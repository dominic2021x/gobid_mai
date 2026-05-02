# Admin AI Control Panel – Architecture Design

**Status:** Design only (not implemented).  
**Goal:** Allow admin to configure assistant behavior (rate limit, quota, model, tokens, tool toggles, global on/off) via a DB-backed control panel, with the chat route reading config dynamically and no breaking change to current behavior.

---

## 1. Proposed DB Schema

### Table: `public.ai_settings`

| Column       | Type        | Constraints | Description |
|-------------|-------------|-------------|-------------|
| `key`       | `TEXT`      | `PRIMARY KEY` | Setting key (see keys below). |
| `value`     | `JSONB`     | `NOT NULL`  | Typed value: number, string, or boolean. |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last write. |

**Recommended keys and value types:**

| Key | Type (in JSONB) | Default (if missing) | Description |
|-----|------------------|----------------------|-------------|
| `assistant.rate_limit_sec` | number | `2` | Per-user min interval (seconds). |
| `assistant.daily_quota` | number | `200` | Max messages per user per day. |
| `assistant.model_name` | string | `"gpt-4o-mini"` | OpenAI model. |
| `assistant.max_tokens` | number | `500` | Max tokens per completion. |
| `assistant.tool_publish_draft_enabled` | boolean | `true` | Whether `publishDraft` is available. |
| `assistant.enabled` | boolean | `true` | Global assistant on/off. |

**Why JSONB for `value`:** One column supports numbers, strings, and booleans; the typed loader in `lib/assistant/config.ts` can parse and validate per key. Alternative: `value TEXT` with app-side parsing; JSONB keeps types explicit and allows future nested values if needed.

**RLS:**

- Enable RLS on `ai_settings`.
- **Option A (recommended):** Policy “Only service role / server can read” is implicit when the app uses `createAdminClient()` (service role bypasses RLS). Add a policy so that **only admins** can `INSERT`/`UPDATE`/`DELETE` when using a user-scoped client (e.g. admin UI): e.g. `USING (public.is_admin())` and `WITH CHECK (public.is_admin())` for `INSERT`/`UPDATE`/`DELETE`. The chat route and config loader **never** use a user-scoped client for this table; they use the admin client, so they bypass RLS and always see all rows.
- **Option B:** Allow `SELECT` for authenticated users if you want to expose “current limits” in the UI later; restrict `INSERT`/`UPDATE`/`DELETE` to admins.

**Indexes:** None required beyond the primary key on `key`. Optional: `updated_at` if you need “last changed” queries.

---

## 2. File Structure

```
lib/assistant/
  config.ts          # NEW: typed config loader (getAssistantConfig), defaults, key constants
  config.types.ts    # NEW (optional): AssistantConfig interface and key type

app/api/assistant/
  chat/route.ts      # MODIFY: replace hardcoded constants with getAssistantConfig()

app/api/admin/      # Future (out of scope for this design)
  ai-settings/
    route.ts         # GET (admin): list/all settings; PATCH (admin): update keys
  # or app/dashboard/admin/ai-settings/ page that calls the same API
```

**Config loader location:** `lib/assistant/config.ts` so all assistant logic (chat route, future cron or other consumers) shares one place for defaults and DB reads.

---

## 3. How the Chat Route Consumes Config

**Flow:**

1. **Early in `POST`:** After auth and body validation, call `getAssistantConfig(adminClient)` once per request. This runs a single `SELECT key, value FROM ai_settings WHERE key LIKE 'assistant.%'` (or `key = any($1)` with the known keys). No per-key round-trips.
2. **Config object:** Loader returns a typed `AssistantConfig` (e.g. `rateLimitSec`, `dailyQuota`, `modelName`, `maxTokens`, `toolPublishDraftEnabled`, `assistantEnabled`). Missing keys are filled with the same defaults used today (2, 200, "gpt-4o-mini", 500, true, true).
3. **Global kill switch:** If `assistantEnabled === false`, return `503` (or `503`/`429`-style) with a single, non-sensitive message (e.g. “Asistentul este temporar indisponibil.”) and do not call OpenAI or touch tools.
4. **Rest of handler:** Use `config.rateLimitSec` for user and conversation throttle windows, `config.dailyQuota` for the daily cap, `config.modelName` and `config.maxTokens` in `openai.chat.completions.create`, and `config.toolPublishDraftEnabled` to build the tools list (and optionally system prompt) so `publishDraft` is omitted when disabled.
5. **Caching (optional):** On Vercel serverless, per-instance in-memory cache with a short TTL (e.g. 60s) is acceptable to avoid a DB read on every request; document that cache is process-local and best-effort. If you skip caching, every request does one small SELECT; that is within serverless constraints.

