-- KDV: fiyatlar KDV dahildir. Ürün oranı boşsa işletmenin varsayılan oranı (%10) kullanılır.
-- Sipariş kalemine oran eklendiği anda yazılır (sonradan oran değişse de geçmiş satış değişmez);
-- bu özellikten önceki kalemlerde oran boştur ve raporda işletmenin varsayılan oranı sayılır.
alter table restaurants add column if not exists default_vat_rate numeric not null default 10 check (default_vat_rate between 0 and 100);
alter table products add column if not exists vat_rate numeric check (vat_rate is null or vat_rate between 0 and 100);
alter table order_items add column if not exists vat_rate numeric;

create or replace function public._order_item_vat() returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $f$
begin
  if new.vat_rate is null then
    select coalesce(p.vat_rate, r.default_vat_rate, 10) into new.vat_rate
      from orders o join restaurants r on r.id = o.restaurant_id
      left join products p on p.id = new.product_id
      where o.id = new.order_id;
    new.vat_rate := coalesce(new.vat_rate, 10);
  end if;
  return new;
end $f$;
revoke execute on function public._order_item_vat() from public, anon, authenticated;
create trigger trg_order_item_vat before insert on order_items for each row execute function _order_item_vat();

-- get_vat_report(p_token, p_from, p_to): oran bazında KDV dahil tutar / matrah / KDV (indirim orantılı, bahşiş hariç)
-- update_vat_settings(p_token, p_default_rate), set_product_vat(p_token, p_product_id, p_rate)
-- get_restaurant_config: 'default_vat_rate' ve ürünlerde 'vat_rate' alanları eklendi.
-- (Fonksiyon gövdeleri canlıda; supabase/schema.sql otomatik dökümünde yer alır.)
