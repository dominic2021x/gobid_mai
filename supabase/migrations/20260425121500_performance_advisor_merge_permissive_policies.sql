-- Follow-up for Supabase Performance Advisor `multiple_permissive_policies`.
--
-- For each public table that has multiple permissive RLS policies for the same
-- action, merge the permissive policies into one equivalent policy per action.
-- The merged policy preserves role targeting by wrapping each old policy
-- expression in a role guard, then OR-ing all applicable expressions.

do $$
declare
  tbl record;
  action_name text;
  action_count int;
  merged_using text;
  merged_check text;
  policy_name text;
begin
  create temp table tmp_permissive_policy_merge on commit drop as
  with actions(action_name) as (
    values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
  ),
  expanded as (
    select
      p.schemaname,
      p.tablename,
      p.policyname,
      a.action_name as action,
      case
        when 'public' = any(p.roles) then 'true'
        else (
          select string_agg(format('pg_has_role(current_user, %L, %L)', r, 'member'), ' or ' order by r)
          from unnest(p.roles) as r
        )
      end as role_guard,
      coalesce(p.qual, 'true') as using_expr,
      coalesce(p.with_check, p.qual, 'true') as check_expr
    from pg_policies p
    join actions a on p.cmd = a.action_name or p.cmd = 'ALL'
    where p.schemaname = 'public'
      and p.permissive = 'PERMISSIVE'
  ),
  target_tables as (
    select distinct schemaname, tablename
    from expanded
    group by schemaname, tablename, action
    having count(*) > 1
  )
  select e.*
  from expanded e
  join target_tables t
    on t.schemaname = e.schemaname
   and t.tablename = e.tablename;

  for tbl in
    select distinct schemaname, tablename
    from tmp_permissive_policy_merge
  loop
    execute format('drop policy if exists perf_merged_select on %I.%I', tbl.schemaname, tbl.tablename);
    execute format('drop policy if exists perf_merged_insert on %I.%I', tbl.schemaname, tbl.tablename);
    execute format('drop policy if exists perf_merged_update on %I.%I', tbl.schemaname, tbl.tablename);
    execute format('drop policy if exists perf_merged_delete on %I.%I', tbl.schemaname, tbl.tablename);

    for policy_name in
      select distinct policyname
      from tmp_permissive_policy_merge
      where schemaname = tbl.schemaname
        and tablename = tbl.tablename
    loop
      execute format('drop policy if exists %I on %I.%I', policy_name, tbl.schemaname, tbl.tablename);
    end loop;

    foreach action_name in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      select
        count(*),
        string_agg(format('((%s) and (%s))', role_guard, using_expr), ' or ' order by policyname),
        string_agg(format('((%s) and (%s))', role_guard, check_expr), ' or ' order by policyname)
      into action_count, merged_using, merged_check
      from tmp_permissive_policy_merge
      where schemaname = tbl.schemaname
        and tablename = tbl.tablename
        and action = action_name;

      if action_count = 0 then
        continue;
      end if;

      policy_name := format('perf_merged_%s', lower(action_name));

      if action_name = 'SELECT' then
        execute format(
          'create policy %I on %I.%I as permissive for select to public using (%s)',
          policy_name,
          tbl.schemaname,
          tbl.tablename,
          merged_using
        );
      elsif action_name = 'INSERT' then
        execute format(
          'create policy %I on %I.%I as permissive for insert to public with check (%s)',
          policy_name,
          tbl.schemaname,
          tbl.tablename,
          merged_check
        );
      elsif action_name = 'UPDATE' then
        execute format(
          'create policy %I on %I.%I as permissive for update to public using (%s) with check (%s)',
          policy_name,
          tbl.schemaname,
          tbl.tablename,
          merged_using,
          merged_check
        );
      elsif action_name = 'DELETE' then
        execute format(
          'create policy %I on %I.%I as permissive for delete to public using (%s)',
          policy_name,
          tbl.schemaname,
          tbl.tablename,
          merged_using
        );
      end if;
    end loop;
  end loop;
end $$;
