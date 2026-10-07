-- Aynı masada aynı anda iki açık sipariş oluşabiliyordu: açık sipariş kontrolü
-- restoran kilidinden ÖNCE yapıldığı için eşzamanlı iki istek (ör. müşteri adı
-- kaydı + sipariş gönderme) ikisi de "yok" görüp ayrı sipariş açıyordu. Ürünlü
-- olan ödenip kapanınca boş olan masada "dolu" olarak asılı kalıyor, mutfak ve
-- ödemelerde görünmüyordu. Düzeltme: kilit kontrolden önce alınır + tekil indeks.
do $t$
declare f text; d text;
begin
  foreach f in array array['send_order','set_table_customer','seat_reservation','seat_waitlist_entry','approve_customer_order_request'] loop
    select pg_get_functiondef(oid) into d from pg_proc where pronamespace='public'::regnamespace and proname=f;
    if d like '%iki açık sipariş oluşmasın%' then continue; end if;
    d := regexp_replace(d, '(s := _session_check\([^;]*\);)', E'\\1\n  -- Masada aynı anda iki açık sipariş oluşmasın: kontrol kilitten sonra yapılır.\n  perform 1 from restaurants where id = s.restaurant_id for update;');
    execute d;
  end loop;
end $t$;

create unique index if not exists orders_one_open_per_table on orders(table_id) where status = 'open' and table_id is not null;
