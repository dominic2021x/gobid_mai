-- Security Advisor 0028/0029:
-- SECURITY DEFINER functions in the exposed public schema should not be callable
-- directly through PostgREST RPC by anonymous or signed-in users unless that is
-- explicitly part of the public API contract.
--
-- Keep service_role access for server-side workers, admin routes, and cron jobs
-- that intentionally call these functions with the Supabase service key.

do $$
declare
  fn record;
  target_names text[] := array[
    'activate_chat_after_bid',
    'apply_apple_credit_topup',
    'assistant_conversation_updated_at_on_message',
    'backfill_product_images_batch',
    'claim_image_jobs',
    'claim_uploaded_images_for_purge',
    'cleanup_auto_suggestions_junk',
    'cleanup_search_events',
    'cleanup_weak_seed_suggestions',
    'count_distinct_products_with_active_uploaded_images',
    'count_uploaded_images_orphan_soft_delete_candidates',
    'count_uploaded_images_r2_purge_ready',
    'create_auction',
    'create_transaction_on_bid_accepted',
    'finalize_uploaded_image_purge',
    'get_licitatii_count_by_county',
    'get_user_rating',
    'get_user_transaction_for_product',
    'has_user_purchased_product',
    'is_admin_user',
    'lock_oauth_account',
    'mark_orphan_uploaded_images_soft_delete',
    'rebuild_product_filter_counts_rollup',
    'refresh_product_filter_counts_rollup',
    'replace_product_image_url',
    'reset_stale_image_jobs',
    'sync_product_filter_counts_source',
    'sync_product_images_from_products_images',
    'update_auction_images',
    'uploaded_images_cleanup_diag'
  ];
begin
  for fn in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(target_names)
  loop
    execute format('revoke execute on function %s from public', fn.signature);
    execute format('revoke execute on function %s from anon', fn.signature);
    execute format('revoke execute on function %s from authenticated', fn.signature);
    execute format('grant execute on function %s to service_role', fn.signature);
  end loop;
end $$;
