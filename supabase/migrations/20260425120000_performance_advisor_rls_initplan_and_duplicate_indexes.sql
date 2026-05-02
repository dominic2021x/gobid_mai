-- Follow-up for Supabase Performance Advisor:
-- - auth_rls_initplan: wrap auth/current_setting calls in SELECT so they are
--   evaluated once per statement instead of once per row.
-- - duplicate_index: drop redundant non-canonical indexes while keeping
--   unique constraints / canonical indexes.

do $$
declare
  pol record;
  roles_sql text;
  next_qual text;
  next_check text;
  create_sql text;
begin
  for pol in
    select
      schemaname,
      tablename,
      policyname,
      permissive,
      roles,
      cmd,
      qual,
      with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') ~ '(auth\.(uid|role|jwt)\(\)|current_setting\()'
        or coalesce(with_check, '') ~ '(auth\.(uid|role|jwt)\(\)|current_setting\()'
      )
  loop
    select string_agg(quote_ident(role_name), ', ' order by role_name)
      into roles_sql
    from unnest(pol.roles) as role_name;

    next_qual := pol.qual;
    next_check := pol.with_check;

    if next_qual is not null then
      next_qual := replace(next_qual, 'auth.uid()', '(select auth.uid())');
      next_qual := replace(next_qual, 'auth.role()', '(select auth.role())');
      next_qual := replace(next_qual, 'auth.jwt()', '(select auth.jwt())');
      next_qual := regexp_replace(
        next_qual,
        '(^|[^[:alnum:]_.])current_setting\(([^()]*)\)',
        '\1(select current_setting(\2))',
        'g'
      );
    end if;

    if next_check is not null then
      next_check := replace(next_check, 'auth.uid()', '(select auth.uid())');
      next_check := replace(next_check, 'auth.role()', '(select auth.role())');
      next_check := replace(next_check, 'auth.jwt()', '(select auth.jwt())');
      next_check := regexp_replace(
        next_check,
        '(^|[^[:alnum:]_.])current_setting\(([^()]*)\)',
        '\1(select current_setting(\2))',
        'g'
      );
    end if;

    execute format(
      'drop policy if exists %I on %I.%I',
      pol.policyname,
      pol.schemaname,
      pol.tablename
    );

    create_sql := format(
      'create policy %I on %I.%I as %s for %s to %s',
      pol.policyname,
      pol.schemaname,
      pol.tablename,
      pol.permissive,
      pol.cmd,
      roles_sql
    );

    if next_qual is not null then
      create_sql := create_sql || format(' using (%s)', next_qual);
    end if;

    if next_check is not null then
      create_sql := create_sql || format(' with check (%s)', next_check);
    end if;

    execute create_sql;
  end loop;
end $$;

-- Duplicate index cleanup. Keep unique constraints / canonical indexes.
drop index if exists public.idx_licitatii_insolventa_source_external_id;
drop index if exists public.idx_repes_source_external_id;
drop index if exists public.idx_products_brand;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'message_reactions_message_id_message_type_user_id_reaction__key'
      and conrelid = 'public.message_reactions'::regclass
  )
  and (
    to_regclass('public.message_reactions_unique_user_emoji_per_message') is not null
    or exists (
      select 1
      from pg_constraint
      where conname = 'message_reactions_unique_user_emoji_per_message'
        and conrelid = 'public.message_reactions'::regclass
    )
  ) then
    alter table public.message_reactions
      drop constraint if exists message_reactions_message_id_message_type_user_id_reaction__key;
  else
    drop index if exists public.message_reactions_message_id_message_type_user_id_reaction__key;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'products_slug_key'
      and conrelid = 'public.products'::regclass
  )
  and (
    to_regclass('public.products_slug_unique') is not null
    or exists (
      select 1
      from pg_constraint
      where conname = 'products_slug_unique'
        and conrelid = 'public.products'::regclass
    )
  ) then
    alter table public.products
      drop constraint if exists products_slug_key;
  else
    drop index if exists public.products_slug_key;
  end if;
end $$;
