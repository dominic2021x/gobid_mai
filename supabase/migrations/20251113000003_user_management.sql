-- ---------------------------------------------------------------
-- User Management Enhancements for Admin Dashboard
-- ---------------------------------------------------------------

-- Extend user_profiles with additional personal & company fields
alter table public.user_profiles
  add column if not exists date_of_birth date,
  add column if not exists address text,
  add column if not exists company_name text,
  add column if not exists company_cui text,
  add column if not exists company_address text,
  add column if not exists company_verified boolean not null default false,
  add column if not exists account_type text not null default 'private';

-- Table: user_payments (credit history / invoices)
create table if not exists public.user_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_number text,
  amount numeric not null default 0,
  currency text not null default 'RON',
  payment_type text not null default 'admin_credit',
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_user_payments_user_created
  on public.user_payments (user_id, created_at desc);

create trigger trg_user_payments_updated_at
before update on public.user_payments
for each row execute procedure public.set_updated_at();

alter table public.user_payments enable row level security;

do $$
declare
  policy_exists boolean;
begin
  policy_exists := exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_payments'
      and policyname = 'Users view own payments'
  );
  if not policy_exists then
    create policy "Users view own payments" on public.user_payments
      for select using (auth.uid() = user_id);
  end if;

  policy_exists := exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_payments'
      and policyname = 'Users manage own payments'
  );
  if not policy_exists then
    create policy "Users manage own payments" on public.user_payments
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- Table: user_unlocked_products (products unlocked with tokens)
create table if not exists public.user_unlocked_products (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, product_id)
);

create index if not exists idx_user_unlocked_products_product
  on public.user_unlocked_products (product_id);

alter table public.user_unlocked_products enable row level security;

do $$
declare
  policy_exists boolean;
begin
  policy_exists := exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_unlocked_products'
      and policyname = 'Users manage own unlocked products'
  );
  if not policy_exists then
    create policy "Users manage own unlocked products" on public.user_unlocked_products
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- Table: user_auction_history (auction outcomes & bids)
create table if not exists public.user_auction_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  status text not null default 'participated',
  bid_amount numeric,
  currency text default 'RON',
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_user_auction_history_user
  on public.user_auction_history (user_id, occurred_at desc);

create trigger trg_user_auction_history_updated_at
before update on public.user_auction_history
for each row execute procedure public.set_updated_at();

alter table public.user_auction_history enable row level security;

do $$
declare
  policy_exists boolean;
begin
  policy_exists := exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_auction_history'
      and policyname = 'Users manage own auction history'
  );
  if not policy_exists then
    create policy "Users manage own auction history" on public.user_auction_history
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;











