-- ===============================================================
-- Supabase Migration: Newsletter Templates
-- ===============================================================
-- Tabel pentru template-urile de newsletter

-- Asigură extensiile necesare
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------
-- Table: newsletter_templates
-- ---------------------------------------------------------------
create table if not exists public.newsletter_templates (
  id text primary key, -- ID custom (ex: 'newsletter-welcome-5-tokens', 'template-1')
  name text not null,
  subject text not null,
  html_content text not null,
  text_content text,
  category text, -- Categorie pentru care e template-ul (opțional)
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Indexuri pentru performanță
create index if not exists idx_newsletter_templates_category on public.newsletter_templates(category);
create index if not exists idx_newsletter_templates_created_at on public.newsletter_templates(created_at desc);

-- Funcție pentru a actualiza updated_at automat (dacă nu există deja)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pentru updated_at
create trigger trg_newsletter_templates_updated_at
before update on public.newsletter_templates
for each row execute function public.set_updated_at();

-- RLS Policies
alter table public.newsletter_templates enable row level security;

-- Permite citirea publică (pentru admin)
create policy "Anyone can view newsletter templates"
  on public.newsletter_templates
  for select
  using (true);

-- Permite inserarea publică (pentru admin)
create policy "Anyone can insert newsletter templates"
  on public.newsletter_templates
  for insert
  with check (true);

-- Permite actualizarea publică (pentru admin)
create policy "Anyone can update newsletter templates"
  on public.newsletter_templates
  for update
  using (true)
  with check (true);

-- Permite ștergerea publică (pentru admin)
create policy "Anyone can delete newsletter templates"
  on public.newsletter_templates
  for delete
  using (true);

-- Comentarii
comment on table public.newsletter_templates is 'Template-uri pentru email-uri newsletter';
comment on column public.newsletter_templates.html_content is 'Conținut HTML al template-ului (suportă placeholders: {{name}}, {{tokenCode}}, {{logoUrl}}, {{year}})';
comment on column public.newsletter_templates.text_content is 'Conținut text alternativ al template-ului';

-- Insert default welcome template if it doesn't exist
insert into public.newsletter_templates (id, name, subject, html_content, text_content, category)
values (
  'newsletter-welcome-5-tokens',
  'Newsletter Welcome - 5 Tokens',
  'Bine ai venit la Newsletter GoBid - 5 Tokeni Cadou!',
  '<!DOCTYPE html>
<html lang="ro">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cod Tokeni - GoBid Newsletter</title>
  </head>
  <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; background-color: #ffffff; line-height: 1.6;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ffffff;">
      <tr>
        <td align="center" style="padding: 60px 20px;">
          <!-- Logo -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 500px; margin: 0 auto 50px;">
            <tr>
              <td align="center" style="padding: 0 0 50px 0;">
                <img src="{{logoUrl}}" alt="GoBid" style="max-width: 140px; height: auto; display: block;" />
              </td>
            </tr>
          </table>
          
          <!-- Main Content -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 500px; margin: 0 auto;">
            <tr>
              <td style="padding: 0;">
                <h1 style="margin: 0 0 16px 0; font-size: 28px; font-weight: 600; color: #111827; text-align: center; letter-spacing: -0.5px;">
                  Bine ai venit la Newsletter GoBid!
                </h1>
                
                <p style="margin: 0 0 40px 0; font-size: 16px; color: #6b7280; text-align: center; line-height: 1.6;">
                  Salut,<br><br>
                  Mulțumim că te-ai abonat la newsletter-ul nostru! Pentru că te-ai abonat, primești <strong>5 tokeni cadou</strong>.
                </p>
                
                <!-- Code -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td align="center" style="padding: 0 0 40px 0;">
                      <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px; display: inline-block;">
                        <div style="font-size: 32px; font-weight: 600; letter-spacing: 4px; color: #111827; font-family: ''SF Mono'', ''Monaco'', ''Courier New'', monospace; text-align: center; line-height: 1;">
                          {{tokenCode}}
                        </div>
                      </div>
                    </td>
                  </tr>
                </table>
                
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280; text-align: center;">
                  Folosește acest cod în secțiunea "Tokens" din Dashboard pentru a obține 5 tokeni.
                </p>
                
                <p style="margin: 0; font-size: 14px; color: #9ca3af; text-align: center;">
                  Vei primi noutăți despre licitații exclusive și oferte speciale.
                </p>
              </td>
            </tr>
          </table>
          
          <!-- Footer -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 500px; margin: 60px auto 0;">
            <tr>
              <td align="center" style="padding: 40px 0 0 0; border-top: 1px solid #f3f4f6;">
                <p style="margin: 0; font-size: 13px; color: #9ca3af; text-align: center;">
                  © {{year}} GoBid. Toate drepturile rezervate.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>',
  'Bine ai venit la Newsletter GoBid!

Mulțumim că te-ai abonat la newsletter-ul nostru! Pentru că te-ai abonat, primești 5 tokeni cadou.

Codul tău: {{tokenCode}}

Folosește acest cod în secțiunea "Tokens" din Dashboard pentru a obține 5 tokeni.

Vei primi noutăți despre licitații exclusive și oferte speciale.',
  ''
)
on conflict (id) do nothing;