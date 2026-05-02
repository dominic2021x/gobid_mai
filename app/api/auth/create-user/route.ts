import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { normalizeStoredAccountType } from '@/lib/auth/normalizeStoredAccountType';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';

async function findAuthUserByEmail(adminClient: NonNullable<typeof supabaseAdmin>, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const perPage = 200;
  // Hard cap pages to avoid long loops if there are many users.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = (data as any)?.users as any[] | undefined;
    if (!users || users.length === 0) return null;

    const match = users.find((u) => (u?.email || '').trim().toLowerCase() === normalizedEmail);
    if (match) return match;

    if (users.length < perPage) return null;
  }
  return null;
}

async function tryUnbanAndReactivateUser(
  adminClient: NonNullable<typeof supabaseAdmin>,
  userId: string,
  attributes: Record<string, unknown>
) {
  const banDurationAttempts = ['none', '0s', '0'];
  let lastError: any = null;

  for (const ban_duration of banDurationAttempts) {
    const { error } = await adminClient.auth.admin.updateUserById(userId, {
      ...attributes,
      ban_duration,
    } as any);

    if (!error) return null;
    lastError = error;
  }

  return lastError;
}

async function safeLoadDeletionInfo(
  adminClient: NonNullable<typeof supabaseAdmin>,
  userId: string
): Promise<{ isDeleted: boolean; profileMetadata: any | null }> {
  try {
    const { data: profile, error } = await adminClient
      .from('user_profiles')
      .select('is_deleted, metadata')
      .eq('user_id', userId)
      .maybeSingle();

    if (!error) {
      const meta = (profile as any)?.metadata ?? null;
      return { isDeleted: Boolean((profile as any)?.is_deleted) || Boolean(meta?.account_deleted), profileMetadata: meta };
    }
  } catch {
    // ignore and fallback
  }

  // Fallback for older schemas without is_deleted column
  const { data: profile2 } = await adminClient
    .from('user_profiles')
    .select('metadata')
    .eq('user_id', userId)
    .maybeSingle();

  const meta2 = (profile2 as any)?.metadata ?? null;
  return { isDeleted: Boolean(meta2?.account_deleted), profileMetadata: meta2 };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      email, 
      password, 
      firstName, 
      lastName, 
      username,
      phone, 
      accountType, 
      birthDate, 
      location,
      companyName,
      cui,
      registrationNumber,
      city,
      county,
      address,
      pieseAutoSellAsCompany,
      // Executor fields
      executorUnejNumber,
      executorChamber,
      executorOfficeAddress,
      executorOfficeLocation,
      executorWebsite
    } = body;

    const storedAccountType = normalizeStoredAccountType(accountType);
    const normalizedAccountType = storedAccountType;
    const pieseSellAsCompany =
      normalizedAccountType === 'piese_auto' &&
      (pieseAutoSellAsCompany === true || pieseAutoSellAsCompany === 'true');
    const isPiesePrivate = normalizedAccountType === 'piese_auto' && !pieseSellAsCompany;

    console.log('📝 [Create User] Received data:', {
      email: email?.substring(0, 10) + '...',
      accountType,
      hasFirstName: !!firstName,
      hasLastName: !!lastName,
      hasUsername: !!username,
      hasPhone: !!phone,
      hasBirthDate: !!birthDate,
      hasLocation: !!location,
      hasCompanyName: !!companyName,
      hasCui: !!cui,
      hasRegistrationNumber: !!registrationNumber,
      hasCity: !!city,
      hasCounty: !!county,
      hasAddress: !!address,
      hasExecutorUnejNumber: !!executorUnejNumber,
      hasExecutorChamber: !!executorChamber,
      hasExecutorOfficeAddress: !!executorOfficeAddress,
      hasExecutorOfficeLocation: !!executorOfficeLocation,
      hasExecutorWebsite: !!executorWebsite
    });

    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: 'Email și parolă sunt obligatorii' },
        { status: 400 }
      );
    }

    const normalizedUsername = typeof username === 'string' ? username.trim() : '';
    if (normalizedAccountType === 'private' || isPiesePrivate) {
      if (!normalizedUsername) {
        return NextResponse.json(
          { success: false, message: 'Username-ul este obligatoriu pentru contul de utilizator.' },
          { status: 400 }
        );
      }
      if (!/^[a-zA-Z0-9._-]{3,30}$/.test(normalizedUsername)) {
        return NextResponse.json(
          { success: false, message: 'Username invalid. Folosește 3-30 caractere: litere, cifre, punct, underscore sau cratimă.' },
          { status: 400 }
        );
      }
    }

    if (pieseSellAsCompany) {
      if (!String(companyName || '').trim() || !String(cui || '').trim()) {
        return NextResponse.json(
          {
            success: false,
            message: 'Pentru înregistrare ca dealer firmă, completează denumirea firmei și CUI-ul.',
          },
          { status: 400 },
        );
      }
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, message: 'Service role key nu este configurat.' },
        { status: 500 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Create user directly with admin API (no email confirmation sent)
    // IMPORTANT: Set email_confirm to false and use admin API to prevent Supabase from sending emails
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: password,
      email_confirm: false, // Will be confirmed after code verification
      // Disable email sending by not providing email redirect
      user_metadata: {
        first_name: firstName || '',
        last_name: lastName || '',
        username: normalizedUsername || '',
        phone: phone || '',
        account_type: storedAccountType,
        date_of_birth: birthDate || '',
        location: location || '',
        company_name: companyName || '',
        cui: cui || '',
        registration_number: registrationNumber || '',
        company_city: city || ((storedAccountType === 'executor' || storedAccountType === 'liquidator') ? (location || '') : ''),
        company_county: county || '',
        company_address: address || '',
        executor_unej_number: executorUnejNumber || '',
        executor_chamber: executorChamber || '',
        executor_office_address: executorOfficeAddress || '',
        executor_office_location: executorOfficeLocation || '',
        executor_website: executorWebsite || ''
      },
      // Explicitly disable email sending
      app_metadata: {
        provider: 'email',
        providers: ['email']
      }
    });

    if (createError || !userData?.user) {
      console.error('Error creating user:', createError);
      const rawMsg = createError?.message || '';
      let friendlyMsg = 'Nu am putut crea contul. Încearcă din nou.';

      const looksLikeAlreadyRegistered =
        rawMsg.toLowerCase().includes('already') ||
        rawMsg.toLowerCase().includes('registered') ||
        rawMsg.toLowerCase().includes('exists');

      // If a user exists but was previously "deleted" (banned + flagged), reactivate instead of failing.
      if (looksLikeAlreadyRegistered) {
        try {
          const existingUser = await findAuthUserByEmail(supabaseAdmin, normalizedEmail);
          const existingUserId = (existingUser as any)?.id as string | undefined;

          if (existingUserId) {
            const { isDeleted: isDeletedFromProfile } = await safeLoadDeletionInfo(supabaseAdmin, existingUserId);
            const isDisabledByAuthMetadata = Boolean((existingUser as any)?.app_metadata?.account_disabled);
            const bannedUntil = (existingUser as any)?.banned_until;
            const isBanned =
              typeof bannedUntil === 'string' && !Number.isNaN(Date.parse(bannedUntil))
                ? new Date(bannedUntil).getTime() > Date.now()
                : false;

            const isDeleted = isDeletedFromProfile || isDisabledByAuthMetadata || isBanned;

            if (isDeleted) {
              // Unban + reset password + reset email_confirm so the user must verify again
              const mergedAppMetadata = {
                ...(((existingUser as any)?.app_metadata as any) || {}),
                account_disabled: false,
                account_disabled_at: null,
              };
              const reactivateError = await tryUnbanAndReactivateUser(supabaseAdmin, existingUserId, {
                password,
                email_confirm: false,
                user_metadata: {
                  first_name: firstName || '',
                  last_name: lastName || '',
                  username: normalizedUsername || '',
                  phone: phone || '',
                  account_type: storedAccountType,
                  date_of_birth: birthDate || '',
                  location: location || '',
                  company_name: companyName || '',
                  cui: cui || '',
                  registration_number: registrationNumber || '',
                  company_city: city || ((storedAccountType === 'executor' || storedAccountType === 'liquidator') ? (location || '') : ''),
                  company_county: county || '',
                  company_address: address || '',
                  executor_unej_number: executorUnejNumber || '',
                  executor_chamber: executorChamber || '',
                  executor_office_address: executorOfficeAddress || '',
                  executor_office_location: executorOfficeLocation || '',
                  executor_website: executorWebsite || '',
                },
                app_metadata: {
                  provider: 'email',
                  providers: ['email'],
                  ...mergedAppMetadata,
                },
              });

              if (reactivateError) {
                console.error('Error reactivating user:', reactivateError);
                return NextResponse.json(
                  {
                    success: false,
                    message: reactivateError.message || 'Nu am putut reactiva contul. Încearcă din nou.',
                  },
                  { status: 500 }
                );
              }

              // Clear soft-delete flags și actualizează profilul cu datele noi (best-effort)
              try {
                await supabaseAdmin
                  .from('user_profiles')
                  .upsert(
                    {
                      user_id: existingUserId,
                      email: normalizedEmail,
                      is_deleted: false,
                      deleted_at: null,
                      deleted_reason: null,
                      reactivated_at: new Date().toISOString(),
                      first_name: firstName || '',
                      last_name: lastName || '',
                      username: normalizedUsername || null,
                      phone: phone || '',
                      account_type: storedAccountType,
                      date_of_birth: birthDate || null,
                      location: location || null,
                      company_name: companyName || null,
                      company_cui: cui || null,
                      company_registration_number: registrationNumber || null,
                      company_city: city || ((storedAccountType === 'executor' || storedAccountType === 'liquidator') ? (location || '') : null),
                      company_county: county || null,
                      company_address: address || null,
                      executor_unej_number: executorUnejNumber || null,
                      executor_chamber: executorChamber || null,
                      executor_office_address: executorOfficeAddress || null,
                      executor_office_location: executorOfficeLocation || null,
                      executor_website: executorWebsite || null
                    },
                    { onConflict: 'user_id' }
                  );
              } catch (e) {
                // Older schema fallback: clear deletion marker in metadata only
                try {
                  const { data: p } = await supabaseAdmin
                    .from('user_profiles')
                    .select('metadata')
                    .eq('user_id', existingUserId)
                    .maybeSingle();
                  const mergedMetadata = {
                    ...(((p as any)?.metadata as any) || {}),
                    account_deleted: false,
                    account_deleted_at: null,
                    account_deleted_reason: null,
                  };
                  await supabaseAdmin
                    .from('user_profiles')
                    .upsert({ user_id: existingUserId, metadata: mergedMetadata }, { onConflict: 'user_id' });
                } catch {
                  // ignore
                }
              }

              return NextResponse.json({
                success: true,
                user: {
                  id: existingUserId,
                  email: normalizedEmail,
                },
                reactivated: true,
              });
            }
          }
        } catch (reactivateFlowError: any) {
          console.error('Reactivation flow error:', reactivateFlowError);
          // Fall through to friendly message below
        }

        friendlyMsg = 'Există deja un cont cu acest email. Autentifică-te sau folosește un alt email.';
      }
      return NextResponse.json(
        { 
          success: false, 
          message: friendlyMsg 
        },
        { status: 400 }
      );
    }

    // Creează user_profiles IMEDIAT la înregistrare (nu doar la verificare cod)
    // Executor și lichidator: datele apar în /dashboard/executor/settings și /dashboard/lichidator/settings
    try {
      const profileMetadata: Record<string, unknown> = {};
      if (normalizedAccountType === 'private' || isPiesePrivate) {
        profileMetadata.username = normalizedUsername;
      }
      if (normalizedAccountType === 'piese_auto') {
        profileMetadata.piese_auto_sell_as_company = pieseSellAsCompany;
      }
      const profileData = {
        user_id: userData.user.id,
        email: normalizedEmail,
        first_name: firstName || '',
        last_name: lastName || '',
        username: normalizedUsername || null,
        phone: phone || '',
        avatar_url: null,
        account_type: storedAccountType,
        date_of_birth: birthDate || null,
        location: location || null,
        company_name: companyName || null,
        company_cui: cui || null,
        company_registration_number: registrationNumber || null,
        company_city:
          city ||
          ((normalizedAccountType === 'executor' ||
            normalizedAccountType === 'liquidator' ||
            (normalizedAccountType === 'piese_auto' && pieseSellAsCompany))
            ? location || ''
            : null),
        company_county: county || null,
        company_address: address || null,
        executor_unej_number: executorUnejNumber || null,
        executor_chamber: executorChamber || null,
        executor_office_address: executorOfficeAddress || null,
        executor_office_location: executorOfficeLocation || null,
        executor_website: executorWebsite || null,
        metadata: profileMetadata,
      };
      await supabaseAdmin
        .from('user_profiles')
        .upsert(profileData, { onConflict: 'user_id' });

      // Creează și user_tokens dacă nu există
      await supabaseAdmin
        .from('user_tokens')
        .upsert({
          user_id: userData.user.id,
          balance: 0,
          total_earned: 0,
          total_spent: 0,
          level: 'Basic'
        }, { onConflict: 'user_id' });
    } catch (profileError) {
      console.error('[Create User] Error creating profile/tokens:', profileError);
      // Nu eșuăm înregistrarea - utilizatorul există, verificarea codului va crea profilul
    }

    return NextResponse.json({
      success: true,
      user: {
        id: userData.user.id,
        email: userData.user.email
      }
    });
  } catch (error: any) {
    console.error('Error in create-user:', error);
    return NextResponse.json(
      { 
        success: false,
        message: error.message || 'Eroare la crearea contului'
      },
      { status: 500 }
    );
  }
}




