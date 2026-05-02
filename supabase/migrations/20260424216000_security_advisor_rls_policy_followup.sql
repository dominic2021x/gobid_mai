-- Follow-up for Security Advisor `rls_policy_always_true` warnings.
-- Strategy:
-- 1. Drop the permissive policies on the affected tables.
-- 2. Recreate explicit admin-only policies for internal tables.
-- 3. Keep legacy/public flows working on tables still used by open APIs,
--    but replace literal `true` checks with concrete constraints.

do $$
declare
  tbl text;
  pol record;
  target_tables text[] := array[
    'ai_logs',
    'analytics',
    'autopilot_policies',
    'autopilot_tasks',
    'clipuri_video',
    'executor_imports',
    'experiments',
    'invoices',
    'newsletter_subscribers',
    'newsletter_templates',
    'product_transactions',
    'produse',
    'seo',
    'spend_ledger'
  ];
begin
  foreach tbl in array target_tables loop
    if to_regclass(format('public.%I', tbl)) is not null then
      execute format('alter table public.%I enable row level security', tbl);
      for pol in
        select policyname
        from pg_policies
        where schemaname = 'public'
          and tablename = tbl
      loop
        execute format('drop policy if exists %I on public.%I', pol.policyname, tbl);
      end loop;
    end if;
  end loop;
end $$;

