# Ollama LLM Provider – Test Plan

**See also:** [OLLAMA_NGINX_SETUP.md](./OLLAMA_NGINX_SETUP.md) – Ollama is local-only; Nginx reverse proxy + curl verification.

## Env (Ollama as primary)

```bash
export ASSISTANT_LLM_PROVIDER=ollama
export OLLAMA_BASE_URL=http://187.124.8.68:8080
export OLLAMA_MODEL=llama3.1:8b
export OLLAMA_TIMEOUT_MS=8000
```

For OpenAI fallback (optional): set `OPENAI_API_KEY` and use `ASSISTANT_LLM_PROVIDER=openai` (or unset/other).

---

## Production hardening – test scenarios

### 1) Circuit breaker: 3 consecutive failures → skip LLM for 60s

- Trigger 3 Ollama failures in a row (e.g. wrong port or stop Ollama).
- Next call within 60s must not call Ollama: response 200 with `message` = fallback. No 500.
- After 60s, next call may try Ollama again.

### 2) Long message: 10k+ chars → clamped

- Send a free-form message with body length 10k+ characters.
- Request must succeed (200). Input to LLM must be clamped (last 8 conversation messages, each content max 2000 chars, total combined ≤ 12k). No 500 or truncation error.

### 3) Publish confirmation → bypass LLM

- With an active draft, send a publish confirmation (e.g. "da, publică" or "publică").
- Response must be deterministic (publish flow or missing-fields reply). No publish-related text must go through the LLM path.

### 4) Ollama stopped → 200 with fallback

- Stop Ollama or point `OLLAMA_BASE_URL` to a non-responding host.
- POST a free-form message with valid token. Expect 200, `message` = `LLM_FALLBACK_REPLY`, optional `quickReplies` when draft exists. Never 500.

### 5) TypeScript strict

- Run `npx tsc --noEmit`. Must compile with no errors.

---

## Curl examples

**Auth + basic chat (replace TOKEN):**
```bash
curl -s -X POST http://localhost:3000/api/assistant/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"message":"Bună, cu ce mă poți ajuta?"}'
```

**401 (no token):**
```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/assistant/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"test"}'
```

**400 (missing message):**
```bash
curl -s -X POST http://localhost:3000/api/assistant/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{}'
```

---

## Friendly / conversational upgrade – test scenarios

### 1) "Vreau suport" → OPEN_SUPPORT_CHAT

- Send message containing "suport" or "ajutor uman" or "vorbesc cu cineva".
- Expect 200, `message` = "Deschid imediat chatul de suport pentru tine.", `uiAction` = `{ type: "OPEN_SUPPORT_CHAT" }`. No LLM for execution.

### 2) "Du-mă la profil" → NAVIGATE

- Send "Du-mă la profil" or "la setări" or "profilul meu".
- Expect 200, friendly message, `uiAction` = `{ type: "NAVIGATE", payload: { href: "/dashboard/settings" } }`.
- "Du-mă la favorite" → `href: "/dashboard/favorites"`. "Te duc la dashboard" → `href: "/dashboard"`.

### 3) "Publică anunțul" → deterministic publish only

- With a complete draft, send "publică" or "da, publică".
- Response must be deterministic (publish or missing-fields). No LLM; no hallucinated confirmation.

### 4) Friendly joke / small talk → LLM response

- Send a conversational message (e.g. "Spune-mi o glumă", "Ce mai faci?").
- Expect 200, reply from LLM (conversational, short). No uiAction.

### 5) No name → ask name modal

- Use a user whose `user_profiles.first_name` is null/empty.
- Send any message. Expect 200, `message` = "Cum te pot striga? Vreau să fie personal pentru tine 🙂", `uiAction` = `{ type: "OPEN_MODAL", payload: { modal: "set_name" } }`.

### 6) Ollama stopped → deterministic actions still work

- Stop Ollama. Send "Vreau suport" or "Du-mă la favorite".
- Expect 200 with deterministic message and uiAction. No 500.

---

## Quick checklist

| Check | How |
|-------|-----|
| Circuit breaker | 3 failures → next call within 60s returns fallback, no LLM call |
| Message clamp | 10k+ char message → 200, input clamped to 8 msgs / 2k per msg / 12k total |
| Publish bypass | "da, publică" with draft → deterministic only, no LLM |
| Ollama down | 200 + fallback message, never 500 |
| TS strict | `npx tsc --noEmit` passes |
| OPEN_SUPPORT_CHAT | "Vreau suport" → uiAction OPEN_SUPPORT_CHAT |
| NAVIGATE | "Du-mă la profil" / "la favorite" → uiAction NAVIGATE |
| OPEN_MODAL set_name | No first_name in profile → ask name + modal |
| Conversational | Joke/small talk → LLM reply, no uiAction |

---

## Voice mode (`POST /api/assistant/voice`)

- **Auth:** Same as chat (`Authorization: Bearer <token>`). Rate limit and daily quota enforced via internal chat call.
- **Input:** `FormData` with `audio` (WAV or WebM), optional `conversationId`. Max 5MB, MIME `audio/wav` / `audio/webm`.
- **Flow:** STT (Whisper, ro) → if non-Romanian detected → 200 with message "Momentan pot conversa doar în limba română." + optional TTS; else → internal chat POST → TTS (Romanian, mp3 base64) → 200 with `message`, `uiAction?`, `audioBase64?`, etc.

### Voice test scenarios

1. **Romanian greeting** – Send short Romanian audio (e.g. "Bună"). Expect 200, `message` (assistant reply), `audioBase64` (mp3). Autoplay in UI.
2. **"Vreau suport"** – Voice input "Vreau suport". Expect 200, `message` + `uiAction` = `{ type: "OPEN_SUPPORT_CHAT" }` + `audioBase64`. Client executes navigation to support.
3. **"Du-mă la profil"** – Voice input. Expect 200, `uiAction` = `{ type: "NAVIGATE", payload: { href: "/dashboard/settings" } }` + audio.
4. **English** – Send English speech. Expect 200, `message` = "Momentan pot conversa doar în limba română.", optional `audioBase64`. No chat LLM call for content.
5. **Ollama stopped** – Same as chat: voice path calls chat internally; if Ollama is down, chat returns fallback. Expect 200, deterministic/fallback message + optional TTS.
6. **Oversized audio** – Send body > 5MB. Expect 400 with safe error (e.g. "Fișierul audio este prea mare.").
