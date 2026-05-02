-- Token refund requests: users can request token reimbursement per unlocked product.

create table if not exists public.token_refund_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  user_name text not null,
  product_id uuid references public.products(id) on delete set null,
  product_code text,
  product_title text not null,
  product_slug text,
  product_image_url text,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'refunded')),
  admin_note text,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_token_refund_requests_user_created
  on public.token_refund_requests (user_id, created_at desc);

create index if not exists idx_token_refund_requests_status_created
  on public.token_refund_requests (status, created_at desc);

create unique index if not exists uniq_token_refund_requests_pending_user_product
  on public.token_refund_requests (user_id, product_id)
  where status = 'pending';

create trigger trg_token_refund_requests_updated_at
before update on public.token_refund_requests
for each row execute procedure public.set_updated_at();

alter table public.token_refund_requests enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'token_refund_requests'
      and policyname = 'Users view own token refund requests'
  ) then
    create policy "Users view own token refund requests"
      on public.token_refund_requests
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'token_refund_requests'
      and policyname = 'Users create own token refund requests'
  ) then
    create policy "Users create own token refund requests"
      on public.token_refund_requests
      for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

