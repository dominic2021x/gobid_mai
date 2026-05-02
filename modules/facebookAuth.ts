/**
 * Facebook OAuth Authentication Service
 * Documentation: https://developers.facebook.com/docs/facebook-login
 */

export interface FacebookAuthConfig {
  appId: string; // Facebook App ID
  appSecret: string; // Facebook App Secret
  redirectUri: string; // Redirect URI after authentication
  scopes?: string[]; // OAuth scopes (default: email, public_profile)
  version?: string; // Facebook API version (default: v18.0)
}

export interface FacebookUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: {
    data: {
      url: string;
      is_silhouette: boolean;
    };
  };
  first_name?: string;
  last_name?: string;
}

export interface FacebookAuthResponse {
  success: boolean;
  message?: string;
  userInfo?: FacebookUserInfo;
  accessToken?: string;
}

/**
 * Facebook OAuth Service
 */
class FacebookAuthService {
  private config: FacebookAuthConfig | null = null;
  private baseUrl = 'https://www.facebook.com/v18.0/dialog/oauth';
  private tokenUrl = 'https://graph.facebook.com/v18.0/oauth/access_token';
  private userInfoUrl = 'https://graph.facebook.com/v18.0/me';

  /**
   * Initialize Facebook Auth with configuration
   */
  initialize(config: FacebookAuthConfig) {
    this.config = {
      ...config,
      scopes: config.scopes || ['email', 'public_profile'],
      version: config.version || 'v18.0',
    };
    this.baseUrl = `https://www.facebook.com/${this.config.version}/dialog/oauth`;
    this.tokenUrl = `https://graph.facebook.com/${this.config.version}/oauth/access_token`;
    this.userInfoUrl = `https://graph.facebook.com/${this.config.version}/me`;
  }

  /**
   * Get configuration from localStorage or environment
   */
  private getConfig(): FacebookAuthConfig {
    if (this.config) {
      return this.config;
    }

    // Try to get from localStorage
    const storedConfig = typeof window !== 'undefined' ? localStorage.getItem('facebook_auth_config') : null;
    if (storedConfig) {
      try {
        return JSON.parse(storedConfig);
      } catch (e) {
        console.error('Error parsing Facebook Auth config:', e);
      }
    }

    // Try environment variables
    return {
      appId: process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || '',
      appSecret: process.env.FACEBOOK_APP_SECRET || '',
      redirectUri: process.env.NEXT_PUBLIC_FACEBOOK_REDIRECT_URI || 
        (typeof window !== 'undefined' ? `${window.location.origin}/auth/facebook/callback` : ''),
      scopes: ['email', 'public_profile'],
      version: 'v18.0',
    };
  }

  /**
   * Test Facebook Auth configuration
   */
  async testConnection(): Promise<{ success: boolean; message: string; data?: any }> {
    const config = this.getConfig();

    if (!config.appId || !config.appSecret) {
      return {
        success: false,
        message: 'Configurația Facebook Auth este incompletă! Completează App ID și App Secret.',
      };
    }

    try {
      // Validate App ID format (basic check)
      if (!/^\d+$/.test(config.appId)) {
        return {
          success: false,
          message: 'App ID invalid! App ID-ul Facebook trebuie să fie un număr.',
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
        message: 'Configurația Facebook Auth este validă și gata de utilizare!',
        data: {
          appId: config.appId.substring(0, 10) + '...',
          redirectUri: config.redirectUri,
          scopes: config.scopes || ['email', 'public_profile'],
          version: config.version || 'v18.0',
        },
      };
    } catch (error: any) {
      console.error('Facebook Auth API Error:', error);
      return {
        success: false,
        message: error.message || 'Network error occurred',
      };
    }
  }

  /**
   * Generate Facebook OAuth authorization URL
   */
  getAuthorizationUrl(state?: string): string {
    const config = this.getConfig();
    
    if (!config.appId || !config.redirectUri) {
      throw new Error('Facebook Auth nu este configurat! Completează configurația mai întâi.');
    }

    const params = new URLSearchParams({
      client_id: config.appId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: (config.scopes || ['email', 'public_profile']).join(','),
      ...(state && { state }),
    });

    return `${this.baseUrl}?${params.toString()}`;
  }

  /**
   * Redirect to Facebook OAuth login
   */
  redirectToLogin(state?: string) {
    if (typeof window !== 'undefined') {
      window.location.href = this.getAuthorizationUrl(state);
    }
  }

  /**
   * Exchange authorization code for access token
   */
  async getAccessToken(code: string): Promise<FacebookAuthResponse> {
    const config = this.getConfig();

    if (!config.appId || !config.appSecret) {
      return {
        success: false,
        message: 'Facebook Auth nu este configurat!',
      };
    }

    try {
      // First, exchange code for access token
      const tokenResponse = await fetch(
        `${this.tokenUrl}?client_id=${config.appId}&client_secret=${config.appSecret}&redirect_uri=${encodeURIComponent(config.redirectUri)}&code=${code}`
      );

      if (!tokenResponse.ok) {
        const error = await tokenResponse.json();
        return {
          success: false,
          message: error.error?.message || 'Eroare la obținerea token-ului',
        };
      }

      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;

      // Get user info
      const userInfoResponse = await fetch(
        `${this.userInfoUrl}?fields=id,name,email,first_name,last_name,picture&access_token=${accessToken}`
      );

      if (!userInfoResponse.ok) {
        return {
          success: false,
          message: 'Eroare la obținerea informațiilor utilizatorului',
          accessToken,
        };
      }

      const userInfo = await userInfoResponse.json();

      return {
        success: true,
        message: 'Autentificare Facebook reușită!',
        userInfo: {
          id: userInfo.id,
          email: userInfo.email || '',
          name: userInfo.name,
          picture: userInfo.picture,
          first_name: userInfo.first_name,
          last_name: userInfo.last_name,
        },
        accessToken,
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
  async getUserInfo(accessToken: string): Promise<FacebookUserInfo | null> {
    try {
      const response = await fetch(
        `${this.userInfoUrl}?fields=id,name,email,first_name,last_name,picture&access_token=${accessToken}`
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return {
        id: data.id,
        email: data.email || '',
        name: data.name,
        picture: data.picture,
        first_name: data.first_name,
        last_name: data.last_name,
      };
    } catch (error) {
      console.error('Error fetching user info:', error);
      return null;
    }
  }
}

// Export singleton instance
export const facebookAuth = new FacebookAuthService();

















