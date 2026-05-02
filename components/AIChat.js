"use client";

import { useState, useRef, useEffect } from 'react';

/**
 * AIChat Component - Chat complet cu microfon și redare audio
 * Integrare cu Whisper (voice-to-text) și ElevenLabs (text-to-speech)
 */

export default function AIChat({ isOpen, onClose, isDarkMode = true }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioRef = useRef(null);

  // Auto-scroll la ultimul mesaj
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Focus input când se deschide
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Începe înregistrarea audio
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleVoiceInput(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Nu s-a putut accesa microfonul. Verifică permisiunile.');
    }
  };

  // Oprește înregistrarea
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Procesează input vocal
  const handleVoiceInput = async (audioBlob) => {
    setIsLoading(true);

    try {
      // Step 1: Transcribe audio cu Whisper
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const transcriptionResponse = await fetch('/api/voice-to-text', {
        method: 'POST',
        body: formData,
      });

      if (!transcriptionResponse.ok) {
        throw new Error('Failed to transcribe audio');
      }

      const { text } = await transcriptionResponse.json();

      // Adaugă mesajul utilizatorului
      const userMessage = { role: 'user', content: text, type: 'voice' };
      setMessages(prev => [...prev, userMessage]);

      // Step 2: Trimite la chat API
      await sendMessage(text);
    } catch (error) {
      console.error('Error processing voice input:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Eroare la procesarea audio. Încearcă din nou.',
        error: true
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Trimite mesaj text
  const sendMessage = async (text = input) => {
    if (!text.trim() || isLoading) return;

    setIsLoading(true);
    const userMessage = { role: 'user', content: text, type: 'text' };
    setMessages(prev => [...prev, userMessage]);
    setInput('');

    try {
      // Step 1: Trimite la chat API (GPT-4o + RAG)
      const chatResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      if (!chatResponse.ok) {
        throw new Error('Failed to get AI response');
      }

      const { answer, sources } = await chatResponse.json();

      // Adaugă răspunsul AI
      const aiMessage = {
        role: 'assistant',
        content: answer,
        sources: sources || [],
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, aiMessage]);

      // Step 2: Generează și redă audio cu ElevenLabs
      await playVoiceResponse(answer);

    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Eroare la obținerea răspunsului. Încearcă din nou.',
        error: true
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Generează și redă răspuns vocal cu ElevenLabs
  const playVoiceResponse = async (text) => {
    try {
      setIsPlaying(true);

      const response = await fetch('/api/voice-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate voice response');
      }

      const { audio } = await response.json();

      // Convert base64 to audio
      const audioBlob = new Blob(
        [Uint8Array.from(atob(audio), c => c.charCodeAt(0))],
        { type: 'audio/mpeg' }
      );

      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
      };

      audio.onerror = () => {
        setIsPlaying(false);
        console.error('Error playing audio');
      };

      await audio.play();
    } catch (error) {
      console.error('Error generating voice response:', error);
      setIsPlaying(false);
      // Fallback: folosește Web Speech API
      fallbackSpeech(text);
    }
  };

  // Fallback: Web Speech API (browser native)
  const fallbackSpeech = (text) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ro-RO';
      utterance.rate = 0.9;
      utterance.pitch = 1.1;
      
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);
      
      speechSynthesis.speak(utterance);
    }
  };

  // Handle Enter key
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${isDarkMode ? 'bg-black/50' : 'bg-black/30'}`}>
      <div className={`relative w-full max-w-2xl h-[80vh] max-h-[700px] rounded-2xl shadow-2xl flex flex-col ${
        isDarkMode 
          ? 'bg-gray-900 border border-gray-800' 
          : 'bg-white border border-gray-200'
      }`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${
          isDarkMode ? 'border-gray-800' : 'border-gray-200'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h3 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Asistent AI
              </h3>
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Chat vocal și text cu GPT-4o
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg hover:bg-opacity-20 transition-colors ${
              isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className={`text-center py-12 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              <p className="text-lg mb-2">👋 Bună!</p>
              <p>Poți să vorbești sau să scrii întrebări despre produse și licitații.</p>
              <p className="text-sm mt-2">AI-ul va căuta automat informații relevante în baza de date.</p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? isDarkMode
                    ? 'bg-blue-600 text-white'
                    : 'bg-blue-500 text-white'
                  : isDarkMode
                    ? 'bg-gray-800 text-gray-100'
                    : 'bg-gray-100 text-gray-900'
              }`}>
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                
                {/* Sources */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-opacity-20">
                    <p className="text-xs opacity-75 mb-1">Sursă:</p>
                    {msg.sources.map((source, sidx) => (
                      <a
                        key={sidx}
                        href={source.source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs underline opacity-90 hover:opacity-100 block"
                      >
                        {source.text.substring(0, 50)}...
                      </a>
                    ))}
                  </div>
                )}

                {/* Type indicator */}
                {msg.type === 'voice' && (
                  <div className="mt-1 text-xs opacity-75">🎤 Audio</div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className={`rounded-2xl px-4 py-3 ${
                isDarkMode ? 'bg-gray-800' : 'bg-gray-100'
              }`}>
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className={`p-4 border-t ${
          isDarkMode ? 'border-gray-800' : 'border-gray-200'
        }`}>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Scrie sau apasă microfonul..."
                rows={1}
                className={`w-full px-4 py-3 rounded-xl resize-none ${
                  isDarkMode
                    ? 'bg-gray-800 text-white placeholder-gray-500 border border-gray-700'
                    : 'bg-gray-50 text-gray-900 placeholder-gray-400 border border-gray-300'
                } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                style={{ minHeight: '48px', maxHeight: '120px' }}
              />
            </div>

            {/* Microphone Button */}
            <button
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              disabled={isLoading || isPlaying}
              className={`p-3 rounded-xl transition-all ${
                isRecording
                  ? 'bg-red-500 text-white animate-pulse'
                  : isDarkMode
                    ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>

            {/* Send Button */}
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading || isPlaying}
              className={`p-3 rounded-xl transition-all ${
                isDarkMode
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>

          {/* Status indicators */}
          <div className="flex items-center gap-4 mt-2 text-xs">
            {isRecording && (
              <span className={`flex items-center gap-1 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                Înregistrare...
              </span>
            )}
            {isPlaying && (
              <span className={`flex items-center gap-1 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                Redare audio...
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


