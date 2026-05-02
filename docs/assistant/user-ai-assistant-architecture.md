# User AI Assistant – Enterprise Technical Spec

**Document:** Full current implementation of the user AI Assistant chat (gobid.ro).  
**Status:** Production-focused; describes only what exists in the repo.

---

## 1) Overview

### What the assistant does

- **Help / navigation:** Explains dashboard and deep links (e.g. /dashboard, /dashboard/my-products, /ro). Intent “help” is only when there is **no** active draft.
- **Create listing drafts:** Guides the user through required fields (title, description, category, subcategory, starting_price, currency) via a deterministic wizard + optional OpenAI tool round.
- **Publish:** After all mandatory fields are filled, user can confirm (“da, publică”); assistant calls `publishDraft` and confirms with a link to Anunțurile mele.

### What it explicitly does NOT do

- **Admin:** No access to admin panel or other users’ data.
- **Other users:** No visibility or actions on other users’ conversations or drafts.
- **Executări/Insolvență publishing:** For those listing types the assistant only explains that they require token; it does not create or publish them.
- **Search / live_bid logic:** No integration with search index or live-bid auction engine; only draft creation and publish to `status: 'active'` with slug/url.

---

## 2) Architecture

### Components

| Layer | Description |
|-------|-------------|
| **UI** | `app/dashboard/assistant/**`: AssistantChat, MessageBubble, TypingIndicator, CodeBlock, DraftPanel, ConfirmPublishModal, AssistantChatFab. Telegram-like chat, optimistic bubbles, quick replies, draft progress, search in conversation. |
| **API routes** | `app/api/assistant/**`: chat (POST), conversations (GET), conversations/[id] (GET), attach-photos (POST), draft-info (GET), draft-status (GET). All require Bearer auth. |
| **DB** | Supabase: `assistant_conversations`, `assistant_messages`, `assistant_state`, `assistant_daily_usage`, `assistant_user_rate_limit`. RLS on all; ownership via `user_id` or conversation → user. |
| **Tools** | Server-only: createDraftListing, updateDraftField, updateDraftFieldsBatch (deterministic path only), validateDraft, publishDraft, attachPhoto, deleteDraft. OpenAI tool-call whitelist excludes `updateDraftFieldsBatch`. |
| **Wizard / state machine** | `lib/assistant/wizard/stateMachine.ts`: states (START, DRAFT_CREATED, COLLECTING_DETAILS, CONFIRM_PUBLISH, PUBLISHED, DONE, etc.), `detectIntent`, `userWantsToPublish`, `userWantsToDeleteDraft`, `getNextWizardStep`. |
| **Extractor / slot-fill** | `lib/assistant/wizard/extractFields.ts`, `fieldValidationMessages.ts`, `fieldLabels.ts`: deterministic regex/list-based extraction; slot-fill when `last_requested_field` is set; validation messages for invalid input. |
| **NLG** | `lib/assistant/nlg.ts`, `lib/assistant/prompts/nlgSystem.ts`: ReplyPlan → OpenAI (gpt-4o-mini, no tools) to rewrite deterministic reply into a friendlier Romanian message; 5‑min in-memory cache; fallback to deterministic text on failure/timeout. |
| **OpenClaw / Ollama** | **Not implemented.** NLG uses OpenAI only; OpenClaw/Ollama can be added later as a drop-in NLG provider. |

### Data flow (ASCII)

```
[User message]
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│ Auth (Bearer) → Rate limit (2s) → Daily quota (200/day)          │
│ Load: conversation (+ ownership) → assistant_state → last msgs  │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│ Intent: help (no draft) → deterministic help reply                │
│ Intent: create_listing (no draft) → createDraftListing → reply   │
│ Draft + "publică" → validateDraft → publish or missing-fields    │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼ (draft exists, no publish intent)
┌──────────────────────────────────────────────────────────────────┐
│ Slot-fill: last_requested_field set?                             │
│   → extractForField(message) → valid?                           │
│     YES: updateDraftFieldsBatch → validateDraft → getNextStep   │
│     NO:  validationMessageForField + keep last_requested_field   │
└──────────────────────────────────────────────────────────────────┘
       │ (no slot fill or not applicable)
       ▼
┌──────────────────────────────────────────────────────────────────┐
│ Multi-field extractor: extractFields(message)                    │
│   → entries.length > 0? updateDraftFieldsBatch → validateDraft  │
│     → getNextWizardStep; receipt + quickReplies                 │
└──────────────────────────────────────────────────────────────────┘
       │ (no extracted fields)
       ▼
┌──────────────────────────────────────────────────────────────────┐
│ OpenAI round (MAX_TOOL_ROUNDS=1): system + history + message    │
│   Tools: createDraftListing | updateDraftField | attachPhoto |   │
│         validateDraft | publishDraft | deleteDraft               │
│   Tool result → optional state update; then validateDraft →     │
│   getNextWizardStep or use model content                        │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│ draftProgress = validateDraft (for response + NLG)              │
│ If usedDeterministicReply && reply: ReplyPlan → runNlg →         │
│   reply = rewritten or fallback                                  │
│ Insert assistant_messages; update assistant_state; optional      │
│ title gen (2 msgs) + summarize (every 20)                        │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
[JSON: conversationId, message, quickReplies?, draftProgress?]
```

