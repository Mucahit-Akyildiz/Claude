-- Ürün bazında istasyon: products.station_override. Menüye bağlı ürünün istasyonu elle
-- değiştirilince true olur; _sync_menus bu ürünleri menünün istasyonuyla ezmez. Menünün
-- istasyonu tekrar seçilince override kalkar. _sync_menus ayrıca istasyonsuz menünün
-- ürünlerini istasyonsuz yapar (eskiden önceki istasyonda kalıyordu). upsert_product
-- istasyonsuz (null) ürün kaydetmeye izin verir. Canlı veritabanına uygulandı.
alter table products add column if not exists station_override boolean not null default false;
