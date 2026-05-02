-- Coloană pentru a marca anunțurile reactivate (reapărute pe site după ce au fost dezactivate)
ALTER TABLE public.licitatii_insolventa_listings
  ADD COLUMN IF NOT EXISTS reactivated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.licitatii_insolventa_listings.reactivated_at IS 'Data la care anunțul a fost reactivat (deleted_at a fost curățat); folosit pentru afișare „Reactivat” în admin';
