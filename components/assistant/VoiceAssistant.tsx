"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { AssistantUiAction } from "@/lib/assistant/intentRouter";

const MAX_RECORD_MS = 60_000;
const SILENCE_DURATION_MS = 1500;
const SILENCE_CHECK_INTERVAL_MS = 150;
const VOLUME_THRESHOLD = 0.008;
const MIN_SPEECH_MS = 400;

type VoiceResponse = {
  message?: string;
  conversationId?: string;
  quickReplies?: string[];
  draftProgress?: { status: string; filled: number; total: number };
  uiAction?: AssistantUiAction;
  audioBase64?: string;
};

type VoiceAssistantProps = {
  accessToken: string | null;
  conversationId: string | null;
  /** Dacă e setat, microfonul face doar voice-to-text și pasează textul aici (nu trimite la chat, nu TTS). */
  onTranscription?: (text: string) => void;
  onResponse?: (data: VoiceResponse) => void;
  onUiAction?: (action: AssistantUiAction) => void;
  disabled?: boolean;
  className?: string;
};

function executeUiAction(
  action: AssistantUiAction,
  router: ReturnType<typeof useRouter>,
  onUiAction?: (a: AssistantUiAction) => void
): void {
  switch (action.type) {
    case "OPEN_SUPPORT_CHAT":
      router.push("/dashboard/support");
      break;
    case "NAVIGATE": {
      const href = action.payload?.href;
      if (typeof href === "string") router.push(href);
      break;
    }
    case "OPEN_MODAL":
      if (onUiAction) onUiAction(action);
      break;
    default:
      break;
  }
}

export default function VoiceAssistant({
  accessToken,
  conversationId,
  onTranscription,
  onResponse,
  onUiAction,
  disabled = false,
  className = "",
}: VoiceAssistantProps) {
  const router = useRouter();
  const transcribeOnly = Boolean(onTranscription);
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const stopRecording = useCallback((onStopped?: () => void) => {
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    if (silenceCheckIntervalRef.current) {
      clearInterval(silenceCheckIntervalRef.current);
      silenceCheckIntervalRef.current = null;
    }
    const ctx = audioContextRef.current;
    if (ctx) {
      audioContextRef.current = null;
      ctx.close().catch(() => {});
    }
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      try {
        mr.requestData();
      } catch {
        // ignore
      }
      const prevOnStop = mr.onstop;
      mr.onstop = () => {
        if (mr.stream) mr.stream.getTracks().forEach((t) => t.stop());
        prevOnStop?.call(mr, new Event("stop"));
        onStopped?.();
      };
      mr.stop();
    } else {
      onStopped?.();
    }
    mediaRecorderRef.current = null;
    setRecording(false);
  }, []);

  const startRecording = useCallback(() => {
    if (!accessToken || disabled || recording || sending) return;
    setError(null);
    chunksRef.current = [];

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const mr = new MediaRecorder(stream);
        mediaRecorderRef.current = mr;
        mr.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        mr.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
        };
        mr.start(200);
        setRecording(true);

        const recordingStartTime = Date.now();
        let lastSoundTime = recordingStartTime;
        let hasHadSpeech = false;

        try {
          const ctx = new AudioContext();
          audioContextRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.6;
          source.connect(analyser);
          const dataArray = new Uint8Array(analyser.fftSize);

          silenceCheckIntervalRef.current = setInterval(() => {
            if (!audioContextRef.current || !mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return;
            analyser.getByteTimeDomainData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              const n = (dataArray[i] - 128) / 128;
              sum += n * n;
            }
            const rms = Math.sqrt(sum / dataArray.length);
            const now = Date.now();
            if (rms > VOLUME_THRESHOLD) {
              lastSoundTime = now;
              hasHadSpeech = true;
            }
            const silenceDuration = now - lastSoundTime;
            const recordedLongEnough = now - recordingStartTime >= MIN_SPEECH_MS;
            if (hasHadSpeech && recordedLongEnough && silenceDuration >= SILENCE_DURATION_MS) {
              if (silenceCheckIntervalRef.current) {
                clearInterval(silenceCheckIntervalRef.current);
                silenceCheckIntervalRef.current = null;
              }
              stopRecording(() => setTimeout(sendAudio, 100));
            }
          }, SILENCE_CHECK_INTERVAL_MS);
        } catch {
          // VAD nu e disponibil, rămâne doar tap-to-stop și max duration
        }

        stopTimeoutRef.current = setTimeout(() => {
          stopTimeoutRef.current = null;
          stopRecording(() => setTimeout(sendAudio, 100));
        }, MAX_RECORD_MS);
      })
      .catch(() => {
        setError("Microfonul nu este disponibil.");
      });
  }, [accessToken, disabled, recording, sending, stopRecording]);

  const sendAudio = useCallback(async () => {
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    chunksRef.current = [];
    if (blob.size === 0) {
      setError("Nu s-a înregistrat niciun audio.");
      return;
    }

    if (!accessToken) return;
    setSending(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("audio", blob, "audio.webm");
      if (conversationId) form.append("conversationId", conversationId);
      if (transcribeOnly) form.append("transcribeOnly", "true");

      const res = await fetch("/api/assistant/voice", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });

      const data = (await res.json().catch(() => ({}))) as VoiceResponse & { error?: string; text?: string };

      if (!res.ok) {
        setError(data?.error ?? "Eroare la trimitere.");
        return;
      }

      if (transcribeOnly && typeof data.text === "string") {
        onTranscription?.(data.text.trim());
        return;
      }

      if (data.uiAction) {
        executeUiAction(data.uiAction, router, onUiAction);
      }
      if (data.audioBase64) {
        try {
          const binary = atob(data.audioBase64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const audioBlob = new Blob([bytes], { type: "audio/mpeg" });
          const url = URL.createObjectURL(audioBlob);
          const audio = new Audio(url);
          audio.onended = () => URL.revokeObjectURL(url);
          await audio.play();
        } catch {
          // autoplay failed or decode failed; ignore
        }
      }
      onResponse?.(data);
    } catch {
      setError("Eroare de rețea.");
    } finally {
      setSending(false);
    }
  }, [accessToken, conversationId, transcribeOnly, onTranscription, onResponse, onUiAction, router]);

  /** Tap: start recording. Tap again: stop and send. */
  const handleClick = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled || sending || !accessToken) return;
      if (recording) {
        stopRecording(() => setTimeout(sendAudio, 100));
      } else {
        startRecording();
      }
    },
    [disabled, sending, accessToken, recording, stopRecording, sendAudio, startRecording]
  );

  return (
    <div className={className}>
      <button
        type="button"
        aria-label={recording ? "Oprește înregistrarea" : "Vorbește – se oprește singur la pauză"}
        disabled={disabled || sending || !accessToken}
        onClick={handleClick}
        onMouseDown={(e) => e.preventDefault()}
        className="rounded-full p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200/60 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
      >
        {recording ? (
          <span className="flex h-5 w-5 rounded-full bg-red-500 animate-pulse" aria-hidden />
        ) : (
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        )}
      </button>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
