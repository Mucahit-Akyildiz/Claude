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

-- Müşteri kaydını yapan / son değiştiren: customers.created_by, updated_by, info_updated_at + customers_audit tetikleyicisi (peyk.uid); list_customers isimleri döner.
alter table customers add column if not exists created_by uuid, add column if not exists updated_by uuid, add column if not exists info_updated_at timestamptz;

-- customers_audit: not ve müşteriye özel sadakat ayarları da "son değiştiren"e dahil.

-- Paket yükseltme: get_bank_transfer_status2 / submit_bank_transfer_notice2 (p_package_id ile hedef paket; onayda paket değişir). _cron_close_comp_orders hızlı çıkış + orders_open_tagged / order_items_unpaid_order indeksleri; _cron_cleanup_history 20klık parçalar, saatlik.

-- Frankfurt: dakikalık 9 cron işi tek sıralı _cron_minutely() işinde birleştirildi (minutely_jobs, * * * * *); aynı anda başlayıp küçük sunucuda zaman aşımına yol açıyordu.

-- 2026-11-03: Çok şubeli paket otomasyonu
-- * paket_kurumsal.features += 'multi_branch'
-- * restaurants_auto_company tetikleyicisi: max_branches>1 pakete geçen ve şirketi olmayan işletmeye şirket hesabı açar, bağlar;
--   şirketi olan işletmede paket/bitiş tarihini şirkete yansıtır.
-- * open_company_panel(p_token): yönetici rolündeki personel şirket paneline şifresiz geçer.
-- * get_restaurant_config.license.has_company eklendi.
-- * Peyktan ve TEST3 için şirket hesapları (sirket-<kod>) açıldı.
-- 2026-11-03: packages.max_branches = 0 sınırsız şube demek; paket_kurumsal = 0.
--   create_branch, admin_upsert_package (>=0) ve _auto_company_for_branches buna göre güncellendi.
-- 2026-11-03: restaurants_sync_max_users: paket değişince restaurants.max_users paket limitine eşitlenir
--   (ekrandaki "eklenebilir kullanıcı" eski limiti gösteriyordu). Mevcut kayıtlar düzeltildi.
-- 2026-11-03: company_sessions.origin_user_id; open_company_panel bunu kaydeder. switch_to_branch: origin varsa
--   şubeye kendi kullanıcısıyla (aynı hesap / aynı kullanıcı adı) girer, yoksa uyarı verir (ortak hesap kullanılmaz).
--   company_add_me_to_branch: yöneticiyi aynı ad/şifreyle şubeye yönetici olarak ekler.
-- 2026-11-03: Roller: yeni izinler settings_notifs (Bildirim Ayarları), settings_reports (Özet E-postaları);
--   banka/konum/harita ayarları settings_integrations iznine açıldı. _role_permission_catalog etiketleri güncellendi.
--   _guard_manager_target: yönetici hesabının şifre/PIN/e-posta/ad/rol/silme işlemleri yalnızca yöneticiye açık
--   (update_staff_user, delete_staff_user, reset_staff_password_temp, send_staff_temp_password, set_staff_email, set_staff_pin, send_staff_login_sms).
-- 2026-11-03: set_notification_roles izinli türlere pkg_deadline, pkg_courier eklendi (Kime Gitsin kaydı 'Geçersiz bildirim türü' veriyordu).
-- 2026-11-03: api_usage_daily (işletme+gün istek sayacı, _session_check içinde işlem başına bir kez),
--   admin_usage_report(token, from, to), admin_list_restaurants'a company_id/company_name/api_today/api_30d/open_errors.
-- 2026-11-03: Entegrasyon alt izinleri int_online/int_geo/int_marketplace/int_google/int_sms/int_mail/int_bank/int_invoice/int_efatura/int_accounting.
--   _session_check: int_* (settings_integrations hepsini kapsar), int_any; online_ordering/efatura/marketplace/accounting izinleri int_* ile de geçer.
--   İlgili fonksiyonlar int_* iznine bağlandı; rol kataloğunda "Entegrasyonlar" kategorisi (pakette olmayanlar "(paketinizde yok)").
--   Rollerdeki eski online_ordering/efatura/marketplace/accounting izinleri int_* olarak taşındı.
-- 2026-11-03: paket_kurumsal.features += online_ordering, efatura, marketplace, accounting, multi_branch (tüm eklentiler).
-- 2026-11-03: 'Ayarlar · Entegrasyonlar (hepsi)' rol kataloğundan kaldırıldı; bu izne sahip roller 10 int_* iznine açıldı (sunucu settings_integrations'ı geriye uyum için hâlâ kabul eder).
-- 2026-11-03: settings_allowances izni (Limitli Hesaplar); save/delete_allowance, set_allowance_settings, set_allowances_enabled bu izne bağlandı;
--   settings_users'a sahip roller bu izni de aldı. edit_purchase_order: taslak/sipariş verilmiş malzeme siparişinde tarih, not, kalem, miktar düzenleme.
-- 2026-11-03: _merge_open_pos: aynı tedarikçinin teslim alınmamış açık (taslak/sipariş verildi) siparişleri birleşir; assign_po_items_supplier ve set_purchase_order_supplier sonunda çağrılır. Mevcut Anadolu Toros siparişleri birleştirildi.
-- 2026-11-03: _session_check'i çağıran STABLE fonksiyonlar VOLATILE yapıldı (PostgREST salt-okunur işlemde istek sayacı INSERT'i hata veriyordu: get_allowance_settings, allowance_report, customer_birthdays, get_courier_positions vb.); sayaç ve last_seen salt-okunur işlemde atlanır.
-- 2026-11-04: get_purchase_prices(token, from, to): Finansal Analiz › Ürün Analizi › Alış Fiyatları (hammadde bazında son/önceki/ortalama/min/max alış fiyatı).
-- 2026-11-04: _nav_badges hızlandırıldı (izinler tek sorguda, _chat_unread tek çağrı; ~20ms→9ms). FK indeksleri: company_sessions.origin_user_id, ingredient_cost_log.restaurant_id, product_packaging.ingredient_id, restaurants.treat_product_id.
-- 2026-11-04: get_restaurant_config sadeleştirildi: işletme satırı tek okuma, _restaurant_features tek çağrı, reçete+stok tek lateral, overhead_pct yalnızca 'revenue' yönteminde (ilk çağrı ~140ms→20ms, sonraki ~13ms→5ms; çıktı aynı).
-- 2026-11-04: _trg_product_recipe_cost: cost_source 'recipe_partial' — reçetede maliyetsiz hammadde varken elle maliyet yoksa (boş/0) bilinen hammaddelerden otomatik kısmi maliyet; elle girilirse 'recipe_missing'.
-- 2026-11-04: _ing_is_free (bedelsiz alınan hammadde) — _recipe_cost bunu 0 maliyetle tam sayar; config.ingredients.free; po_item_free_recalc tetikleyicisi.
-- 2026-11-04: restaurants.online_order_modes (both|pickup|delivery), set_online_order_modes, get_public_payment_option.order_modes, submit_public_order/start_public_order_payment kapalı türü reddeder.
-- 2026-11-04: _valid_tr_mobile, _valid_person_name; submit_public_order ve start_public_order_payment geçersiz ad/telefonu reddeder.
-- 2026-11-04: _nav_badges: online (masasız) müşteri istekleri Sipariş Al yerine Paket Servis rozetinde.
-- 2026-11-04: receive_purchase_order_items: allow_over:true ile sipariş edilenden fazla teslim (kalem miktarı gelen toplama yükseltilir); onaysız fazlası kesilir.
-- 2026-11-05: online_sms_verify ayarı; public_order_otps; request_public_order_otp / verify_public_order_otp; set_online_sms_verify; sipariş, doğrulanmış numara (30 dk) ister (SMS_DOGRULAMA_GEREKLI).
-- 2026-11-05: get_server_now(): istemci saat farkı (mutfak/paket/ödeme sayaçları sunucu saatine göre).
-- 2026-11-05: Uzaktan yazdırma: shared_printers, print_jobs; share_printer, list_shared_printers, claim_print_jobs, submit_print_job, finish_print_job, get_print_job_status; _cleanup_print_jobs (saatlik temizlikte).

