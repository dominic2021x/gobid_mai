"use client";

import { useEffect, useRef, useState } from "react";

interface SearchResult {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
}

export function VoiceSearch() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSupported, setIsSupported] = useState(true);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !navigator.mediaDevices ||
      !window.MediaRecorder
    ) {
      setIsSupported(false);
    }
  }, []);

  const handleStartRecording = async () => {
    setError(null);
    setTranscript(null);
    setResults([]);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await sendAudio(blob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch (err) {
      console.error("Voice capture error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Nu am putut accesa microfonul. Verifică permisiunile."
      );
    }
  };

  const handleStopRecording = () => {
    if (!mediaRecorderRef.current) return;
    mediaRecorderRef.current.stop();
    setIsRecording(false);
  };

  const sendAudio = async (blob: Blob) => {
    setIsProcessing(true);
    setError(null);
    setTranscript(null);

    try {
      const formData = new FormData();
      formData.append("file", blob, "recording.webm");

      const response = await fetch("/api/voice-search", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Eroare la căutarea vocală.");
      }

      const payload = (await response.json()) as {
        query: string;
        results: SearchResult[];
      };

      setTranscript(payload.query);
      setResults(payload.results);
    } catch (err) {
      console.error("Voice search request failed:", err);
      setError(
        err instanceof Error ? err.message : "Nu am putut procesa înregistrarea."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isSupported) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Microfonul nu este suportat în acest browser. Folosește un browser modern
        (Chrome, Edge, Safari).
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Căutare vocală
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Apasă butonul de microfon și spune ce cauți.
          </p>
        </div>
        <button
          type="button"
          onClick={isRecording ? handleStopRecording : handleStartRecording}
          className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
            isRecording
              ? "bg-red-500 hover:bg-red-600"
              : "bg-blue-500 hover:bg-blue-600"
          } text-white shadow-lg`}
          aria-label="Pornește/oprește înregistrarea"
        >
          {isRecording ? (
            <span className="h-4 w-4 animate-pulse rounded bg-white" />
          ) : (
            <i className="ri-mic-line text-xl" />
          )}
        </button>
      </div>

      {isProcessing && (
        <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-300">
          <i className="ri-loader-4-line animate-spin" />
          Procesez înregistrarea...
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      )}

      {transcript && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
          <span className="font-semibold text-gray-900 dark:text-gray-100">
            Transcriere:
          </span>{" "}
          {transcript}
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Rezultate ({results.length})
          </h4>
          <ul className="space-y-3">
            {results.map((result) => {
              const metadata = result.metadata ?? {};
              return (
                <li
                  key={result.id}
                  className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
                >
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {String(metadata.title ?? "Produs fără titlu")}
                  </p>
                  {metadata.description ? (
                    <p className="mt-1 line-clamp-3 text-sm text-gray-500 dark:text-gray-400">
                      {String(metadata.description)}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                    {metadata.category ? (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
                        {String(metadata.category)}
                      </span>
                    ) : null}
                    <span>Relevanță: {(result.score * 100).toFixed(1)}%</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default VoiceSearch;










