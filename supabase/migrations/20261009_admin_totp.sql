-- Platform admin girişine 2 adımlı doğrulama (TOTP, RFC 6238; Google/Microsoft Authenticator).
-- Gizli anahtar sunucuda üretilir; QR kod tarayıcıda çizilir (dış servise gönderilmez).
-- Aynı kod (zaman adımı) ikinci kez kullanılamaz (totp_last_counter).
alter table platform_admins add column if not exists totp_secret text, add column if not exists totp_pending text,
  add column if not exists totp_enabled boolean not null default false, add column if not exists totp_last_counter bigint;
-- Yardımcılar (yalnızca service_role): _b32_encode(bytea), _b32_decode(text), _totp(text,bigint), _totp_match(text,text)
-- platform_admin_login(p_username, p_password, p_otp default null): TOTP açıksa kod yoksa 'OTP_GEREKLI' hatası
-- admin_totp_status / admin_totp_begin / admin_totp_enable / admin_totp_disable
-- (Fonksiyon gövdeleri canlıda; supabase/schema.sql otomatik dökümünde yer alır.)