-- campaign_phone_change_resend: customers.phone_changed_at (trigger customers_phone_changed);
-- send_campaign 24 saat kuralı, son gönderimden sonra telefon değiştiyse SMS/ikisi için uygulanmaz.

-- api_usage_skip_locked: _session_check'teki api_usage_daily sayacı "for update skip locked" ile artırılır.
-- Eski upsert satır kilidini istek boyunca tuttuğu için aynı restoranın istekleri sıraya girip statement timeout veriyordu.

-- data_version_deferred: trg_bump_dv tetikleyicileri "constraint trigger ... deferrable initially deferred" yapıldı;
-- _bump_data_version işlem başına restoran başına bir kez (peyk.dv_<rid>) ve commit anında data_versions'ı artırır.

-- realtime_data_versions_publication: supabase_realtime yayını yoktu; oluşturulup data_versions eklendi
-- (istemcideki postgres_changes aboneliği artık anlık bildirim alır; mutfak/ekranlar beklemeden yenilenir).
-- GERİ ALINDI: data_versions supabase_realtime yayınından çıkarıldı (realtime postgres_changes veritabanı işlemcisini doldurup statement timeout'a yol açtı).
-- Yayın (boş) duruyor; data_versions tekrar eklenmemeli. Mutfak ekranı 3 sn'de bir get_data_version ile kontrol eder.

-- disk_io_cron_relax: Disk IO bütçesi tükendiği için cron sıklıkları azaltıldı:
-- close_comp_orders_5s -> '30 seconds', dispatch_customer_requests_20s -> '* * * * *' (dakikada bir);
-- _cron_cleanup_history artık 1 günden eski cron/http kayıtlarını siler (önceden 3 gün).

-- sms_delivery_reports: sms_outbox'a http_req_id, provider_ref, report_req_id, report_checked_at, delivery_error eklendi;
-- status kısıtına 'delivered','failed' eklendi. _send_sms İleti Merkezi istek kimliğini saklar; _sms_poll_reports (cron
-- sms_delivery_reports, dakikada bir) sipariş no'yu alır, get-report ile 111=delivered / 112=failed işler. get_sms_log güncellendi.
-- _trg_order_delivered_review: sms_enabled ve sms_on_payment açıksa "teslim edildi" mesajı atılmaz (değerlendirme ödeme SMS'inde tek mesaj).

-- customer_thanks_single_message: _customer_thanks(sales_history_id) tek SMS + tek e-posta (teşekkür + değerlendirme linki).
-- _trg_payment_sms: masa/gel-al ödemede gönderir; adrese teslim pakette teslim edilmemişse bekler; orders.review_sent_at ile tekrar engellenir.
-- _trg_order_delivered_review: paket teslim edildiğinde ödeme alınmışsa gönderir, alınmamışsa ödeme alınınca gider.
-- _trg_takeaway_ready_sms: adrese teslim (takeaway_type='delivery') siparişte "hazır" mesajı gönderilmez (yola çıktı mesajı yeterli).

-- staff_login_multiline: send_staff_login_sms ve send_staff_temp_password SMS metni alt alta (işletme kodu / kullanıcı adı / şifre).

-- dayclose_overhead_fix: ŞİLE LEZZET SOFRASI 1 ve 6 Kasım kapanışlarındaki cash_counts.overhead_daily 353.33 -> 10600
-- (giderler aylıktan günlüğe çevrilmeden önce kapanış yapılmıştı).

-- dayclose_alloc_dynamic: get_dayclose_alloc bu ayın günlerinde sabit gideri güncel _overhead_summary'den, malzemeyi güncel
-- products.cost'tan hesaplar (geçmiş aylar kapanış/sipariş anındaki değerle). trg_overhead_resync (overhead_items) bu ayın
-- cash_counts.overhead_daily değerlerini güncel ayara çeker; tüm restoranların Kasım kapanışları bir kez yeniden hesaplandı.

-- customer_sms_optout_groups: customers.sms_opt_out (tüm müşteri SMS'leri engellenir, sms_outbox status 'opted_out'),
-- customers.group_ids + customer_groups tablosu; RPC: list_customer_groups, upsert_customer_group, delete_customer_group (soft),
-- set_customer_prefs; list_customers ve get_winback alanları; get_winback(p_token,p_days,p_group) grup filtresi.

-- sms_optout_allow: restaurants.sms_optout_allow text[]; "SMS istemiyor" müşterilere yalnızca bu listedeki türler gider.
-- RPC: get_sms_optout_settings, set_sms_optout_allow (int_sms). _send_sms güncellendi.

-- winback_flags: get_winback satırlarına sms_blocked (SMS istemiyor ve tür izinli değil) ve recently_sent (24 saat / 14 gün kuralı) eklendi.

-- anon_internal_revoke: yeni iç fonksiyonların (_trg_*, _customer_thanks, _sms_poll_reports, _valid_* …) anon/authenticated
-- execute yetkisi kaldırıldı; "alter default privileges for role postgres revoke execute on functions from public" ile
-- bundan sonra oluşturulan fonksiyonlar varsayılan kapalı. İstemci RPC'lerine açıkça grant gerekir.

-- undo_purchase_receive(p_token, p_id): purchasing_manage; teslim alınan kalemler _reverse_po_item ile stok/maliyetten geri alınır,
-- sipariş 'ordered' (teslim bekleyen) olur. anon/authenticated'a grant edildi.

-- reverse_po_item_clamp: _reverse_po_item stoğu eksiye düşürmez (greatest(0, stock - rq)); kısmen kullanılmış malzemede
-- teslimi geri al / iptal ingredients_stock_nonneg hatası vermez.

-- 2026-11-09: kitchen_set_product_available(p_token, p_product_ids uuid[], p_available) — mutfak ekranından
-- acil satışa kapatma/açma. 'kitchen' yetkisi ister, restaurant_id oturumdan; data_versions artırılır.
-- grant execute ... to anon, authenticated.

-- 2026-11-09: Hammadde alış birimleri. ingredients.purchase_units jsonb ([{n:'koli', f:30, d:true}], f = kaç temel birim)
-- ve ingredients.piece_weight (1 adet ≈ kaç temel birim). Stok/maliyet/reçete temel birimde kalır.
-- set_ingredient_units(p_token, p_id, p_units, p_piece_weight) — settings_ingredients; en fazla 5 birim, tek varsayılan.
-- get_restaurant_config ingredients çıktısına purchase_units ve piece_weight eklendi. grant ... to anon, authenticated.

-- 2026-11-09: close_purchase_order_short(p_token, p_id) — kısmen teslim alınan siparişi gelen miktarla kapatır
-- (purchasing_manage). Eksik miktar siparişten düşülür, hiç gelmeyen kalemler silinir, durum 'received', nota
-- "Eksik kapatıldı: …" eklenir. Stok/maliyet değişmez. grant ... to anon, authenticated.

-- 2026-11-09: clear_purchase_item_cost(p_token, p_item_id) — yanlış girilen birim fiyatı siler (unit_cost=0, price_set=false).
-- Fiyat teslimle maliyete işlenmişse (cost_applied_qty>0) reddeder. purchasing_reports. grant ... to anon, authenticated.

-- 2026-11-09: Hammadde arşivleme. ingredients.archived boolean. delete_ingredient: satın alma geçmişinde kullanılan hammadde
-- silinmez, arşivlenir (reçete/paket bağları kaldırılır, min_stock=0). get_restaurant_config ve get_analytics_bundle arşivlileri göstermez.

-- 2026-11-10: list_archived_ingredients(p_token) ve restore_ingredient(p_token, p_id) — arşivlenen hammaddeyi listeler / geri getirir.
-- settings_ingredients. grant ... to anon, authenticated.

-- 2026-11-10: Online rezervasyon saatleri. restaurants.online_resv_from/online_resv_to (time, vars. 11:00–23:00).
-- set_online_reservation_hours(p_token, p_from, p_to) — reservations; get_online_reservation_settings ve
-- get_public_reservation_info from/to döndürür; submit_public_reservation aralık dışını reddeder (Europe/Istanbul).

-- 2026-11-10: list_reservations varsayılan aralığı 14 günden 61 güne çıkarıldı (online rezervasyon 60 gün ileriye alınabildiği için;
-- 14 günden ileri rezervasyonlar listede görünmüyordu).

-- 2026-11-10: Rezervasyon ufku 90 gün: list_reservations varsayılan aralığı 91 gün, submit_public_reservation en fazla 90 gün sonrası.

-- 2026-11-10: overhead_items.note (gider notu). upsert_overhead_item'a p_note eklendi (eski 7 parametreli sürüm kaldırıldı),
-- _overhead_summary kalemlerde note döndürür. grant ... to anon, authenticated.

-- 2026-11-10: Günlük hazırlık (ör. döner şişi). ingredients.prep_source_id (kaynak/depo hammaddesi, aynı birim), prep_default.
-- ingredient_prep_log (prep/keep/waste/return). set_ingredient_prep (settings_ingredients), prep_ingredient (kitchen; kaynaktan düşer,
-- hazırlanana ekler, maliyet ağırlıklı ortalanır; depoda yetersizse reddeder), prep_leftover (kitchen; keep / waste → waste_log
-- "Gün sonu kalan" / return → kaynağa), list_prep_log. get_restaurant_config ingredients'a prep_source_id, prep_default eklendi.

-- 2026-11-10: bulk_customer_group(p_token, p_ids uuid[], p_group_id, p_add) — seçili müşterileri gruba toplu ekler / çıkarır (crm).
-- grant ... to anon, authenticated.
