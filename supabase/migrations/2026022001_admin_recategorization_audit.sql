-- Audit table for admin manual recategorization (single and bulk).
-- product_id NULL when action is "apply_to_all" batch (see batch_id or request_id for grouping).

CREATE TABLE IF NOT EXISTS public.admin_recategorization_audit (
  id                BIGSERIAL PRIMARY KEY,
  admin_user_id     UUID NOT NULL,
  product_id        UUID NULL,
  action_type       TEXT NOT NULL, -- 'single' | 'bulk' | 'apply_to_all'
  before_json       JSONB NULL,
  after_json        JSONB NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_id        TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_recategorization_audit_admin_user_id
  ON public.admin_recategorization_audit (admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_recategorization_audit_product_id
  ON public.admin_recategorization_audit (product_id);
CREATE INDEX IF NOT EXISTS idx_admin_recategorization_audit_created_at
  ON public.admin_recategorization_audit (created_at DESC);

COMMENT ON TABLE public.admin_recategorization_audit IS 'Audit log for admin recategorization (category, subcategory, attributes).';
