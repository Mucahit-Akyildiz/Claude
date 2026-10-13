-- Hammaddeye fire oranı (waste_pct, %0-99).
-- Reçete miktarları (product_ingredients.qty_per_unit) BRÜT saklanır: tüm stok
-- düşme/kontrol fonksiyonları değişmeden fireyi de hesaba katar.
-- * set_recipe / set_ingredient_usage: girilen net miktar / (1 - fire/100) olarak kaydedilir.
-- * get_restaurant_config: recipe.qty_per_unit net döner (+ gross_qty, waste_pct); ingredients.waste_pct.
-- * upsert_ingredient(..., p_waste_pct): fire değişince bağlı reçeteler
--   qty * (1-eski/100) / (1-yeni/100) ile yeniden ölçeklenir (net miktar korunur).
alter table ingredients add column if not exists waste_pct numeric not null default 0;
alter table ingredients add constraint ingredients_waste_pct_chk check (waste_pct >= 0 and waste_pct < 100);
-- Fonksiyon gövdeleri canlı veritabanına uygulandı (bkz. supabase/schema.sql dökümü).
