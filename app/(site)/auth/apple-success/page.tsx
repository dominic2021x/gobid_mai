"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type AppleSuccessUserInfo = {
  firstName?: string;
  lastName?: string;
  email?: string;
  supabaseUserId?: string;
  id?: string;
  magicLink?: string;
  magicLinkToken?: string;
  magicLinkHash?: string;
  /** When true, redirect to complete-profile to collect first_name / last_name */
  needsNameOnboarding?: boolean;
  [key: string]: unknown;
};

function AppleSuccessContent() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const handleAuth = async () => {
      const isAdmin = (searchParams?.get?.('admin') ?? 'false') === 'true';

      // Prefer cookie (avoids 405 from very long URL); fallback to URL param
      let userInfo: AppleSuccessUserInfo | null = null;
      const dataParam = searchParams?.get?.('data') ?? null;
      if (dataParam) {
        try {
          userInfo = JSON.parse(decodeURIComponent(dataParam)) as AppleSuccessUserInfo;
        } catch {
          userInfo = null;
        }
      }
      if (!userInfo) {
        try {
          const res = await fetch('/api/auth/apple/success-data', { credentials: 'same-origin' });
          const body = await res.json();
          if (body?.data && typeof body.data === 'object') {
            userInfo = body.data as AppleSuccessUserInfo;
          }
        } catch {
          // ignore
        }
      }

      if (userInfo) {
        // Backward compatibility: accept both supabaseUserId and id
        const supabaseUserId = userInfo.supabaseUserId ?? userInfo.id;
        if (supabaseUserId) userInfo.supabaseUserId = supabaseUserId;

        try {
          const userId = userInfo.supabaseUserId;
          const email = userInfo.email;
          if (userId && email) {
            try {
              const { data: { session } } = await supabase.auth.getSession();

              if (!session || session.user.id !== userId) {
                // Token pentru verifyOtp: din magicLink URL sau magicLinkToken (nu e nevoie de magicLinkHash)
                let token: string | null = null;
                if (userInfo.magicLink) {
                  try {
                    token = new URL(userInfo.magicLink).searchParams.get('token');
                  } catch {
                    // ignore
                  }
                }
                if (!token && userInfo.magicLinkToken) {
                  token = userInfo.magicLinkToken;
                }
                if (token) {
                  try {
                    const { error: verifyError } = await supabase.auth.verifyOtp({
                      token,
                      type: 'magiclink',
                      email,
                    });
                    if (verifyError && process.env.NODE_ENV === 'development') {
                      console.warn('[Apple Success] verifyOtp:', verifyError.message);
                    }
                  } catch {
                    // continue; sesiunea poate fi setată oricum sau utilizatorul rămâne pe localStorage
                  }
                }
              }
            } catch {
              // continue with redirect
            }
          }

          if (isAdmin) {
            const adminInfo = { ...userInfo, role: 'admin', isAdmin: true };
            localStorage.setItem('adminInfo', JSON.stringify(adminInfo));
            window.location.replace('/admin');
            return;
          }
          localStorage.setItem('userInfo', JSON.stringify(userInfo));
          if (userInfo.supabaseUserId) {
            localStorage.setItem('supabaseUserId', userInfo.supabaseUserId);
          }
          if (typeof window !== 'undefined') {
            localStorage.removeItem('authRedirect');
          }
          const { trackGoogleConversion } = await import("@/lib/analytics/googleAds");
          trackGoogleConversion("signup", { dedupeKey: userInfo.supabaseUserId || "once" });
          if (userInfo.needsNameOnboarding === true) {
            window.location.replace('/auth/complete-profile');
            return;
          }
          const redirectPath = typeof window !== 'undefined'
            ? localStorage.getItem('authRedirect') || '/dashboard'
            : '/dashboard';
          window.location.replace(redirectPath);
        } catch {
          window.location.replace('/auth?error=parse_error');
        }
      } else {
        window.location.replace('/auth?error=no_data');
      }
    };

    handleAuth();
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700">
      <div className="text-center">
        <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-green-600 rounded-full mb-6 shadow-2xl flex items-center justify-center mx-auto animate-spin">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-green-400 bg-clip-text text-transparent">
          Autentificare cu Apple...
        </h2>
        <p className="text-gray-300">Te redirecționăm...</p>
      </div>
    </div>
  );
}

export default function AppleSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-300">Se încarcă...</p>
        </div>
      </div>
    }>
      <AppleSuccessContent />
    </Suspense>
  );
}
