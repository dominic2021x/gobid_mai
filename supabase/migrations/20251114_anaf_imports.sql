-- ===============================================================
-- Supabase Migration: ANAF Imports System
-- ===============================================================
-- Sistem complet pentru import automat de licitații ANAF
-- și gestionarea tuturor importurilor din multiple surse

-- ============================================
-- Tabel: anaf_imports
-- ============================================
-- Tabel pentru gestionarea tuturor importurilor (ANAF și alte surse)
create table if not exists public.anaf_imports (
  id uuid primary key default gen_random_uuid(),
  source_type text not null default 'anaf', -- 'anaf', 'insolventa', 'executori', etc.
  source_url text not null, -- URL-ul PDF-ului sau sursa
  pdf_url text, -- URL-ul PDF-ului original
  pdf_storage_path text, -- Path-ul în Supabase Storage pentru PDF
  status text not null default 'pending', -- 'pending', 'processing', 'completed', 'failed'
  error_message text,
  extracted_data jsonb, -- Datele extrase din PDF (raw JSON)
  metadata jsonb not null default '{}'::jsonb, -- Metadata suplimentară
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz
);

create index if not exists idx_anaf_imports_source_type on public.anaf_imports(source_type);
create index if not exists idx_anaf_imports_status on public.anaf_imports(status);
create index if not exists idx_anaf_imports_created_at on public.anaf_imports(created_at desc);
create unique index if not exists idx_anaf_imports_source_url on public.anaf_imports(source_url);

-- ============================================
-- Tabel: anaf_licitatii
-- ============================================
-- Tabel pentru licitațiile ANAF procesate
create table if not exists public.anaf_licitatii (
  id uuid primary key default gen_random_uuid(),
  import_id uuid references public.anaf_imports(id) on delete set null,
  product_id uuid, -- ID-ul produsului creat automat (referință la produse)
  
  -- Informații despre licitație
  numar_licitatie text, -- I, II, III, IV
  data_licitatie date,
  ora_licitatie time,
  loc_licitatie text,
  
  -- Informații despre bun
  tip_bun text, -- 'teren', 'constructie', 'auto', 'bun_mobil', etc.
  categoria_teren text, -- 'intravilan', 'extravilan', 'arabil', 'faneata', 'livada', etc.
  suprafata_totala numeric, -- în mp sau ha
  unitate_suprafata text default 'mp', -- 'mp' sau 'ha'
  
  -- Informații despre locație
  judet text not null,
  localitate text not null,
  adresa text,
  coordinates jsonb, -- {lat: number, lng: number}
  
  -- Informații despre contribuabil
  nume_contribuabil text,
  
  -- Informații financiare
  pret_evaluare numeric,
  tva_inclus boolean default false,
  valoare_tva numeric,
  moneda text default 'RON',
  
  -- Condiții și detalii
  conditii_suplimentare jsonb not null default '{}'::jsonb, -- garantie, cont bancar, termene, acte necesare
  detalii_relevante text,
  
  -- PDF și documente
  pdf_url text,
  pdf_storage_path text,
  
  -- Status
  status text not null default 'active', -- 'active', 'ended', 'cancelled'
  product_created boolean default false, -- Dacă produsul a fost creat automat
  
  -- Metadata
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_anaf_licitatii_import on public.anaf_licitatii(import_id);
create index if not exists idx_anaf_licitatii_product on public.anaf_licitatii(product_id);
create index if not exists idx_anaf_licitatii_judet on public.anaf_licitatii(judet);
create index if not exists idx_anaf_licitatii_tip_bun on public.anaf_licitatii(tip_bun);
create index if not exists idx_anaf_licitatii_data_licitatie on public.anaf_licitatii(data_licitatie desc);
create index if not exists idx_anaf_licitatii_status on public.anaf_licitatii(status);

-- ============================================
-- Trigger pentru updated_at
-- ============================================
-- Verifică dacă funcția set_updated_at există
do $$
begin
  if not exists (
    select 1 from pg_proc where proname = 'set_updated_at'
  ) then
    create or replace function public.set_updated_at()
    returns trigger as $function$
    begin
      new.updated_at = timezone('utc', now());
      return new;
    end;
    $function$ language plpgsql;
  end if;
end $$;

create trigger trg_anaf_imports_updated_at
before update on public.anaf_imports
for each row execute procedure public.set_updated_at();

create trigger trg_anaf_licitatii_updated_at
before update on public.anaf_licitatii
for each row execute procedure public.set_updated_at();

-- ============================================
-- Row Level Security (RLS)
-- ============================================
alter table public.anaf_imports enable row level security;
alter table public.anaf_licitatii enable row level security;

-- Policy pentru anaf_imports: doar adminii pot vedea și gestiona
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
      and tablename = 'anaf_imports' 
      and policyname = 'Admins manage ANAF imports'
  ) then
    create policy "Admins manage ANAF imports" on public.anaf_imports
      using (
        auth.role() = 'service_role'
        or exists (
          select 1
          from public.user_profiles up
          where up.user_id = auth.uid()
            and up.is_admin = true
        )
      )
      with check (
        auth.role() = 'service_role'
        or exists (
          select 1
          from public.user_profiles up
          where up.user_id = auth.uid()
            and up.is_admin = true
        )
      );
  end if;
end $$;

-- Policy pentru anaf_licitatii: toți pot vedea, doar adminii pot modifica
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
      and tablename = 'anaf_licitatii' 
      and policyname = 'Anyone can view ANAF licitatii'
  ) then
    create policy "Anyone can view ANAF licitatii" on public.anaf_licitatii
      for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
      and tablename = 'anaf_licitatii' 
      and policyname = 'Admins manage ANAF licitatii'
  ) then
    create policy "Admins manage ANAF licitatii" on public.anaf_licitatii
      using (
        auth.role() = 'service_role'
        or exists (
          select 1
          from public.user_profiles up
          where up.user_id = auth.uid()
            and up.is_admin = true
        )
      )
      with check (
        auth.role() = 'service_role'
        or exists (
          select 1
          from public.user_profiles up
          where up.user_id = auth.uid()
            and up.is_admin = true
        )
      );
  end if;
end $$;

