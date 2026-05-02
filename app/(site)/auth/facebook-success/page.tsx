"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";

function FacebookSuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const dataParam = searchParams?.get?.('data') ?? null;
    const isAdmin = (searchParams?.get?.('admin') ?? 'false') === 'true';

    if (dataParam) {
      try {
        const userInfo = JSON.parse(decodeURIComponent(dataParam));
        
        // Save to localStorage
        localStorage.setItem('userInfo', JSON.stringify(userInfo));
        
        // Redirect based on admin or user
        if (isAdmin) {
          router.push('/admin');
        } else {
          // Get redirect path from localStorage or default to dashboard
          const redirectPath = typeof window !== 'undefined' 
            ? localStorage.getItem('authRedirect') || '/dashboard'
            : '/dashboard';
          
          // Clear the saved redirect path
          if (typeof window !== 'undefined') {
            localStorage.removeItem('authRedirect');
          }
          
          router.push(redirectPath);
        }
      } catch (error) {
        console.error('Error parsing user data:', error);
        router.push('/auth?error=parse_error');
      }
    } else {
      router.push('/auth?error=no_data');
    }
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-white text-lg">Conectare cu Facebook...</p>
      </div>
    </div>
  );
}

export default function FacebookSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-white text-lg">Se încarcă...</p>
        </div>
      </div>
    }>
      <FacebookSuccessContent />
    </Suspense>
  );
}


