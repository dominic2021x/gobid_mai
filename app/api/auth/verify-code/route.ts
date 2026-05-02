import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { normalizeStoredAccountType } from '@/lib/auth/normalizeStoredAccountType';
import { getVerificationCode, deleteVerificationCode } from '@/lib/verification-codes';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, code } = body;

    if (!email || !code) {
      return NextResponse.json(
        { success: false, message: 'Email și cod sunt obligatorii' },
        { status: 400 }
      );
    }

    // Normalize email (trim and lowercase)
    const normalizedEmail = email.trim().toLowerCase();
    
    console.log('🔍 Verifying code:', {
      email: normalizedEmail,
      code: code,
      timestamp: new Date().toISOString()
    });

    // Get stored code from database
    let storedData = await getVerificationCode(normalizedEmail);
    
    // Fallback to in-memory if database fails
    if (!storedData) {
      try {
        const { getVerificationCode: getInMemory } = await import('@/lib/verification-codes');
        storedData = getInMemory(normalizedEmail);
        console.log('⚠️ Using in-memory storage as fallback');
      } catch (e) {
        // Ignore
      }
    }
    
    if (!storedData) {
      console.log('❌ Code not found or expired for email:', normalizedEmail);
      return NextResponse.json(
        { success: false, message: 'Cod invalid sau expirat. Te rugăm să soliciți un cod nou.' },
        { status: 400 }
      );
    }
    
    console.log('✅ Code found:', {
      storedCode: storedData.code,
      providedCode: code,
      match: storedData.code === code,
      expiresAt: new Date(storedData.expiresAt).toISOString(),
      now: new Date().toISOString()
    });

    // Verify code
    if (storedData.code !== code) {
      return NextResponse.json(
        { success: false, message: 'Cod incorect. Te rugăm să încerci din nou.' },
        { status: 400 }
      );
    }

    // Code is valid, verify user email in Supabase using admin client
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, message: 'Service role key nu este configurat.' },
        { status: 500 }
      );
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(storedData.userId);
    
    if (userError || !userData) {
      console.error('Error getting user:', userError);
      return NextResponse.json(
        { success: false, message: `Utilizatorul nu a fost găsit. ${userError?.message || ''}` },
        { status: 404 }
      );
    }

    // Update user email_confirmed_at
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      storedData.userId,
      {
        email_confirm: true
      }
    );

    if (updateError) {
      console.error('Error confirming user email:', updateError);
      return NextResponse.json(
        { success: false, message: 'Eroare la confirmarea email-ului.' },
        { status: 500 }
      );
    }

    // Create profile & tokens after successful verification (if not already)
    try {
      const meta = userData.user?.user_metadata || {};
      const profileData = {
        user_id: storedData.userId,
        email: userData.user?.email || null,
        first_name: meta.first_name || '',
        last_name: meta.last_name || '',
        phone: meta.phone || '',
        avatar_url: null,
        account_type: normalizeStoredAccountType(meta.account_type),
        date_of_birth: meta.date_of_birth || null,
        location: meta.location || null,
        company_name: meta.company_name || null,
        company_cui: meta.cui || null,
        company_registration_number: meta.registration_number || null,
        company_city: meta.company_city || meta.city || null,
        company_county: meta.company_county || meta.county || null,
        company_address: meta.company_address || meta.address || null,
        executor_unej_number: meta.executor_unej_number || null,
        executor_chamber: meta.executor_chamber || null,
        executor_office_address: meta.executor_office_address || null,
        executor_office_location: meta.executor_office_location || null,
        executor_website: meta.executor_website || null
      };

      await supabaseAdmin
        .from('user_profiles')
        .upsert(profileData, { onConflict: 'user_id' });

      await supabaseAdmin
        .from('user_tokens')
        .upsert({
          user_id: storedData.userId,
          user_email: userData.user.email || '',
          balance: 0,
          total_earned: 0,
          total_spent: 0,
          level: "Basic",
          package_type: "Basic"
        }, { onConflict: "user_id" });
    } catch (profileError) {
      console.error('Error creating profile/tokens after verification:', profileError);
      // continue, email already verified
    }

    // Delete used code
    try {
      await deleteVerificationCode(normalizedEmail);
    } catch (e) {
      // Fallback to in-memory deletion
      try {
        const { deleteVerificationCode: deleteInMemory } = await import('@/lib/verification-codes');
        deleteInMemory(normalizedEmail);
      } catch (e2) {
        // Ignore
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Email confirmat cu succes!',
      userId: storedData.userId
    });
  } catch (error: any) {
    console.error('Error verifying code:', error);
    return NextResponse.json(
      { 
        success: false,
        message: error.message || 'Eroare la verificarea codului'
      },
      { status: 500 }
    );
  }
}

