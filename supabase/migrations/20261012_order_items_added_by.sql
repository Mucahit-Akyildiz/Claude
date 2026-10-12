-- Hangi garson hangi ürünü ekledi: order_items.added_by.
-- _session_check oturumdaki kullanıcıyı işlem süresince 'peyk.uid' ayarına yazar;
-- tetikleyici yeni ürün satırına bunu işler (tüm sipariş gönderme RPC'leri kapsanır).
alter table order_items add column if not exists added_by uuid;

create or replace function _order_items_set_added_by() returns trigger language plpgsql as $$
begin
  if new.added_by is null then new.added_by := nullif(current_setting('peyk.uid', true), '')::uuid; end if;
  return new;
end $$;
create trigger trg_order_items_added_by before insert on order_items for each row execute function _order_items_set_added_by();
revoke execute on function _order_items_set_added_by() from public, anon, authenticated;

-- Ayrıca (canlıda uygulandı, şema dökümüne yansır):
--  * _session_check: perform set_config('peyk.uid', s.user_id::text, true);
--  * pay_order_items: kısmi ödemede bölünen satıra added_by kopyalanır.
--  * get_live_orders: ürünlerde added_by / added_by_name, siparişte created_by_name.
--  * get_sales_history: waiters (ödenen ürünleri ekleyen garsonlar).
--  * get_sale_detail: waiters.

-- Destek Erişimi rol yetkisi (settings_support): _has_role_perm yardımcı fonksiyonu,
-- set/get_support_access artık Yönetici VEYA bu yetkiye sahip rolü kabul eder,
-- _role_permission_catalog Yönetim grubuna 'Ayarlar · Destek Erişimi' eklendi.

-- Değişiklik kaydı (audit_log): _audit_trg tetikleyicisi products, roles, app_users,
-- restaurant_tables, stations, restaurants (ekle/değiştir/sil), orders (iptal/silme) ve
-- order_items (silme) üzerinde. Şifre/anahtar alanları maskelenir; yalnızca stok değişimi yazılmaz.
-- _session_check 'peyk.support' ayarını da yazar (destek oturumu işaretlenir).
-- list_audit_log(token, entity, before): Yönetici veya 'settings_audit' yetkisi.

-- Platform admin: admin_audit_log(token, restaurant_id) - işletmenin değişiklik kaydı (son 300), salt okunur.
-- Google yorum yönlendirmesi paket kontrolü: get_restaurant_config linki yalnızca 'google_reviews'
-- özelliği varsa döner; update_google_review_url özellik yoksa PAKET_OZELLIK_YOK verir.

-- Mesajlar "son görülme": list_chat_conversations birebir kişilerde last_seen
-- (staff_sessions.last_seen_at en yenisi) döner; grup/Genel satırlarında null.

-- Masa adları bölge bazında benzersiz: upsert_table aynı adı yalnızca aynı bölgede reddeder.
-- pay_order_items: aynı adlı masa başka bölgede de varsa satış kaydına "Bölge · Masa" yazar.

-- İstasyon alt menüleri ve fişe yazdırma: products.category (alt menü adı), products.print_ticket
-- (false ise mutfak fişine basılmaz). set_product_options(token, product_id, category, print_ticket);
-- get_restaurant_config ürünlerde category ve print_ticket döner.

-- İstasyon alt menüleri istasyonda tanımlanır: stations.categories text[];
-- set_station_categories(token, station_id, categories) (silinen alt menüdeki ürünler alt menüsüz kalır);
-- get_restaurant_config istasyonlarda categories döner.

-- Otomatik müşteri kaydı: _auto_customer(restaurant, name, phone, email);
-- orders tetikleyicisi (müşteri adı/telefonu girilince kart oluşur/güncellenir),
-- invoices tetikleyicisi (fiş e-postayla gönderilince müşterinin boş e-postası doldurulur).

-- QR menü / online sipariş: get_public_menu ve get_public_order_menu ürünlerde category ve
-- cat_pos (istasyondaki alt menü sırası) döner. _auto_customer: en az 7 haneli numaralar.
