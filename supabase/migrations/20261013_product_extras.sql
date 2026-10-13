-- Ürün ekstraları: products.parent_id (ana ürüne bağlı gizli ürün). upsert_product_extra RPC;
-- _sync_menus ekstraların istasyonunu ana ürüne eşitler; herkese açık menüler ve medya listesi
-- ekstraları göstermez; get_restaurant_config parent_id döner (istemci products/extras ayırır).
-- Canlı veritabanına uygulandı.
alter table products add column if not exists parent_id uuid references products(id) on delete cascade;