---

## 3) Exact File Map

### UI – `app/dashboard/assistant/`

| Path | Responsibility |
|------|----------------|
| `page.tsx` | Assistant page: metadata, short copy, no chat (chat is in Fab or drawer). |
| `_components/AssistantChat.tsx` | Main chat: conversations list, message list, send, optimistic user + pending assistant bubble, 600ms thinking indicator, scroll to bottom, grouping (2 min), quick replies, draft progress bar, “Publică acum” + modal, search in conversation (highlight, next/prev), pin draft (localStorage), draft-info fetch, openProduct link to `/dashboard/my-products?openProduct=<id>`. |
| `_components/MessageBubble.tsx` | Single message: linkify internal paths, fenced code blocks, copy message (desktop hover / mobile ⋯ menu), user Retry/Edit, search highlight, avatar/compact by time group. |
| `_components/TypingIndicator.tsx` | “Se gândește…” with bouncing dots; uses `anim-fade`. |
| `_components/CodeBlock.tsx` | Fenced code block with copy button. |
| `_components/DraftPanel.tsx` | Side panel: draft status (draft-status API), missing fields, thumbnails, “Adaugă poze”, “Publică”, “Deschide în Anunțurile mele”. |
| `_components/ConfirmPublishModal.tsx` | Modal: confirm publish, draft title, loading state, Escape/Tab trap. |
| `_components/AssistantChatFab.tsx` | FAB + draggable panel; position persisted in localStorage; embeds AssistantChat. |

### API – `app/api/assistant/`

| Path | Method | Responsibility |
|------|--------|----------------|
| `chat/route.ts` | POST | Auth, rate limit, daily quota, load/create conversation and state, deterministic pipeline + optional OpenAI tool round, NLG rewrite, insert message, update state, return message + quickReplies + draftProgress. |
| `conversations/route.ts` | GET | List conversations for user (id, title, created_at, updated_at, last_message_snippet). |
| `conversations/[id]/route.ts` | GET | Paginated messages for one conversation (cursor, limit 1–50); ownership enforced. |
| `attach-photos/route.ts` | POST | Body: conversationId, urls[]; resolves draft from assistant_state; calls attachPhoto for each URL (Cloudinary allowlist); returns attached count and errors. |
| `draft-info/route.ts` | GET | Query: conversationId; returns draftId, title, status, updatedAt or draftId: null. |
| `draft-status/route.ts` | GET | Query: conversationId; returns hasDraft, draftProductId, status, imagesCount, ready, missing[]. |

### Lib – `lib/assistant/`

