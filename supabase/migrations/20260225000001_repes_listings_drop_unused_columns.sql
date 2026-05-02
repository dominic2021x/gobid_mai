-- Elimină coloanele nefolosite din repes_listings (aliniere la câmpurile de pe REPES).
-- Păstrăm doar: id, source_external_id, source_url, title, price_text, location_raw, location_city, location_county,
-- description_html, seller_name, seller_email, seller_phone, seller_address, published_at, auction_date, auction_time,
-- pdf_url, meta_fields, last_seen_at, deleted_at, reactivated_at, product_id, created_at, updated_at.

ALTER TABLE public.repes_listings DROP COLUMN IF EXISTS category;
ALTER TABLE public.repes_listings DROP COLUMN IF EXISTS seller_profile_url;
ALTER TABLE public.repes_listings DROP COLUMN IF EXISTS sale_type;

COMMENT ON TABLE public.repes_listings IS 'Anunțuri sincronizate de pe prod.executori.ro/repes; câmpuri aliniate la site (Titlu, Preț, Locație bun, Licitator, Email, Telefon, Adresă, Data încărcării, Data/Ora licitației, Document PDF, Descriere, Imagini).';
