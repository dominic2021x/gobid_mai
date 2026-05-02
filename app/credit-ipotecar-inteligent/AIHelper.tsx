"use client";

import { useState, useRef, useEffect } from "react";
import { SparklesIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";

interface MonthlyPaymentDetail {
  month: number;
  balance: number;
  interest: number;
  principalPaid: number;
  extraPayment: number;
  totalPayment: number;
}

interface CalculationResult {
  monthlyPayment: number;
  extraPayment: number;
  interestSaved: number;
  monthsReduced: number;
  monthlyDetails?: MonthlyPaymentDetail[];
}

interface AIHelperProps {
  calculationData: {
    currency: "RON" | "EUR";
    principal: number;
    annualRate: number;
    monthsRemaining: number;
    extraPaymentMonthly: number;
    result: CalculationResult;
  } | null;
  isDarkMode: boolean;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function AIHelper({ calculationData, isDarkMode }: AIHelperProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [generatedText, setGeneratedText] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Generează automat textul pentru bancă când există date de calcul
  useEffect(() => {
    if (!calculationData) return;

    const generateBankTextAsync = async () => {
      setIsLoading(true);
      try {
        const response = await fetch("/api/credit-ipotecar-inteligent/generate-text", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            principal: calculationData.principal,
            annualRate: calculationData.annualRate,
            monthsRemaining: calculationData.monthsRemaining,
            extraPaymentMonthly: calculationData.extraPaymentMonthly,
            extraPayment: calculationData.result.extraPayment,
            monthsReduced: calculationData.result.monthsReduced,
            currency: calculationData.currency || "RON",
          }),
        });

        if (!response.ok) {
          const contentType = response.headers.get("content-type");
          let errorData: { error?: string; details?: string } = {};
          if (contentType && contentType.includes("application/json")) {
            try {
              errorData = await response.json();
            } catch (e) {
              console.error("Failed to parse error response:", e);
            }
          } else {
            const text = await response.text();
            errorData = { error: text || `HTTP ${response.status}` };
          }
          console.error("API Error:", errorData);
          throw new Error(errorData.error || errorData.details || `Failed to generate text: ${response.status}`);
        }

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          const text = await response.text();
          throw new Error(`Invalid response format: ${text.substring(0, 100)}`);
        }

        const data = await response.json();
        if (!data || typeof data !== 'object' || !data.text) {
          throw new Error("Invalid response data format");
        }
        setGeneratedText(data.text);

        // Adaugă mesajul generat automat în chat doar dacă nu există deja mesaje
        setMessages((prev) => {
          if (prev.length === 0) {
            return [
              {
                role: "assistant",
                content: `Am generat următorul text pentru bancă:\n\n"${data.text}"\n\nPoți modifica sau personaliza acest text dacă dorești.`,
              },
            ];
          }
          return prev;
        });
      } catch (error) {
        console.error("Error generating bank text:", error);
        setMessages((prev) => {
          if (prev.length === 0) {
            return [
              {
                role: "assistant",
                content: "A apărut o eroare la generarea textului. Te rog încearcă din nou.",
              },
            ];
          }
          return prev;
        });
      } finally {
        setIsLoading(false);
      }
    };

    setGeneratedText(""); // Reset pentru a regenera
    generateBankTextAsync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calculationData]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/credit-ipotecar-inteligent/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: input,
          conversationHistory: messages,
          calculationData: calculationData,
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
      const aiMessage: Message = { role: "assistant", content: data.message };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "A apărut o eroare. Te rog încearcă din nou.",
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Poți adăuga o notificare aici
  };

  return (
    <div
      className={`w-full h-full flex flex-col backdrop-blur-xl ${
        isDarkMode 
          ? "bg-white/5 text-white border border-white/10" 
          : "bg-white/80 text-gray-900 border border-white/20"
      } rounded-3xl shadow-2xl transition-all duration-300 hover:shadow-3xl`}
      style={{
        boxShadow: isDarkMode 
          ? '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)' 
          : '0 20px 60px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.5)'
      }}
    >
      {/* Header */}
      <div
        className={`p-6 border-b ${
          isDarkMode ? "border-white/10" : "border-gray-200/50"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg ${
            isDarkMode ? 'shadow-blue-500/30' : 'shadow-blue-500/20'
          }`}>
            <SparklesIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-blue-600 bg-clip-text text-transparent">
              Asistent GoBid AI
            </h2>
            {calculationData && (
              <p className={`text-xs mt-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                Text generat automat pentru bancă
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {generatedText && (
          <div
            className={`p-4 rounded-xl backdrop-blur-sm ${
              isDarkMode 
                ? "bg-gradient-to-r from-blue-500/20 to-blue-500/20 border border-blue-500/30" 
                : "bg-gradient-to-r from-blue-50 to-blue-50 border border-blue-200/50"
            } shadow-lg`}
          >
            <div className="flex justify-between items-start mb-2">
              <span className={`text-sm font-semibold ${
                isDarkMode ? "text-blue-300" : "text-blue-700"
              }`}>Text pentru bancă:</span>
              <button
                onClick={() => copyToClipboard(generatedText)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                  isDarkMode
                    ? "bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/30"
                    : "bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-300"
                } shadow-sm hover:shadow-md`}
              >
                Copiază
              </button>
            </div>
            <p className={`text-sm italic ${
              isDarkMode ? "text-gray-200" : "text-gray-700"
            }`}>{generatedText}</p>
          </div>
        )}

        {messages.length === 0 && !generatedText && (
          <div
            className={`text-center py-8 ${
              isDarkMode ? "text-gray-400" : "text-gray-500"
            }`}
          >
            <SparklesIcon className="w-12 h-12 mx-auto mb-4 text-blue-500 opacity-50" />
            <p>Completează calculatorul pentru a genera textul pentru bancă.</p>
            <p className="text-sm mt-2">Sau întreabă-mă orice despre creditul ipotecar!</p>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${
              message.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[80%] p-4 rounded-xl shadow-lg ${
                message.role === "user"
                  ? isDarkMode
                    ? "bg-gradient-to-r from-blue-600 to-blue-600 text-white"
                    : "bg-gradient-to-r from-blue-600 to-blue-600 text-white"
                  : isDarkMode
                  ? "bg-white/10 backdrop-blur-sm border border-white/20 text-white"
                  : "bg-white/90 backdrop-blur-sm border border-gray-200/50 text-gray-900 shadow-md"
              }`}
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div
              className={`p-4 rounded-lg ${
                isDarkMode ? "bg-gray-700" : "bg-gray-100"
              }`}
            >
              <div className="flex gap-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.4s" }}></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        className={`p-4 border-t backdrop-blur-sm ${
          isDarkMode ? "border-white/10 bg-white/5" : "border-gray-200/50 bg-white/50"
        }`}
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Întreabă-mă ceva..."
            disabled={isLoading}
            className={`flex-1 px-4 py-3 rounded-xl border backdrop-blur-sm transition-all ${
              isDarkMode
                ? "bg-white/10 border-white/20 text-white placeholder-gray-400 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/30"
                : "bg-white/80 border-gray-300/50 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            } focus:outline-none shadow-sm disabled:opacity-50`}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700 text-white px-5 py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
          >
            <PaperAirplaneIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
