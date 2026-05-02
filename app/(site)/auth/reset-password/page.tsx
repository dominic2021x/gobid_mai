"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import UniversalHeader from "@/components/UniversalHeader";
import { supabase } from "@/lib/supabase";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isProcessingToken, setIsProcessingToken] = useState(false);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', String(newMode));
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      if (saved !== null) {
        setIsDarkMode(saved === 'true');
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [isDarkMode]);

  // Process token from URL when page loads (from Supabase redirect)
  useEffect(() => {
    const processToken = async () => {
      // Check for error in URL (from Supabase redirect)
      const error = searchParams.get('error');
      const errorCode = searchParams.get('error_code');
      const errorDescription = searchParams.get('error_description');
      
      if (error) {
        console.error('[Reset Password] Error from Supabase:', { error, errorCode, errorDescription });
        
        // If token expired, show helpful message
        if (errorCode === 'otp_expired') {
          setMessage({ 
            type: "error", 
            text: "Link-ul de resetare a expirat. Te rugăm să soliciți un link nou." 
          });
        } else {
          setMessage({ 
            type: "error", 
            text: errorDescription?.replace(/\+/g, ' ') || "Link-ul de resetare este invalid sau a expirat." 
          });
        }
        setIsProcessingToken(false);
        return;
      }
      
      // Check for token in URL (can be 'token' or 'token_hash')
      const token = searchParams.get('token') || searchParams.get('token_hash');
      const type = searchParams.get('type');
      
      if (token && (type === 'recovery' || !type)) {
        setIsProcessingToken(true);
        console.log('[Reset Password] Processing recovery token from URL');
        
        try {
          // Try to verify the token with Supabase using token_hash
          const verifyResult = await supabase.auth.verifyOtp({
            token_hash: token,
            type: 'recovery'
          });
          
          const { data, error: verifyError } = verifyResult;
          
          if (verifyError) {
            console.error('[Reset Password] Token verification error:', verifyError);
            setMessage({ 
              type: "error", 
              text: verifyError.message || "Link-ul de resetare este invalid sau a expirat." 
            });
            setIsProcessingToken(false);
            return;
          }
          
          if (data?.user) {
            console.log('[Reset Password] Token verified successfully, user can reset password');
            // Token is valid, user can now reset password
            setIsProcessingToken(false);
          } else {
            console.error('[Reset Password] No user data after token verification');
            setMessage({ 
              type: "error", 
              text: "Link-ul de resetare este invalid sau a expirat." 
            });
            setIsProcessingToken(false);
          }
        } catch (error: any) {
          console.error('[Reset Password] Error processing token:', error);
          setMessage({ 
            type: "error", 
            text: error.message || "Eroare la procesarea link-ului de resetare." 
          });
          setIsProcessingToken(false);
        }
      } else {
        setIsProcessingToken(false);
      }
    };
    
    processToken();
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password.length < 8) {
      setMessage({ type: "error", text: "Parola trebuie să aibă minim 8 caractere." });
      return;
    }

    if (password !== confirmPassword) {
      setMessage({ type: "error", text: "Parolele nu se potrivesc." });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) {
        setMessage({ type: "error", text: error.message || "Eroare la resetarea parolei." });
        setIsSubmitting(false);
        return;
      }

      setMessage({ type: "success", text: "Parola a fost resetată cu succes! Redirecționare..." });
      setTimeout(() => {
        router.push('/auth');
      }, 2000);
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "Eroare la resetarea parolei." });
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <UniversalHeader isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} />
      <div className="flex items-center justify-center min-h-[calc(100vh-80px)] px-4 py-12">
        <div className={`w-full max-w-md ${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-lg p-8`}>
          <h1 className={`text-2xl font-bold mb-6 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            Resetare Parolă
          </h1>
          
          {message && (
            <div className={`mb-4 p-3 rounded ${
              message.type === "success" 
                ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200" 
                : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200"
            }`}>
              {message.text}
            </div>
          )}

          {isProcessingToken && (
            <div className="mb-4 p-3 rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200">
              Se procesează link-ul de resetare...
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Parolă Nouă
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    isDarkMode 
                      ? 'bg-gray-700 border-gray-600 text-white' 
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute right-3 top-1/2 transform -translate-y-1/2 ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}
                >
                  {showPassword ? "👁️" : "👁️‍🗨️"}
                </button>
              </div>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Confirmă Parola
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    isDarkMode 
                      ? 'bg-gray-700 border-gray-600 text-white' 
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className={`absolute right-3 top-1/2 transform -translate-y-1/2 ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}
                >
                  {showConfirmPassword ? "👁️" : "👁️‍🗨️"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? "Se procesează..." : "Resetează Parola"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}

