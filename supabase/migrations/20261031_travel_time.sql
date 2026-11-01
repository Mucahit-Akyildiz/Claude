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
