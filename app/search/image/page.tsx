"use client";

import { useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function ImageSearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Redirect to /ro with the same imageUrl parameter
  useEffect(() => {
    const imageUrl = searchParams?.get('imageUrl');
    if (imageUrl) {
      router.replace(`/ro?imageUrl=${encodeURIComponent(imageUrl)}`);
    } else {
      router.replace('/ro');
    }
  }, [searchParams, router]);

  // Show loading while redirecting
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
        <p className="text-gray-300">Se redirecționează...</p>
      </div>
    </div>
  );
}

export default function ImageSearchPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    }>
      <ImageSearchPageContent />
    </Suspense>
  );
}
