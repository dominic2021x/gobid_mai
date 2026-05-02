-- ===============================================================
-- EXEMPLE: Introducere în baza de date a datelor din localStorage
-- ===============================================================
-- Înlocuiește 'USER_ID_UUID' cu UUID-ul utilizatorului (auth.users.id).
-- Migrarea automată din browser: POST /api/user/sync-preferences
-- cu body = { favoriteAuctions, unlockedAuctions, savedFilters, ... }
-- ===============================================================

-- 1) user_settings - preferences (darkMode, showHeaderNameDesktop)
INSERT INTO public.user_settings (user_id, category, data, updated_at)
VALUES (
  'USER_ID_UUID'::uuid,
  'preferences',
  '{"darkMode": true, "showHeaderNameDesktop": "1"}'::jsonb,
  timezone('utc', now())
)
ON CONFLICT (user_id, category)
DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;

-- 2) user_settings - saved_filters
INSERT INTO public.user_settings (user_id, category, data, updated_at)
VALUES (
  'USER_ID_UUID'::uuid,
  'saved_filters',
  '{"category": "", "location": "", "minPrice": null, "maxPrice": null}'::jsonb,
  timezone('utc', now())
)
ON CONFLICT (user_id, category)
DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;

-- 3) user_settings - search_history (ultimele căutări)
INSERT INTO public.user_settings (user_id, category, data, updated_at)
VALUES (
  'USER_ID_UUID'::uuid,
  'search_history',
  '["teren bucuresti", "apartament cluj"]'::jsonb,
  timezone('utc', now())
)
ON CONFLICT (user_id, category)
DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;

-- 4) user_settings - recently_viewed (ID-uri produse)
INSERT INTO public.user_settings (user_id, category, data, updated_at)
VALUES (
  'USER_ID_UUID'::uuid,
  'recently_viewed',
  '[]'::jsonb,
  timezone('utc', now())
)
ON CONFLICT (user_id, category)
DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;

-- 5) user_settings - auction_notifications
INSERT INTO public.user_settings (user_id, category, data, updated_at)
VALUES (
  'USER_ID_UUID'::uuid,
  'auction_notifications',
  '{}'::jsonb,
  timezone('utc', now())
)
ON CONFLICT (user_id, category)
DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;

-- 6) user_unlocked_products (produse deblocate cu token) - înlocuiește PRODUCT_UUID cu id din products
-- INSERT INTO public.user_unlocked_products (user_id, product_id)
-- VALUES ('USER_ID_UUID'::uuid, 'PRODUCT_UUID'::uuid)
-- ON CONFLICT (user_id, product_id) DO NOTHING;

-- 7) user_custom_buttons
INSERT INTO public.user_custom_buttons (user_id, button_config, updated_at)
VALUES ('USER_ID_UUID'::uuid, '[]'::jsonb, timezone('utc', now()))
ON CONFLICT (user_id)
DO UPDATE SET button_config = EXCLUDED.button_config, updated_at = EXCLUDED.updated_at;
