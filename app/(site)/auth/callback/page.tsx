"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the code and error from URL
        const code = searchParams?.get('code');
        const error = searchParams?.get('error');
        const errorDescription = searchParams?.get('error_description');

        if (error) {
          console.error('OAuth error:', error, errorDescription);
          router.push(`/auth?error=${encodeURIComponent(errorDescription || error)}`);
          return;
        }

        if (!code) {
          console.error('No code in callback');
          router.push('/auth?error=no_code');
          return;
        }

        // Exchange code for session
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          console.error('Error exchanging code for session:', exchangeError);
          router.push(`/auth?error=${encodeURIComponent(exchangeError.message || 'exchange_error')}`);
          return;
        }

        if (!data.session) {
          console.error('No session after exchange');
          router.push('/auth?error=no_session');
          return;
        }

        const user = data.session.user;

        // Create or update user profile and tokens
        if (user) {
          try {
            // Create or update user profile
            const fullName = user.user_metadata?.full_name || user.user_metadata?.name || '';
            const nameParts = fullName.trim().split(/\s+/);
            const firstName = user.user_metadata?.first_name || nameParts[0] || '';
            const lastName = user.user_metadata?.last_name || nameParts.slice(1).join(' ') || '';
            const { error: profileError } = await supabase
              .from('user_profiles')
              .upsert({
                user_id: user.id,
                first_name: firstName,
                last_name: lastName,
                email: user.email || '',
                avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
                phone: user.user_metadata?.phone || null,
              }, { onConflict: 'user_id' });

            if (profileError) {
              console.error('Error updating user profile:', profileError);
              // Continue anyway - profile update is not critical
            }

            // Create or update user tokens (only if doesn't exist - don't overwrite existing tokens)
            const { data: existingTokens } = await supabase
              .from('user_tokens')
              .select('*')
              .eq('user_id', user.id)
              .maybeSingle();

            if (!existingTokens) {
              // Only create if doesn't exist - preserve any tokens from localStorage migration
              const { error: tokensError } = await supabase
                .from('user_tokens')
                .upsert({
                  user_id: user.id,
                  user_email: user.email || '',
                  balance: 0,
                  total_earned: 0,
                  total_spent: 0,
                  level: 'Basic',
                  package_type: 'Basic'
                }, { onConflict: 'user_id' });

              if (tokensError) {
                console.error('Error creating user tokens:', tokensError);
                // Continue anyway - tokens can be created later
              } else {
                console.log('✅ User tokens record created for Google login');
              }
            }
          } catch (error) {
            console.error('Error in profile/tokens update:', error);
            // Continue anyway
          }
        }

        // Redirect to dashboard or saved redirect path
        const redirectPath = typeof window !== 'undefined' 
          ? localStorage.getItem('authRedirect') || '/dashboard'
          : '/dashboard';
        
        // Clear the saved redirect path
        if (typeof window !== 'undefined') {
          localStorage.removeItem('authRedirect');
        }
        
        console.log('✅ Authentication successful, redirecting to:', redirectPath);
        const { trackGoogleConversion } = await import("@/lib/analytics/googleAds");
        trackGoogleConversion("signup", { dedupeKey: user.id || "once" });
        router.push(redirectPath);
      } catch (error: any) {
        console.error('Error in auth callback:', error);
        router.push(`/auth?error=${encodeURIComponent(error.message || 'unknown_error')}`);
      }
    };

    handleCallback();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700">
      <div className="text-center">
        <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-green-600 rounded-full mb-6 shadow-2xl flex items-center justify-center mx-auto animate-spin">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-green-400 bg-clip-text text-transparent">
          Autentificare în curs...
        </h2>
        <p className="text-gray-300">Te redirecționăm...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-300">Se încarcă...</p>
        </div>
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}


