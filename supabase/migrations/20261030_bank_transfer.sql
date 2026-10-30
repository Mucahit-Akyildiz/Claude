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
