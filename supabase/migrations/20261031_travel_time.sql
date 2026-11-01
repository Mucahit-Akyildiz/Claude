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

-- ===== Canlı kurye takibi =====
-- orders: courier_token (kurye sayfası anahtarı), courier_lat/lng/acc/at (son konum), courier_eta_min/eta_at (kalan süre).
-- RPC: get_courier_job(token), courier_ping(token,lat,lng,acc), courier_delivered(token)  [anon, kurye sayfası]
--      get_courier_link(session, order), get_courier_positions(session)                   [personel]
--      _courier_eta_target, _set_courier_eta, _set_order_dest                            [service_role, api/travel-time eta_ids]
-- dispatch_order: courier_token üretir/döndürür, kuryeye courier_assigned bildirimi gönderir.
-- get_public_tracking: eta_min/eta_at, live, courier_lat/lng (yalnızca yoldayken ve son 3 dk), dest/rest koordinatları.
-- get_live_orders: courier_at, courier_eta_min, courier_eta_at.
-- pg_cron courier_eta (her dakika): konumu taze kuryelerde ~2 dk'da bir kalan süre (_cron_courier_eta).

-- ===== Dinamik maliyet =====
-- purchase_order_items.cost_applied_qty; products.cost_source ('manual'|'recipe'|'recipe_missing'); ingredient_cost_log.
-- _apply_po_item_cost: ağırlıklı ortalama (eldeki × eski + gelen × fiyat) / toplam; receive_purchase_order_items ve set_purchase_item_cost çağırır.
-- Tetikleyiciler: products (reçete maliyeti zorlanır), product_ingredients ve ingredients.unit_cost/waste_pct değişince ürün maliyeti yeniden hesaplanır.
-- overhead_items + restaurants.overhead_revenue_base / overhead_auto_labor; _overhead_summary, get_overheads, upsert/remove_overhead_item, set_overhead_settings.
-- get_restaurant_config: overhead_pct, products[].cost_source. get_ingredient_cost_log.
-- resend_courier_notify(session, order): kuryeye courier_assigned bildirimini tekrar gönderir.
-- dispatch_order: müşteriye bildir → SMS (açıksa) ve e-posta (kayıtlıysa) bağımsız; mail_sent döner.
-- dispatch_order: courier_eta_min/eta_at ilk tahmin (haritadan sürüş, yoksa varsayılan); yola çıktı e-postasında tahmini varış. get_public_tracking: kurye konumu yokken de tahmini süre.
-- orders.review_sent_at; _trg_order_delivered_review: paket teslim edilince 'delivered' SMS/e-posta (değerlendirme linkiyle); _trg_payment_sms bu siparişte link eklemez.
-- Etiketli sipariş kıyası: get_analytics_bundle.products t_qty/t_rev/t_cost; get_product_sales tagged_revenue/tagged_cost; get_product_profit t_qty/t_rev/t_cost (etiketliler ayrı).
-- Kurye onayı: orders.courier_accepted_at / courier_offer_at; get_nav_badges.delivery_offer; accept_delivery(session, order) → courier_token; courier_accept(token);
-- resend_courier_notify courier_offer_at'i yeniler; dispatch_order kurye değişince onayı sıfırlar; get_live_orders/get_courier_job alanları.
-- Başa baş: restaurants.overhead_method ('breakeven' varsayılan | 'revenue'); _overhead_summary mtd_gross/days/has_rent/revenue_pct; _overhead_pct yalnız 'revenue'de; set_overhead_settings(p_method).
-- KDV hariç kâr: get_product_profit.net_revenue; get_analytics_bundle.products.nrev; _overhead_summary.mtd_gross KDV hariç.
-- get_ingredient_daily_usage(session, days): sipariş önerisi için hammadde başına son N gün tüketimi (fire dahil) + span.
-- Paket malzemesi: product_packaging; order_items.packed/pack_applied/pack_cost; _trg_item_packaging (paket sipariş / packed → stoktan düş, maliyete ekle; geri alınca iade);
-- set_item_packed, set_ingredient_usage2; config products[].packaging; get_live_orders items packed/has_pack.
-- Fire düzeltmesi: qty_per_unit brüt saklanır → _recipe_cost, get_product_profit, get_ingredient_daily_usage fireyi ikinci kez eklemez.
-- Paket malzemesi kullanım şekli: ingredients.pack_mode (null | per_product | per_order); set_ingredient_pack_mode; set_ingredient_usage2 moda göre yazar.
-- orders.packaging/pack_cost + set_order_packaging (siparişte girilen poşet adedi, fark kadar stok); iptalde iade; başa baş brüt kârından düşülür.
-- set_item_packed: ödenmiş kalemlerde de son 48 saat; get_order_pack_items(session, history) kapanmış hesaptan paket yap.
-- get_product_profit: p_qty/p_rev/p_cost/p_packcost (paket kanalı) ve order_pack_cost (poşet).
-- Bedelsiz: purchase_order_items.price_set (0 TL bilinçli girilmiş); get_purchase_report items.free; _nav_badges/_apply_po_item_cost/set_purchase_item_cost uyarlandı.
-- send_po_to_supplier(session, po, 'email'|'sms', to); cash_counts.overhead_daily (kapanışta sabit gider payı) + get_dayclose_alloc; reset_ingredient_stock.
-- collect_open_account(..., p_bank): havale/EFT + banka; open_account_entries.bank_id; bundle open_acc_paid_transfer/banks.
-- assign_po_items_supplier(session, item_ids[], supplier): kalem bazında tedarikçi; kısmi seçimde sipariş bölünür.
-- purchase_orders.share_token + get_public_po (/tedarik/?t=); send_po_to_supplier numaralı liste + PDF linki.
-- get_dayclose_alloc(..., p_include_open): kapanmamış günler bugünkü günlük giderle; open_days/open_qty.

