import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


/**
 * Test endpoint to check what link Supabase generates
 * Usage: GET /api/auth/reset-password/test?email=test@example.com
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const email = searchParams.get('email');

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Please provide a valid email parameter: ?email=test@example.com' },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    // Check if user exists
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (userError) {
      return NextResponse.json(
        { error: 'Error listing users', details: userError.message },
        { status: 500 }
      );
    }

    const user = userData?.users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
    
    if (!user) {
      return NextResponse.json({
        error: 'User not found',
        email: email
      });
    }

    // Generate recovery link with production URL
    const productionUrl = 'https://gobid.ro';
    const finalRedirectTo = `${productionUrl}/auth/reset-password`;

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email.trim(),
      options: {
        redirectTo: finalRedirectTo,
      },
    });

    if (linkError || !linkData?.properties?.action_link) {
      return NextResponse.json({
        error: 'Error generating link',
        details: linkError
      }, { status: 500 });
    }

    let resetLink = linkData.properties.action_link;
    
    // Apply the same correction logic as the main endpoint
    // Parse and fix the URL (same logic as main endpoint)
    try {
      const url = new URL(resetLink);
      const redirectToParam = url.searchParams.get('redirect_to');
      
      if (redirectToParam) {
        // Decode URL if needed (may be double-encoded)
        let decodedRedirectTo = redirectToParam;
        try {
          decodedRedirectTo = decodeURIComponent(redirectToParam);
          if (decodedRedirectTo.includes('%')) {
            decodedRedirectTo = decodeURIComponent(decodedRedirectTo);
          }
        } catch (e) {
          decodedRedirectTo = redirectToParam;
        }
        
        // ALWAYS replace if it's not exactly the production URL
        if (decodedRedirectTo !== `${productionUrl}/auth/reset-password` ||
            decodedRedirectTo.includes('localhost') ||
            decodedRedirectTo.includes('vercel') ||
            !decodedRedirectTo.includes('gobid.ro')) {
          url.searchParams.set('redirect_to', `${productionUrl}/auth/reset-password`);
          resetLink = url.toString();
        }
      } else {
        url.searchParams.set('redirect_to', `${productionUrl}/auth/reset-password`);
        resetLink = url.toString();
      }
    } catch (e) {
      // Fallback: simple string replacement
      resetLink = resetLink.replace(/redirect_to=([^&]+)/g, (match, value) => {
        const decoded = decodeURIComponent(value);
        if (decoded.includes('localhost') || decoded.includes('vercel') || !decoded.includes('gobid.ro')) {
          return `redirect_to=${encodeURIComponent(`${productionUrl}/auth/reset-password`)}`;
        }
        return match;
      });
    }
    
    // Final verification
    try {
      const finalUrl = new URL(resetLink);
      const finalRedirectTo = finalUrl.searchParams.get('redirect_to');
      
      if (finalRedirectTo) {
        let decodedFinal = finalRedirectTo;
        try {
          decodedFinal = decodeURIComponent(finalRedirectTo);
          if (decodedFinal.includes('%')) {
            decodedFinal = decodeURIComponent(decodedFinal);
          }
        } catch (e) {
          decodedFinal = finalRedirectTo;
        }
        
        if (decodedFinal !== `${productionUrl}/auth/reset-password` ||
            !decodedFinal.includes('gobid.ro') ||
            decodedFinal.includes('localhost') ||
            decodedFinal.includes('vercel')) {
          finalUrl.searchParams.set('redirect_to', `${productionUrl}/auth/reset-password`);
          resetLink = finalUrl.toString();
        }
      }
    } catch (e) {
      // Ignore
    }
    
    // Parse and show what's in the link AFTER correction
    let redirectToParam = null;
    try {
      const url = new URL(resetLink);
      redirectToParam = url.searchParams.get('redirect_to');
    } catch (e) {
      // Ignore
    }

    return NextResponse.json({
      success: true,
      email: email,
      requestedRedirectTo: finalRedirectTo,
      generatedLink: resetLink,
      redirectToInLink: redirectToParam,
      linkPreview: resetLink.substring(0, 300),
      analysis: {
        containsGobidRo: resetLink.includes('gobid.ro'),
        containsVercel: resetLink.includes('vercel'),
        containsLocalhost: resetLink.includes('localhost'),
        redirectToIsCorrect: redirectToParam?.includes('gobid.ro') && !redirectToParam?.includes('vercel') && !redirectToParam?.includes('localhost'),
        redirectToValue: redirectToParam
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}
