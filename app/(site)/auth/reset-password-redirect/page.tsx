"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

/**
 * Intermediate redirect page that fixes Supabase redirect URLs
 * This page handles the redirect from Supabase and fixes localhost URLs
 */
function ResetPasswordRedirectContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    // Get all URL parameters
    const token = searchParams.get('token');
    const type = searchParams.get('type');
    const error = searchParams.get('error');
    const errorCode = searchParams.get('error_code');
    const errorDescription = searchParams.get('error_description');

    // If there's an error, redirect to reset password page with error
    if (error) {
      const errorParams = new URLSearchParams();
      if (errorCode) errorParams.set('error_code', errorCode);
      if (errorDescription) errorParams.set('error_description', errorDescription);
      
      router.push(`/auth/reset-password?${errorParams.toString()}`);
      return;
    }

    // If we have a token, redirect to reset password page with token
    if (token && type === 'recovery') {
      const params = new URLSearchParams();
      params.set('token', token);
      params.set('type', type);
      
      // Always use production URL
      router.push(`/auth/reset-password?${params.toString()}`);
    } else {
      // No token, just go to reset password page
      router.push('/auth/reset-password');
    }
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Se procesează link-ul de resetare...</p>
      </div>
    </div>
  );
}

export default function ResetPasswordRedirectPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Se încarcă...</p>
        </div>
      </div>
    }>
      <ResetPasswordRedirectContent />
    </Suspense>
  );
}
