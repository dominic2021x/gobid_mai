import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


/**
 * Check Supabase configuration for password reset URLs
 * This endpoint helps verify if Site URL and Redirect URLs are configured correctly
 */
export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    // Note: Supabase Admin API doesn't directly expose Site URL configuration
    // But we can check what URLs are being used when generating links
    
    // Try to get project settings (if available)
    const config = {
      productionUrl: 'https://gobid.ro',
      expectedRedirectUrl: 'https://gobid.ro/auth/reset-password',
      note: 'Supabase Site URL must be set to https://gobid.ro in Dashboard → Authentication → URL Configuration'
    };

    // Test: Generate a dummy link to see what redirect_to Supabase uses by default
    // We'll use a test email that doesn't exist to avoid side effects
    const testEmail = 'test-config-check-' + Date.now() + '@example.com';
    
    try {
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: testEmail,
        options: {
          redirectTo: 'https://gobid.ro/auth/reset-password',
        },
      });

      let analysis = {
        linkGenerated: !!linkData?.properties?.action_link,
        redirectToInLink: null as string | null,
        containsLocalhost: false,
        containsVercel: false,
        containsGobidRo: false,
        isCorrect: false
      };

      if (linkData?.properties?.action_link) {
        try {
          const url = new URL(linkData.properties.action_link);
          const redirectTo = url.searchParams.get('redirect_to');
          analysis.redirectToInLink = redirectTo;
          
          if (redirectTo) {
            const decoded = decodeURIComponent(redirectTo);
            analysis.containsLocalhost = decoded.includes('localhost');
            analysis.containsVercel = decoded.includes('vercel');
            analysis.containsGobidRo = decoded.includes('gobid.ro');
            analysis.isCorrect = decoded === 'https://gobid.ro/auth/reset-password' && 
                                 !decoded.includes('localhost') && 
                                 !decoded.includes('vercel');
          }
        } catch (e) {
          // Ignore parsing errors
        }
      }

      return NextResponse.json({
        success: true,
        config,
        testResult: {
          email: testEmail,
          linkGenerated: !!linkData?.properties?.action_link,
          linkPreview: linkData?.properties?.action_link?.substring(0, 300),
          analysis,
          error: linkError?.message
        },
        recommendations: {
          siteUrl: 'Set Site URL to: https://gobid.ro',
          redirectUrls: [
            'Add to Redirect URLs:',
            '  - https://gobid.ro/auth/reset-password',
            '  - https://gobid.ro/auth/callback',
            '  - https://gobid.ro/**'
          ],
          steps: [
            '1. Go to Supabase Dashboard',
            '2. Select your project',
            '3. Go to Authentication → URL Configuration',
            '4. Set Site URL to: https://gobid.ro',
            '5. Add Redirect URLs listed above',
            '6. Save changes'
          ]
        }
      });
    } catch (testError: any) {
      return NextResponse.json({
        success: true,
        config,
        testResult: {
          error: testError.message
        },
        recommendations: {
          siteUrl: 'Set Site URL to: https://gobid.ro',
          redirectUrls: [
            'Add to Redirect URLs:',
            '  - https://gobid.ro/auth/reset-password',
            '  - https://gobid.ro/auth/callback',
            '  - https://gobid.ro/**'
          ],
          steps: [
            '1. Go to Supabase Dashboard',
            '2. Select your project',
            '3. Go to Authentication → URL Configuration',
            '4. Set Site URL to: https://gobid.ro',
            '5. Add Redirect URLs listed above',
            '6. Save changes'
          ]
        }
      });
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}
