# Contact API – cum să testezi

## Cerințe
- Aplicația rulează (`npm run dev`)
- Supabase configurat cu `NEXT_PUBLIC_SUPABASE_URL` și `SUPABASE_SERVICE_ROLE_KEY`
- Migrarea `20260303_contact_messages.sql` aplicată

## Curl – succes
```bash
curl -X POST http://localhost:3000/api/contact \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "message": "Mesaj de test",
    "privacyAccepted": true
  }'
```
Răspuns așteptat: `{"ok":true}`

## Curl – cu honeypot (spam)
Dacă `website` este completat, API-ul returnează `{"ok":true}` fără să salveze (comportament anti-spam).

## Curl – validare eșuată
```bash
curl -X POST http://localhost:3000/api/contact \
  -H "Content-Type: application/json" \
  -d '{"name": "", "email": "invalid", "message": "x"}'
```
Răspuns așteptat: 400, `{"ok":false,"code":"VALIDATION_ERROR","error":"..."}`

## Curl – rate limit
Trimite 6+ cereri rapide de pe același IP. Răspuns așteptat la a 6-a: 429, `{"ok":false,"code":"RATE_LIMITED"}`

## Verificare în Supabase
```sql
SELECT id, name, email, LEFT(message, 50) as msg_preview, status, created_at
FROM contact_messages
ORDER BY created_at DESC
LIMIT 10;
```
