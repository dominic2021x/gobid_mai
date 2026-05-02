/**
 * Helper functions pentru tracking-ul produselor vizionate recent
 */

export interface RecentlyViewedProduct {
  id: string;
  title: string;
  image?: string | string[];
  price?: number;
  currency?: string;
  slug?: string;
  url?: string;
  viewedAt: number;
}

/**
 * Salvează un produs în istoricul de produse vizionate
 */
export function trackProductView(product: {
  id: string;
  title: string;
  image?: string | string[];
  price?: number;
  currency?: string;
  slug?: string;
  url?: string;
}): void {
  if (typeof window === 'undefined') return;

  try {
    const existing = localStorage.getItem('recentlyViewedProducts');
    const products: RecentlyViewedProduct[] = existing ? JSON.parse(existing) : [];

    // Elimină produsul dacă există deja (pentru a-l muta la început)
    const filtered = products.filter(p => p.id !== product.id);

    // Adaugă produsul la început
    const newProduct: RecentlyViewedProduct = {
      ...product,
      viewedAt: Date.now(),
    };

    // Limitează la ultimele 50 produse
    const updated = [newProduct, ...filtered].slice(0, 50);

    localStorage.setItem('recentlyViewedProducts', JSON.stringify(updated));
  } catch (error) {
    console.error('Error tracking product view:', error);
  }
}

/**
 * Obține produsele vizionate recent
 */
export function getRecentlyViewedProducts(limit: number = 12): RecentlyViewedProduct[] {
  if (typeof window === 'undefined') return [];

  try {
    const saved = localStorage.getItem('recentlyViewedProducts');
    if (!saved) return [];

    const products: RecentlyViewedProduct[] = JSON.parse(saved);
    return products
      .sort((a, b) => b.viewedAt - a.viewedAt)
      .slice(0, limit);
  } catch (error) {
    console.error('Error getting recently viewed products:', error);
    return [];
  }
}

/**
 * Șterge istoricul produselor vizionate
 */
export function clearRecentlyViewedProducts(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('recentlyViewedProducts');
}
