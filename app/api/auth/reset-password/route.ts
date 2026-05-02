import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, redirectTo } = body;

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Email valid este obligatoriu' },
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
      console.error('Error listing users:', userError);
      return NextResponse.json(
        { error: 'Eroare la verificarea utilizatorului' },
        { status: 500 }
      );
    }

    const user = userData?.users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
    
    if (!user) {
      // Don't reveal if user exists or not for security
      // Return success even if user doesn't exist
      return NextResponse.json({ 
        success: true,
        message: 'Dacă acest email există în sistem, vei primi un email de resetare.'
      });
    }

    // Generate recovery link using admin API (this doesn't send email automatically)
    // ALWAYS use production URL (https://gobid.ro) - never use localhost or Vercel URLs
    // This ensures reset links work correctly in production
    
    // FORCE production URL - always use gobid.ro, ignore Vercel URLs and localhost
    // Use intermediate redirect page that will handle Supabase redirects correctly
    const baseUrl = 'https://gobid.ro';
    const finalRedirectTo = `${baseUrl}/auth/reset-password-redirect`;
    
    // Get request headers for logging only
    const host = request.headers.get('host') || '';
    const requestUrl = request.headers.get('referer') || request.headers.get('origin') || '';
    
    console.log('[Reset Password API] Generating link with:', {
      baseUrl,
      finalRedirectTo,
      host: host || 'N/A',
      requestUrl: requestUrl ? requestUrl.substring(0, 50) : 'N/A',
      environment: process.env.NODE_ENV
    });

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email.trim(),
      options: {
        redirectTo: finalRedirectTo,
      },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error('Error generating recovery link:', linkError);
      return NextResponse.json(
        { error: 'Eroare la generarea link-ului de resetare' },
        { status: 500 }
      );
    }

    let resetLink = linkData.properties.action_link;
    
    console.log('[Reset Password API] Original link from Supabase:', resetLink.substring(0, 200));
    
    // ALWAYS replace any localhost, Vercel URLs, or other non-production URLs
    // Supabase sometimes uses wrong URL even when we provide correct redirectTo
    const productionDomain = 'gobid.ro';
    const productionUrl = 'https://gobid.ro';
    
    // Parse and fix the URL
    try {
      const url = new URL(resetLink);
      const redirectToParam = url.searchParams.get('redirect_to');
      
      console.log('[Reset Password API] Original redirect_to:', redirectToParam);
      
      if (redirectToParam) {
        // Decode URL if needed (may be double-encoded)
        let decodedRedirectTo = redirectToParam;
        try {
          decodedRedirectTo = decodeURIComponent(redirectToParam);
          // Try decoding again in case it's double-encoded
          if (decodedRedirectTo.includes('%')) {
            decodedRedirectTo = decodeURIComponent(decodedRedirectTo);
          }
        } catch (e) {
          // If decoding fails, use original
          decodedRedirectTo = redirectToParam;
        }
        
        console.log('[Reset Password API] Decoded redirect_to:', decodedRedirectTo);
        
        // Check if redirect_to contains localhost, Vercel URLs, or any non-production domain
        const isLocalhost = decodedRedirectTo.includes('localhost') || decodedRedirectTo.includes('127.0.0.1');
        const isVercel = decodedRedirectTo.includes('vercel.app') || decodedRedirectTo.includes('vercel');
        const hasWww = decodedRedirectTo.includes('www.gobid.ro');
        // Check if path is correct - must end with /auth/reset-password-redirect
        const isNotExactPath = !decodedRedirectTo.endsWith('/auth/reset-password-redirect');
        // Also check if it's just the domain without path or with wrong path
        const isJustDomain = decodedRedirectTo === 'https://www.gobid.ro' || decodedRedirectTo === 'https://www.gobid.ro/' || 
                             decodedRedirectTo === 'https://gobid.ro' || decodedRedirectTo === 'https://gobid.ro/';
        const isNotProduction = !decodedRedirectTo.includes('gobid.ro');
        
        // ALWAYS replace if it's not exactly the production URL with correct path
        if (isLocalhost || isVercel || isNotProduction || hasWww || isNotExactPath || isJustDomain || decodedRedirectTo !== `${productionUrl}/auth/reset-password-redirect`) {
          console.log('[Reset Password API] Replacing redirect_to because:', {
            isLocalhost,
            isVercel,
            hasWww,
            isNotExactPath,
            isJustDomain,
            isNotProduction,
            isNotExactMatch: decodedRedirectTo !== `${productionUrl}/auth/reset-password-redirect`,
            original: decodedRedirectTo,
            expected: `${productionUrl}/auth/reset-password-redirect`
          });
          
          // Always use production URL - encode it properly
          url.searchParams.set('redirect_to', `${productionUrl}/auth/reset-password-redirect`);
          resetLink = url.toString();
          
          console.log('[Reset Password API] Fixed redirect_to to:', `${productionUrl}/auth/reset-password-redirect`);
          console.log('[Reset Password API] Updated link:', resetLink.substring(0, 250));
        } else {
          console.log('[Reset Password API] redirect_to is already correct production URL');
        }
      } else {
        // If no redirect_to parameter, add it
        url.searchParams.set('redirect_to', `${productionUrl}/auth/reset-password-redirect`);
        resetLink = url.toString();
        console.log('[Reset Password API] Added redirect_to parameter');
      }
      
      console.log('[Reset Password API] Final link:', resetLink.substring(0, 200));
    } catch (e) {
      console.error('[Reset Password API] Error parsing URL, using string replacement:', e);
      
      // Fallback: simple string replacement
      resetLink = resetLink
        .replace(/localhost:\d+/g, productionDomain)
        .replace(/127\.0\.0\.1:\d+/g, productionDomain)
        .replace(/http:\/\/localhost/g, productionUrl)
        .replace(/http:\/\/127\.0\.0\.1/g, productionUrl)
        .replace(/https?:\/\/[^/&?]*\.vercel\.app[^&?]*/g, productionUrl)
        .replace(/https?:\/\/[^/&?]*vercel[^/&?]*\.app[^&?]*/g, productionUrl);
      
      // Also try to fix redirect_to parameter using regex
      resetLink = resetLink.replace(
        /redirect_to=([^&]+)/g,
        (match, value) => {
          const decoded = decodeURIComponent(value);
          const hasWww = decoded.includes('www.gobid.ro');
          const isJustDomain = decoded === 'https://www.gobid.ro' || decoded === 'https://www.gobid.ro/' || 
                               decoded === 'https://gobid.ro' || decoded === 'https://gobid.ro/';
          const isNotExactPath = !decoded.endsWith('/auth/reset-password-redirect');
          
          if (decoded.includes('localhost') || decoded.includes('vercel') || !decoded.includes('gobid.ro') || 
              hasWww || isJustDomain || isNotExactPath) {
            return `redirect_to=${encodeURIComponent(`${productionUrl}/auth/reset-password-redirect`)}`;
          }
          return match;
        }
      );
    }

    // Final verification: ensure redirect_to is always https://gobid.ro/auth/reset-password
    try {
      const finalUrl = new URL(resetLink);
      const finalRedirectTo = finalUrl.searchParams.get('redirect_to');
      
      if (finalRedirectTo) {
        // Decode and check
        let decodedFinal = finalRedirectTo;
        try {
          decodedFinal = decodeURIComponent(finalRedirectTo);
          if (decodedFinal.includes('%')) {
            decodedFinal = decodeURIComponent(decodedFinal);
          }
        } catch (e) {
          decodedFinal = finalRedirectTo;
        }
        
        // ALWAYS force to production URL if it's not exactly correct
        const hasWww = decodedFinal.includes('www.gobid.ro');
        const isNotExactPath = !decodedFinal.endsWith('/auth/reset-password-redirect');
        const isJustDomain = decodedFinal === 'https://www.gobid.ro' || decodedFinal === 'https://www.gobid.ro/' || 
                             decodedFinal === 'https://gobid.ro' || decodedFinal === 'https://gobid.ro/';
        
        if (decodedFinal !== `${productionUrl}/auth/reset-password-redirect` || 
            !decodedFinal.includes('gobid.ro') || 
            decodedFinal.includes('localhost') || 
            decodedFinal.includes('vercel') ||
            hasWww ||
            isNotExactPath ||
            isJustDomain) {
          finalUrl.searchParams.set('redirect_to', `${productionUrl}/auth/reset-password-redirect`);
          resetLink = finalUrl.toString();
          console.log('[Reset Password API] Final verification: forced redirect_to to production URL');
          console.log('[Reset Password API] Was:', decodedFinal);
          console.log('[Reset Password API] Now:', `${productionUrl}/auth/reset-password-redirect`);
        } else {
          console.log('[Reset Password API] Final verification: redirect_to is correct');
        }
      } else {
        // If no redirect_to, add it
        finalUrl.searchParams.set('redirect_to', `${productionUrl}/auth/reset-password-redirect`);
        resetLink = finalUrl.toString();
        console.log('[Reset Password API] Final verification: added redirect_to parameter');
      }
      
      console.log('[Reset Password API] Final resetLink:', resetLink.substring(0, 250));
    } catch (e) {
      console.error('[Reset Password API] Final verification error:', e);
    }
    
    // ONE MORE TIME: Force redirect_to to be correct (triple check)
    try {
      const tripleCheckUrl = new URL(resetLink);
      const tripleCheckRedirectTo = tripleCheckUrl.searchParams.get('redirect_to');
      
      if (tripleCheckRedirectTo) {
        let decodedTriple = tripleCheckRedirectTo;
        try {
          decodedTriple = decodeURIComponent(tripleCheckRedirectTo);
          if (decodedTriple.includes('%')) {
            decodedTriple = decodeURIComponent(decodedTriple);
          }
        } catch (e) {
          decodedTriple = tripleCheckRedirectTo;
        }
        
        // FORCE to production URL if not exactly correct
        const hasWww = decodedTriple.includes('www.gobid.ro');
        const isNotExactPath = !decodedTriple.endsWith('/auth/reset-password-redirect');
        const isJustDomain = decodedTriple === 'https://www.gobid.ro' || decodedTriple === 'https://www.gobid.ro/' || 
                             decodedTriple === 'https://gobid.ro' || decodedTriple === 'https://gobid.ro/';
        
        if (decodedTriple !== `${productionUrl}/auth/reset-password-redirect` || hasWww || isNotExactPath || isJustDomain) {
          tripleCheckUrl.searchParams.set('redirect_to', `${productionUrl}/auth/reset-password-redirect`);
          resetLink = tripleCheckUrl.toString();
          console.log('[Reset Password API] Triple check: forced redirect_to');
        }
      } else {
        tripleCheckUrl.searchParams.set('redirect_to', `${productionUrl}/auth/reset-password-redirect`);
        resetLink = tripleCheckUrl.toString();
        console.log('[Reset Password API] Triple check: added redirect_to');
      }
    } catch (e) {
      console.error('[Reset Password API] Triple check error:', e);
    }
    
    // Extract redirect_to from final link for verification
    let finalRedirectToValue = null;
    try {
      const verifyUrl = new URL(resetLink);
      finalRedirectToValue = verifyUrl.searchParams.get('redirect_to');
      // Decode to show actual value
      if (finalRedirectToValue) {
        try {
          finalRedirectToValue = decodeURIComponent(finalRedirectToValue);
          if (finalRedirectToValue.includes('%')) {
            finalRedirectToValue = decodeURIComponent(finalRedirectToValue);
          }
        } catch (e) {
          // Keep encoded value
        }
      }
    } catch (e) {
      // Ignore
    }
    
    console.log('[Reset Password API] Returning link with redirect_to:', finalRedirectToValue);
    console.log('[Reset Password API] Full link being returned:', resetLink.substring(0, 300));
    
    // Return the reset link so the client can send it via custom email
    return NextResponse.json({
      success: true,
      resetLink: resetLink,
      message: 'Link-ul de resetare a fost generat cu succes',
      // Debug info (remove in production if needed)
      debug: {
        originalRedirectTo: finalRedirectTo,
        finalRedirectTo: finalRedirectToValue,
        linkPreview: resetLink.substring(0, 300)
      }
    });
  } catch (error: any) {
    console.error('Unexpected error in reset password:', error);
    return NextResponse.json(
      { error: error.message || 'Eroare server' },
      { status: 500 }
    );
  }
}
