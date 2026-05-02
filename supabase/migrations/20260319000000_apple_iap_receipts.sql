create table if not exists public.apple_iap_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  listing_id uuid null,
  transaction_id text not null unique,
  original_transaction_id text null,
  product_id text not null,
  raw_response jsonb not null,
  source text not null default 'apple_ios',
  created_at timestamptz not null default now()
);

create index if not exists idx_apple_iap_receipts_user_id
  on public.apple_iap_receipts (user_id);

create index if not exists idx_apple_iap_receipts_listing_id
  on public.apple_iap_receipts (listing_id);

create index if not exists idx_apple_iap_receipts_product_id
  on public.apple_iap_receipts (product_id);

