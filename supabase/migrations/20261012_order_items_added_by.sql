-- Hangi garson hangi ürünü ekledi: order_items.added_by.
-- _session_check oturumdaki kullanıcıyı işlem süresince 'peyk.uid' ayarına yazar;
-- tetikleyici yeni ürün satırına bunu işler (tüm sipariş gönderme RPC'leri kapsanır).
alter table order_items add column if not exists added_by uuid;

create or replace function _order_items_set_added_by() returns trigger language plpgsql as $$
begin
  if new.added_by is null then new.added_by := nullif(current_setting('peyk.uid', true), '')::uuid; end if;
  return new;
end $$;
create trigger trg_order_items_added_by before insert on order_items for each row execute function _order_items_set_added_by();
revoke execute on function _order_items_set_added_by() from public, anon, authenticated;

-- Ayrıca (canlıda uygulandı, şema dökümüne yansır):
--  * _session_check: perform set_config('peyk.uid', s.user_id::text, true);
--  * pay_order_items: kısmi ödemede bölünen satıra added_by kopyalanır.
--  * get_live_orders: ürünlerde added_by / added_by_name, siparişte created_by_name.
--  * get_sales_history: waiters (ödenen ürünleri ekleyen garsonlar).
--  * get_sale_detail: waiters.
