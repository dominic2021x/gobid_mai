# Google Maps API - Configurare și Utilizare

Acest modul oferă funcționalități de geocodare și generare de imagini Street View folosind Google Maps API.

## 📋 Cerințe

1. **Cont Google Cloud Platform (GCP)**
2. **Proiect activ în GCP**
3. **API Key pentru Google Maps**

## 🔑 Obținerea API Key

### Pasul 1: Creează un proiect în Google Cloud Platform

1. Accesează [Google Cloud Console](https://console.cloud.google.com/)
2. Creează un proiect nou sau selectează unul existent
3. Notează ID-ul proiectului

### Pasul 2: Activează API-urile necesare

În Google Cloud Console, navighează la **APIs & Services > Library** și activează:

1. **Geocoding API**
   - Caută "Geocoding API"
   - Click pe "Enable"

2. **Street View Static API**
   - Caută "Street View Static API"
   - Click pe "Enable"

### Pasul 3: Creează API Key

1. Navighează la **APIs & Services > Credentials**
2. Click pe **"+ CREATE CREDENTIALS"** > **"API Key"**
3. Copiază API Key-ul generat

### Pasul 4: Restricționează API Key (Recomandat pentru producție)

1. Click pe API Key-ul creat pentru a-l edita
2. În secțiunea **"API restrictions"**:
   - Selectează **"Restrict key"**
   - Bifează doar:
     - **Geocoding API**
     - **Street View Static API**
3. În secțiunea **"Application restrictions"**:
   - Pentru producție, selectează **"HTTP referrers"**
   - Adaugă domeniile tale (ex: `https://tudomeniu.com/*`)
   - Pentru development local, poți lăsa **"None"** (NU recomandat pentru producție)

4. Click **"Save"**

## 🔧 Configurare în Proiect

### Adaugă variabila de mediu

Adaugă în fișierul `.env.local`:

```env
GOOGLE_MAPS_API_KEY=your_api_key_here
```

**IMPORTANT:** Nu comite niciodată API Key-ul în Git! Asigură-te că `.env.local` este în `.gitignore`.

### Pentru Vercel/Producție

1. Accesează dashboard-ul Vercel
2. Navighează la **Settings > Environment Variables**
3. Adaugă:
   - **Name:** `GOOGLE_MAPS_API_KEY`
   - **Value:** API Key-ul tău
   - **Environment:** Production, Preview, Development

## 📚 Utilizare

### Geocodare Adresă

```typescript
import { geocodeAddress, geocodeFullAddress } from '@/lib/maps/geocode';

// Geocodează o adresă simplă
const result = await geocodeAddress('Strada Mihai Eminescu, Cluj-Napoca, România');

if (result.success) {
  console.log(`Coordonate: (${result.lat}, ${result.lng})`);
  console.log(`Adresă formatată: ${result.formattedAddress}`);
}

// Geocodează adresă completă (județ + localitate + adresă)
const fullResult = await geocodeFullAddress(
  'Cluj',
  'Cluj-Napoca',
  'Strada Mihai Eminescu, nr. 10'
);
```

### Generare Street View

```typescript
import { getStreetViewImage } from '@/lib/maps/streetview';

const streetView = await getStreetViewImage(46.7712, 23.6236, '800x600');

if (streetView.success && streetView.imageUrl) {
  console.log(`Street View URL: ${streetView.imageUrl}`);
}
```

## 💰 Costuri

### Geocoding API
- **Primii 40,000 de request-uri/lună:** GRATUIT
- **Peste 40,000:** $5.00 per 1,000 requests

### Street View Static API
- **Primii 28,000 de request-uri/lună:** GRATUIT
- **Peste 28,000:** $7.00 per 1,000 requests

**Notă:** Costurile se aplică per proiect GCP. Monitorizează utilizarea în Google Cloud Console.

## 🛡️ Securitate

1. **NU** comite API Key-ul în Git
2. **Restricționează** API Key-ul la domeniile tale
3. **Monitorizează** utilizarea în Google Cloud Console
4. **Folosește** variabile de mediu pentru toate cheile API
5. **Activează** billing alerts în GCP pentru a evita costuri neașteptate

## 🐛 Debugging

### Verifică dacă API Key-ul funcționează

```bash
curl "https://maps.googleapis.com/maps/api/geocode/json?address=Bucuresti&key=YOUR_API_KEY"
```

Dacă primești un răspuns JSON cu `"status": "OK"`, API Key-ul funcționează corect.

### Erori comune

1. **"REQUEST_DENIED"**
   - API Key-ul nu este activat pentru API-urile necesare
   - API Key-ul este restricționat și nu permite cererea

2. **"ZERO_RESULTS"**
   - Adresa nu a fost găsită
   - Adresa este prea ambiguă

3. **"OVER_QUERY_LIMIT"**
   - Ai depășit limita de request-uri
   - Verifică billing în GCP

## 📖 Resurse

- [Google Maps Platform Documentation](https://developers.google.com/maps/documentation)
- [Geocoding API Guide](https://developers.google.com/maps/documentation/geocoding)
- [Street View Static API Guide](https://developers.google.com/maps/documentation/streetview)
- [Pricing Information](https://developers.google.com/maps/billing-and-pricing/pricing)



