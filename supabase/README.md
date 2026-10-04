# Veritabanı

- `schema.sql` — canlı Supabase veritabanının yapısı (tablolar, fonksiyonlar,
  tetikleyiciler). Elle düzenlenmez; `.github/workflows/db-schema.yml` her
  birleştirmede ve 6 saatte bir yeniden döker, değiştiyse commit eder.
- `tests/critical_tests.sql` — ödeme, sipariş, stok, giriş/OTP, vardiya ve
  işletmeler arası izolasyon senaryoları. Canlı veritabanında tek bir işlem
  içinde çalışır ve sonunda geri alınır (ROLLBACK); veri değişmez.
  `.github/workflows/db-tests.yml` her PR'da, birleştirmede ve her gece çalıştırır.

Her iki iş akışı da GitHub'da `SUPABASE_DB_URL` secret'ini ister
(Supabase > Project Settings > Database > Connection string > Session pooler).

Yerelde çalıştırmak için:

    psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/critical_tests.sql
