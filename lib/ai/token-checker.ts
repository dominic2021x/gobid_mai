/**
 * Verifică accesul utilizatorului la anunțuri bazat pe tokeni
 */

export interface TokenCheckResult {
  hasAccess: boolean;
  message?: string;
  tokensRemaining?: number;
}

/**
 * Verifică dacă utilizatorul are token pentru a accesa un anunț
 * Funcționează atât server-side cât și client-side
 */
export function checkTokenAccess(userId?: string, productId?: string): TokenCheckResult {
  // Pe server-side, returnează că are acces (verificarea reală se face pe client)
  if (typeof window === 'undefined') {
    return { hasAccess: true };
  }

  try {
    // Verifică tokeni utilizator
    const tokensData = localStorage.getItem('userTokens');
    if (!tokensData) {
      return {
        hasAccess: false,
        message: 'Lista este blocată, vă rugăm să deblocați tokenul',
        tokensRemaining: 0,
      };
    }

    const tokens = JSON.parse(tokensData);
    
    // Verifică dacă are tokeni
    if (tokens.balance < 1) {
      return {
        hasAccess: false,
        message: 'Lista este blocată, vă rugăm să deblocați tokenul',
        tokensRemaining: tokens.balance,
      };
    }

    // Verifică dacă anunțul este deja deblocat
    if (productId) {
      const unlockedData = localStorage.getItem('unlockedAuctions') || '[]';
      const unlocked = JSON.parse(unlockedData);
      
      if (unlocked.includes(productId)) {
        return {
          hasAccess: true,
          tokensRemaining: tokens.balance,
        };
      }
    }

    return {
      hasAccess: true,
      tokensRemaining: tokens.balance,
    };
  } catch (error) {
    console.error('Error checking token access:', error);
    return {
      hasAccess: false,
      message: 'Eroare la verificarea accesului',
    };
  }
}

/**
 * Generează mesaj vocal pentru acces blocat
 * Verifică template-uri custom din configurație
 */
export function generateVoiceMessage(result: TokenCheckResult): string {
  if (!result.hasAccess && result.message) {
    // Verifică dacă există template custom
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('aiResponseConfig');
        if (saved) {
          const config = JSON.parse(saved);
          if (config.templates?.tokenBlocked) {
            return config.templates.tokenBlocked;
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }
    return result.message;
  }
  return '';
}

