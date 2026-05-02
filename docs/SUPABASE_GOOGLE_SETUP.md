# Configurare Google OAuth cu Supabase Auth

## Pași pentru configurare

### 1. Configurare în Google Cloud Console

1. Mergi la [Google Cloud Console](https://console.cloud.google.com/)
2. Selectează sau creează un proiect
3. Mergi la **APIs & Services** → **Credentials**
4. Click pe **Create Credentials** → **OAuth client ID**
5. Configurează:
   - **Application type**: Web application
   - **Name**: GoBid RO (sau orice nume vrei)
   - **Authorized redirect URIs**: 
     - Pentru development: `http://localhost:3000/auth/callback`
     - Pentru producție: `https://your-domain.com/auth/callback`
     - **IMPORTANT**: Adaugă și redirect URI-ul de la Supabase:
       - `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
6. Copiază **Client ID** și **Client Secret**

### 2. Configurare în Supabase Dashboard

1. Mergi la [Supabase Dashboard](https://app.supabase.com/)
2. Selectează proiectul tău
3. Mergi la **Authentication** → **Providers**
4. Găsește **Google** și click pe el
5. Activează provider-ul
6. Adaugă:
   - **Client ID (for OAuth)**: Client ID-ul de la Google
   - **Client Secret (for OAuth)**: Client Secret-ul de la Google
7. Salvează

### 3. Verificare Redirect URI în Supabase

1. În Supabase Dashboard, mergi la **Authentication** → **URL Configuration**
2. Verifică că **Redirect URLs** include:
   - `http://localhost:3000/auth/callback` (pentru development)
   - `https://your-domain.com/auth/callback` (pentru producție)

### 4. Testare

1. Pornește aplicația: `npm run dev`
2. Mergi la `/auth`
3. Click pe "Continuă cu Google"
4. Ar trebui să te redirecționeze la Google pentru autentificare
5. După autentificare, ar trebui să te redirecționeze înapoi la `/dashboard`

## Note importante

- **Redirect URI-ul trebuie să fie EXACT identic** în ambele locuri (Google Console și Supabase)
- Supabase va gestiona automat sesiunea după autentificare
- Nu mai este nevoie de `/api/auth/google/callback` - Supabase gestionează totul
- Utilizatorii vor fi creați automat în Supabase Auth când se autentifică cu Google
- Profilul utilizatorului va fi creat/actualizat automat în tabela `user_profiles`

## Troubleshooting

### Eroare: "redirect_uri_mismatch"
- Verifică că redirect URI-ul din Google Console este EXACT identic cu cel din Supabase
- Asigură-te că ai adăugat ambele redirect URI-uri (local și Supabase)

### Eroare: "Invalid client"
- Verifică că Client ID și Client Secret sunt corecte în Supabase Dashboard
- Asigură-te că ai activat provider-ul Google în Supabase

### Eroare: "Unsupported provider: provider is not enabled"
- **Soluție**: Mergi în Supabase Dashboard → Authentication → Providers → Google
- Activează provider-ul Google (toggle-ul trebuie să fie ON)
- Adaugă Client ID și Client Secret de la Google
- Salvează și încearcă din nou

### Utilizatorul nu rămâne logat
- Verifică că sesiunea Supabase este setată corect în `/auth/callback`
- Verifică că `supabase.auth.getSession()` funcționează în dashboard

