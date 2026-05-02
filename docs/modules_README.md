# Modules

Acest folder conține toate modulele aplicației, organizate pe funcționalități.

## Structură

### `smartbill.ts`
Modul pentru integrarea cu SmartBill API pentru facturare automată.
- **Funcționalități**: Creare facturi, descărcare PDF, gestionare clienți și produse
- **Documentație**: https://api.smartbill.ro/#!/prezentare_generala

### `netopia.ts`
Modul pentru integrarea cu Netopia Payments pentru procesarea plăților online.
- **Funcționalități**: Creare plăți, redirectare la gateway, verificare status plăți
- **Documentație**: https://netopia-payments.com/

### `googleAuth.ts`
Modul pentru autentificare cu Google OAuth.
- **Funcționalități**: Autentificare utilizatori cu Google, obținere informații profil
- **Documentație**: https://developers.google.com/identity/protocols/oauth2

### `facebookAuth.ts`
Modul pentru autentificare cu Facebook OAuth.
- **Funcționalități**: Autentificare utilizatori cu Facebook, obținere informații profil
- **Documentație**: https://developers.facebook.com/docs/facebook-login

### `resend.ts`
Modul pentru integrarea cu Resend pentru trimiterea de email-uri.
- **Funcționalități**: Trimitere email-uri, template-uri, tracking status
- **Documentație**: https://resend.com/docs

### `userActivity.ts`
Modul pentru gestionarea activității utilizatorilor.
- **Funcționalități**: Istoric activități, istoric licitații, tracking comportament

### `index.ts`
Index central pentru exportarea tuturor modulelor.

## Utilizare

```typescript
// Import din modul specific
import { smartbill } from '@/modules/smartbill';
import { getUserActivity } from '@/modules/userActivity';

// Sau import din index central
import { smartbill, getUserActivity } from '@/modules';
```

## Adăugare Module Noi

1. Creează fișierul modulului în acest folder
2. Exportă funcțiile/class-urile necesare
3. Adaugă exportul în `index.ts`
4. Documentează modulul în acest README



