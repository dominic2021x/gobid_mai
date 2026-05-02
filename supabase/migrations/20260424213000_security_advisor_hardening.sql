-- Supabase Security Advisor hardening:
-- 1) Fix mutable search_path warnings for known functions.
-- 2) Add explicit RLS policies for internal/admin tables and public geo lookups.

do $$
declare
  fn record;
  target_names text[] := array[
    'activate_chat_after_bid',
    'apply_apple_credit_topup',
    'bump_search_popularity',
    'check_premium_expiration',
    'claim_agent_job',
    'cleanup_expired_price_evaluations',
    'cleanup_search_events',
    'cleanup_weak_seed_suggestions',
    'complete_agent_job',
    'create_transaction_on_bid_accepted',
    'demand_flywheel_set_updated_at',
    'enqueue_product_filter_count_dirty_groups',
    'get_licitatii_ids_missing_data_ora2',
    'get_user_rating',
    'get_user_transaction_for_product',
    'graph_set_updated_at',
    'growth_claim_next_job',
    'growth_demand_set_updated_at',
    'growth_jobs_health',
    'growth_lock_next_job',
    'growth_os_set_updated_at',
    'growth_set_updated_at',
    'growth_trend_set_updated_at',
    'has_user_purchased_product',
    'is_admin',
    'is_admin_user',
    'lock_oauth_account',
    'match_graph_embeddings',
    'match_pages',
    'match_products',
    'product_filter_counts_channel_bucket',
    'product_filter_counts_is_visible',
    'product_filter_counts_normalize_text',
    'products_normalize_columns',
    'products_search_vector_refresh',
    'requeue_stuck_agent_jobs',
    'ro_localities_set_norms',
    'run_search_popularity_decay',
    'search_suggestions_candidates_rpc',
    'search_suggestions_rpc',
    'seed_products_batch',
    'semantic_search_products_listings',
    'seo_internal_links_set_updated_at',
    'set_message_reactions_updated_at',
    'set_products_updated_at',
    'set_search_intel_arms_updated_at',
    'set_search_intel_bucket_weights_updated_at',
    'set_search_intel_query_boosts_updated_at',
    'set_updated_at',
    'update_chat_requests_updated_at',
    'update_executor_custom_buttons_updated_at',
    'update_module_configurations_updated_at',
    'update_price_evaluations_updated_at',
    'update_product_chat_timestamp',
    'update_products_updated_at',
    'update_report_chats_updated_at',
    'update_updated_at_column',
    'update_user_blocks_updated_at',
    'update_user_chat_last_message',
    'update_user_chats_updated_at',
    'update_user_reactions_updated_at',
    'update_user_reports_updated_at',
    'upsert_search_suggestion_seed',
    'upsert_suggestion_daily_stats_batch'
  ];
begin
  for fn in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(target_names)
  loop
    execute format('alter function %s set search_path = public, pg_temp', fn.signature);
  end loop;
end $$;

alter table if exists public.admin_modules enable row level security;
drop policy if exists admin_modules_admin_manage on public.admin_modules;
create policy admin_modules_admin_manage
  on public.admin_modules
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
  );

alter table if exists public.admin_recategorization_audit enable row level security;
drop policy if exists admin_recategorization_audit_admin_manage on public.admin_recategorization_audit;
create policy admin_recategorization_audit_admin_manage
  on public.admin_recategorization_audit
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
  );

alter table if exists public.agent_state enable row level security;
drop policy if exists agent_state_admin_manage on public.agent_state;
create policy agent_state_admin_manage
  on public.agent_state
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
  );

alter table if exists public.anaf_scrape_config enable row level security;
drop policy if exists anaf_scrape_config_admin_manage on public.anaf_scrape_config;
create policy anaf_scrape_config_admin_manage
  on public.anaf_scrape_config
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
  );

alter table if exists public.apple_iap_receipts enable row level security;
drop policy if exists apple_iap_receipts_read_own on public.apple_iap_receipts;
create policy apple_iap_receipts_read_own
  on public.apple_iap_receipts
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists apple_iap_receipts_admin_manage on public.apple_iap_receipts;
create policy apple_iap_receipts_admin_manage
  on public.apple_iap_receipts
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
  );

alter table if exists public.apple_transactions enable row level security;
drop policy if exists apple_transactions_read_own on public.apple_transactions;
create policy apple_transactions_read_own
  on public.apple_transactions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists apple_transactions_admin_manage on public.apple_transactions;
create policy apple_transactions_admin_manage
  on public.apple_transactions
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
  );

alter table if exists public.cache_events enable row level security;
drop policy if exists cache_events_admin_manage on public.cache_events;
create policy cache_events_admin_manage
  on public.cache_events
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
  );

alter table if exists public.category_overrides enable row level security;
drop policy if exists category_overrides_admin_manage on public.category_overrides;
create policy category_overrides_admin_manage
  on public.category_overrides
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
  );

alter table if exists public.category_suggestions enable row level security;
drop policy if exists category_suggestions_admin_manage on public.category_suggestions;
create policy category_suggestions_admin_manage
  on public.category_suggestions
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
  );

alter table if exists public.geo_counties enable row level security;
drop policy if exists geo_counties_public_read on public.geo_counties;
create policy geo_counties_public_read
  on public.geo_counties
  for select
  to anon, authenticated
  using (true);

alter table if exists public.geo_places enable row level security;
drop policy if exists geo_places_public_read on public.geo_places;
create policy geo_places_public_read
  on public.geo_places
  for select
  to anon, authenticated
  using (true);

alter table if exists public.geo_place_aliases enable row level security;
drop policy if exists geo_place_aliases_public_read on public.geo_place_aliases;
create policy geo_place_aliases_public_read
  on public.geo_place_aliases
  for select
  to anon, authenticated
  using (true);

alter table if exists public.geo_neighbors enable row level security;
drop policy if exists geo_neighbors_public_read on public.geo_neighbors;
create policy geo_neighbors_public_read
  on public.geo_neighbors
  for select
  to anon, authenticated
  using (true);

do $$
begin
  if to_regclass('public.cache_control') is not null then
    execute 'alter table public.cache_control enable row level security';
    execute 'drop policy if exists cache_control_admin_manage on public.cache_control';
    execute $sql$
      create policy cache_control_admin_manage
        on public.cache_control
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
  if to_regclass('public.agent_jobs') is not null then
    execute 'alter table public.agent_jobs enable row level security';
    execute 'drop policy if exists agent_jobs_admin_manage on public.agent_jobs';
    execute $sql$
      create policy agent_jobs_admin_manage
        on public.agent_jobs
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
