-- Adrese teslim dinamik yol süresi (canlıya uygulandı).
alter table restaurants add column if not exists geo_address text, add column if not exists geo_lat double precision, add column if not exists geo_lng double precision,
  add column if not exists travel_default_min int not null default 10, add column if not exists travel_buffer_min int not null default 3;
alter table orders add column if not exists travel_min int, add column if not exists travel_src text;
-- _pkg_deadline(o): pickup_at − coalesce(o.travel_min, restaurants.travel_default_min, 10) (delivery).
-- _trg_order_travel: adres girilince/değişince api/travel-time'a (x-push-secret) order_id gönderir (pg_net).
-- _order_travel_target, _set_order_travel (yalnızca servis), save_geo_settings (yönetici),
-- get_restaurant_config 'geo', get_live_orders travel_min/travel_src.
-- Sürüş süresi Google Routes API (computeRoutes) ile; anahtar Vercel ortamında GOOGLE_MAPS_API_KEY.
