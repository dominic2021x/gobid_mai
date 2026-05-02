import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Setează SUPABASE_URL și SUPABASE_SERVICE_ROLE_KEY înainte de a rula scriptul.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const users = [
  {
    email: 'domi@gobid.ro',
    password: 'dominic1156F@',
    firstName: 'Domi',
    lastName: 'Admin',
    role: 'super_user',
    isAdmin: true,
  },
  {
    email: 'alex@gobid.ro',
    password: 'managerALEX2025@',
    firstName: 'Alex',
    lastName: 'Manager',
    role: 'manager',
    isAdmin: false,
  },
  {
    email: 'ovidiu@gobid.ro',
    password: 'managerOVIDIU2025@',
    firstName: 'Ovidiu',
    lastName: 'Manager',
    role: 'manager',
    isAdmin: false,
  },
];

async function getUserIdByEmail(email) {
  const { data, error } = await supabase.auth.admin.listUsers({ email, page: 1, perPage: 1 });
  if (error) throw error;
  return data.users?.[0]?.id ?? null;
}

async function ensureUser(user) {
  // încearcă createUser; dacă pică, îl căutăm și actualizăm
  const { data, error } = await supabase.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: {
      first_name: user.firstName,
      last_name: user.lastName,
      role: user.role,
    },
    app_metadata: {
      role: user.role,
    },
  });

  if (error) {
    console.log(`[createUser] ${user.email} -> status:${error.status} code:${error.code} message:${error.message}`);
  }

  let userId = data?.user?.id;

  if (!userId) {
    userId = await getUserIdByEmail(user.email);
    if (!userId) {
      throw new Error(`Nu am putut obține ID-ul pentru ${user.email}`);
    }

    // actualizează parola și metadata pe user existent
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password: user.password,
      email_confirm: true,
      user_metadata: {
        first_name: user.firstName,
        last_name: user.lastName,
        role: user.role,
      },
      app_metadata: {
        role: user.role,
      },
    });

    if (updateError) {
      throw updateError;
    }
  }

  const { error: profileError } = await supabase.from('user_profiles').upsert(
    {
      user_id: userId,
      first_name: user.firstName,
      last_name: user.lastName,
      role: user.role,
      is_admin: user.isAdmin,
    },
    { onConflict: 'user_id' }
  );

  if (profileError) {
    throw profileError;
  }

  console.log(`OK: ${user.email}`);
}

async function main() {
  for (const user of users) {
    await ensureUser(user);
  }
  console.log('Toți utilizatorii au fost creați sau actualizați cu succes.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