| Path | Responsibility |
|------|----------------|
| `auth.ts` | getAssistantAuth(request): Bearer token → supabaseAdmin.auth.getUser → { userId, accessToken }. |
| `nlg.ts` | ReplyPlan type; buildNlgPrompt(plan, recentMessages); runNlg(plan, recentMessages) with in-memory 5‑min cache; hashPlan for cache key. |
| `prompts/nlgSystem.ts` | NLG_SYSTEM_PROMPT: rewriter rules (same intent, no invented data, 1–3 sentences, max 1 emoji). |
| `summarize.ts` | buildCompactSummary(messages): deterministic short summary for context window (every 20 messages). |
| `uiMap.ts` | UI_MAP (dashboard routes + labels), MANDATORY_FIELD_LABELS. |
| `wizard/stateMachine.ts` | WizardState; userWantsToPublish, userWantsToDeleteDraft; detectIntent(help | create_listing | unknown); getNextWizardStep(state, validation, userMessage). |
| `wizard/extractFields.ts` | extractFields(message), extractForField(field, message, context), getExtractedFieldEntries, getSubcategoriesForCategory; categories/subcategories/counties lists; price/currency parsing. |
| `wizard/fieldValidationMessages.ts` | validationMessageForField(field, context); getQuickRepliesForField(field, draftCategory). |
| `wizard/fieldLabels.ts` | formatFilledFieldsReceipt(fieldNames) for receipt line. |
| `ui/linkify.ts` | linkifyInternalPaths(text): whitelist /dashboard, /ro, /auth → LinkifySegment[]. |
| `tools/index.ts` | Re-exports all tools + DRAFT_FIELD_WHITELIST, MANDATORY_FIELDS_FOR_PUBLISH, types. |
| `tools/types.ts` | AssistantContext, DraftFieldName, DRAFT_FIELD_WHITELIST, MANDATORY_FIELDS_FOR_PUBLISH. |
| `tools/createDraftListing.ts` | Inserts product (status draft, user_id from ctx); returns productId. |
| `tools/updateDraftField.ts` | Single field update; whitelist check; .eq("user_id", ctx.userId). |
| `tools/updateDraftFieldsBatch.ts` | Batch UPDATE; whitelist; title/price/currency/images validation; image URL allowlist (Cloudinary). Used only in deterministic slot-fill and extractor paths, not in OpenAI tool list. |
| `tools/validateDraft.ts` | Select mandatory fields; returns { ready, missing }. |
| `tools/publishDraft.ts` | validateDraft first; then slug from title, status=active, url=/live_bid/{slug}. |
| `tools/attachPhoto.ts` | Append URL to product.images; allowlist Cloudinary; max 20 images. |
| `tools/deleteDraft.ts` | Delete only if status=draft and user_id match. |

### Supabase / auth

| Path | Responsibility |
|------|----------------|
| `lib/supabase/serverUserClient.ts` | createServerUserClient(accessToken): Supabase client with Bearer header for RLS. |
| `lib/supabase` | supabaseAdmin used in chat route and getAssistantAuth for getUser(accessToken). |

### Migrations – `supabase/migrations/`

| File | Content |
|------|---------|
| `2026022401_assistant_tables.sql` | assistant_conversations, assistant_messages, assistant_state (id, user_id, title, created_at; conversation_id, role, content, created_at; conversation_id PK, draft_product_id, state, data JSONB, last_request_at, updated_at); indexes; RLS. |
| `2026022402_assistant_conversations_updated_at.sql` | assistant_conversations.updated_at; trigger on assistant_messages INSERT to set conversation updated_at. |
| `2026022404_assistant_daily_usage_and_summary.sql` | assistant_daily_usage (user_id, usage_date, message_count); assistant_state.summary, last_summarized_message_id. |
| `2026022405_assistant_user_rate_limit.sql` | assistant_user_rate_limit (user_id PK, last_request_at). |

**Not present:** `ai_cache` table (NLG uses in-memory cache only).

---

## 4) Database & RLS

### assistant_conversations

- **Columns:** id (UUID PK), user_id (FK auth.users, NOT NULL), title (TEXT, default 'Conversație nouă'), created_at (TIMESTAMPTZ), updated_at (TIMESTAMPTZ).
- **Indexes:** user_id; created_at DESC; updated_at DESC.
- **RLS:** FOR ALL USING/WITH CHECK auth.uid() = user_id.

### assistant_messages

- **Columns:** id (UUID PK), conversation_id (FK assistant_conversations, NOT NULL), role (TEXT CHECK IN ('user','assistant','system')), content (TEXT), created_at (TIMESTAMPTZ).
- **Indexes:** conversation_id; created_at.
- **RLS:** FOR ALL via EXISTS on assistant_conversations where conversation_id = c.id and c.user_id = auth.uid().

### assistant_state

- **Columns:** conversation_id (UUID PK, FK assistant_conversations), draft_product_id (UUID FK products, SET NULL), state (TEXT, default 'START'), data (JSONB, default '{}'), last_request_at (TIMESTAMPTZ), updated_at (TIMESTAMPTZ), summary (TEXT), last_summarized_message_id (UUID FK assistant_messages, SET NULL).
- **JSONB data keys used:** `state`, `draft_product_id`, `last_requested_field`.
- **Indexes:** last_request_at.
- **RLS:** FOR ALL via conversation → user_id = auth.uid().

