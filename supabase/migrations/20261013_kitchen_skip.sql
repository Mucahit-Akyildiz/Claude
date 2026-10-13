-- products.kitchen_skip: istasyona (mutfak ekranı + fiş) düşmeyecek ürün. order_items BEFORE INSERT
-- tetikleyicisi (_order_item_kitchen_skip) bu ürünleri doğrudan 'ready' yapar. set_product_kitchen
-- RPC'si (settings_stations / settings_products); get_restaurant_config products.kitchen_skip döner.
-- Canlı veritabanına uygulandı.
alter table products add column if not exists kitchen_skip boolean not null default false;
-- Güncelleme: paket (orders.kind = 'takeaway') siparişler kitchen_skip ayarından etkilenmez.
-- reset_restaurant_data: yeni kategoriler messages / waiter_calls / audit / customers (canlıya uygulandı).
