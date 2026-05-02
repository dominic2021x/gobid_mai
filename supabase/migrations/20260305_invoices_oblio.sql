-- Invoices table: stores Oblio invoice metadata and PDF reference after Netopia payment
-- Idempotency: unique(order_id) prevents duplicate invoice generation

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null,
  oblio_invoice_id text not null,
  invoice_number text,
  series text,
  pdf_url text,
  amount numeric not null default 0,
  currency text not null default 'RON',
  status text not null default 'issued',
  created_at timestamptz not null default now(),
  constraint invoices_order_id_unique unique (order_id)
);

create index if not exists invoices_user_id_idx on public.invoices(user_id);
create index if not exists invoices_order_id_idx on public.invoices(order_id);

comment on table public.invoices is 'Oblio invoices generated after successful Netopia payment; PDF stored in Supabase Storage bucket invoices';

-- Create storage bucket "invoices" in Dashboard: Storage → New bucket → name: invoices, public: false.
-- Or via API: supabase.storage.createBucket('invoices', { public: false }).

-- RLS: users can read only their own invoices
alter table public.invoices enable row level security;

create policy "Users can read own invoices"
  on public.invoices for select
  using (auth.uid() = user_id);

-- Service role (API) can insert/update for webhook
create policy "Service role can insert invoices"
  on public.invoices for insert
  with check (true);

create policy "Service role can update invoices"
  on public.invoices for update
  using (true);