### assistant_daily_usage

- **Columns:** user_id (FK auth.users), usage_date (DATE, Europe/Bucharest), message_count (INT). PK (user_id, usage_date).
- **Indexes:** (user_id, usage_date).
- **RLS:** FOR ALL auth.uid() = user_id.
- **Intent:** Daily quota (e.g. 200 messages/day).

### assistant_user_rate_limit

- **Columns:** user_id (UUID PK, FK auth.users), last_request_at (TIMESTAMPTZ).
- **RLS:** FOR ALL auth.uid() = user_id.
- **Intent:** Global per-user throttle (2s between chat requests).

---

## 5) Chat Behavior (Deterministic “Brain”)

### Intent handling

- **help:** Only when `!draftProductId`. Reply: menu + deep links (UI_MAP). State set to DONE.
- **create_listing:** Only when `!draftProductId`. createDraftListing → reply asks for title; state DRAFT_CREATED.
- If draft exists and user says “publică” (userWantsToPublish): validateDraft → if ready then publishDraft and reply with link; else reply with missing labels and stay COLLECTING_DETAILS.

### Draft lifecycle states

- **START:** No draft; initial or after DONE.
- **INTENT_HELP / DONE:** Help flow or conversation end.
- **DRAFT_CREATED:** Draft created, collecting first fields.
- **COLLECTING_DETAILS:** Draft exists; filling fields; last_requested_field may be set for slot-fill.
- **CONFIRM_PUBLISH:** All mandatory fields filled; waiting for “da, publică”.
- **CONFIRM_DELETE:** Waiting for “da, șterge” before deleteDraft.
- **PUBLISHED:** Draft published this session; draft_product_id cleared.

When state is DRAFT_CREATED or COLLECTING_DETAILS and draft_product_id is set, the route normalizes to COLLECTING_DETAILS for logic.

### Deterministic pipeline order

1. **Load:** Auth → rate limit (assistant_user_rate_limit, 2s) → daily quota (assistant_daily_usage, 200/day) → conversation (by id + user_id) or create new → assistant_state (draft_product_id, state, data.last_requested_field, summary, last_summarized_message_id).
2. **Insert user message** and upsert daily usage.
3. **Intent branch:** help (no draft) → deterministic help; create_listing (no draft) → createDraftListing + reply; draft + userWantsToPublish → validate → publish or missing-fields reply.
4. **Slot-fill (draft path):** If last_requested_field set: load draft currency/category; extractForField(last_requested_field, message, context). If entries: updateDraftFieldsBatch → validateDraft → getNextWizardStep → receipt + next question + quickReplies; else validationMessageForField + keep last_requested_field.
5. **Multi-field extractor (draft path, no slot filled):** extractFields(message) → getExtractedFieldEntries. If entries: updateDraftFieldsBatch → validateDraft → getNextWizardStep; if clarifyingMessage use it else receipt + step.reply; set quickReplies (e.g. subcategory from draft category).
6. **OpenAI path (draft path, no extracted fields):** buildSystemPrompt(draftId, state, summary); loadRecentMessages(limit 10); single round (MAX_TOOL_ROUNDS=1) with tools; ALLOWED_TOOLS whitelist; createDraftListing blocked if draft already exists; on deleteDraft/publishDraft success update newDraftId/newState and set deterministic reply. After round: if newDraftId && ranTool then validateDraft + getNextWizardStep; else if newDraftId && finalContent and !isGenericGreeting use finalContent else getNextWizardStep.
7. **No draft:** Same OpenAI call with full TOOL_DEFINITIONS (including createDraftListing).
8. **draftProgress:** Computed from validateDraft (published this turn → published; else filled/total from missing).
9. **NLG:** If usedDeterministicReply && reply: build ReplyPlan (deterministicReply, userMessage, mode, requestedField, quickReplies, progress); loadRecentMessages(4); runNlg(plan, recent); if result replace reply.
10. **Persist:** Insert assistant message; optionally generate title (when total messages === 2); optionally summarize (every 20); update assistant_state (draft_product_id, state, data, summary, last_summarized_message_id).

### When OpenAI is used vs skipped

