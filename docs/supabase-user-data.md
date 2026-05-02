# Supabase Data Model – User-Centric Features

Last updated: 2025-11-13

This document defines the Supabase tables required to move all user-facing state
away from `localStorage`/IndexedDB and into PostgreSQL.  Every table assumes the
default Supabase schema (`public`) and relies on the built-in `auth.users`
table as the source of truth for identity (`uuid` primary keys).

All timestamp columns default to `timezone('utc', now())`.  Each table that
exposes mutable data includes an `updated_at` column maintained by trigger.

---

## 1. User Profile & Account State

### `user_profiles`
| Column        | Type        | Notes                                                   |
|---------------|-------------|---------------------------------------------------------|
| `user_id`     | `uuid` PK FK| References `auth.users.id` (1:1).                       |
| `first_name`  | `text`      | Nullable.                                               |
| `last_name`   | `text`      | Nullable.                                               |
| `phone`       | `text`      | Nullable, optional unique index if required.            |
| `avatar_url`  | `text`      | Nullable.                                               |
| `metadata`    | `jsonb`     | Arbitrary extra fields.                                 |
| `created_at`  | `timestamptz` | Default now.                                           |
| `updated_at`  | `timestamptz` | Maintained by trigger.                                |

### `user_tokens`
Tracks gamification / credit balances currently stored as `userTokens`.

| Column         | Type        | Notes                                  |
|----------------|-------------|----------------------------------------|
| `user_id`      | `uuid` PK FK| References `auth.users.id`.            |
| `balance`      | `integer`   | Default 0.                             |
| `total_earned` | `integer`   | Default 0.                             |
| `total_spent`  | `integer`   | Default 0.                             |
| `level`        | `text`      | Default `'Basic'`.                     |
| `updated_at`   | `timestamptz` | Trigger maintained.                   |

### `user_settings`
Generic storage for module/AI/voice preferences now held in localStorage.

| Column       | Type        | Notes                                        |
|--------------|-------------|----------------------------------------------|
| `user_id`    | `uuid` FK   | References `auth.users.id`.                  |
| `category`   | `text`      | e.g. `'tts'`, `'ai_config'`, `'ui'`, `'map'`.|
| `data`       | `jsonb`     | Arbitrary payload.                           |
| `created_at` | `timestamptz` | Default now.                                |
| `updated_at` | `timestamptz` | Trigger maintained.                         |
| **Unique**   | (`user_id`, `category`) | Upsert-friendly.                 |

---

## 2. Notifications & Activity

### `user_notifications`
| Column        | Type        | Notes                                             |
|---------------|-------------|---------------------------------------------------|
| `id`          | `uuid` PK   | `gen_random_uuid()`.                              |
| `user_id`     | `uuid` FK   | Recipient user.                                   |
| `title`       | `text`      | Optional short title.                             |
| `message`     | `text`      | Full message content.                             |
| `type`        | `text`      | Enum-like text (`'success'`, `'info'`, etc.).     |
| `metadata`    | `jsonb`     | Links, CTA, extra context.                        |
| `read_at`     | `timestamptz` | Null until read.                                |
| `created_at`  | `timestamptz` | Default now.                                     |

Indexes: `(user_id, read_at)` for unread lookups, `(user_id, created_at desc)`
for feeds.

### `user_activity_logs`
Lightweight audit trail for analytics/tracking.

| Column       | Type        | Notes                                              |
|--------------|-------------|----------------------------------------------------|
| `id`         | `uuid` PK   | `gen_random_uuid()`.                               |
| `user_id`    | `uuid` FK   | Nullable for anonymous events.                     |
| `session_id` | `text`      | Mirrors existing generated session IDs.            |
| `event`      | `text`      | Event name (e.g., `'product_view'`).               |
| `properties` | `jsonb`     | Event payload.                                     |
| `created_at` | `timestamptz` | Default now.                                      |

---

## 3. Favorites, Watchlists & Engagement

### `user_favorites`
| Column        | Type      | Notes                                               |
|---------------|-----------|-----------------------------------------------------|
| `user_id`     | `uuid` FK | References `auth.users.id`.                         |
| `product_id`  | `uuid` FK | References `products.id`.                           |
| `created_at`  | `timestamptz` | Default now.                                    |
| **PK**        | (`user_id`, `product_id`) | Simple toggling.                    |

### `user_watchlist`
Optional, mirrors favorites but for “watching” auctions.

| Column        | Type      | Notes                                            |
|---------------|-----------|--------------------------------------------------|
| `user_id`     | `uuid` FK | References `auth.users.id`.                      |
| `product_id`  | `uuid` FK | References `products.id`.                        |
| `created_at`  | `timestamptz` | Default now.                                 |
| **PK**        | (`user_id`, `product_id`) |                                  |

---

