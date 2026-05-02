/**
 * Google OAuth Authentication Service
 * Documentation: https://developers.google.com/identity/protocols/oauth2
 */

export interface GoogleAuthConfig {
  clientId: string; // Google OAuth Client ID
  clientSecret: string; // Google OAuth Client Secret
  redirectUri: string; // Redirect URI after authentication
  scopes?: string[]; // OAuth scopes (default: profile, email)
}

export interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
  verified_email?: boolean;
}

export interface GoogleAuthResponse {
  success: boolean;
  message?: string;
  userInfo?: GoogleUserInfo;
  accessToken?: string;
  refreshToken?: string;
}

/**
 * Google OAuth Service
 */
class GoogleAuthService {
  private config: GoogleAuthConfig | null = null;
  private baseUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  private tokenUrl = 'https://oauth2.googleapis.com/token';
  private userInfoUrl = 'https://www.googleapis.com/oauth2/v2/userinfo';

  /**
   * Initialize Google Auth with configuration
   */
  initialize(config: GoogleAuthConfig) {
    this.config = {
      ...config,
      scopes: config.scopes || ['profile', 'email'],
    };
  }

  /**
   * Get configuration from localStorage or environment
   */
  private getConfig(): GoogleAuthConfig {
    if (this.config) {
      return this.config;
    }

    // Try to get from localStorage
    const storedConfig = typeof window !== 'undefined' ? localStorage.getItem('google_auth_config') : null;
    if (storedConfig) {
      try {
        return JSON.parse(storedConfig);
      } catch (e) {
        console.error('Error parsing Google Auth config:', e);
      }
    }

    // Try environment variables
    return {
      clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI || 
        (typeof window !== 'undefined' ? `${window.location.origin}/auth/google/callback` : ''),
      scopes: ['profile', 'email'],
    };
  }

  /**
   * Test Google Auth configuration
   */
  async testConnection(): Promise<{ success: boolean; message: string; data?: any }> {
    const config = this.getConfig();

    if (!config.clientId || !config.clientSecret) {
      return {
        success: false,
        message: 'Configurația Google Auth este incompletă! Completează Client ID și Client Secret.',
      };
    }

    try {
      // Validate Client ID format (basic check)
      if (!config.clientId.includes('.apps.googleusercontent.com')) {
        return {
          success: false,
          message: 'Client ID invalid! Client ID-ul Google trebuie să conțină ".apps.googleusercontent.com"',
        };
      }

      // Check redirect URI format
      if (!config.redirectUri || !config.redirectUri.startsWith('http')) {
        return {
          success: false,
          message: 'Redirect URI invalid! Trebuie să fie o adresă URL completă.',
        };
      }

      return {
        success: true,
        message: 'Configurația Google Auth este validă și gata de utilizare!',
        data: {
          clientId: config.clientId.substring(0, 20) + '...',
          redirectUri: config.redirectUri,
          scopes: config.scopes || ['profile', 'email'],
        },
      };
    } catch (error: any) {
      console.error('Google Auth API Error:', error);
      return {
        success: false,
        message: error.message || 'Network error occurred',
      };
    }
  }

  /**
   * Generate Google OAuth authorization URL
   */
  getAuthorizationUrl(state?: string): string {
    const config = this.getConfig();
    
    if (!config.clientId || !config.redirectUri) {
      throw new Error('Google Auth nu este configurat! Completează configurația mai întâi.');
    }

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: (config.scopes || ['profile', 'email']).join(' '),
      access_type: 'offline',
      prompt: 'consent',
      ...(state && { state }),
    });

    return `${this.baseUrl}?${params.toString()}`;
  }

  /**
   * Redirect to Google OAuth login
   */
  redirectToLogin(state?: string) {
    if (typeof window !== 'undefined') {
      window.location.href = this.getAuthorizationUrl(state);
    }
  }

  /**
   * Exchange authorization code for access token
   */
  async getAccessToken(code: string): Promise<GoogleAuthResponse> {
    const config = this.getConfig();

    if (!config.clientId || !config.clientSecret) {
      return {
        success: false,
        message: 'Google Auth nu este configurat!',
      };
    }

    try {
      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: config.redirectUri,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          message: error.error_description || 'Eroare la obținerea token-ului',
        };
      }

      const data = await response.json();
      
      // Get user info
      const userInfoResponse = await fetch(this.userInfoUrl, {
        headers: {
          Authorization: `Bearer ${data.access_token}`,
        },
      });

      if (!userInfoResponse.ok) {
        return {
          success: false,
          message: 'Eroare la obținerea informațiilor utilizatorului',
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
        };
      }

      const userInfo = await userInfoResponse.json();

      return {
        success: true,
        message: 'Autentificare Google reușită!',
        userInfo: {
          id: userInfo.id,
          email: userInfo.email,
          name: userInfo.name,
          picture: userInfo.picture,
          given_name: userInfo.given_name,
          family_name: userInfo.family_name,
          verified_email: userInfo.verified_email,
        },
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Eroare la autentificare',
      };
    }
  }

  /**
   * Get user info from access token
   */
  async getUserInfo(accessToken: string): Promise<GoogleUserInfo | null> {
    try {
      const response = await fetch(this.userInfoUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return {
        id: data.id,
        email: data.email,
        name: data.name,
        picture: data.picture,
        given_name: data.given_name,
        family_name: data.family_name,
        verified_email: data.verified_email,
      };
    } catch (error) {
      console.error('Error fetching user info:', error);
      return null;
    }
  }
}

// Export singleton instance
export const googleAuth = new GoogleAuthService();




