- **Skipped:** Help (no draft); create_listing (no draft); draft + “publică” (validate + publish or missing); slot-fill success or validation error; multi-field extractor success (with or without clarifyingMessage).
- **Used:** Draft path when no slot-fill and no extractor entries; or no draft (first message or unknown intent). One completion round with tools (MAX_TOOL_ROUNDS=1).

### MAX_TOOL_ROUNDS and tool whitelist

- **MAX_TOOL_ROUNDS = 1.** No multi-round tool loop.
- **ALLOWED_TOOLS:** createDraftListing, updateDraftField, attachPhoto, validateDraft, publishDraft, deleteDraft. updateDraftFieldsBatch is **not** in ALLOWED_TOOLS; it is only used in the deterministic slot-fill and extractor branches.

---

## 6) Tools (Server-Side Only)

| Tool | Purpose | Ownership | Allowed / validation |
|------|---------|-----------|------------------------|
| **createDraftListing** | Insert product status=draft, user_id=ctx.userId. | RLS + insert as user. | No args. |
| **updateDraftField** | Update one whitelisted field. | .eq("user_id", ctx.userId). | field in DRAFT_FIELD_WHITELIST; value type per field. |
| **updateDraftFieldsBatch** | Single UPDATE of multiple whitelisted fields. | .eq("user_id", ctx.userId). | Keys in whitelist; title ≤200; starting_price>0; currency RON|EUR; images from Cloudinary only, max 20. |
| **validateDraft** | Read mandatory fields; return ready + missing[]. | .eq("user_id", ctx.userId). | Read-only. |
| **publishDraft** | validateDraft; then set status=active, slug, url. | .eq("user_id", ctx.userId). | Fails if !validation.ready. |
| **attachPhoto** | Append image URL to product.images. | .eq("user_id", ctx.userId). | URL from allowlist (res.cloudinary.com, res-cdn.cloudinary.com); max 20. |
| **deleteDraft** | Delete row. | .eq("user_id", ctx.userId).eq("status", "draft"). | Only if userWantsToDeleteDraft(message); else returns error. |

Tool injection prevention: only names in ALLOWED_TOOLS are executed; args parsed server-side; createDraftListing rejected when draft already exists.

---

## 7) UX Features (Enterprise Feel)

- **Telegram-like chat:** Bubbles by role, avatar, compact grouping.
- **Pending assistant:** Placeholder bubble with “…” plus 600ms delay then TypingIndicator (“Se gândește…”).
- **Optimistic user bubble:** Sent immediately with status sending → sent/failed; optional hint “(se completează draft-ul…)” for draft-like input.
- **Smooth scroll:** bottomRef scrollIntoView on messages/thinking change.
- **Grouping window:** 2 minutes (GROUP_WINDOW_MS); same role within window → compact, no duplicate avatar.
- **Hover/focus actions:** Copy message (assistant); Retry/Edit (last user message); desktop hover row, mobile ⋯ menu.
- **Copy code blocks:** CodeBlock component with “Copiază codul” in MessageBubble.
- **Linkify:** Internal paths only; whitelist `/dashboard`, `/ro`, `/auth` (linkify.ts).
- **Quick reply chips:** Category (top 5) or subcategory (up to 8 for current draft category); send message on click.
- **Draft progress bar:** Completat X/Y; status pill (Draft | Gata de publicare | Publicat); “Publică acum” when ready; idempotency: modal confirm then sendMessage("da, publică"); inline publish error shown on failure.
- **Search in conversation:** Input debounced (200ms); highlight matches; next/prev buttons; scroll to match (messageIndexForScroll).
- **Pin draft:** Toggle per conversation; stored in localStorage (assistant_pin_<convId>); banner with title, status, “Deschide în Anunțurile mele”, draft-info fetch.
- **openProduct link:** `/dashboard/my-products?openProduct=<draftId>` (and pinned draft “Deschide”).
- **Reduced motion:** globals.css @media (prefers-reduced-motion: reduce) disables assistant-anim-in, assistant-anim-fade, typing bounce.
- **Micro animations:** .anim-in (180ms), .anim-fade (150ms) for message/typing.

---

## 8) Security Model

