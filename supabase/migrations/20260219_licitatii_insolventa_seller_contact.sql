-- Câmpuri vânzator (Detalii vânzator): email, telefon, adresă – extrase la sync și afișate pe site
ALTER TABLE public.licitatii_insolventa_listings
  ADD COLUMN IF NOT EXISTS seller_email text,
  ADD COLUMN IF NOT EXISTS seller_phone text,
  ADD COLUMN IF NOT EXISTS seller_address text;

COMMENT ON COLUMN public.licitatii_insolventa_listings.seller_email IS 'Email vânzător (din Detalii vânzator)';
COMMENT ON COLUMN public.licitatii_insolventa_listings.seller_phone IS 'Telefon(e) vânzător (din Detalii vânzator)';
COMMENT ON COLUMN public.licitatii_insolventa_listings.seller_address IS 'Adresă / Localizare vânzător (din Detalii vânzator)';