-- Kullanıcı e-postası (Mal Kabul gönderim alıcısı vb.)
alter table app_users add column if not exists email text;
-- set_staff_email(p_token, p_user_id, p_email): settings_users yetkisi, format kontrolü; bulk_call beyaz listesine eklendi; get_restaurant_config users[].email döner.

-- Şifre sıfırlama: tek kullanımlık şifre + ilk girişte kendi şifresini belirleme
alter table app_users add column if not exists must_change_password boolean not null default false;
-- reset_staff_password_temp(p_token,p_user_id,p_password): update_staff_user ile şifreyi ayarlar, must_change_password=true, açık oturumları kapatır.
-- get_must_change_password(p_token) / set_own_password(p_token,p_new_password): girişte zorunlu şifre belirleme.

-- Güvenlik: tüm şifre kuralları en az 8 karakter (personel, sıfırlama, raporlar şifresi, şirket).
-- Giriş: login_failures.ip + _req_ip() (x-forwarded-for); aynı IP'den 15 dk'da 30 hatalı denemede giriş kilitlenir.
alter table login_failures add column if not exists ip text;
create index if not exists login_failures_ip_idx on login_failures(ip, created_at);

-- Google Maps: platform anahtarı kullanan işletmeye günlük çağrı kotası (varsayılan 300; restaurants.maps_daily_quota ile değişir).
create table if not exists maps_usage(restaurant_id uuid not null, day date not null, n int not null default 0, primary key(restaurant_id, day));
alter table restaurants add column if not exists maps_daily_quota int;
-- _maps_quota_take(p_order, p_rid, p_n) -> bool (yalnız service_role).
-- QR / online sipariş isteği: IP bazlı sınır (ip_hits + _ip_rate_check('order_req', 12, 10)) submit_customer_order_request ve submit_public_order başında.
create table if not exists ip_hits(id bigserial primary key, bucket text not null, ip text not null, created_at timestamptz not null default now());

-- Seçenek grupları: products.option_groups (ana üründe [{name,min,max}]), products.opt_group (ekstranın grubu); set_product_option_groups RPC; config'de döner.
alter table products add column if not exists option_groups jsonb not null default '[]'::jsonb, add column if not exists opt_group text;

-- Muhasebe aktarımı: get_accounting_export(p_token, p_from, p_to) -> {sales[d,vat,gross,net,tax], payments[...], purchases[...]} ('reports' izni).

-- PIN ile hızlı personel geçişi: app_users.pin_hash; set_staff_pin(p_token,p_user_id,p_pin); login_by_pin(p_token,p_pin) (5 dk'da 8 hatalı denemede kilit); config users[].has_pin.
alter table app_users add column if not exists pin_hash text;

-- send_staff_temp_password(p_token,p_user_id,p_password,p_channel 'sms'|'email'): geçici şifre + gönderim. send_staff_login_sms sıfırlamada 8 karakter ve must_change_password.

-- Çok dil: app_users.lang; set_my_lang / get_my_lang (tr,en,ar,ru,de).
alter table app_users add column if not exists lang text;

-- Limitli hesaplar birleşik: allowances.carry_over (günlük devreder); kişi ve kullanıcı için tüm dönemler.
alter table allowances add column if not exists carry_over boolean default false;

-- Masa ikramı: restaurants.treat_product_id/treat_zone_ids, orders.treat_off, _sync_table_treat + orders_treat_sync tetikleyicisi, set_table_treat, set_order_treat_off.
alter table restaurants add column if not exists treat_product_id uuid, add column if not exists treat_zone_ids uuid[];
alter table orders add column if not exists treat_off boolean not null default false;

-- restaurants.guest_required + set_guest_required: masa siparişinde kişi sayısı zorunlu.
alter table restaurants add column if not exists guest_required boolean not null default false;

-- Mal kabul iptali: _reverse_po_item (teslim alınan stok düşülür, ağırlıklı ortalama maliyet geri alınır, ingredient_cost_log purchase_cancel); set_purchase_order_status iptalde çağırır; receive sipariş miktarını aşan kısmı stoğa eklemez.
