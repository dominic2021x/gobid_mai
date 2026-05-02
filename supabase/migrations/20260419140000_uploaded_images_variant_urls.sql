-- Responsive WebP variants (thumb / card / full) for server-optimized uploads (`/api/upload/image`).

ALTER TABLE public.uploaded_images
  ADD COLUMN IF NOT EXISTS variant_urls jsonb;

COMMENT ON COLUMN public.uploaded_images.variant_urls IS
  'Optional JSON: { "thumb": url, "card": url, "full": url }. Canonical listing URL stays in public_url (full).';
