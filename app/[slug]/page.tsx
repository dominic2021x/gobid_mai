"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

/**
 * Pagină catch-all pentru slug-uri la root
 * Redirecționează către /licitatii-publice/[slug] dacă există un produs cu acel slug
 */
export default function SlugRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;

  useEffect(() => {
    const checkAndRedirect = async () => {
      if (!slug) {
        router.push('/');
        return;
      }

      try {
        // Verifică dacă există un produs cu acest slug
        const { data: product, error } = await supabase
          .from('products')
          .select('slug, url, product_type')
          .eq('slug', slug)
          .neq('status', 'deleted')
          .maybeSingle();

        if (error && error.code !== 'PGRST116') {
          console.error('Error checking product by slug:', error);
        }

        if (product) {
          // Determină ruta bazat pe product_type
          const productTypeRoutes: Record<string, string> = {
            'licitatii-publice': 'licitatii-publice',
            'live-bid': 'live_bid',
            'buy-now': 'produs',
          };
          
          const productType = product.product_type || 'produse';
          const route = productTypeRoutes[productType] || 'produse';
          router.replace(`/${route}/${slug}`);
          return;
        }

        // Verifică dacă există un produs cu URL-ul care se termină cu acest slug
        const { data: urlProduct, error: urlError } = await supabase
          .from('products')
          .select('slug, url, product_type')
          .ilike('url', `%/${slug}`)
          .neq('status', 'deleted')
          .maybeSingle();

        if (urlError && urlError.code !== 'PGRST116') {
          console.error('Error checking product by URL:', urlError);
        }

        if (urlProduct && urlProduct.slug) {
          // Determină ruta bazat pe product_type
          const productTypeRoutes: Record<string, string> = {
            'licitatii-publice': 'licitatii-publice',
            'live-bid': 'live_bid',
            'buy-now': 'produs',
          };
          
          const productType = urlProduct.product_type || 'produse';
          const route = productTypeRoutes[productType] || 'produse';
          router.replace(`/${route}/${urlProduct.slug}`);
          return;
        }

        // Nu există produs, redirecționează către homepage
        router.replace('/');
      } catch (error) {
        console.error('Error in slug redirect:', error);
        router.replace('/');
      }
    };

    checkAndRedirect();
  }, [slug, router]);

  // Afișează un mesaj de încărcare în timpul redirecționării
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600 dark:text-gray-400">Se încarcă...</p>
      </div>
    </div>
  );
}