## 4. Chat & Support Tickets

### `chat_conversations`
| Column         | Type        | Notes                                           |
|----------------|-------------|-------------------------------------------------|
| `id`           | `uuid` PK   | `gen_random_uuid()`.                            |
| `user_id`      | `uuid` FK   | Conversation owner (nullable for public chats). |
| `subject`      | `text`      | Optional topic/title.                           |
| `channel`      | `text`      | `'website'`, `'whatsapp'`, `'admin'`, etc.      |
| `status`       | `text`      | `'open'`, `'pending'`, `'closed'`.              |
| `metadata`     | `jsonb`     | Context (device info, lead source, etc.).       |
| `created_at`   | `timestamptz` | Default now.                                   |
| `updated_at`   | `timestamptz` | Trigger maintained.                            |

### `chat_messages`
| Column            | Type        | Notes                                                 |
|-------------------|-------------|-------------------------------------------------------|
| `id`              | `uuid` PK   | `gen_random_uuid()`.                                  |
| `conversation_id` | `uuid` FK   | References `chat_conversations.id`.                   |
| `sender_type`     | `text`      | `'user'`, `'admin'`, `'ai'`.                          |
| `sender_id`       | `uuid`      | Nullable for AI/bot messages.                         |
| `content`         | `text`      | Message body (markdown ready).                        |
| `attachments`     | `jsonb`     | Array describing uploaded files.                      |
| `metadata`        | `jsonb`     | Extra flags (read receipts, emotion scores, etc.).    |
| `created_at`      | `timestamptz` | Default now.                                         |

Indexes: `(conversation_id, created_at asc)` and optionally `(sender_id)` for
moderation dashboards.

### `support_tickets`
| Column        | Type        | Notes                                        |
|---------------|-------------|----------------------------------------------|
| `id`          | `uuid` PK   | `gen_random_uuid()`.                         |
| `user_id`     | `uuid` FK   | Creator (nullable for anonymous).            |
| `subject`     | `text`      |                                              |
| `status`      | `text`      | `'open'`, `'in_progress'`, `'resolved'`.     |
| `priority`    | `text`      | `'low'`, `'normal'`, `'high'`, `'urgent'`.   |
| `category`    | `text`      | e.g., `'billing'`, `'technical'`.            |
| `metadata`    | `jsonb`     | Additional context, attachments, order IDs.  |
| `created_at`  | `timestamptz` | Default now.                                |
| `updated_at`  | `timestamptz` | Trigger maintained.                         |

### `support_ticket_messages`
| Column         | Type        | Notes                                          |
|----------------|-------------|------------------------------------------------|
| `id`           | `uuid` PK   | `gen_random_uuid()`.                           |
| `ticket_id`    | `uuid` FK   | References `support_tickets.id`.               |
| `sender_type`  | `text`      | `'user'`, `'staff'`, `'system'`.               |
| `sender_id`    | `uuid`      | Nullable for system messages.                  |
| `content`      | `text`      | Message body.                                  |
| `attachments`  | `jsonb`     | Optional array.                                |
| `created_at`   | `timestamptz` | Default now.                                  |

---

## 5. Integrations & API Keys

### `integration_settings`
Centralizes modules such as Google Maps, SmartBill, Resend, Facebook.

| Column        | Type        | Notes                                          |
|---------------|-------------|------------------------------------------------|
| `id`          | `uuid` PK   | `gen_random_uuid()`.                           |
| `key`         | `text` UNIQUE | Identifier (`'google_maps'`, `'smartbill'`). |
| `settings`    | `jsonb`     | Contains `api_key`, `enabled`, etc.            |
| `encrypted`   | `boolean`   | Flag if sensitive values are encrypted.        |
| `updated_by`  | `uuid`      | Admin user who last modified.                  |
| `updated_at`  | `timestamptz` | Default now.                                  |

For secrets, store encrypted values or leverage Supabase Vault (preferred).

---

## 6. System Helpers

### Updated-at Trigger
Use a single trigger function applied to tables that require automatic
`updated_at` management.

```sql
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;
```

Example usage:

```sql
create trigger set_timestamp
before update on public.user_profiles
for each row execute procedure public.set_updated_at();
```

---

## 7. AI / Automation Support Tables

### `analytics`
Central event log consumat de dashboard, AI insights și Decision Engine.

| Column        | Type          | Notes                                                     |
|---------------|---------------|-----------------------------------------------------------|
| `id`          | `uuid` PK     | `gen_random_uuid()`.                                      |
| `type`        | `text`        | `'produs_view'`, `'clip_view'`, `'page_view'`, etc.       |
| `item_id`     | `text`        | ID-ul entității urmărite.                                 |
| `item_type`   | `text`        | `'produs'`, `'clip'`, `'page'`, `'auction'`.              |
| `metadata`    | `jsonb`       | Date suplimentare (durată, sursă, device, etc.).          |
| `user_id`     | `uuid` FK     | Optional, referință către `auth.users`.                   |
| `session_id`  | `text`        | ID generat client-side pentru evenimente anonime.         |
| `created_at`  | `timestamptz` | Default `now()`.                                          |

