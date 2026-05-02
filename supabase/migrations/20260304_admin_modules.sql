-- admin_modules: configurații module (Netopia, Oblio, SmartBill, etc.)
-- Folosit de Admin → Module și de API-uri care citesc config din DB.

create table if not exists public.admin_modules (
  id uuid primary key default gen_random_uuid(),
  module_id text not null unique,
  module_name text not null,
  module_type text not null default 'api',
  enabled boolean not null default false,
  config jsonb not null default '{}',
  description text,
  version text default '1.0.0',
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create index if not exists idx_admin_modules_module_id on public.admin_modules (module_id);
create index if not exists idx_admin_modules_enabled on public.admin_modules (enabled);

-- RLS: doar service_role (supabaseAdmin) poate accesa, bypass RLS
alter table public.admin_modules enable row level security;
