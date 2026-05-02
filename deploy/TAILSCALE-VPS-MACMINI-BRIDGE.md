# Mac mini (Ollama) + Tailscale + VPS ca bridge

Scop: **Vercel / internet** nu vede direct Mac mini-ul; vede doar **VPS-ul public** (ex. `192.3.92.184`). VPS-ul și Mac mini-ul sunt în **aceeași rețea Tailscale**, astfel Nginx (sau alt proxy) pe VPS poate înainta traficul către Ollama de pe Mac mini.

```
Internet / Vercel  →  http(s)://VPS_PUBLIC_IP:port  →  Nginx pe VPS
                                                      →  http://100.x.x.x:11434  (Tailscale IP Mac mini)
                                                      →  Ollama (127.0.0.1:11434 pe Mac mini)
```

## 1. Tailscale pe ambele mașini

- **Mac mini**: instalare Tailscale, login, pornește serviciul. Ollama rămâne pe `127.0.0.1:11434` (recomandat, nu expune 11434 la LAN fără motiv).
- **VPS**: același cont Tailscale (sau ACL care permite VPS → Mac mini).

Notează **Tailscale IP** al Mac mini-ului (ex. `100.64.x.y`): în admin Tailscale sau `tailscale ip -4` pe Mac mini.

## 2. Verificare din VPS că Ollama e accesibil prin Tailscale

Pe VPS (SSH):

```bash
curl -sS -m 10 http://100.x.x.x:11434/api/tags
```

Înlocuiește `100.x.x.x` cu IP-ul Tailscale al Mac mini. Răspuns JSON cu `models` = OK.

Dacă **timeout / connection refused**:

- Pe Mac mini: `tailscale status`, firewall macOS (permite incoming de la Tailscale).
- În Tailscale Admin: verifică ACL ca VPS să poată accesa portul 11434 pe Mac mini (sau „accept” implicit între device-uri din același tailnet).

## 3. Nginx pe VPS (bridge public → Tailscale)

**Nu** expune `11434` direct la internet dacă poți evita; folosește **80/443** + auth (Bearer / header) ca în `deploy/ai-api-nginx-port80.conf` / `deploy/ollama-nginx.conf`, dar `proxy_pass` către **IP Tailscale**, nu `127.0.0.1`:

```nginx
location /api/generate {
    proxy_pass http://100.x.x.x:11434/api/generate;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_read_timeout 300s;
    proxy_connect_timeout 10s;
    proxy_send_timeout 300s;
}
```

(Adaugă `location /api/chat` analog dacă folosești chat API.)

## 4. Variabile în Next.js / Vercel

- **`EXTERNAL_AI_API_URL`** sau **`MAC_MINI_API_URL`** trebuie să fie URL-ul **văzut de Vercel**:
  - fie `http://192.3.92.184:11434/api/generate` dacă expui direct 11434 pe VPS și forward-ezi la Mac mini (mai puțin ideal),
  - fie `https://ai.domeniu.tău/api/generate` dacă Nginx termină TLS pe 443 și face proxy către `100.x.x.x:11434`.

Vercel **nu** poate folosi IP-uri Tailscale (`100.x.x.x`) în URL — doar VPS-ul le poate folosi în `proxy_pass`.

## 5. Securitate

- Restrânge pe firewall-ul VPS: **doar 22, 80, 443** (fără 11434 public dacă Nginx face tot traficul).
- Pune **cheie** în Nginx (Bearer / `x-api-key`) și aceeași valoare în **`MAC_MINI_API_KEY`** în Vercel.

## 6. Debugging rapid

| Unde | Comandă / verificare |
|------|----------------------|
| Mac mini | `ollama list`, `curl -s http://127.0.0.1:11434/api/tags` |
| VPS → Mac (TS) | `curl -s http://100.x.x.x:11434/api/tags` |
| Internet → VPS | `curl -s http://192.3.92.184:...` (sau domeniu) același path ca în `.env` |

Vezi și [AI-API-VPS-CONNECTIVITY.md](./AI-API-VPS-CONNECTIVITY.md) pentru UFW, curl extern și TLS.
