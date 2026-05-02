-- Script pentru crearea tabelului executor_imports
-- Rulează acest script în Supabase SQL Editor
-- sau folosește: psql -h <host> -U <user> -d <database> -f scripts/create-executor-imports-table.sql

-- Create executor_imports table for storing import records
create table if not exists public.executor_imports (
  id uuid default gen_random_uuid() primary key,
  source_type text not null check (source_type in ('pdf', 'csv', 'url', 'other')),
  source_url text,
  file_name text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  products_data jsonb,
  products_created integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  processed_at timestamp with time zone
);

-- Create index on status for filtering
create index if not exists executor_imports_status_idx on public.executor_imports(status);

-- Create index on created_at for sorting
create index if not exists executor_imports_created_at_idx on public.executor_imports(created_at desc);

-- Enable RLS
alter table public.executor_imports enable row level security;

-- Drop existing policies if they exist (for re-running)
drop policy if exists "Allow authenticated users to view executor imports" on public.executor_imports;
drop policy if exists "Allow authenticated users to insert executor imports" on public.executor_imports;
drop policy if exists "Allow authenticated users to update executor imports" on public.executor_imports;
drop policy if exists "Allow authenticated users to delete executor imports" on public.executor_imports;

-- Policy: Users can only see their own imports (if we add user_id later)
-- For now, allow all authenticated users to see all imports
create policy "Allow authenticated users to view executor imports"
  on public.executor_imports
  for select
  to authenticated
  using (true);

create policy "Allow authenticated users to insert executor imports"
  on public.executor_imports
  for insert
  to authenticated
  with check (true);

create policy "Allow authenticated users to update executor imports"
  on public.executor_imports
  for update
  to authenticated
  using (true);

create policy "Allow authenticated users to delete executor imports"
  on public.executor_imports
  for delete
  to authenticated
  using (true);