- **Auth:** Authorization: Bearer <accessToken>; supabaseAdmin.auth.getUser(accessToken); 401 if missing/invalid.
- **RLS:** All assistant_* tables and products access use RLS; API uses createServerUserClient(accessToken) and .eq("user_id", auth.userId) (defense-in-depth).
- **Tool injection:** Only ALLOWED_TOOLS names; args from model parsed once; no client-supplied tool names.
- **URL allowlist:** Images: Cloudinary hosts only (attachPhoto, updateDraftFieldsBatch).
- **Logging:** No PII in prod; development logs errors to console.
- **Rate limiting:** Per user 2s (assistant_user_rate_limit); per conversation 2s (assistant_state.last_request_at); daily 200 messages (assistant_daily_usage).
- **Admin / restricted routes:** Not exposed by assistant; no tools or prompts that reference /admin or other users; linkify whitelist does not include /admin.

---

## 9) Performance & Scalability

- **TTFB:** Single OpenAI round (or none in full-deterministic path); NLG timeout 10s with fallback; chat timeout 25s.
- **DB:** One conversation check, one state read, one message insert, one state update per request; no N+1; conversations list fetches last message snippet in one extra query.
- **Caching:** NLG in-memory cache keyed by hash(reply, mode, requestedField, progress.status); TTL 5 min. No ai_cache table.
- **Vercel:** maxDuration not set in route; consider 30–60s if needed for long summaries.
- **OpenClaw/Ollama:** Can be added as alternative NLG provider in runNlg (same ReplyPlan → text contract).

---

## 10) Edge Cases & Failure Modes

| Case | Behavior |
|------|----------|
| Missing/invalid token | 401, body “Necesită autentificare.” |
| Conversation not owned | 404, “Conversație negăsită.” |
| Draft missing (e.g. deleted) | validateDraft throws; tool round returns error; state can still show old draft_product_id until next successful path clears it. Graceful: draft-info/draft-status return draftId: null or hasDraft: false. |
| Invalid slot-fill input | validationMessageForField reply; last_requested_field unchanged; quickReplies for that field. |
| OpenAI / NLG timeout | NLG: runNlg returns null → deterministic reply used. Chat: completion timeout (25s) → 500 and error message. |
| Double publish | publishDraft sets status=active; second publish would validate same draft (still ready) and attempt update; slug collision handled by suffix in publishDraft. Idempotency: UI “Publică acum” opens modal then single sendMessage("da, publică"); isPublishingNow blocks double click. |

---

## Summary

The User AI Assistant is a **deterministic-first** chat: help and create-listing intents, slot-fill, and multi-field extraction run without LLM; OpenAI is used for free-form turns and one tool round (create/update/validate/publish/delete draft, attach photo). An **NLG** step rewrites deterministic replies into a friendlier tone (cached 5 min, fallback on failure). All data access is **user-scoped** (RLS + .eq(user_id)); rate limits (2s, 200/day) and image URL allowlist (Cloudinary) enforce safety. The UI provides Telegram-style bubbles, quick replies, draft progress, search, and pin draft with no admin or cross-user capabilities.

**File created:** `docs/assistant/user-ai-assistant-architecture.md`

### TODOs discovered (max 10)

1. **Context window:** `loadRecentMessages` uses `order("created_at", { ascending: true }).range(0, limit - 1)`, so the “recent” context is the **first** N messages of the conversation, not the last N. For long chats, consider ordering descending and taking the last N then reversing for chronological prompt order.
2. **Summarization:** Summary is appended (newSummary = old + new slice); unbounded growth over many SUMMARIZE_EVERY cycles; consider capping total summary length or replacing.
3. **Title generation:** Only on total === 2 messages; long conversations never get title refresh.
4. **updateDraftFieldsBatch not in ALLOWED_TOOLS:** Intentional; document in onboarding that model cannot batch-update; only deterministic paths can.
5. **Draft panel vs in-chat progress:** DraftPanel and in-chat draftProgress both call draft-status; could unify to single source of truth to avoid double fetch.
6. **Publish from UI:** Confirm modal then sendMessage("da, publică") is idempotent at API level; consider explicit idempotency key if duplicate requests are observed.
7. **OpenClaw/Ollama:** Not implemented; runNlg is the single place to plug an alternative NLG provider.
8. **ai_cache table:** Optional future: persist NLG cache for multi-instance or cold start; currently in-memory only.
9. **Executări/Insolvență:** Assistant only explains token requirement; no flow to create/publish those listing types.
10. **Error messages in prod:** 500 returns generic “Eroare la procesare.”; consider safe user-facing message and server-side correlation id for support.
