-- Yedekten geri yükleme güvenliği:
--  * ON CONFLICT güncellemesi yalnızca aynı işletmenin satırına uygulanır (başka işletmenin kaydı değişemez)
--  * yalnızca işletme sahibi (sistem rolü) yükleyebilir; app_users.role_ids/şifre/aktiflik ve roles.is_system/permissions geri yüklenmez
--  * "alter table ... disable trigger" (tüm işletmeleri kilitleyen tablo kilidi) yerine işlem bazlı bayrak:
--    set_config('peyktan.restoring','1',true); tetikleyiciler bu bayrakta erken döner.
-- Canlıya DO blokları ile uygulandı (pg_get_functiondef + replace); aşağısı aynı yamanın tekrar çalıştırılabilir hâli.
do $$ declare f text; d text; n text; begin
foreach f in array array['_audit_trg','_bump_data_version','_contact_auto_customer_trg','_invoices_customer_email_trg','_menus_cleanup_trg','_orders_auto_customer_trg','_product_no_cost_close','_purchase_order_push','_sales_history_allowance','_sales_history_guests','_trg_enqueue_okc_sale','_trg_order_address_to_customer','_trg_payment_sms','_trg_reservation_sms','_trg_role_shift_exempt_sync','_trg_shift_close_pause','_trg_shift_exempt_limit','_trim_customer_name'] loop
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname=f and p.pronamespace='public'::regnamespace;
  continue when d is null or d like '%peyktan.restoring%';
  n := regexp_replace(d, E'(\\n\\s*begin\\s*\\n)', E'\\1  if current_setting(''peyktan.restoring'', true) = ''1'' then return coalesce(new, old); end if;\n', 'i');
  execute n;
end loop; end $$;
