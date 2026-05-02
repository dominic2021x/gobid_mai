-- ===============================================================
-- Optional backfill for user-centric tables.
-- Execute AFTER running migrations to ensure default rows exist.
-- ===============================================================

-- Backfill user_profiles (blank values)
insert into public.user_profiles (user_id, created_at, updated_at)
select u.id, timezone('utc', now()), timezone('utc', now())
from auth.users u
where not exists (
  select 1 from public.user_profiles p where p.user_id = u.id
);

-- Backfill user_tokens with zero balances
insert into public.user_tokens (user_id, balance, total_earned, total_spent, level, updated_at)
select u.id, 0, 0, 0, 'Basic', timezone('utc', now())
from auth.users u
where not exists (
  select 1 from public.user_tokens t where t.user_id = u.id
);

-- Example: migrate favorite auctions from legacy JSON (replace with real data)
-- insert into public.user_favorites (user_id, product_id)
-- values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000');

-- Example: default integration settings placeholder
insert into public.integration_settings (key, settings, encrypted, updated_at)
values ('google_maps', jsonb_build_object('enabled', false), false, timezone('utc', now()))
on conflict (key) do nothing;












