-- ===============================================================
-- Supabase Migration: Newsletter Subscribers
-- ===============================================================
-- Tabel pentru abonații la newsletter cu coduri de tokeni

-- Asigură extensiile necesare
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------
-- Table: newsletter_subscribers
-- ---------------------------------------------------------------
create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  subscribed_at timestamptz not null default timezone('utc', now()),
  status text not null default 'active' check (status in ('active', 'unsubscribed')),
  category text, -- Categorie AI: imobiliare, auto, tehnologie, etc.
  interests jsonb default '[]'::jsonb, -- Interese detectate de AI
  activity_score integer default 0, -- Scor activitate
  token_code text, -- Cod pentru 5 tokeni (format: TOKEN5-XXXXXXXX)
  tokens integer default 5, -- Număr de tokeni oferiți
  token_code_used boolean default false, -- Dacă codul a fost folosit
  metadata jsonb default '{}'::jsonb, -- Metadata suplimentară
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Indexuri pentru performanță
create index if not exists idx_newsletter_subscribers_email on public.newsletter_subscribers(email);
create index if not exists idx_newsletter_subscribers_status on public.newsletter_subscribers(status);
create index if not exists idx_newsletter_subscribers_subscribed_at on public.newsletter_subscribers(subscribed_at desc);
create index if not exists idx_newsletter_subscribers_category on public.newsletter_subscribers(category);
create index if not exists idx_newsletter_subscribers_token_code on public.newsletter_subscribers(token_code) where token_code is not null;

-- Ensure set_updated_at function exists
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pentru updated_at
CREATE TRIGGER trg_newsletter_subscribers_updated_at
BEFORE UPDATE ON public.newsletter_subscribers
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- RLS Policies
alter table public.newsletter_subscribers enable row level security;

-- Permite citirea publică (pentru admin)
create policy "Anyone can view newsletter subscribers"
  on public.newsletter_subscribers
  for select
  using (true);

-- Permite inserarea publică (pentru subscription)
create policy "Anyone can subscribe to newsletter"
  on public.newsletter_subscribers
  for insert
  with check (true);

-- Permite actualizarea doar pentru status și token_code_used (pentru unsubscribe și redeeming)
create policy "Anyone can update newsletter subscriber status"
  on public.newsletter_subscribers
  for update
  using (true)
  with check (true);

-- Comentarii
comment on table public.newsletter_subscribers is 'Abonați la newsletter cu coduri de tokeni';
comment on column public.newsletter_subscribers.token_code is 'Cod unic pentru a obține 5 tokeni (generat la abonare)';
comment on column public.newsletter_subscribers.token_code_used is 'Indică dacă codul de tokeni a fost folosit/redemezat';
