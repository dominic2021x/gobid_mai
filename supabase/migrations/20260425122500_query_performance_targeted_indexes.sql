-- Targeted indexes for the post-reset Query Performance report.
-- Kept narrow and partial to reduce write overhead during imports.

create index if not exists uploaded_images_active_public_url_idx
  on public.uploaded_images (public_url)
  where deleted_at is null;

create index if not exists products_active_category_subcategory_idx
  on public.products (category, subcategory)
  where status in ('active', 'reserved', 'sold', 'in_progress');

create index if not exists products_active_created_feed_idx
  on public.products (created_at desc, id desc)
  where status in ('active', 'reserved', 'sold', 'in_progress')
    and status <> 'deleted';

create index if not exists products_product_type_status_idx
  on public.products (product_type, status, id)
  where status <> 'deleted';
