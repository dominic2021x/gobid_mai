-- ===============================================================
-- Supabase Migration: User-Centric Data Model
-- Run this script in the Supabase SQL editor or via CLI.
-- Creates tables used to replace all localStorage-based state.
-- ===============================================================

-- Ensure pgcrypto for UUID generation
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------
-- Helper trigger for updated_at
-- ---------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------
-- Table: user_profiles
-- ---------------------------------------------------------------
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  phone text,
  avatar_url text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_user_profiles_updated_at
before update on public.user_profiles
for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------
-- Table: user_tokens
-- ---------------------------------------------------------------
create table if not exists public.user_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0,
  total_earned integer not null default 0,
  total_spent integer not null default 0,
  level text not null default 'Basic',
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_user_tokens_updated_at
before update on public.user_tokens
for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------
-- Table: user_settings
-- ---------------------------------------------------------------
create table if not exists public.user_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, category)
);

create trigger trg_user_settings_updated_at
before update on public.user_settings
for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------
-- Table: user_notifications
-- ---------------------------------------------------------------
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  message text not null,
  type text not null default 'info',
  metadata jsonb default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_user_notifications_user_created
  on public.user_notifications (user_id, created_at desc);

create index if not exists idx_user_notifications_unread
  on public.user_notifications (user_id, read_at);

-- ---------------------------------------------------------------
-- Table: user_activity_logs
-- ---------------------------------------------------------------
create table if not exists public.user_activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  session_id text,
  event text not null,
  properties jsonb default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_user_activity_user_created
  on public.user_activity_logs (user_id, created_at desc);

create index if not exists idx_user_activity_session
  on public.user_activity_logs (session_id);

-- ---------------------------------------------------------------
-- Table: user_favorites
-- ---------------------------------------------------------------
create table if not exists public.user_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, product_id)
);

create index if not exists idx_user_favorites_product
  on public.user_favorites (product_id);

-- ---------------------------------------------------------------
-- Table: user_watchlist
-- ---------------------------------------------------------------
create table if not exists public.user_watchlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, product_id)
);

create index if not exists idx_user_watchlist_product
  on public.user_watchlist (product_id);

-- ---------------------------------------------------------------
-- Table: chat_conversations
-- ---------------------------------------------------------------
create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  subject text,
  channel text not null default 'website',
  status text not null default 'open',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_chat_conversations_updated_at
before update on public.chat_conversations
for each row execute procedure public.set_updated_at();

create index if not exists idx_chat_conversations_user
  on public.chat_conversations (user_id, updated_at desc);

-- ---------------------------------------------------------------
-- Table: chat_messages
-- ---------------------------------------------------------------
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_type text not null, -- 'user' | 'admin' | 'ai'
  sender_id uuid,
  content text not null,
  attachments jsonb default '[]'::jsonb,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_chat_messages_conversation
  on public.chat_messages (conversation_id, created_at asc);

create index if not exists idx_chat_messages_sender
  on public.chat_messages (sender_id);

-- ---------------------------------------------------------------
-- Table: support_tickets
-- ---------------------------------------------------------------
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  subject text not null,
  status text not null default 'open',
  priority text not null default 'normal',
  category text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_support_tickets_updated_at
before update on public.support_tickets
for each row execute procedure public.set_updated_at();

create index if not exists idx_support_tickets_user
  on public.support_tickets (user_id, updated_at desc);

create index if not exists idx_support_tickets_status
  on public.support_tickets (status);

-- ---------------------------------------------------------------
-- Table: support_ticket_messages
-- ---------------------------------------------------------------
create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_type text not null, -- 'user' | 'staff' | 'system'
  sender_id uuid,
  content text not null,
  attachments jsonb default '[]'::jsonb,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_support_ticket_messages_ticket
  on public.support_ticket_messages (ticket_id, created_at asc);

-- ---------------------------------------------------------------
-- Table: integration_settings
-- ---------------------------------------------------------------
create table if not exists public.integration_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  settings jsonb not null default '{}'::jsonb,
  encrypted boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_integration_settings_updated_at
before update on public.integration_settings
for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------
-- Row Level Security
-- NOTE: Policies assume JWT contains `role` claim or `is_admin` in `auth.users`.
-- Adjust predicates to match your auth strategy.
-- ---------------------------------------------------------------
alter table public.user_profiles enable row level security;
alter table public.user_tokens enable row level security;
alter table public.user_settings enable row level security;
alter table public.user_notifications enable row level security;
alter table public.user_activity_logs enable row level security;
alter table public.user_favorites enable row level security;
alter table public.user_watchlist enable row level security;
alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.integration_settings enable row level security;