**Pseudocode (conceptual):**

```ts
// In POST handler, after auth + body validation:
const config = await getAssistantConfig(createAdminClient());
if (!config.assistantEnabled) {
  return NextResponse.json({ error: "Asistentul este temporar indisponibil." }, { status: 503 });
}
// Use config.rateLimitSec, config.dailyQuota, config.modelName, config.maxTokens
// Build tools list: if !config.toolPublishDraftEnabled, filter out "publishDraft" from ALLOWED_TOOLS / TOOL_DEFINITIONS
```

**No hardcoded values:** All numeric/string/boolean limits and model choices in the chat route come from `getAssistantConfig()` (or its defaults defined in one place in `config.ts`). Constants that are not admin-configurable (e.g. `MAX_TOOL_ROUNDS`, `CONTEXT_LAST_MESSAGES`, `SUMMARIZE_EVERY`, `OPENAI_TIMEOUT_MS`) can remain in code or move into `config.ts` as non-DB defaults.

---

## 4. Security Considerations

| Risk | Mitigation |
|------|------------|
| **Config read by non-admin clients** | Config is read only in server-side API route using `createAdminClient()`. No client-side or user-scoped Supabase client reads `ai_settings`. |
| **Admin writes from non-admin users** | RLS on `ai_settings`: only `is_admin()` (or equivalent) can `INSERT`/`UPDATE`/`DELETE`. Admin UI/API must use the same auth and pass RLS or use an admin-only API that uses service role and validates admin identity in app code. |
| **Sensitive data in config** | Store only non-secret knobs (numbers, model name, booleans). No API keys or secrets in `ai_settings`. |
| **Logging** | Config loader and chat route must not log raw config or keys in production (same as current “no sensitive logging” rule). |
| **Tool enable/disable** | If `publishDraft` is disabled, remove it from the tools array sent to OpenAI and (if applicable) from system prompt instructions, so the model cannot call it. |
| **Global disable** | When `assistantEnabled` is false, fail fast with 503 and do not invoke OpenAI or tools. |

---

## 5. Migration Strategy

1. **Add table and seed defaults (single migration)**  
   - Create `ai_settings` with `key`, `value` (JSONB), `updated_at`.  
   - Enable RLS and create admin-only write policy (and optional read policy as above).  
   - `INSERT` default rows for each of the six keys so existing behavior is unchanged if the app reads config before any admin edits.

2. **Introduce `lib/assistant/config.ts`**  
   - Implement `getAssistantConfig(adminClient)` with the same defaults as current chat route constants.  
   - If the table is empty or a key is missing, use in-code defaults (no breaking change).

3. **Chat route refactor**  
   - Replace hardcoded `RATE_LIMIT_SEC`, `DAILY_QUOTA`, `MAX_TOKENS`, model name, and tool list with values from `getAssistantConfig()`.  
   - Add global check for `assistantEnabled` and `publishDraft` tool filtering.  
   - Deploy; behavior stays the same when DB has the seeded defaults.

4. **Admin UI/API (later)**  
   - Add admin-only route(s) or dashboard page to read/update `ai_settings`.  
   - All updates go through the same table and are read by the next `getAssistantConfig()` call (or after cache TTL).

5. **Rollback**  
   - If needed, remove config usage from the chat route and revert to constants; keep the table for future use. No schema change required for rollback of app code.

---

## 6. Summary

- **DB:** One table `ai_settings` (key, value JSONB, updated_at), RLS so only admins can write; server reads via admin client.
- **Loader:** `lib/assistant/config.ts` with typed `getAssistantConfig(adminClient)` and single SELECT for all `assistant.*` keys, defaults in code.
- **Chat route:** One config read per request (or cached), global disable → 503, dynamic rate limit/quota/model/max_tokens and optional exclusion of `publishDraft` from tools.
- **Security:** Server-only config read, no secrets in table, no sensitive logging, admin-only writes.
- **Migration:** Add table + seed defaults, add config loader, refactor chat route to use config, then add admin UI when needed; rollback by reverting route to constants.
