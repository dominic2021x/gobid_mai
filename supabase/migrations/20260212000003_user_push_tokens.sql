create table if not exists public.user_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  push_token text not null unique,
  platform text not null default 'native',
  device_id text,
  app_version text,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_user_push_tokens_user on public.user_push_tokens(user_id);
create index if not exists idx_user_push_tokens_active on public.user_push_tokens(user_id, is_active);