-- Helper predicate for admin role
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'role') = 'admin', false);
$$;

-- Policies for user-owned data
do $$
declare
  policy_exists boolean;
begin
  -- user_profiles
  policy_exists := exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_profiles' and policyname = 'Users manage own profile'
  );
  if not policy_exists then
    create policy "Users manage own profile" on public.user_profiles
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  -- user_tokens
  policy_exists := exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_tokens' and policyname = 'Users manage own tokens'
  );
  if not policy_exists then
    create policy "Users manage own tokens" on public.user_tokens
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  -- user_settings
  policy_exists := exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_settings' and policyname = 'Users manage own settings'
  );
  if not policy_exists then
    create policy "Users manage own settings" on public.user_settings
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  -- user_notifications (read/update owned notifications)
  policy_exists := exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_notifications' and policyname = 'Users read own notifications'
  );
  if not policy_exists then
    create policy "Users read own notifications" on public.user_notifications
      for select using (auth.uid() = user_id);
  end if;

  policy_exists := exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_notifications' and policyname = 'Users update read status'
  );
  if not policy_exists then
    create policy "Users update read status" on public.user_notifications
      for update using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  -- user_activity_logs (read own activity, insert only via backend)
  policy_exists := exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_activity_logs' and policyname = 'Users read own activity'
  );
  if not policy_exists then
    create policy "Users read own activity" on public.user_activity_logs
      for select using (auth.uid() = user_id);
  end if;

  -- user_favorites/watchlist
  policy_exists := exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_favorites' and policyname = 'Users manage favorites'
  );
  if not policy_exists then
    create policy "Users manage favorites" on public.user_favorites
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  policy_exists := exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_watchlist' and policyname = 'Users manage watchlist'
  );
  if not policy_exists then
    create policy "Users manage watchlist" on public.user_watchlist
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  -- chat_conversations/messages
  policy_exists := exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_conversations' and policyname = 'Users manage own conversations'
  );
  if not policy_exists then
    create policy "Users manage own conversations" on public.chat_conversations
      using (coalesce(user_id, auth.uid()) = auth.uid())
      with check (coalesce(user_id, auth.uid()) = auth.uid());
  end if;

  policy_exists := exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_messages' and policyname = 'Users access own conversations'
  );
  if not policy_exists then
    create policy "Users access own conversations" on public.chat_messages
      using (
        exists (
          select 1 from public.chat_conversations c
          where c.id = chat_messages.conversation_id
            and coalesce(c.user_id, auth.uid()) = auth.uid()
        )
      )
      with check (
        exists (
          select 1 from public.chat_conversations c
          where c.id = chat_messages.conversation_id
            and coalesce(c.user_id, auth.uid()) = auth.uid()
        )
      );
  end if;

  -- support_tickets/messages
  policy_exists := exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'support_tickets' and policyname = 'Users manage own tickets'
  );
  if not policy_exists then
    create policy "Users manage own tickets" on public.support_tickets
      using (coalesce(user_id, auth.uid()) = auth.uid())
      with check (coalesce(user_id, auth.uid()) = auth.uid());
  end if;

  policy_exists := exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'support_ticket_messages' and policyname = 'Users access own tickets'
  );
  if not policy_exists then
    create policy "Users access own tickets" on public.support_ticket_messages
      using (
        exists (
          select 1 from public.support_tickets t
          where t.id = support_ticket_messages.ticket_id
            and coalesce(t.user_id, auth.uid()) = auth.uid()
        )
      )
      with check (
        exists (
          select 1 from public.support_tickets t
          where t.id = support_ticket_messages.ticket_id
            and coalesce(t.user_id, auth.uid()) = auth.uid()
        )
      );
  end if;

  -- integration_settings (read/update only for admins)
  policy_exists := exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'integration_settings' and policyname = 'Admins manage integrations'
  );
  if not policy_exists then
    create policy "Admins manage integrations" on public.integration_settings
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;

-- Optionally grant read access for public catalog data (comment out if unwanted)
-- create policy "Public read integration settings" on public.integration_settings
--   for select using (true);












