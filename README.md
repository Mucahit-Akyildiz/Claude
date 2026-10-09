# Peyktan — Restoran Yönetim Sistemi

Restoranlar için sipariş, mutfak, ödeme, stok, rezervasyon, CRM ve finansal
analiz özelliklerini tek bir panelde toplayan çok kiracılı (multi-tenant)
bir SaaS uygulaması. Web, masaüstü (Electron) ve mobil (Capacitor/Android)
istemcilerin hepsi aynı canlı HTTPS sitesini (`app/index.html` ve modülleri)
WebView içinde açar; tek bir kaynak vardır.

## Mimari

- **Frontend**: Derlemesiz (build adımı olmayan), klasik `<script src>`
  ile yüklenen JS modülleri (`app/js/*.js`) — ES module değil, bilinçli bir
  tercih: `onclick="..."`'lerle HTML'den çağrılan yüzlerce global
  fonksiyonu bozmadan modülerleştirmeyi sağlıyor.
  - `api.js` — Supabase client + RPC sarmalayıcısı + oturum yardımcıları
  - `state.js` — global `APP` state objesi, nav öğeleri
  - `utils.js` — `escapeHtml`, `money`, `showToast`, HTML sanitizer, polling hata izleme
  - `pos-kitchen.js`, `pos-payments.js`, `pos-packages.js`, `pos-printer.js`, `pos-escpos.js`, `pos-push.js` — Mutfak, Ödemeler/Masa-Sipariş, Paket Servis, Yazıcı/Fiş, bildirimler
  - `messages.js` (mesajlaşma), `radio.js` (Peyk Bas-Konuş), `help.js` (Yardım)
  - `financial.js`, `crm.js`, `supplier.js`, `reservations.js`, `settings.js`, `admin-panel.js`, `auth-screens.js`, `main.js`
- **Backend**: Tüm veri erişimi **sadece** Supabase Postgres
  `SECURITY DEFINER` RPC fonksiyonları üzerinden yapılır; frontend hiçbir
  zaman `sb.from()` ile doğrudan tabloya erişmez. RLS repo genelinde açık
  ama policy'siz (deny-all) — tek erişim yolu RPC'ler.
- **Ödemeler**: Kart (iyzico) → `api/payment-initialize.js` +
  `api/payment-callback.js` (Vercel serverless). Havale/EFT → admin
  onayıyla (`admin_review_bank_transfer_notice`). Kart ödemesinde onay + uzatma tek
  işlemde `complete_subscription_payment` ile (tutar kontrolüyle), havalede
  `extend_restaurant_subscription` ile yapılır; her ikisi de yalnızca sunucu tarafından çağrılabilir ve
  birbirinin bekleyen işlemini kontrol ederek çifte abonelik uzatmayı
  engeller.
- **Bildirimler**: Web Push (VAPID) + native FCM, `api/dispatch-ready-pushes.js`
  üzerinden `pg_cron` tetikleyicileriyle gönderilir.
- **Veritabanı şeması**: `supabase/schema.sql` canlı veritabanından otomatik
  dökülür (bkz. `.github/workflows/db-schema.yml`); değişiklikler
  `supabase/migrations/` altında tutulur. Eski `final_setup.sql` kaldırıldı.
- **Fonksiyon yetkileri**: Yeni fonksiyonlar varsayılan olarak herkese açık
  anahtara (anon) **kapalı** oluşturulur; istemcinin çağıracağı RPC'ler açıkça
  `grant execute ... to anon, authenticated` ile açılır. İç yardımcılar (`_*`)
  ve sunucuya özel fonksiyonlar yalnızca `service_role`'e açıktır
  (`critical_tests.sql` bunu denetler).

## Güvenlik modeli (özet)

- Her yazma RPC'si `_session_check(p_token, p_permission)` ile oturumu ve
  rol iznini doğrular; `restaurant_id` her zaman oturumdan alınır, client'tan
  asla parametre olarak kabul edilmez (cross-tenant BOLA'yı engeller).
- Fiyat/maliyet gibi finansal değerler client JSON'undan değil, sunucudaki
  `products` kaydından okunur.
- Ödeme tutarları (`pay_order_items`) sipariş toplamıyla sunucuda
  karşılaştırılır; eşzamanlı çift ödeme `FOR UPDATE` kilitleriyle engellenir.
- OTP doğrulama fonksiyonları yanlış kodda `RAISE EXCEPTION` **atmaz**
  (aksi halde Postgres tüm transaction'ı — deneme sayacı artışı dahil —
  geri alır); bunun yerine boş/`false` sonuç döner ve sayaç kalıcı artar.
- Genel/kimliksiz uçlar (`submit_public_order`, `submit_customer_order_request`,
  OTP istem uçları) hız sınırlaması (rate limiting) içerir.

## Test yaklaşımı

Otomatik bir test paketi (unit/integration) **yoktur** — bilinen bir eksik.
Bunun yerine:

- **CI** (`.github/workflows/ci.yml`): her `api/*.js` ve `app/js/*.js`
  dosyası için `node --check` ile sözdizimi doğrulaması; `mobile-build.yml`/
  `desktop-build.yml` ayrıca kendi `lint` adımlarını içerir.
- **Manuel/canlı doğrulama**: Güvenlik düzeltmeleri, canlı Supabase
  üzerinde tek seferlik/disposable test verisiyle (geçici restoran/ürün/
  sipariş oluşturup senaryoyu deneyip hemen silme) doğrulanır; UI
  değişiklikleri Playwright ile gerçek tarayıcıda manuel gezilerek test edilir.

**Öneri**: Kritik RPC'ler (`pay_order_items`, `send_order`, OTP akışları)
için Supabase'in yerel geliştirme ortamında (`supabase start`) çalışan bir
pgTAP veya basit bir Node tabanlı entegrasyon test paketi eklemek, gelecekteki
regresyonları (örn. bu denetimde bulunan OTP sayaç hatası gibi) otomatik
yakalayacaktır.

## Bilinen, kasıtlı olarak ertelenmiş konular

- `pg_net` extension'ı `public` şemasında (linter uyarısı) — taşımak
  `pg_cron`/`net.http_post` üzerinden giden OTP e-postaları ve push
  bildirimlerini kırma riski taşıdığı için ayrı, dikkatli bir bakım
  penceresinde yapılmalı.
- iyzico'ya gönderilen adres/şehir bilgisi sabit ("İstanbul") — `restaurants`
  tablosunda adres/şehir alanı yok; gerçek veri toplamak yeni bir alan +
  UI eklemeyi gerektiren ayrı bir iş.
- Platform admin girişinde 2FA/IP allowlist yok — ayrı bir özellik.
- Merkezi hata izleme (Sentry vb.) entegre değil.
