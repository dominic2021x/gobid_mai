# Configurare Manuală Google OAuth în Supabase (Pas cu Pas)

## ⚠️ IMPORTANT: Configurarea trebuie făcută manual în Supabase Dashboard

Supabase nu permite configurarea provider-ilor OAuth prin SQL sau API direct. Trebuie configurat manual în Dashboard.

## 📋 Pași detaliați:

### 1. Obține Google Credentials

#### A. Google Cloud Console
1. Mergi la: https://console.cloud.google.com/
2. Login cu contul Google
3. Selectează sau creează un proiect
4. Mergi la **APIs & Services** → **Credentials**
5. Click **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**
6. Configurează:
   - **Application type**: Web application
   - **Name**: GoBid RO
   - **Authorized redirect URIs**: 
     ```
     http://localhost:3000/auth/callback
     https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
     ```
     (Înlocuiește `YOUR_PROJECT_REF` cu referința proiectului tău Supabase)
7. Click **"Create"**
8. **COPIAZĂ** Client ID și Client Secret

#### B. Găsește Project Reference în Supabase
1. Mergi la: https://app.supabase.com/
2. Selectează proiectul
3. Settings → API
4. Găsește **"Project URL"**: `https://xxxxx.supabase.co`
5. **Project Reference** = `xxxxx` (partea din mijloc)

### 2. Configurează în Supabase Dashboard

#### A. Accesează Authentication Providers
1. Mergi la: https://app.supabase.com/
2. Selectează proiectul
3. În meniul stâng: **Authentication**
4. Click pe tab-ul **"Providers"**

#### B. Activează Google Provider
1. Scroll până găsești **"Google"** în listă
2. Click pe cardul **"Google"** (sau pe toggle-ul de lângă el)
3. Vei vedea un formular cu:
   - **Enable Google provider**: Toggle (trebuie să fie **ON/VERDE**)
   - **Client ID (for OAuth)**: Lipește Client ID-ul de la Google
   - **Client Secret (for OAuth)**: Lipește Client Secret-ul de la Google

#### C. Completează și Salvează
1. **ACTIVEAZĂ toggle-ul** (cel mai important!)
2. Lipește **Client ID** în câmpul "Client ID (for OAuth)"
3. Lipește **Client Secret** în câmpul "Client Secret (for OAuth)"
4. Click pe butonul **"Save"** (sau "Update") de jos
5. Ar trebui să vezi un mesaj de succes

### 3. Verifică Redirect URLs

1. În **Authentication**, click pe tab-ul **"URL Configuration"**
2. În secțiunea **"Redirect URLs"**, verifică că ai:
   - `http://localhost:3000/auth/callback`
   - (Pentru producție, adaugă și: `https://your-domain.com/auth/callback`)
3. Dacă nu le vezi, adaugă-le:
   - Click pe **"+ Add URL"**
   - Adaugă URL-ul
   - Click **"Save"**

### 4. Testează

1. Pornește aplicația: `npm run dev`
2. Mergi la: `http://localhost:3000/auth`
3. Click pe **"Continuă cu Google"**
4. Ar trebui să te redirecționeze la Google pentru autentificare
5. După autentificare, ar trebui să te redirecționeze la `/dashboard`

## 🔍 Verificare Rapidă

După configurare, verifică:
- ✅ Toggle-ul Google este **ACTIVAT** (verde) în Supabase
- ✅ Client ID este completat
- ✅ Client Secret este completat
- ✅ Redirect URI-ul Supabase este adăugat în Google Console
- ✅ Redirect URL-ul local este adăugat în Supabase URL Configuration

## ❌ Dacă tot primești eroarea "provider is not enabled"

1. **Verifică toggle-ul**: Trebuie să fie **VERDE/ON**, nu doar completat formularul
2. **Reîncarcă pagina** Supabase Dashboard și verifică din nou
3. **Așteaptă 1-2 minute** după salvare (propagare)
4. **Verifică consola browser-ului** pentru erori
5. **Încearcă să dezactivezi și reactivezi** provider-ul

## 📞 Suport

Dacă tot nu funcționează:
- Verifică că ai salvat configurația (click pe "Save")
- Verifică că nu ai spații la început/sfârșit în Client ID/Secret
- Verifică că redirect URI-urile sunt EXACT identice în ambele locuri






