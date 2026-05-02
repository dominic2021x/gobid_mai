-- ===============================================================
-- Supabase Migration: Admin Page Permissions & Audit
-- ===============================================================

create table if not exists public.admin_page_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  page_slug text not null,
  can_access boolean not null default true,
  granted_at timestamptz not null default timezone('utc', now()),
  granted_by uuid references auth.users(id) on delete set null
);

create unique index if not exists idx_admin_page_permissions_user_page
  on public.admin_page_permissions (user_id, page_slug);

alter table public.admin_page_permissions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'admin_page_permissions' and policyname = 'Admins manage page permissions'
  ) then
    create policy "Admins manage page permissions" on public.admin_page_permissions
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











