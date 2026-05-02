"use client";

import { useState, useRef, useEffect } from "react";
import { SparklesIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";

interface CalculationResult {
  monthlyPayment: number;
  extraPayment: number;
  interestSaved: number;
  monthsReduced: number;
}

interface AIHelperProps {
  calculationData: {
    principal: number;
    annualRate: number;
    monthsRemaining: number;
    monthsToReduce: number;
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
        const response = await fetch("/api/smart-mortgage/generate-text", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            principal: calculationData.principal,
            annualRate: calculationData.annualRate,
            monthsRemaining: calculationData.monthsRemaining,
            monthsToReduce: calculationData.monthsToReduce,
            extraPayment: calculationData.result.extraPayment,
            monthsReduced: calculationData.result.monthsReduced,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to generate text");
        }

        const data = await response.json();
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
      const response = await fetch("/api/smart-mortgage/chat", {
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
        throw new Error("Failed to get AI response");
      }

      const data = await response.json();
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
      className={`w-full h-full flex flex-col ${
        isDarkMode ? "bg-gray-800 text-white" : "bg-white text-gray-900"
      } rounded-2xl shadow-xl`}
    >
      {/* Header */}
      <div
        className={`p-6 border-b ${
          isDarkMode ? "border-gray-700" : "border-gray-200"
        }`}
      >
        <div className="flex items-center gap-3">
          <SparklesIcon className="w-6 h-6 text-blue-500" />
          <h2 className="text-xl font-bold">Asistent GoBid AI</h2>
        </div>
        {calculationData && (
          <p className={`text-sm mt-2 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
            Text generat automat pentru bancă
          </p>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {generatedText && (
          <div
            className={`p-4 rounded-lg ${
              isDarkMode ? "bg-gray-700/50" : "bg-blue-50"
            } border ${
              isDarkMode ? "border-blue-600" : "border-blue-200"
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <span className="text-sm font-semibold">Text pentru bancă:</span>
              <button
                onClick={() => copyToClipboard(generatedText)}
                className={`text-xs px-2 py-1 rounded ${
                  isDarkMode
                    ? "bg-gray-600 hover:bg-gray-500"
                    : "bg-gray-200 hover:bg-gray-300"
                } transition`}
              >
                Copiază
              </button>
            </div>
            <p className="text-sm italic">{generatedText}</p>
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
              className={`max-w-[80%] p-4 rounded-lg ${
                message.role === "user"
                  ? isDarkMode
                    ? "bg-blue-600 text-white"
                    : "bg-blue-600 text-white"
                  : isDarkMode
                  ? "bg-gray-700 text-white"
                  : "bg-gray-100 text-gray-900"
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
        className={`p-4 border-t ${
          isDarkMode ? "border-gray-700" : "border-gray-200"
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
            className={`flex-1 px-4 py-2 rounded-lg border ${
              isDarkMode
                ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
            } focus:outline-none focus:ring-2 focus:ring-blue-500 transition disabled:opacity-50`}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PaperAirplaneIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
