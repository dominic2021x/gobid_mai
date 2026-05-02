# Supabase – scripturi SQL manuale

Scripturi SQL pentru rulare manuală (nu sunt migrații Supabase).

## Structură supabase/

| Folder | Descriere |
|--------|-----------|
| `migrations/` | Migrații Supabase (ordonate cronologic) |
| `seeds/` | Date inițiale pentru development |
| `scripts/` | Scripturi manuale (acest folder) |

## Fișiere în scripts/

- **support-tables** – supabase-support-tables*.sql (complet, simple, no-rls, rls-only)
- **user** – supabase-user-tokens.sql, supabase-user-data-migration.sql
- **autopilot** – supabase-autopilot-tables.sql
- **custom** – CREATE_USER_CUSTOM_BUTTONS_TABLE.sql, add_premium_columns.sql
- **util** – reset_product_status.sql, create-executor-imports-table.sql
- **verificare** – verificare_campuri_produse.sql
