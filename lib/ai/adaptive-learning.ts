/**
 * Sistem de învățare adaptivă pentru căutări
 * Se adaptează la modul în care fiecare client vorbește și caută
 */

interface SearchPattern {
  original: string;
  corrected: string;
  category?: string;
  timestamp: number;
  source: 'voice' | 'text';
  success: boolean; // dacă utilizatorul a selectat rezultatul
}

interface UserCorrections {
  [key: string]: {
    corrected: string;
    count: number;
    lastUsed: number;
  };
}

/**
 * Stochează pattern-ul de căutare pentru învățare
 */
export function storeSearchPattern(
  original: string,
  corrected: string,
  category?: string,
  source: 'voice' | 'text' = 'text',
  success: boolean = false
): void {
  try {
    if (typeof window === 'undefined') return;

    const pattern: SearchPattern = {
      original: original.toLowerCase().trim(),
      corrected: corrected.toLowerCase().trim(),
      category,
      timestamp: Date.now(),
      source,
      success,
    };

    // Stochează în localStorage (pentru fiecare client)
    const key = 'gobid_search_patterns';
    const existing = localStorage.getItem(key);
    const patterns: SearchPattern[] = existing ? JSON.parse(existing) : [];

    // Adaugă noul pattern
    patterns.push(pattern);

    // Păstrează doar ultimele 1000 de pattern-uri (pentru performanță)
    const recentPatterns = patterns
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 1000);

    localStorage.setItem(key, JSON.stringify(recentPatterns));

    // Actualizează dicționarul de corecții
    updateCorrectionsDictionary(original, corrected);
  } catch (error) {
    console.warn('Error storing search pattern:', error);
  }
}

/**
 * Actualizează dicționarul de corecții bazat pe pattern-uri
 */
function updateCorrectionsDictionary(original: string, corrected: string): void {
  try {
    if (typeof window === 'undefined') return;

    const key = 'gobid_corrections';
    const existing = localStorage.getItem(key);
    const corrections: UserCorrections = existing ? JSON.parse(existing) : {};

    const originalKey = original.toLowerCase().trim();
    
    if (!corrections[originalKey]) {
      corrections[originalKey] = {
        corrected: corrected.toLowerCase().trim(),
        count: 1,
        lastUsed: Date.now(),
      };
    } else {
      // Dacă corecția se potrivește, incrementează contorul
      if (corrections[originalKey].corrected === corrected.toLowerCase().trim()) {
        corrections[originalKey].count++;
        corrections[originalKey].lastUsed = Date.now();
      } else {
        // Dacă există o corecție diferită, verifică care este mai frecventă
        // Păstrează cea mai folosită
        if (corrections[originalKey].count < 2) {
          corrections[originalKey].corrected = corrected.toLowerCase().trim();
          corrections[originalKey].count = 1;
          corrections[originalKey].lastUsed = Date.now();
        }
      }
    }

    localStorage.setItem(key, JSON.stringify(corrections));
  } catch (error) {
    console.warn('Error updating corrections dictionary:', error);
  }
}

/**
 * Obține corecții bazate pe învățare adaptivă
 */
export function getAdaptiveCorrection(query: string): string | null {
  try {
    if (typeof window === 'undefined') return null;

    const key = 'gobid_corrections';
    const existing = localStorage.getItem(key);
    if (!existing) return null;

    const corrections: UserCorrections = JSON.parse(existing);
    const queryKey = query.toLowerCase().trim();

    // Caută corecție exactă
    if (corrections[queryKey] && corrections[queryKey].count >= 2) {
      return corrections[queryKey].corrected;
    }

    // Caută corecții parțiale (pentru cuvinte din query)
    const words = queryKey.split(/\s+/);
    for (const word of words) {
      if (corrections[word] && corrections[word].count >= 2) {
        // Înlocuiește cuvântul în query cu corecția
        return queryKey.replace(new RegExp(`\\b${word}\\b`, 'gi'), corrections[word].corrected);
      }
    }

    return null;
  } catch (error) {
    console.warn('Error getting adaptive correction:', error);
    return null;
  }
}

/**
 * Obține pattern-uri similare pentru sugestii
 */
export function getSimilarPatterns(query: string, limit: number = 5): string[] {
  try {
    if (typeof window === 'undefined') return [];

    const key = 'gobid_search_patterns';
    const existing = localStorage.getItem(key);
    if (!existing) return [];

    const patterns: SearchPattern[] = JSON.parse(existing);
    const queryLower = query.toLowerCase().trim();
    const words = queryLower.split(/\s+/);

    // Găsește pattern-uri similare (care conțin cel puțin 2 cuvinte comune)
    const similar = patterns
      .filter(p => {
        const patternWords = p.original.split(/\s+/);
        const commonWords = words.filter(w => patternWords.includes(w));
        return commonWords.length >= 2 && p.success;
      })
      .sort((a, b) => b.timestamp - a.timestamp) // Cele mai recente primele
      .slice(0, limit)
      .map(p => p.corrected);

    return Array.from(new Set(similar));
  } catch (error) {
    console.warn('Error getting similar patterns:', error);
    return [];
  }
}

/**
 * Marchează o căutare ca fiind reușită (utilizatorul a selectat un rezultat)
 */
export function markSearchAsSuccess(original: string, corrected: string): void {
  try {
    if (typeof window === 'undefined') return;

    const key = 'gobid_search_patterns';
    const existing = localStorage.getItem(key);
    if (!existing) return;

    const patterns: SearchPattern[] = JSON.parse(existing);
    const originalLower = original.toLowerCase().trim();
    const correctedLower = corrected.toLowerCase().trim();

    // Marchează pattern-urile similare ca fiind reușite
    patterns.forEach(p => {
      if (
        (p.original === originalLower || p.corrected === correctedLower) &&
        !p.success
      ) {
        p.success = true;
      }
    });

    localStorage.setItem(key, JSON.stringify(patterns));
  } catch (error) {
    console.warn('Error marking search as success:', error);
  }
}

/**
 * Obține statistici despre căutări pentru o categorie
 */
export function getCategorySearchStats(category: string): {
  total: number;
  successful: number;
  commonQueries: string[];
} {
  try {
    if (typeof window === 'undefined') {
      return { total: 0, successful: 0, commonQueries: [] };
    }

    const key = 'gobid_search_patterns';
    const existing = localStorage.getItem(key);
    if (!existing) {
      return { total: 0, successful: 0, commonQueries: [] };
    }

    const patterns: SearchPattern[] = JSON.parse(existing);
    const categoryPatterns = patterns.filter(
      p => p.category?.toLowerCase() === category.toLowerCase()
    );

    const total = categoryPatterns.length;
    const successful = categoryPatterns.filter(p => p.success).length;

    // Găsește query-urile cele mai comune
    const queryCounts: Record<string, number> = {};
    categoryPatterns.forEach(p => {
      const query = p.corrected;
      queryCounts[query] = (queryCounts[query] || 0) + 1;
    });

    const commonQueries = Object.entries(queryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([query]) => query);

    return { total, successful, commonQueries };
  } catch (error) {
    console.warn('Error getting category search stats:', error);
    return { total: 0, successful: 0, commonQueries: [] };
  }
}

