-- ---------------------------------------------------------------
-- Table: ai_video_ideas
-- Stochează istoricul clipurilor generate din idei video în admin
-- ---------------------------------------------------------------

create table if not exists public.ai_video_ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea text not null,
  platform text not null default 'tiktok',
  avatar_name text,
  product_id text,
  script jsonb not null default '{}'::jsonb,
  video jsonb not null default '{}'::jsonb,
  status text not null default 'success',
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_ai_video_ideas_user_created
  on public.ai_video_ideas (user_id, created_at desc);

create trigger trg_ai_video_ideas_updated_at
before update on public.ai_video_ideas
for each row execute procedure public.set_updated_at();

alter table public.ai_video_ideas enable row level security;

do $$
declare
  policy_exists boolean;
begin
  policy_exists := exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ai_video_ideas'
      and policyname = 'Users manage own video ideas'
  );

  if not policy_exists then
    create policy "Users manage own video ideas" on public.ai_video_ideas
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;











