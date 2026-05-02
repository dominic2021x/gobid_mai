-- Reduce Supabase Realtime load.
-- user_activity_logs is high-volume telemetry; the app now polls the few UI
-- surfaces that need "last seen" instead of subscribing to every INSERT.

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_activity_logs'
  ) then
    alter publication supabase_realtime drop table public.user_activity_logs;
  end if;
end $$;
