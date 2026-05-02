-- Add subject (topic) and company_name for contact form routing and filtering
ALTER TABLE public.contact_messages
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS company_name text;

COMMENT ON COLUMN public.contact_messages.subject IS 'Topic: contact, partners, website_error, tokens, other';
COMMENT ON COLUMN public.contact_messages.company_name IS 'Optional company name when contacting as business';
