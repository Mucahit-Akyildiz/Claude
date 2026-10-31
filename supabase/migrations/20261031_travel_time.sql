-- Adrese teslim dinamik yol süresi (canlıya uygulandı).
alter table restaurants add column if not exists geo_address text, add column if not exists geo_lat double precision, add column if not exists geo_lng double precision,
  add column if not exists travel_default_min int not null default 10, add column if not exists travel_buffer_min int not null default 3;
alter table orders add column if not exists travel_min int, add column if not exists travel_src text;
-- _pkg_deadline(o): pickup_at − coalesce(o.travel_min, restaurants.travel_default_min, 10) (delivery).
-- _trg_order_travel: adres girilince/değişince api/travel-time'a (x-push-secret) order_id gönderir (pg_net).
-- _order_travel_target, _set_order_travel (yalnızca servis), save_geo_settings (yönetici),
-- get_restaurant_config 'geo', get_live_orders travel_min/travel_src.
-- Sürüş süresi Google Routes API (computeRoutes) ile; anahtar Vercel ortamında GOOGLE_MAPS_API_KEY.
-- İşletmeye özel Google Maps anahtarı + trafik yeniden kontrolü (canlıya uygulandı):
-- tenant_integrations.maps_api_key (_enc), save_maps_key, _maps_key, _maps_session; orders.dest_lat/dest_lng/travel_stage/travel_checked_at;
-- restaurants.travel_recheck_min, save_travel_recheck; _set_order_travel2; _cron_travel_recheck (cron 'travel_recheck', her dakika):
-- yola çıkışa 30 ve 15 dk kala api/travel-time { recheck_ids }; değişim eşiği aşarsa güncellenir, uzarsa travel_alert bildirimi.

-- submit_offline_order: p_pickup_min = 'now' → pickup_at null ("Hemen" paket).
-- _cron_travel_recheck: teslim saati olmayan paketler 3 dk'da bir yeniden hesaplanır (en fazla 2 saat, yola çıkana kadar).
-- restaurants.travel_refresh_min (varsayılan 3): Hemen paketlerde yeniden hesap aralığı; save_travel_recheck(p_token,p_min,p_refresh); config.geo.travel_refresh_min.
-- _cron_pkg_alerts: kurye hatırlatması hazır olduktan 2, 7, 12 dk sonra (courier_push_stage 1..3).
