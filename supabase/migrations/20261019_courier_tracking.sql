-- Kurye takibi: paket (teslimat) siparişi kuryeye verilir, müşteri /takip/?t=TOKEN ile izler.
alter table public.orders add column if not exists courier_user_id uuid, add column if not exists dispatched_at timestamptz,
  add column if not exists delivered_at timestamptz, add column if not exists tracking_token uuid;
create unique index if not exists orders_tracking_token_uq on public.orders(tracking_token) where tracking_token is not null;
-- dispatch_order(p_token, p_order_id, p_courier, p_send_sms): 'packages' izni; tracking_token üretir, isteğe bağlı SMS (_send_sms).
-- mark_order_delivered(p_token, p_order_id, p_undo): teslim edildi / geri al.
-- get_public_tracking(p_tracking): herkese açık; son 2 günün siparişi; durum preparing/ready/on_the_way/delivered, kurye adının ilk kelimesi.
-- get_live_orders: courier_user_id, courier_name, dispatched_at, delivered_at, tracking_token alanları eklendi.
