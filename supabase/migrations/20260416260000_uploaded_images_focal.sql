-- AI focal point (normalized 0–1) for Cloudflare Image Resizing gravity=XxY; set once per object by image_jobs worker.

ALTER TABLE public.uploaded_images
  ADD COLUMN IF NOT EXISTS focal_x double precision,
  ADD COLUMN IF NOT EXISTS focal_y double precision;

COMMENT ON COLUMN public.uploaded_images.focal_x IS
  'Horizontal focal 0=left, 1=right (Cloudflare gravity X).';
COMMENT ON COLUMN public.uploaded_images.focal_y IS
  'Vertical focal 0=top, 1=bottom (Cloudflare gravity Y).';

-- Skip full-table CHECK validation during migration push.
