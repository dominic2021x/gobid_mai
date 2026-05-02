-- ===============================================================
-- Supabase Migration: Autopilot & Analytics Infrastructure
-- Creează tabelele suplimentare folosite de modulele AI, analytics
-- și de componentele auxiliare (SEO, clipuri video, produse legacy).
-- Rulează scriptul în Supabase SQL Editor sau prin CLI.
-- ===============================================================

-- Asigură extensiile necesare
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------
-- Table: analytics
-- ---------------------------------------------------------------
create table if not exists public.analytics (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  item_id text not null,
  item_type text,
  metadata jsonb not null default '{}'::jsonb,
  user_id uuid references auth.users(id) on delete set null,
  session_id text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_analytics_type on public.analytics(type);
create index if not exists idx_analytics_item on public.analytics(item_id);
create index if not exists idx_analytics_created_at on public.analytics(created_at desc);

alter table public.analytics
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.analytics
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.analytics
  add column if not exists session_id text;

alter table public.analytics
  add column if not exists created_at timestamptz not null default timezone('utc', now());

-- ---------------------------------------------------------------
-- Table: produse (legacy AI dataset)
-- ---------------------------------------------------------------
create table if not exists public.produse (
  id uuid primary key default gen_random_uuid(),
  titlu text not null,
  descriere text,
  pret numeric,
  status text not null default 'draft',
  imagini jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_produse_status on public.produse(status);

alter table public.produse
  add column if not exists status text not null default 'draft';

alter table public.produse
  add column if not exists imagini jsonb not null default '[]'::jsonb;

alter table public.produse
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.produse
  add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table public.produse
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

do $$
begin
  if not exists (
    select 1 from pg_trigger 
    where tgname = 'trg_produse_updated_at'
  ) then
    create trigger trg_produse_updated_at
    before update on public.produse
    for each row execute procedure public.set_updated_at();
  end if;
end $$;

-- ---------------------------------------------------------------
-- Table: clipuri_video
-- ---------------------------------------------------------------
create table if not exists public.clipuri_video (
  id uuid primary key default gen_random_uuid(),
  produs_id uuid references public.produse(id) on delete set null,
  url text not null,
  titlu text,
  descriere text,
  platforme jsonb not null default '[]'::jsonb,
  tiktok_id text,
  instagram_id text,
  youtube_id text,
  durata numeric,
  views bigint not null default 0,
  likes bigint not null default 0,
  comments bigint not null default 0,
  shares bigint not null default 0,
  engagement_rate numeric,
  stats_updated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_clipuri_video_produs on public.clipuri_video(produs_id);
create index if not exists idx_clipuri_video_views on public.clipuri_video(views desc);

alter table public.clipuri_video
  add column if not exists platforme jsonb not null default '[]'::jsonb;

alter table public.clipuri_video
  add column if not exists tiktok_id text;

alter table public.clipuri_video
  add column if not exists instagram_id text;

alter table public.clipuri_video
  add column if not exists youtube_id text;

alter table public.clipuri_video
  add column if not exists durata numeric;

alter table public.clipuri_video
  add column if not exists views bigint not null default 0;

alter table public.clipuri_video
  add column if not exists likes bigint not null default 0;

alter table public.clipuri_video
  add column if not exists comments bigint not null default 0;

alter table public.clipuri_video
  add column if not exists shares bigint not null default 0;

alter table public.clipuri_video
  add column if not exists engagement_rate numeric;

alter table public.clipuri_video
  add column if not exists stats_updated_at timestamptz;

alter table public.clipuri_video
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.clipuri_video
  add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table public.clipuri_video
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

do $$
begin
  if not exists (
    select 1 from pg_trigger 
    where tgname = 'trg_clipuri_video_updated_at'
  ) then
    create trigger trg_clipuri_video_updated_at
    before update on public.clipuri_video
    for each row execute procedure public.set_updated_at();
  end if;
end $$;

-- ---------------------------------------------------------------
-- Table: seo (SEO metadata per product)
-- ---------------------------------------------------------------
create table if not exists public.seo (
  id uuid primary key default gen_random_uuid(),
  produs_id uuid references public.produse(id) on delete cascade,
  titlu_seo text,
  descriere_seo text,
  cuvinte_cheie text,
  scor numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_seo_produs on public.seo(produs_id);

alter table public.seo
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.seo
  add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table public.seo
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

do $$
begin
  if not exists (
    select 1 from pg_trigger 
    where tgname = 'trg_seo_updated_at'
  ) then
    create trigger trg_seo_updated_at
    before update on public.seo
    for each row execute procedure public.set_updated_at();
  end if;
end $$;

-- ---------------------------------------------------------------
-- Table: autopilot_policies
-- ---------------------------------------------------------------
create table if not exists public.autopilot_policies (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_autopilot_policies_key on public.autopilot_policies(key);

-- ---------------------------------------------------------------
-- Table: autopilot_tasks
-- ---------------------------------------------------------------
create table if not exists public.autopilot_tasks (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  payload jsonb not null,
  status text not null default 'queued',
  cost_usd numeric not null default 0,
  risk_score numeric not null default 0,
  risk_explanation text,
  review_comment text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'autopilot_tasks_status_check'
      and conrelid = 'public.autopilot_tasks'::regclass
  ) then
    alter table public.autopilot_tasks
      add constraint autopilot_tasks_status_check
      check (
        status in (
          'queued',
          'running',
          'blocked',
          'approved',
          'done',
          'failed',
          'rejected'
        )
      );
  end if;
end $$;

create index if not exists idx_autopilot_tasks_status on public.autopilot_tasks(status);
create index if not exists idx_autopilot_tasks_created_at on public.autopilot_tasks(created_at desc);
create index if not exists idx_autopilot_tasks_type on public.autopilot_tasks(type);
create index if not exists idx_autopilot_tasks_risk_score on public.autopilot_tasks(risk_score desc);

alter table public.autopilot_tasks
  add column if not exists payload jsonb not null default '{}'::jsonb;

alter table public.autopilot_tasks
  add column if not exists cost_usd numeric not null default 0;

alter table public.autopilot_tasks
  add column if not exists risk_score numeric not null default 0;

alter table public.autopilot_tasks
  add column if not exists risk_explanation text;

alter table public.autopilot_tasks
  add column if not exists review_comment text;

alter table public.autopilot_tasks
  add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table public.autopilot_tasks
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

do $$
begin
  if not exists (
    select 1 from pg_trigger 
    where tgname = 'trg_autopilot_tasks_updated_at'
  ) then
    create trigger trg_autopilot_tasks_updated_at
    before update on public.autopilot_tasks
    for each row execute procedure public.set_updated_at();
  end if;
end $$;

-- ---------------------------------------------------------------
-- Table: experiments (A/B testing metadata)
-- ---------------------------------------------------------------
create table if not exists public.experiments (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  item_id uuid not null,
  variant text not null,
  metrics jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz
);

create index if not exists idx_experiments_item_id on public.experiments(item_id);
create index if not exists idx_experiments_scope on public.experiments(scope);
create index if not exists idx_experiments_finished_at on public.experiments(finished_at);

-- ---------------------------------------------------------------
-- Table: spend_ledger (cost tracking)
-- ---------------------------------------------------------------
create table if not exists public.spend_ledger (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  service text not null,
  amount_usd numeric not null,
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_spend_ledger_day on public.spend_ledger(day desc);
create index if not exists idx_spend_ledger_service on public.spend_ledger(service);

-- ---------------------------------------------------------------
-- Table: ai_logs (centralized AI logging)
-- ---------------------------------------------------------------
create table if not exists public.ai_logs (
  id text primary key,
  timestamp timestamptz not null default timezone('utc', now()),
  module text not null,
  level text not null check (level in ('info', 'warning', 'error', 'success')),
  message text not null,
  details jsonb,
  duration numeric
);

create index if not exists idx_ai_logs_module on public.ai_logs(module);
create index if not exists idx_ai_logs_timestamp on public.ai_logs(timestamp desc);
create index if not exists idx_ai_logs_level on public.ai_logs(level);
create index if not exists idx_ai_logs_module_timestamp on public.ai_logs(module, timestamp desc);

-- ---------------------------------------------------------------
-- Seed default policies (idempotent)
-- ---------------------------------------------------------------
insert into public.autopilot_policies (key, value)
values
  ('daily_video_quota', '{"max": 1}'::jsonb),
  ('max_email_per_day', '{"max": 1}'::jsonb),
  ('min_ctr_to_scale', '{"value": 0.02}'::jsonb),
  ('video_targets', '{"categories": ["imobiliare", "auto"], "priority": "imobiliare"}'::jsonb),
  ('daily_task_limit', '{"value": 5}'::jsonb),
  ('min_impact_score', '{"value": 2}'::jsonb)
on conflict (key) do update
set value = excluded.value,
    updated_at = timezone('utc', now());

-- ===============================================================
-- End of migration
-- ===============================================================

