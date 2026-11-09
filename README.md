# Peyktan — Restoran Yönetim Sistemi

Restoranlar için sipariş, mutfak, paket servis/kurye, ödeme, stok ve reçete,
satınalma/mal kabul, rezervasyon, CRM/sadakat, SMS/e-posta bildirimleri ve
finansal analizi tek panelde toplayan çok kiracılı (multi-tenant) bir SaaS.
Web, masaüstü (Electron) ve mobil (Capacitor/Android) istemcilerin hepsi aynı
canlı siteyi (`https://www.peyktan.com/app/`) açar; tek bir kaynak vardır.

## Klasörler

| Klasör | İçerik |
|---|---|
| `app/` | Yönetim paneli (POS). `app/js/*.js` modülleri, `app/css/app.css`, `sw.js` (service worker) |
| `assets/` | Ortak JS (`act.js`, `emoji-font.js`, canlı harita), görseller, vendor kütüphaneleri |
| `siparis/`, `menu/` | Online sipariş ve QR menü / masadan hesap ödeme sayfaları |
| `rezervasyon/`, `degerlendirme/`, `takip/`, `kurye/`, `tedarik/` | Herkese açık sayfalar (rezervasyon, değerlendirme, sipariş takibi, kurye, tedarikçi) |
| `api/` | Vercel sunucusuz fonksiyonları: iyzico ödeme, push gönderimi, pazaryeri, TTS, dosya yükleme |
| `supabase/` | `migrations/` (değişiklik notları), `schema.sql` (otomatik döküm), `tests/critical_tests.sql` |
| `desktop/`, `mobile/` | Electron ve Capacitor kabukları |
| `tests/ui/` | Playwright arayüz duman testleri (`smoke.cjs`, sahte Supabase: `fake-supabase.js`) |
| `scripts/` | Paketleme ve yayın kontrol betikleri |

## Mimari

