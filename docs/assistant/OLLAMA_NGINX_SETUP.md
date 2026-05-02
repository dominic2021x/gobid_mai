# Ollama connectivity for gobid.ro

## Current behaviour

- **Ollama listens on `127.0.0.1:11434` only** (local-only; not bound to 0.0.0.0).
- To use Ollama from another machine or from a Next.js app running elsewhere, it must be exposed via a **reverse proxy** (e.g. Nginx) or the app must run **on the same host** as Ollama (co-located).

If the health-check URL (e.g. `http://187.124.8.68:8081`) returns the default Nginx page (HTML), the app will report:

> Base URL points to nginx, not Ollama. Configure reverse proxy to 127.0.0.1:11434.

---

## Nginx reverse proxy (expose Ollama on a public port)

On the host where Ollama runs (`127.0.0.1:11434`), configure Nginx to proxy to Ollama. Example for port **8081**:

```nginx
# /etc/nginx/sites-available/ollama (or inside http { } in nginx.conf)
server {
    listen 8081;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:11434;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/ollama /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Optional: if you put an auth layer in front (e.g. custom header), set `OLLAMA_API_KEY` in the app’s `.env`; the app sends it as header `x-ollama-key`. Nginx must validate this header.

---

## Curl verification

After the proxy is in place, verify from another machine (or from the same host):

**1. List models (Ollama API):**

```bash
curl -s http://YOUR_SERVER_IP:8081/api/tags
```

Expected: JSON with a `"models"` array (not HTML “Welcome to nginx”).

**2. Chat request (no auth):**

```bash
curl -s -X POST http://YOUR_SERVER_IP:8081/api/chat \
  -H "Content-Type: application/json" \
  -d '{"model":"llama3.1:8b","stream":false,"messages":[{"role":"user","content":"salut"}]}'
```

Expected: JSON with `"message"` and `"done":true` (not HTML).

**3. Chat request with Bearer token (if you use auth in front of Ollama):**

```bash
curl -s -X POST http://YOUR_SERVER_IP:8081/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_OLLAMA_API_KEY" \
  -d '{"model":"llama3.1:8b","stream":false,"messages":[{"role":"user","content":"salut"}]}'
```

**4. App health-check (from the machine where Next runs):**

```bash
curl -s http://localhost:3000/api/assistant/ollama-health
```

With correct proxy and env (`ASSISTANT_LLM_PROVIDER=ollama`, `OLLAMA_BASE_URL_PRIMARY=http://YOUR_SERVER_IP:8081`), response should be `"ok": true`. If the base URL still serves the Nginx default page, you’ll get `"ok": false` and the message: *Base URL points to nginx, not Ollama. Configure reverse proxy to 127.0.0.1:11434.*

---

## Env summary

| Variable | Description |
|----------|-------------|
| `ASSISTANT_LLM_PROVIDER` | `ollama` to use Ollama for the assistant. |
| `OLLAMA_BASE_URL_PRIMARY` | Base URL of Ollama (e.g. `http://187.124.8.68:8081` when behind Nginx). |
| `OLLAMA_API_KEY` | Secret sent as header `x-ollama-key`; must match Nginx config if proxy requires it. |
| `OLLAMA_MODEL` | Model name (e.g. `llama3.1:8b`). |

If the app runs on the same host as Ollama and no proxy is used, set `OLLAMA_BASE_URL_PRIMARY` (or `OLLAMA_HOST`) to `http://127.0.0.1:11434`.

---

## Chat nu merge – verificări

1. **Provider în .env**  
   În `.env` sau `.env.local` trebuie să fie exact:  
   `ASSISTANT_LLM_PROVIDER=ollama`  
   (fără spații, literă mică). Dacă e gol sau `openai`, chat-ul folosește OpenAI, nu Ollama.

2. **Repornește serverul Next.js**  
   După orice modificare la variabilele Ollama din `.env`, oprește și pornește din nou `npm run dev` (sau procesul care rulează Next). Provider-ul se citește la pornire.

3. **Health check**  
   Deschide în browser sau cu curl:  
   `http://localhost:3000/api/assistant/ollama-health`  
   - Dacă vezi `"ok": false` și `"provider": "(nesetat)"` sau altceva decât `ollama` → setează `ASSISTANT_LLM_PROVIDER=ollama` și repornește.  
   - Dacă vezi 403 → cheia din `OLLAMA_API_KEY` nu e acceptată de Nginx (verifică config-ul Nginx pentru `x-ollama-key`).  
   - Dacă vezi mesaj despre nginx → Nginx nu proxy-ează către `127.0.0.1:11434`; corectează blocul `location /`.

4. **Log în terminal (dev)**  
   La fiecare mesaj în chat, în terminalul unde rulează Next apare un log de tip:  
   `[assistant/chat] start { provider: 'ollama', ollamaBase: 'http://...', hasKey: true/false }`  
   Verifică că `provider` e `ollama`, că `ollamaBase` e URL-ul corect și că `hasKey` e `true` dacă Nginx cere `x-ollama-key`.
