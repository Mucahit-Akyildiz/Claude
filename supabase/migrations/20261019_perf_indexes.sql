-- Performans: sık kullanılan sorgular için kısmi/bileşik indeksler ve indekssiz yabancı anahtarlar.
create index if not exists orders_open_by_rest on public.orders(restaurant_id) where status = 'open';
create index if not exists sales_history_rest_closed on public.sales_history(restaurant_id, closed_at desc);
create index if not exists order_items_pending_order on public.order_items(order_id) where status = 'pending';
create index if not exists reservations_rest_time on public.reservations(restaurant_id, reservation_time) where status in ('pending','confirmed');
create index if not exists cor_pending_rest on public.customer_order_requests(restaurant_id) where status = 'pending';
create index if not exists cash_counts_user_idx on public.cash_counts(user_id);
create index if not exists promotion_uses_rest_idx on public.promotion_uses(restaurant_id);
create index if not exists promotion_uses_user_idx on public.promotion_uses(user_id);
create index if not exists support_access_log_rest_idx on public.support_access_log(restaurant_id);
