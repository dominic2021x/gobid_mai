# 🚀 Ghid Complet: Configurare Google OAuth în Supabase

## 📋 Pași detaliați pas cu pas

### PASUL 1: Obține Client ID și Client Secret de la Google

#### 1.1. Accesează Google Cloud Console
- Mergi la: https://console.cloud.google.com/
- Login cu contul Google

#### 1.2. Selectează sau creează un proiect
- Dacă ai deja un proiect, selectează-l din dropdown-ul de sus
- Dacă nu, click pe "Select a project" → "New Project"
  - Nume proiect: `GoBid RO` (sau orice nume vrei)
  - Click "Create"

#### 1.3. Activează Google+ API (dacă nu este activat)
- În meniul stâng, mergi la **APIs & Services** → **Library**
- Caută "Google+ API" sau "People API"
- Click pe el și apoi "Enable"

#### 1.4. Creează OAuth 2.0 Client ID
- Mergi la **APIs & Services** → **Credentials**
- Click pe butonul **"+ CREATE CREDENTIALS"** (sus)
- Selectează **"OAuth client ID"**

#### 1.5. Configurează OAuth consent screen (dacă e prima dată)
- Dacă vezi un mesaj despre "OAuth consent screen", click pe "Configure Consent Screen"
- Selectează **"External"** (pentru development) sau **"Internal"** (pentru G Suite)
- Completează:
  - **App name**: `GoBid RO`
  - **User support email**: email-ul tău
  - **Developer contact information**: email-ul tău
- Click "Save and Continue"
- Skip "Scopes" (click "Save and Continue")
- Skip "Test users" (click "Save and Continue")
- Click "Back to Dashboard"

#### 1.6. Creează OAuth Client ID
- În **APIs & Services** → **Credentials**, click **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**
- **Application type**: Selectează **"Web application"**
- **Name**: `GoBid RO Web Client`
- **Authorized JavaScript origins**: 
  - `http://localhost:3000` (pentru development)
  - `https://your-domain.com` (pentru producție - adaugă mai târziu)
- **Authorized redirect URIs**: 
  - `http://localhost:3000/auth/callback` (pentru development)
  - **IMPORTANT**: Adaugă și redirect URI-ul de la Supabase:
    - `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
    - (Înlocuiește `YOUR_PROJECT_REF` cu referința proiectului tău Supabase)
- Click **"Create"**

#### 1.7. Copiază Client ID și Client Secret
- Vei vedea un popup cu:
  - **Your Client ID**: `xxxxx-xxxxx.apps.googleusercontent.com`
  - **Your Client Secret**: `GOCSPX-xxxxx`
- **COPIAZĂ AMBELE** și păstrează-le într-un loc sigur
- ⚠️ **Client Secret** se poate vedea doar o dată! Dacă îl uiți, trebuie să creezi unul nou.

---

### PASUL 2: Configurează în Supabase Dashboard

#### 2.1. Accesează Supabase Dashboard
- Mergi la: https://app.supabase.com/
- Login cu contul tău

#### 2.2. Selectează proiectul
- Selectează proiectul tău din lista de proiecte

#### 2.3. Găsește secțiunea Authentication
- În meniul stâng, click pe **"Authentication"**
- Click pe tab-ul **"Providers"**

#### 2.4. Activează Google Provider
- Scroll până găsești **"Google"** în listă
- Click pe cardul **"Google"** (sau pe toggle-ul de lângă el)

#### 2.5. Completează informațiile
- Vei vedea un formular cu:
  - **Enable Google provider**: Toggle-ul trebuie să fie **ON** (verde)
  - **Client ID (for OAuth)**: Lipește Client ID-ul de la Google
  - **Client Secret (for OAuth)**: Lipește Client Secret-ul de la Google
- **IMPORTANT**: Asigură-te că toggle-ul este **ACTIVAT** (verde)

#### 2.6. Salvează
- Click pe butonul **"Save"** (sau "Update") de jos
- Ar trebui să vezi un mesaj de succes

---

### PASUL 3: Verifică Redirect URLs în Supabase

#### 3.1. Mergi la URL Configuration
- În **Authentication**, click pe tab-ul **"URL Configuration"**

#### 3.2. Verifică Redirect URLs
- În secțiunea **"Redirect URLs"**, asigură-te că ai:
  - `http://localhost:3000/auth/callback` (pentru development)
  - `https://your-domain.com/auth/callback` (pentru producție - adaugă mai târziu)
- Dacă nu le vezi, adaugă-le:
  - Click pe **"+ Add URL"**
  - Adaugă URL-ul
  - Click **"Save"**

---

### PASUL 4: Verifică că totul funcționează

#### 4.1. Testează în aplicație
1. Pornește aplicația: `npm run dev`
2. Mergi la: `http://localhost:3000/auth`
3. Click pe butonul **"Continuă cu Google"**
4. Ar trebui să te redirecționeze la Google pentru autentificare
5. După ce te autentifici, ar trebui să te redirecționeze înapoi la `/dashboard`

#### 4.2. Verifică în Supabase
- Mergi la **Authentication** → **Users**
- Ar trebui să vezi utilizatorul nou creat după autentificare

---

## 🔍 Cum să găsești Project Reference în Supabase

1. Mergi la Supabase Dashboard
2. Selectează proiectul tău
3. În meniul stâng, click pe **"Settings"** (iconița de roată)
4. Click pe **"API"**
5. Găsește **"Project URL"** - va arăta ca: `https://xxxxx.supabase.co`
6. **Project Reference** este partea `xxxxx` din URL
7. Redirect URI-ul complet va fi: `https://xxxxx.supabase.co/auth/v1/callback`

---

## ⚠️ Probleme comune și soluții

### Eroare: "redirect_uri_mismatch"
**Soluție:**
- Verifică că redirect URI-ul din Google Console este EXACT identic cu cel din Supabase
- Asigură-te că ai adăugat ambele:
  - `http://localhost:3000/auth/callback` (în Google Console)
  - `https://xxxxx.supabase.co/auth/v1/callback` (în Google Console)

### Eroare: "Unsupported provider: provider is not enabled"
**Soluție:**
- Mergi în Supabase Dashboard → Authentication → Providers → Google
- Asigură-te că toggle-ul este **ACTIVAT** (verde)
- Verifică că ai completat Client ID și Client Secret
- Click "Save"

### Eroare: "Invalid client"
**Soluție:**
- Verifică că Client ID și Client Secret sunt corecte (fără spații la început/sfârșit)
- Verifică că le-ai copiat complet (fără să lipsească caractere)

### Butonul Google nu face nimic
**Soluție:**
- Verifică consola browser-ului pentru erori
- Asigură-te că ai salvat configurația în Supabase
- Reîncarcă pagina și încearcă din nou

---

## 📝 Checklist final

- [ ] Am creat OAuth Client ID în Google Cloud Console
- [ ] Am adăugat redirect URI-ul Supabase în Google Console
- [ ] Am activat provider-ul Google în Supabase Dashboard
- [ ] Am adăugat Client ID în Supabase
- [ ] Am adăugat Client Secret în Supabase
- [ ] Am salvat configurația în Supabase
- [ ] Am adăugat redirect URL-ul în Supabase URL Configuration
- [ ] Am testat autentificarea și funcționează

---

## 🎉 Gata!

După ce ai completat toți pașii, autentificarea cu Google ar trebui să funcționeze perfect! Utilizatorii se vor putea autentifica cu Google și vor fi creați automat în Supabase.






