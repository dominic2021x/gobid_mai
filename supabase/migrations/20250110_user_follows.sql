-- ===============================================================
-- Supabase Migration: User Follows System
-- Creates table for user follow/unfollow functionality
-- ===============================================================

-- Ensure pgcrypto for UUID generation
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------
-- Table: user_follows
-- ---------------------------------------------------------------
create table if not exists public.user_follows (
  id uuid primary key default gen_random_uuid(),
  follower_user_id uuid not null references auth.users(id) on delete cascade,
  followed_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  -- Ensure a user cannot follow themselves
  constraint no_self_follow check (follower_user_id != followed_user_id),
  -- Ensure unique follow relationship
  unique(follower_user_id, followed_user_id)
);

-- Create indexes for efficient queries
create index if not exists idx_user_follows_follower
  on public.user_follows (follower_user_id);

create index if not exists idx_user_follows_followed
  on public.user_follows (followed_user_id);

create index if not exists idx_user_follows_created
  on public.user_follows (created_at desc);

-- Enable Row Level Security
alter table public.user_follows enable row level security;

-- RLS Policies
-- Users can view all follow relationships (for counting followers/following)
create policy "Anyone can view follow relationships"
  on public.user_follows
  for select
  using (true);

-- Users can create their own follow relationships
create policy "Users can create their own follow relationships"
  on public.user_follows
  for insert
  with check (auth.uid() = follower_user_id);

-- Users can delete their own follow relationships (unfollow)
create policy "Users can delete their own follow relationships"
  on public.user_follows
  for delete
  using (auth.uid() = follower_user_id);

-- Grant permissions
grant select, insert, delete on public.user_follows to authenticated;
grant select on public.user_follows to anon;

-- Enable Realtime for user_follows table
alter publication supabase_realtime add table public.user_follows;

