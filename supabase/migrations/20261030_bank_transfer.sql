-- Havale/EFT ödeme yöntemi + banka/IBAN ayarı + IBAN'ı SMS/e-postayla gönderme (canlıya uygulandı).
alter table restaurants add column if not exists bank_name text, add column if not exists bank_iban text, add column if not exists bank_holder text;
alter table sales_history add column if not exists transfer_amount numeric not null default 0;
create or replace function public._sales_history_transfer() returns trigger language plpgsql as $f$
begin
  if new.payment_method = 'transfer' then new.transfer_amount := coalesce(new.card_amount,0); new.card_amount := 0; end if;
  return new;
end $f$;
create trigger trg_sales_history_transfer before insert on sales_history for each row execute function _sales_history_transfer();
-- save_bank_info(p_token, p_bank, p_holder, p_iban): yalnızca yönetici, TR + 24 hane doğrulaması, audit_log.
-- send_iban(p_token, p_phone, p_email, p_amount): ödeme yetkisi; _send_sms(...,'iban') / _send_email_r(_mail_layout(...)).
-- get_restaurant_config: 'bank' {bank_name, bank_holder, bank_iban} eklendi.
-- send_iban_to(p_token, p_phone, p_email, p_amount, p_name, p_customer_id): müşteriyi seçili/telefon/e-posta ile eşleştirir,
-- kayıtlı değilse customers'a ekler, ardından send_iban çağırır; {customer_id, customer_new} döner. (Canlıya uygulandı.)
-- Sesli bildirim işletme geneli aç/kapat (canlıya uygulandı): restaurants.voice_enabled, set_voice_enabled(p_token, p_on) yönetici,
-- get_restaurant_config 'voice_enabled'.
alter table restaurants add column if not exists voice_enabled boolean not null default true;
-- Birden fazla banka hesabı (canlıya uygulandı): bank_accounts (soft delete: active), _banks_json, save_bank_account,
-- archive_bank_account, send_iban_bank(.., p_bank_id), send_iban_to_bank(.., p_bank_id); get_restaurant_config 'banks'.
-- restaurants.bank_* değerleri bank_accounts'a taşındı (varsayılan).
-- Paket teslim saati bildirimleri (canlıya uygulandı): _cron_pkg_alerts aşamaları 1:<30, 2:<20, 3:<10, 4:geçti;
-- _nav_badges pkg_deadline penceresi 30 dk, mutfak kalemlerinde 'dl' (teslim saatli paket) bayrağı.
-- Adrese teslim paketlerde 10 dk yol süresi (canlıya uygulandı): _pkg_deadline(orders) = pickup_at − 10 dk (delivery);
-- _cron_pkg_alerts ve _nav_badges pkg_deadline bu saate göre.
create or replace function public._pkg_deadline(o orders) returns timestamptz language sql immutable as $f$
  select o.pickup_at - case when coalesce(o.takeaway_type, case when o.delivery_address is not null then 'delivery' else 'pickup' end) = 'delivery' then interval '10 minutes' else interval '0' end $f$;
-- Z raporu: get_analytics_bundle kpi'ye open_acc, open_acc_n, open_acc_paid, transfer eklendi.
-- Garson kartları: hesap, siparişi açan garsona (orders.created_by) yazılır; get_analytics_bundle.staff ve get_staff_detail. (Canlıya uygulandı.)
-- Havale banka bazında (canlıya uygulandı): orders/sales_history.transfer_bank_id, set_order_transfer_bank,
-- _sales_history_transfer siparişteki bankayı kopyalar; bundle kpi.transfer_banks.
-- Müşteri kampanyası (canlıya uygulandı): get_winback p_days 0 = tüm müşteriler, -1 = son 30 günde gelenler, buckets.all;
-- send_campaign(p_token, p_ids, p_text, p_channel, p_subject): 24 saat çift gönderim koruması, SMS/e-posta purpose 'campaign'.
-- Online sipariş kaynağı (canlıya uygulandı): orders.source ('online'); approve_customer_order_request doldurur; get_sales_history source döner.
-- Geçmiş: onaylanmış online taleplerle (ad+telefon+3 saat) eşleşen paket siparişleri 'online' işaretlendi.
-- Garson detayı: get_staff_detail products.tagged_qty, tagged (etiket bazında hesap/tutar).
alter table orders add column if not exists source text;
-- get_sales_history: transfer_bank; get_staff_detail.sales: transfer, gift, open_acc. (Canlıya uygulandı.)
