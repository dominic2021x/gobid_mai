-- Follow-up for Security Advisor function_search_path_mutable warnings.
-- Uses pg_proc lookup by function name so it catches existing overloads/signatures in remote DB.

do $$
declare
  fn record;
  target_names text[] := array[
    'products_search_vector_refresh',
    'get_user_rating',
    'claim_agent_job',
    'enqueue_product_filter_count_dirty_groups',
    'set_products_updated_at',
    'bump_search_popularity',
    'update_user_chat_last_message',
    'check_premium_expiration',
    'products_normalize_columns',
    'growth_lock_next_job',
    'is_admin_user',
    'ro_localities_set_norms',
    'set_message_reactions_updated_at',
    'set_search_intel_query_boosts_updated_at',
    'demand_flywheel_set_updated_at',
    'set_search_intel_arms_updated_at',
    'upsert_search_suggestion_seed',
    'growth_trend_set_updated_at',
    'update_price_evaluations_updated_at',
    'set_search_intel_bucket_weights_updated_at',
    'upsert_suggestion_daily_stats_batch',
    'product_filter_counts_is_visible',
    'cleanup_search_events',
    'requeue_stuck_agent_jobs',
    'update_updated_at_column',
    'create_transaction_on_bid_accepted',
    'growth_set_updated_at',
    'growth_demand_set_updated_at',
    'lock_oauth_account',
    'search_suggestions_rpc',
    'seo_internal_links_set_updated_at',
    'get_user_transaction_for_product',
    'update_report_chats_updated_at',
    'has_user_purchased_product',
    'seed_products_batch',
    'growth_jobs_health',
    'complete_agent_job',
    'cleanup_expired_price_evaluations',
    'search_suggestions_candidates_rpc',
    'product_filter_counts_normalize_text',
    'match_graph_embeddings',
    'match_pages',
    'update_chat_requests_updated_at',
    'update_products_updated_at',
    'match_products',
    'update_product_chat_timestamp',
    'semantic_search_products_listings',
    'update_user_reports_updated_at',
    'is_admin',
    'graph_set_updated_at',
    'update_executor_custom_buttons_updated_at',
    'cleanup_weak_seed_suggestions',
    'update_module_configurations_updated_at',
    'get_licitatii_ids_missing_data_ora2'
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
