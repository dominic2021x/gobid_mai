-- Follow-up targeted indexes from post-reset Query Performance.

create index if not exists products_status_created_at_desc_feed_idx
  on public.products (status, created_at desc, id desc)
  where status <> 'deleted';

create index if not exists user_profiles_user_id_idx
  on public.user_profiles (user_id);

create index if not exists ticket_messages_ticket_timestamp_idx
  on public.ticket_messages (ticket_id, "timestamp" asc);

create index if not exists user_activity_logs_user_created_cover_idx
  on public.user_activity_logs (user_id, created_at desc)
  include (id, event);

create index if not exists user_watchlist_user_created_idx
  on public.user_watchlist (user_id, created_at desc);
