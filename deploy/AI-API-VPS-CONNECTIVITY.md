# Conectivitate VPS: AI API accesibil pentru Next.js (Vercel) și clienți externi

Obiectiv: Vercel apelează un URL public stabil (port **80** sau **443**), nu `http://IP:3000` direct, decât temporar la debug.

**Mac mini în spatele VPS + Tailscale:** vezi [TAILSCALE-VPS-MACMINI-BRIDGE.md](./TAILSCALE-VPS-MACMINI-BRIDGE.md) — Vercel lovește IP-ul public al VPS-ului (`192.3.92.184` sau domeniu); Nginx pe VPS face `proxy_pass` la IP-ul Tailscale al Mac mini-ului (`100.x.x.x:11434`).

## 1. Verifică că aplicația AI ascultă public sau doar local

- Dacă folosești **Nginx pe același VPS**, Node poate rămâne pe `127.0.0.1:3000` (recomandat).
- Atunci **nu** este nevoie ca portul 3000 să fie deschis în firewall către internet.

Pe mașina VPS:

```bash
ss -tlnp | grep 3000
curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/health
```

Înlocuiește `/health` cu calea reală a serviciului tău.

## 2. Firewall (UFW)

**Variantă recomandată** (doar 80/443 publice, 3000 doar local):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

**Variantă temporară de test** (exporți direct 3000 — dezactivează după ce Nginx merge):

```bash
sudo ufw allow 3000/tcp
sudo ufw reload
```

## 3. Test de pe alt calculator (curl)

Înlocuiește `YOUR_PUBLIC_IP` sau domeniul și cheia.

**Direct pe port 3000** (dacă e deschis în firewall):

```bash
curl -sS -D - -o /tmp/ai.out -X POST "http://YOUR_PUBLIC_IP:3000/v1/generate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"prompt":"ping","stream":false}'
head -c 500 /tmp/ai.out
```

**Prin Nginx pe port 80** (fără `:3000` în URL):

```bash
curl -sS -D - -o /tmp/ai.out -X POST "http://ai.example.com/v1/generate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"prompt":"ping","stream":false}'
```

Dacă primești `Connection refused` sau timeout: verifică firewall, ca serviciul rulează, și că Nginx face `proxy_pass` la `127.0.0.1:3000`.

## 4. Nginx reverse proxy (port 80)

Copiază și adaptează `deploy/ai-api-nginx-port80.conf` (schimbă `server_name`).

```bash
sudo cp /path/to/gobid.ro/deploy/ai-api-nginx-port80.conf /etc/nginx/sites-available/ai-api
sudo nano /etc/nginx/sites-available/ai-api
sudo ln -sf /etc/nginx/sites-available/ai-api /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

TLS (recomandat pentru producție):

```bash
sudo certbot --nginx -d ai.example.com
```

După TLS, URL-ul în Vercel devine `https://ai.example.com/...` (fără port în URL).

## 5. Variabile de mediu (Vercel / Next.js)

În **Vercel → Project → Settings → Environment Variables**:

- `MAC_MINI_API_URL` = URL-ul **public** final, **fără** `:3000`, de exemplu:
  - `https://ai.example.com/v1/generate`
  - sau `http://YOUR_PUBLIC_IP/` dacă folosești doar port 80 pe IP (mai puțin ideal)
- `MAC_MINI_API_KEY` = aceeași cheie pe care o validează serverul AI (Bearer sau `x-api-key`, după implementarea ta).

În repo, vezi comentarii în `.env.example` pentru același pattern.

## Checklist rapid

| Pas | Acțiune |
|-----|--------|
| DNS | A record `ai.example.com` → IP public VPS |
| Node | Rulează pe `127.0.0.1:3000` sau `0.0.0.0:3000` |
| UFW | 80/443 deschise; 3000 opțional doar pentru test |
| Nginx | `proxy_pass http://127.0.0.1:3000` + timeout-uri LLM |
| Vercel | `MAC_MINI_API_URL` cu **https** și calea completă către endpoint |

## Note Vercel

- Request-urile pleacă de pe rețeaua Vercel către IP-ul tău public: VPS-ul trebuie să aibă **IP public routabil**, fără blocare la furnizor.
- Dacă folosești **Cloudflare** în față, verifică că proxy-ul nu taie body-uri mari sau timeout-uri; poți crește timeout în Cloudflare sau bypass pentru subdomeniul AI.