- **Frontend**: Klasik `<script>` ile yüklenen global JS modülleri (ES module
  değil). Yayında `app/js/*.js` dosyaları `scripts/build-bundle.js` ile
  (esbuild, global isimler korunarak) tek `app/dist/app.bundle.js` dosyasına
  paketlenir. Dosya listesi `app/index.html` içindeki
  `<!-- bundle:start … bundle:end -->` bloğundadır.
  - `app/dist/` depoda **tutulmaz**; Vercel `vercel.json` içindeki
    `buildCommand` ile, CI ise testlerden önce paketi kendisi üretir.
  - HTML içinde satır içi JavaScript (`onclick=` vb.) **yoktur**. Olaylar
    `act()` / `actOn()` yardımcılarıyla `data-*` öznitelikleri üzerinden
    bağlanır (`assets/js/act.js`); `scripts/check-inline-handlers.js` bunu
    denetler ve CSP'de `script-src 'unsafe-inline'` gerekmez.
  - Okuma RPC'leri kısa süreli istemci önbelleğindedir (`api.js`); başka
    cihazdaki değişiklikler `data_versions` sayacı ile algılanır
    (`get_data_version`, mutfak ekranında 3 sn'de bir).
- **Backend**: Supabase Postgres (Frankfurt, `eu-central-1`). Tüm veri erişimi
  `SECURITY DEFINER` RPC'ler üzerinden yapılır; istemci tabloya doğrudan
  erişmez (RLS açık, policy'siz). Zamanlanmış işler `pg_cron`, dış HTTP
  çağrıları `pg_net` ile yapılır.
- **Ödemeler**: Abonelik ve online sipariş kart ödemesi iyzico
  (`api/payment-initialize.js`, `api/payment-callback.js`, `api/order-pay.js`);
  havale/EFT admin onayıyla.
- **Bildirimler**: Web Push (VAPID) + FCM (`api/dispatch-ready-pushes.js`),
  SMS (NetGSM, Verimor, İleti Merkezi, VatanSMS veya özel URL) ve e-posta.
  İleti Merkezi için teslim raporu dakikada bir sorgulanır
  (`_sms_poll_reports`: Ulaştı / Ulaşmadı). Müşteri bazında "SMS istemiyor" ve
  hangi türlerin yine de gideceği ayarlanabilir.
- **Hata izleme**: İstemci hataları `client_errors` tablosuna yazılır; admin
  panelindeki **Hatalar** sekmesinden izlenir.

## Güvenlik modeli (özet)

- Her RPC `_session_check(p_token, p_permission)` ile oturumu ve rol iznini
  doğrular; `restaurant_id` her zaman oturumdan alınır, istemciden kabul
  edilmez. Yönetici hesapları `_guard_manager_target` ile korunur.
- **Fonksiyon yetkileri**: Yeni fonksiyonlar varsayılan olarak anon /
  authenticated rollerine **kapalı** oluşturulur
  (`alter default privileges ... revoke execute on functions from public`).
  İstemcinin çağıracağı her yeni RPC için açıkça
  `grant execute on function ... to anon, authenticated` yazılmalıdır.
  İç yardımcılar (`_*`) ve tetikleyici fonksiyonlar kapalı kalır;
  `critical_tests.sql` bunu denetler.
- Fiyat ve maliyetler istemciden değil sunucudaki kayıtlardan okunur; ödeme
  tutarları sunucuda kontrol edilir, çift ödeme `FOR UPDATE` ile engellenir.
- Herkese açık uçlar (online sipariş, OTP, rezervasyon) hız sınırlıdır; online
  siparişte ad/telefon doğrulaması ve isteğe bağlı SMS doğrulaması vardır.
- Telefon numaraları arayüzde maskelenir (KVKK).

## Testler ve CI

| İş | Ne yapar |
|---|---|
| `Temel Kontroller` (`ci.yml`) | `node --check` sözdizimi kontrolü + paketi derleyip Playwright ile **37 arayüz testi** (masaüstü ve telefon) |
| `Veritabanı Kritik Testleri` (`db-tests.yml`) | `supabase/tests/critical_tests.sql`: canlı veritabanında tek işlem içinde geçici işletmelerle kritik akışlar (sipariş → mutfak → ödeme, stok, izolasyon, yetkiler); sonunda `ROLLBACK` |
| `Veritabanı Şemasını Kaydet` (`db-schema.yml`) | Canlı şemayı `supabase/schema.sql`'e döker |
| `CodeQL`, masaüstü ve Android derlemeleri | Güvenlik taraması ve kurulum dosyaları |

Veritabanı işleri `SUPABASE_DB_URL` secret'ına (Transaction pooler adresi)
ihtiyaç duyar.

Yerelde:

```bash
node scripts/build-bundle.js                         # paketi üret
NODE_PATH=$(npm root -g) node tests/ui/smoke.cjs     # arayüz testleri
```

## Yayın akışı

1. `bash scripts/bump-version.sh` — sürümü artırır (`app/version.json`,
   `sw.js`, `?vNNN` sorgu ekleri) ve paketi yerelde derler.
2. `node scripts/check-version-sync.js` ve `node scripts/check-inline-handlers.js`.
3. Arayüz testleri (37/37).
4. Değişiklik ana dala birleşince Vercel siteyi derleyip yayınlar; açık
   istemciler yeni sürümü algılayınca "Güncelle" çubuğu gösterir.
5. Veritabanı değişiklikleri Supabase'e migration olarak uygulanır ve
   `supabase/migrations/` altına not düşülür.

## Bilinen konular

- `pg_net` uzantısı `public` şemasında (linter uyarısı); taşımak cron ile
  giden SMS/e-posta/push akışlarını etkileyebileceği için ayrı bakım işidir.
- Platform admin girişinde 2FA / IP kısıtı yok.
- iyzico'ya gönderilen şehir bilgisi sabit.
- Stil politikasında (`style-src`) hâlâ `'unsafe-inline'` var; yönetim
  panelindeki satır içi `style=` kullanımları kaldırılınca kapatılabilir.
