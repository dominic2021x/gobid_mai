"use client";

import { dashboardApiFetch } from "@/lib/dashboard-api-fetch";
import { useState, useRef, useEffect } from "react";
import { SparklesIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

interface AIHelperProps {
  isDarkMode: boolean;
  userInfo?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    avatar?: string;
  };
}

export default function AIHelper({ isDarkMode, userInfo }: AIHelperProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const formatTimestamp = (timestamp?: string) => {
    if (timestamp) {
      // Dacă este deja un timestamp, îl formatează
      try {
        const date = new Date(timestamp);
        return date.toLocaleString('ro-RO', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'Europe/Bucharest'
        });
      } catch (e) {
        return timestamp; // Returnează original dacă nu poate fi formatat
      }
    }
    // Dacă nu există timestamp, creează unul nou
    const now = new Date();
    return now.toLocaleString('ro-RO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Europe/Bucharest'
    });
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { 
      role: "user", 
      content: input,
      timestamp: formatTimestamp(new Date().toISOString())
    };
    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input;
    setInput("");
    setIsLoading(true);

    try {
      const response = await dashboardApiFetch("/api/support/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: currentInput,
          conversationHistory: messages,
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        let errorMessage = "Failed to get AI response";
        if (contentType && contentType.includes("application/json")) {
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.details || errorMessage;
          } catch (e) {
            console.error("Failed to parse error response:", e);
          }
        } else {
          const text = await response.text();
          errorMessage = text || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error(`Invalid response format: ${text.substring(0, 100)}`);
      }

      const data = await response.json();
      if (!data || typeof data !== 'object' || !data.message) {
        throw new Error("Invalid response data format");
      }
      const aiMessage: Message = { 
        role: "assistant", 
        content: data.message,
        timestamp: formatTimestamp(new Date().toISOString())
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "A apărut o eroare. Te rog încearcă din nou sau creează un ticket de suport.",
          timestamp: formatTimestamp(new Date().toISOString())
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div
      className={`w-full h-full flex flex-col ${
        isDarkMode 
          ? "bg-gray-800 text-white" 
          : "bg-white text-gray-900"
      } rounded-2xl shadow-2xl overflow-hidden`}
    >
      {/* Header - Chat Style */}
      <div
        className={`p-4 border-b ${
          isDarkMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Profile Picture */}
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center overflow-hidden">
                <img 
                  src="https://ui-avatars.com/api/?name=Cristina&background=8b5cf6&color=fff&size=128&bold=true" 
                  alt="Cristina" 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback to initials if image fails
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent) {
                      parent.innerHTML = '<span class="text-white font-bold text-lg">CR</span>';
                    }
                  }}
                />
              </div>
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
            </div>
            <div>
              <h3 className={`text-lg font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                Cristina
              </h3>
              <p className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                Asistenta ta virtuală • Activ acum
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              isDarkMode 
                ? "bg-green-500/20 text-green-400 border border-green-500/30" 
                : "bg-green-100 text-green-700 border border-green-300"
            }`}>
              AI ON
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className={`flex-1 overflow-y-auto p-4 space-y-4 ${
        isDarkMode ? 'bg-gray-900' : 'bg-gray-50'
      }`}>
        {messages.length === 0 && (
          <div
            className={`text-center py-8 ${
              isDarkMode ? "text-gray-400" : "text-gray-500"
            }`}
          >
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold text-2xl">C</span>
            </div>
            <p className={`font-medium ${isDarkMode ? "text-white" : "text-gray-900"}`}>
              Bună, eu sunt asistenta ta virtuală Cristina.
            </p>
            <p className={`text-sm mt-2 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>
              Cum te pot ajuta astăzi?
            </p>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex items-start gap-3 ${
              message.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {/* Assistant Avatar */}
            {message.role === "assistant" && (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 overflow-hidden">
                <img 
                  src="https://ui-avatars.com/api/?name=Cristina&background=8b5cf6&color=fff&size=128&bold=true" 
                  alt="Cristina" 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent) {
                      parent.innerHTML = '<span class="text-white font-bold">CR</span>';
                    }
                  }}
                />
              </div>
            )}
            
            <div className={`flex flex-col ${message.role === "user" ? "items-end" : "items-start"} max-w-[75%]`}>
              {message.role === "assistant" && (
                <span className={`text-xs font-semibold mb-1 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                  Cristina
                </span>
              )}
              {message.role === "user" && (
                <span className={`text-xs font-semibold mb-1 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                  {(() => {
                    if (userInfo?.firstName && userInfo?.lastName) {
                      return `${userInfo.firstName} ${userInfo.lastName}`;
                    } else if (userInfo?.firstName) {
                      return userInfo.firstName;
                    } else if (userInfo?.email) {
                      return userInfo.email.split('@')[0]; // Username din email
                    } else {
                      return 'Utilizator';
                    }
                  })()}
                </span>
              )}
              <div
                className={`p-3 rounded-2xl ${
                  message.role === "user"
                    ? isDarkMode
                      ? "bg-blue-600 text-white"
                      : "bg-blue-500 text-white"
                    : isDarkMode
                    ? "bg-gray-700 text-white"
                    : "bg-white text-gray-900 shadow-sm border border-gray-200"
                }`}
              >
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
              </div>
              {message.timestamp && (
                <span className={`text-xs mt-1 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}>
                  {typeof message.timestamp === 'string' && message.timestamp.includes('T') 
                    ? formatTimestamp(message.timestamp)
                    : message.timestamp}
                </span>
              )}
            </div>

            {/* User Avatar */}
            {message.role === "user" && (
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                isDarkMode ? "bg-gray-700" : "bg-gray-300"
              }`}>
                {userInfo?.avatar ? (
                  <img
                    src={userInfo.avatar}
                    alt={userInfo.firstName || 'User'}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const fallback = target.nextElementSibling as HTMLElement;
                      if (fallback) fallback.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div className={`w-full h-full flex items-center justify-center ${userInfo?.avatar ? 'hidden' : ''}`}>
                  <span className="text-xs font-bold text-white">
                    {userInfo?.firstName ? userInfo.firstName.charAt(0).toUpperCase() : 'U'}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-start gap-3 justify-start">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold">CR</span>
            </div>
            <div className="flex flex-col items-start">
              <span className={`text-xs font-semibold mb-1 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                Cristina
              </span>
              <div className={`p-3 rounded-2xl ${
                isDarkMode ? "bg-gray-700" : "bg-white border border-gray-200"
              }`}>
                <div className="flex gap-2">
                  <div className={`w-2 h-2 rounded-full animate-bounce ${
                    isDarkMode ? "bg-gray-400" : "bg-gray-400"
                  }`}></div>
                  <div className={`w-2 h-2 rounded-full animate-bounce ${
                    isDarkMode ? "bg-gray-400" : "bg-gray-400"
                  }`} style={{ animationDelay: "0.2s" }}></div>
                  <div className={`w-2 h-2 rounded-full animate-bounce ${
                    isDarkMode ? "bg-gray-400" : "bg-gray-400"
                  }`} style={{ animationDelay: "0.4s" }}></div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        className={`p-4 border-t ${
          isDarkMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white"
        }`}
      >
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Scrie un mesaj..."
            disabled={isLoading}
            className={`flex-1 px-4 py-3 rounded-xl border transition-all ${
              isDarkMode
                ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                : "bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            } focus:outline-none disabled:opacity-50`}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className={`p-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              isDarkMode
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-blue-500 hover:bg-blue-600 text-white"
            } shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95`}
          >
            <PaperAirplaneIcon className="w-5 h-5" />
          </button>
        </div>
        <p className={`text-xs mt-2 text-center ${
          isDarkMode ? "text-gray-500" : "text-gray-400"
        }`}>
          Asistent AI va răspunde automat
        </p>
      </div>
    </div>
  );
}

