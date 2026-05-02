create table if not exists public.listing_premium_events (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null,
  user_id uuid not null,
  source text not null,
  source_transaction_id text null,
  premium_days integer not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_listing_premium_events_listing_id
  on public.listing_premium_events (listing_id);

create index if not exists idx_listing_premium_events_user_id
  on public.listing_premium_events (user_id);

create index if not exists idx_listing_premium_events_source_tx
  on public.listing_premium_events (source_transaction_id);

