"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

function GoogleSuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const handleAuth = async () => {
      console.log('🟢 Google Success page loaded');
      const dataParam = searchParams?.get?.('data') ?? null;
      const isAdmin = (searchParams?.get?.('admin') ?? 'false') === 'true';

      console.log('📋 Data param exists:', !!dataParam);
      console.log('📋 Is admin:', isAdmin);

      if (dataParam) {
        try {
          console.log('📦 Parsing user data...');
          const userInfo = JSON.parse(decodeURIComponent(dataParam));
          console.log('✅ User info parsed:', {
            email: userInfo.email,
            firstName: userInfo.firstName,
            hasSupabaseUserId: !!userInfo.supabaseUserId
          });
          
          // If we have a Supabase user ID and magic link token, try to set session
          if (userInfo.supabaseUserId && userInfo.email) {
            try {
              // Check if we already have a session
              const { data: { session }, error: sessionError } = await supabase.auth.getSession();
              
              if (!session || session.user.id !== userInfo.supabaseUserId) {
                // If we have a magic link token, use it to verify and set session
                if (userInfo.magicLinkToken && userInfo.magicLinkHash) {
                  try {
                    // Verify the token and set session
                    // Note: verifyOtp needs the token, not just the hash
                    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
                      token: userInfo.magicLinkToken,
                      type: 'magiclink',
                      email: userInfo.email,
                    });

                    if (!verifyError && verifyData?.session) {
                      console.log('✅ Supabase session set successfully');
                      // Session is now set, continue with redirect
                    } else {
                      console.error('Error verifying magic link:', verifyError);
                      // Try to use the magic link URL directly if available
                      if (userInfo.magicLink) {
                        // Extract token from URL and verify
                        const urlParams = new URL(userInfo.magicLink).searchParams;
                        const token = urlParams.get('token');
                        const tokenHash = urlParams.get('token_hash');
                        
                        if (token) {
                          const { data: verifyData2, error: verifyError2 } = await supabase.auth.verifyOtp({
                            token: token,
                            type: 'magiclink',
                            email: userInfo.email,
                          });
                          
                          if (!verifyError2 && verifyData2?.session) {
                            console.log('✅ Supabase session set via magic link URL');
                          }
                        }
                      }
                    }
                  } catch (verifyError) {
                    console.error('Error verifying token:', verifyError);
                  }
                }
              } else {
                console.log('✅ Supabase session already active');
              }
            } catch (supabaseError) {
              console.error('Error setting Supabase session:', supabaseError);
              // Continue with localStorage fallback
            }
          }
          
          // Save user info to localStorage
          if (isAdmin) {
            // Save as admin
            const adminInfo = {
              ...userInfo,
              role: 'admin',
              isAdmin: true,
            };
            localStorage.setItem('adminInfo', JSON.stringify(adminInfo));
            router.push('/admin');
          } else {
            // Save as regular user
            console.log('💾 Saving user info to localStorage...');
            localStorage.setItem('userInfo', JSON.stringify(userInfo));
            // Also save Supabase user ID for session management
            if (userInfo.supabaseUserId) {
              localStorage.setItem('supabaseUserId', userInfo.supabaseUserId);
            }
            console.log('✅ User info saved, redirecting...');
            // Get redirect path from localStorage or default to dashboard
            const redirectPath = typeof window !== 'undefined' 
              ? localStorage.getItem('authRedirect') || '/dashboard'
              : '/dashboard';
            
            // Clear the saved redirect path
            if (typeof window !== 'undefined') {
              localStorage.removeItem('authRedirect');
            }
            
            const { trackGoogleConversion } = await import("@/lib/analytics/googleAds");
            trackGoogleConversion("signup", { dedupeKey: userInfo.supabaseUserId || "once" });
            router.push(redirectPath);
          }
        } catch (error) {
          console.error('❌ Error parsing user data:', error);
          console.error('❌ Data param was:', dataParam?.substring(0, 100));
          router.push('/auth?error=parse_error');
        }
      } else {
        console.error('❌ No data param in URL');
        console.error('❌ Search params:', Object.fromEntries(searchParams?.entries() || []));
        router.push('/auth?error=no_data');
      }
    };

    handleAuth();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700">
      <div className="text-center">
        <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-green-600 rounded-full mb-6 shadow-2xl flex items-center justify-center mx-auto animate-spin">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-green-400 bg-clip-text text-transparent">
          Autentificare cu Google...
        </h2>
        <p className="text-gray-300">Te redirecționăm...</p>
      </div>
    </div>
  );
}

export default function GoogleSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-300">Se încarcă...</p>
        </div>
      </div>
    }>
      <GoogleSuccessContent />
    </Suspense>
  );
}