Indexes: `(type)`, `(item_id)`, `(created_at desc)` pentru agregări rapide.

### `produse`
Set minimal folosit de modulele AI legacy (poate fi populat din `products`).

| Column       | Type          | Notes                                                     |
|--------------|---------------|-----------------------------------------------------------|
| `id`         | `uuid` PK     | `gen_random_uuid()`.                                      |
| `titlu`      | `text`        | Titlul produsului (obligatoriu).                          |
| `descriere`  | `text`        | Descriere lungă.                                          |
| `pret`       | `numeric`     | Preț estimativ (RON).                                     |
| `status`     | `text`        | `'draft'`, `'active'`, `'archived'`.                      |
| `imagini`    | `jsonb`       | Array cu URL-uri.                                         |
| `metadata`   | `jsonb`       | Câmp liber pentru AI (atribute, scoruri, etc.).           |
| `created_at` | `timestamptz` | Default `now()`.                                          |
| `updated_at` | `timestamptz` | Trigger `set_updated_at`.                                 |

### `clipuri_video`
Clipuri generate de AI (HeyGen/Synthesia) și statisticile sincronizate.

| Column            | Type          | Notes                                                  |
|-------------------|---------------|--------------------------------------------------------|
| `id`              | `uuid` PK     | `gen_random_uuid()`.                                   |
| `produs_id`       | `uuid` FK     | Legătură cu `produse.id` (null dacă independent).      |
| `url`             | `text`        | URL public al clipului.                                |
| `titlu`           | `text`        | Titlu custom.                                          |
| `descriere`       | `text`        | Descriere video.                                       |
| `platforme`       | `jsonb`       | `[\"tiktok\", \"youtube\", ...]`.                      |
| `tiktok_id`       | `text`        | ID remote pentru statistici.                          |
| `instagram_id`    | `text`        | ID Reel.                                               |
| `youtube_id`      | `text`        | ID Shorts.                                             |
| `durata`          | `numeric`     | Durata în secunde.                                     |
| `views`           | `bigint`      | Vederi agregate.                                       |
| `likes`           | `bigint`      | Număr total de like-uri.                               |
| `comments`        | `bigint`      | Comentarii totale.                                     |
| `shares`          | `bigint`      | Distribuiri totale.                                    |
| `engagement_rate` | `numeric`     | % engagement maxim pe platforme.                       |
| `stats_updated_at`| `timestamptz` | Ultima sincronizare cu platformele sociale.           |
| `metadata`        | `jsonb`       | Extra payload.                                         |
| `created_at`      | `timestamptz` | Default `now()`.                                       |
| `updated_at`      | `timestamptz` | Trigger `set_updated_at`.                              |

### `seo`
Persistă rescrierile SEO și scorurile generate de AI.

| Column         | Type          | Notes                                   |
|----------------|---------------|-----------------------------------------|
| `id`           | `uuid` PK     | `gen_random_uuid()`.                    |
| `produs_id`    | `uuid` FK     | Referință `produse.id`.                 |
| `titlu_seo`    | `text`        | Titlu optimizat.                        |
| `descriere_seo`| `text`        | Meta descriere.                         |
| `cuvinte_cheie`| `text`        | CSV/space separated keywords.           |
| `scor`         | `numeric`     | Scor AI (0-100).                        |
| `metadata`     | `jsonb`       | Versiuni, recomandări, etc.            |
| `created_at`   | `timestamptz` | Default `now()`.                        |
| `updated_at`   | `timestamptz` | Trigger `set_updated_at`.               |

### `autopilot_policies`
Parametri dinamici pentru Decision Engine / Safety Rails.

| Column      | Type      | Notes                                   |
|-------------|-----------|-----------------------------------------|
| `id`        | `uuid` PK | `gen_random_uuid()`.                    |
| `key`       | `text`    | Cheie unică (ex: `daily_task_limit`).   |
| `value`     | `jsonb`   | Conținut flexibil (`{"value":5}`).      |
| `updated_at`| `timestamptz` | Default `now()`.                    |

### `autopilot_tasks`
Coada de task-uri generate/executate de Autopilot AI + review panel.

