-- Gizli anahtarlar düz metin yerine Supabase Vault'ta (şifreli) tutulur.
-- 1) platform_settings içindeki resend_api_key, push_dispatch_secret, support_inbound_secret,
--    giphy_api_key, sms_password -> vault.secrets ('ps_' önekiyle); tablodaki düz metin satırlar silindi.
--    Okuyan fonksiyonlar 'from platform_settings' yerine 'from _psv' görünümünü kullanır
--    (_psv: düz ayarlar + Vault'tan çözülen gizli değerler; anon/authenticated erişemez).
--    admin_set_gif_key / admin_set_sms Vault'a yazar.
-- 2) İşletme entegrasyon anahtarları (efatura_api_key, marketplace_*_key, accounting_api_key) yazılırken
--    Vault'taki 'peyktan_field_key' ile pgp_sym_encrypt edilir (_enc / _dec, yalnızca service_role).
-- (Uygulama canlıda yapıldı; fonksiyon gövdeleri supabase/schema.sql otomatik dökümünde yer alır.)
create or replace view public._psv with (security_barrier) as
  select key, value from platform_settings where key not in ('resend_api_key','push_dispatch_secret','support_inbound_secret','giphy_api_key','sms_password')
  union all
  select substr(name, 4), decrypted_secret from vault.decrypted_secrets where name in ('ps_resend_api_key','ps_push_dispatch_secret','ps_support_inbound_secret','ps_giphy_api_key','ps_sms_password');
revoke all on public._psv from public, anon, authenticated;
