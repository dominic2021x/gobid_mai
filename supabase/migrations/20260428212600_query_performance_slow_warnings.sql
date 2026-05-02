-- Targeted indexes for current Query Performance slow statements.
-- Keep these narrow: they match observed PostgREST filters and auth user
-- deletion cascades without adding broad write-heavy indexes.

create index if not exists products_user_visible_created_idx
  on public.products (user_id, created_at desc, id desc)
  where user_id is not null
    and status <> 'deleted';

-- PostgREST often uses prepared statements with parameterized status filters.
-- A non-partial created_at index gives the planner a reliable path for the
-- high-volume feed query ordered globally by newest listings.
create index if not exists products_created_at_desc_id_idx
  on public.products (created_at desc, id desc);

create index if not exists products_visible_category_status_created_idx
  on public.products (category, status, created_at desc, id desc)
  where status <> 'deleted'
    and category is not null
    and category <> '';

create index if not exists products_visible_subcategory_status_created_idx
  on public.products (subcategory, status, created_at desc, id desc)
  where status <> 'deleted'
    and subcategory is not null
    and subcategory <> '';

create index if not exists products_visible_category_level3_status_idx
  on public.products (category, category_level_3, status)
  where status <> 'deleted'
    and category is not null
    and category <> ''
    and category_level_3 is not null
    and category_level_3 <> '';

-- Frequent metadata lookup for rendered images; include focal values so the
-- public_url lookup can be served as an index-only scan when visibility allows.
create index if not exists uploaded_images_active_public_url_focal_idx
  on public.uploaded_images (public_url)
  include (focal_x, focal_y)
  where deleted_at is null;

-- Lookup used by location enrichment/cache warm paths.
create index if not exists ro_localities_city_norm_idx
  on public.ro_localities (city_norm)
  where city_norm is not null and city_norm <> '';

-- These FK indexes help auth.users deletes avoid scanning referencing tables.
do $$
declare
  target record;
begin
  for target in
    select *
    from (
      values
        ('admin_page_permissions', 'granted_by', 'admin_page_permissions_granted_by_idx'),
        ('contact_messages', 'user_id', 'contact_messages_user_id_idx'),
        ('report_chats', 'admin_user_id', 'report_chats_admin_user_id_idx'),
        ('token_refund_requests', 'reviewed_by_user_id', 'token_refund_requests_reviewed_by_user_id_idx'),
        ('user_favorites', 'user_id', 'user_favorites_user_id_idx'),
        ('user_reports', 'reviewed_by', 'user_reports_reviewed_by_idx')
    ) as t(table_name, column_name, index_name)
  loop
    if to_regclass(format('public.%I', target.table_name)) is not null
       and exists (
         select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = target.table_name
           and column_name = target.column_name
       )
    then
      execute format(
        'create index if not exists %I on public.%I (%I)',
        target.index_name,
        target.table_name,
        target.column_name
      );
    end if;
  end loop;
end $$;