| Column            | Type          | Notes                                                   |
|-------------------|---------------|---------------------------------------------------------|
| `id`              | `uuid` PK     | `gen_random_uuid()`.                                    |
| `type`            | `text`        | `'seo'`, `'article'`, `'video'`, `'social'`, `'email'`. |
| `payload`         | `jsonb`       | Parametri necesari execuției.                           |
| `status`          | `text`        | `'queued'`, `'running'`, `'blocked'`, `'approved'`, `'done'`, `'failed'`, `'rejected'`. |
| `cost_usd`        | `numeric`     | Cost estimat/real.                                      |
| `risk_score`      | `numeric`     | 0-100 calculat de Risk Scoring.                         |
| `risk_explanation`| `text`        | Explicație AI pentru review.                            |
| `review_comment`  | `text`        | Motiv manual (Safety Rails / admin).                    |
| `created_at`      | `timestamptz` | Default `now()`.                                        |
| `updated_at`      | `timestamptz` | Trigger `set_updated_at`.                               |

Indexes: `(status)`, `(type)`, `(created_at desc)`, `(risk_score desc)`.

### `experiments`
Folosit pentru testele A/B orchestrate de Autopilot.

| Column       | Type          | Notes                                         |
|--------------|---------------|-----------------------------------------------|
| `id`         | `uuid` PK     | `gen_random_uuid()`.                          |
| `scope`      | `text`        | Domeniu (`'seo'`, `'landing'`, `'pricing'`).  |
| `item_id`    | `uuid`        | Entitatea urmărită (produs, pagină).          |
| `variant`    | `text`        | `'A'`, `'B'`, `'control'`, etc.               |
| `metrics`    | `jsonb`       | CTR, views, conversions.                      |
| `started_at` | `timestamptz` | Default `now()`.                              |
| `finished_at`| `timestamptz` | Null până la încheiere.                       |

### `spend_ledger`
Jurnalizează cheltuielile AI (OpenAI, HeyGen, Resend).

| Column      | Type          | Notes                                        |
|-------------|---------------|----------------------------------------------|
| `id`        | `uuid` PK     | `gen_random_uuid()`.                         |
| `day`       | `date`        | Ziua costului.                               |
| `service`   | `text`        | `'openai'`, `'heygen'`, `'resend'`, etc.     |
| `amount_usd`| `numeric`     | Cost în USD.                                 |
| `note`      | `text`        | Context (task ID, payload).                  |
| `created_at`| `timestamptz` | Default `now()`.                             |

### `ai_logs`
Log centralizat pentru toate modulele AI / cron.

| Column     | Type          | Notes                                                  |
|------------|---------------|--------------------------------------------------------|
| `id`       | `text` PK     | Format `log-<timestamp>-<rand>`.                       |
| `timestamp`| `timestamptz` | Default `now()`.                                       |
| `module`   | `text`        | `'autopilot'`, `'voice-search'`, `'video-ideas'`, etc. |
| `level`    | `text`        | `'info'`, `'warning'`, `'error'`, `'success'`.         |
| `message`  | `text`        | Descriere scurtă.                                      |
| `details`  | `jsonb`       | Payload complet (request/response).                    |
| `duration` | `numeric`     | Milisecunde (opțional).                                |

### `ai_video_ideas`
Persistența ideilor video generate (vezi migrarea dedicată `20251113_ai_video_ideas.sql`).

| Column         | Type          | Notes                                     |
|----------------|---------------|-------------------------------------------|
| `id`           | `uuid` PK     | `gen_random_uuid()`.                      |
| `user_id`      | `uuid` FK     | Autor (admin).                            |
| `idea_text`    | `text`        | Rezumat idee.                             |
| `platform`     | `text`        | `'tiktok'`, `'instagram'`, `'youtube'`.   |
| `script_data`  | `jsonb`       | Script complet.                           |
| `video_metadata`| `jsonb`      | Parametri pentru filmare/avatar.          |
| `status`       | `text`        | `'draft'`, `'generated'`, `'published'`.  |
| `created_at`   | `timestamptz` | Default `now()`.                          |
| `updated_at`   | `timestamptz` | Trigger `set_updated_at`.                 |

---

## 8. Row Level Security (RLS)

- Enable RLS on every user-facing table.
- Policies:
  - **User-owned data** (`user_profiles`, `user_tokens`, etc.): allow users to
    `select`, `insert`, `update`, `delete` where `auth.uid() = user_id`.
  - **Admin actions**: create role-based policies (e.g., `is_admin` flag in
    `auth.users` metadata).
  - **Public data** (if any) should explicitly allow anonymous read access.

---

## 9. Migration Ordering

1. Deploy schema + RLS + triggers.
2. Seed data from existing JSON/localStorage snapshots (if available).
3. Update backend API routes to call Supabase.
4. Refactor frontend state management to consume Supabase data (SWR/React Query).
5. Remove all `localStorage`/IndexedDB usage once Supabase path is battle-tested.

---

This data model covers every localStorage entry currently in use (header state,
chat widgets, AI configuration, analytics traces, module toggles).  New modules
should reuse `user_settings` or extend the schema following the same patterns.



