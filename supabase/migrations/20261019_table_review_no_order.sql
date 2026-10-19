-- Masa QR değerlendirme bandı masada hiç sipariş yokken de görünür: reviews.table_id ile masaya bağlı
-- tek bir bekleyen değerlendirme (3 saat içinde tekrar kullanılır; değerlendirme yapıldıysa 3 saat sorulmaz).
-- get_table_review canlıya uygulandı; tam hali supabase/schema.sql dökümünde.
alter table reviews add column if not exists table_id uuid references restaurant_tables(id) on delete set null;