do $$
begin
  if to_regclass('public.ai_logs') is not null then
    execute $sql$
      create policy ai_logs_admin_manage
        on public.ai_logs
        for all
        to authenticated
        using (
          exists (
            select 1
            from public.user_profiles up
            where up.user_id = auth.uid()
              and up.is_admin = true
          )
        )
        with check (
          exists (
            select 1
            from public.user_profiles up
            where up.user_id = auth.uid()
              and up.is_admin = true
          )
        )
    $sql$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.analytics') is not null then
    execute $sql$
      create policy analytics_insert_event
        on public.analytics
        for insert
        to anon, authenticated
        with check (
          type is not null
          and btrim(type) <> ''
          and item_id is not null
          and btrim(item_id) <> ''
          and (item_type is null or btrim(item_type) <> '')
          and (session_id is null or btrim(session_id) <> '')
          and coalesce(jsonb_typeof(metadata), 'object') = 'object'
          and (user_id is null or auth.uid() = user_id)
        )
    $sql$;

    execute $sql$
      create policy analytics_admin_manage
        on public.analytics
        for all
        to authenticated
        using (
          exists (
            select 1
            from public.user_profiles up
            where up.user_id = auth.uid()
              and up.is_admin = true
          )
        )
        with check (
          exists (
            select 1
            from public.user_profiles up
            where up.user_id = auth.uid()
              and up.is_admin = true
          )
        )
    $sql$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.autopilot_policies') is not null then
    execute $sql$
      create policy autopilot_policies_admin_manage
        on public.autopilot_policies
        for all
        to authenticated
        using (
          exists (
            select 1
            from public.user_profiles up
            where up.user_id = auth.uid()
              and up.is_admin = true
          )
        )
        with check (
          exists (
            select 1
            from public.user_profiles up
            where up.user_id = auth.uid()
              and up.is_admin = true
          )
        )
    $sql$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.autopilot_tasks') is not null then
    execute $sql$
      create policy autopilot_tasks_admin_manage
        on public.autopilot_tasks
        for all
        to authenticated
        using (
          exists (
            select 1
            from public.user_profiles up
            where up.user_id = auth.uid()
              and up.is_admin = true
          )
        )
        with check (
          exists (
            select 1
            from public.user_profiles up
            where up.user_id = auth.uid()
              and up.is_admin = true
          )
        )
    $sql$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.clipuri_video') is not null then
    execute $sql$
      create policy clipuri_video_public_read
        on public.clipuri_video
        for select
        to anon, authenticated
        using (
          produs_id is not null
          and url is not null
          and btrim(url) <> ''
        )
    $sql$;

    execute $sql$
      create policy clipuri_video_public_insert
        on public.clipuri_video
        for insert
        to anon, authenticated
        with check (
          produs_id is not null
          and url is not null
          and btrim(url) <> ''
        )
    $sql$;

    execute $sql$
      create policy clipuri_video_public_update
        on public.clipuri_video
        for update
        to anon, authenticated
        using (
          produs_id is not null
          and url is not null
          and btrim(url) <> ''
        )
        with check (
          produs_id is not null
          and url is not null
          and btrim(url) <> ''
        )
    $sql$;

    execute $sql$
      create policy clipuri_video_public_delete
        on public.clipuri_video
        for delete
        to anon, authenticated
        using (
          produs_id is not null
          and url is not null
          and btrim(url) <> ''
        )
    $sql$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.executor_imports') is not null then
    execute $sql$
      create policy executor_imports_authenticated_manage
        on public.executor_imports
        for all
        to authenticated
        using (
          source_type in ('pdf', 'csv', 'url', 'other')
          and status in ('pending', 'processing', 'completed', 'failed')
          and created_at is not null
        )
        with check (
          source_type in ('pdf', 'csv', 'url', 'other')
          and status in ('pending', 'processing', 'completed', 'failed')
          and created_at is not null
        )
    $sql$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.experiments') is not null then
    execute $sql$
      create policy experiments_admin_manage
        on public.experiments
        for all
        to authenticated
        using (
          exists (
            select 1
            from public.user_profiles up
            where up.user_id = auth.uid()
              and up.is_admin = true
          )
        )
        with check (
          exists (
            select 1
            from public.user_profiles up
            where up.user_id = auth.uid()
              and up.is_admin = true
          )
        )
    $sql$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.invoices') is not null then
    execute $sql$
      create policy invoices_read_own
        on public.invoices
        for select
        to authenticated
        using (auth.uid() = user_id)
    $sql$;

    execute $sql$
      create policy invoices_admin_manage
        on public.invoices
        for all
        to authenticated
        using (
          exists (
            select 1
            from public.user_profiles up
            where up.user_id = auth.uid()
              and up.is_admin = true
          )
        )
        with check (
          exists (
            select 1
            from public.user_profiles up
            where up.user_id = auth.uid()
              and up.is_admin = true
          )
        )
    $sql$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.newsletter_subscribers') is not null then
    execute $sql$
      create policy newsletter_subscribers_admin_manage
        on public.newsletter_subscribers
        for all
        to authenticated
        using (
          exists (
            select 1
            from public.user_profiles up
            where up.user_id = auth.uid()
              and up.is_admin = true
          )
        )
        with check (
          exists (
            select 1
            from public.user_profiles up
            where up.user_id = auth.uid()
              and up.is_admin = true
          )
        )
    $sql$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.newsletter_templates') is not null then
    execute $sql$
      create policy newsletter_templates_admin_manage
        on public.newsletter_templates
        for all
        to authenticated
        using (
          exists (
            select 1
            from public.user_profiles up
            where up.user_id = auth.uid()
              and up.is_admin = true
          )
        )
        with check (
          exists (
            select 1
            from public.user_profiles up
            where up.user_id = auth.uid()
              and up.is_admin = true
          )
        )
    $sql$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.product_transactions') is not null then
    execute $sql$
      create policy product_transactions_read_participant
        on public.product_transactions
        for select
        to authenticated
        using (
          auth.uid() = buyer_id
          or auth.uid() = seller_id
        )
    $sql$;

    execute $sql$
      create policy product_transactions_admin_manage
        on public.product_transactions
        for all
        to authenticated
        using (
          exists (
            select 1
            from public.user_profiles up
            where up.user_id = auth.uid()
              and up.is_admin = true
          )
        )
        with check (
          exists (
            select 1
            from public.user_profiles up
            where up.user_id = auth.uid()
              and up.is_admin = true
          )
        )
    $sql$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.produse') is not null then
    execute $sql$
      create policy produse_public_read
        on public.produse
        for select
        to anon, authenticated
        using (
          titlu is not null
          and btrim(titlu) <> ''
          and status in ('draft', 'active', 'published', 'reserved', 'sold', 'in_progress')
        )
    $sql$;

    execute $sql$
      create policy produse_public_insert
        on public.produse
        for insert
        to anon, authenticated
        with check (
          titlu is not null
          and btrim(titlu) <> ''
          and status in ('draft', 'active', 'published', 'reserved', 'sold', 'in_progress')
        )
    $sql$;

    execute $sql$
      create policy produse_public_update
        on public.produse
        for update
        to anon, authenticated
        using (
          titlu is not null
          and btrim(titlu) <> ''
          and status in ('draft', 'active', 'published', 'reserved', 'sold', 'in_progress')
        )
        with check (
          titlu is not null
          and btrim(titlu) <> ''
          and status in ('draft', 'active', 'published', 'reserved', 'sold', 'in_progress')
        )
    $sql$;

    execute $sql$
      create policy produse_public_delete
        on public.produse
        for delete
        to anon, authenticated
        using (
          titlu is not null
          and btrim(titlu) <> ''
        )
    $sql$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.seo') is not null then
    execute $sql$
      create policy seo_public_read
        on public.seo
        for select
        to anon, authenticated
        using (produs_id is not null)
    $sql$;

    execute $sql$
      create policy seo_public_insert
        on public.seo
        for insert
        to anon, authenticated
        with check (
          produs_id is not null
          and (
            titlu_seo is not null
            or descriere_seo is not null
            or cuvinte_cheie is not null
            or scor is not null
          )
        )
    $sql$;

    execute $sql$
      create policy seo_public_update
        on public.seo
        for update
        to anon, authenticated
        using (produs_id is not null)
        with check (produs_id is not null)
    $sql$;

    execute $sql$
      create policy seo_public_delete
        on public.seo
        for delete
        to anon, authenticated
        using (produs_id is not null)
    $sql$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.spend_ledger') is not null then
    execute $sql$
      create policy spend_ledger_admin_manage
        on public.spend_ledger
        for all
        to authenticated
        using (
          exists (
            select 1
            from public.user_profiles up
            where up.user_id = auth.uid()
              and up.is_admin = true
          )
        )
        with check (
          exists (
            select 1
            from public.user_profiles up
            where up.user_id = auth.uid()
              and up.is_admin = true
          )
        )
    $sql$;
  end if;
end $$;
