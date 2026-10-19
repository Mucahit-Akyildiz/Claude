-- Masa QR değerlendirme bandı ödeme öncesinde de görünsün: açık hesaba bağlı değerlendirme
-- (reviews.order_id); hesap ödenince aynı kayıt sales_history'ye bağlanır (_link_order_review).
-- Fonksiyon gövdeleri canlı veritabanına uygulandı; tam hâli için bkz. supabase/schema.sql dökümü.
alter table reviews add column if not exists order_id uuid references orders(id) on delete set null;
create unique index if not exists reviews_order_id_key on reviews(order_id);
