-- Online sipariş: menü fotoğraflarıyla birlikte her 5 sn'de tamamen indiriliyordu (çok ağır,
-- stok geç güncelleniyordu). Stok için sadece {ürün id: kalan} döndüren hafif uç.
create or replace function public.get_public_order_stock(p_restaurant_code text)
returns json language plpgsql stable security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
declare v_restaurant restaurants%rowtype;
begin
  select * into v_restaurant from restaurants where code = p_restaurant_code;
  if v_restaurant.id is null or not coalesce(v_restaurant.is_active, false) or not coalesce(v_restaurant.online_ordering_enabled, false) then
    return null;
  end if;
  return (select coalesce(json_object_agg(p.id, _product_public_qty(p.id)), '{}'::json)
    from products p where p.restaurant_id = v_restaurant.id and p.available = true);
end; $function$;

-- Sadakat: online siparişte müşteri telefonu "0555 555 55 55" / "+90..." gibi farklı yazınca
-- kayıtlı müşteri bulunamıyor, puan işlenmiyordu. Son 10 hane ile eşleştirilir.
create or replace function public._phone_key(p text)
returns text language sql immutable set search_path to 'pg_temp' as $$
  select nullif(right(regexp_replace(coalesce(p,''), '\D', '', 'g'), 10), '')
$$;

create or replace function public.get_customer_by_phone(p_token uuid, p_phone text)
returns json language plpgsql security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'payments');
  return (
    select row_to_json(c) from (
      select cu.id, cu.name, cu.phone, cu.points_balance, cu.total_visits, cu.total_spent, cu.birthday,
        coalesce(cu.spend_per_point, r.loyalty_spend_per_point) as spend_per_point,
        coalesce(cu.point_value, r.loyalty_point_value) as point_value,
        coalesce(cu.birthday_discount_percent, r.birthday_discount_percent) as birthday_discount_percent,
        (cu.spend_per_point is not null or cu.point_value is not null or cu.birthday_discount_percent is not null) as custom_loyalty,
        (cu.birthday is not null
          and extract(month from cu.birthday) = extract(month from (now() at time zone 'Europe/Istanbul'))
          and extract(day from cu.birthday) = extract(day from (now() at time zone 'Europe/Istanbul'))
        ) as is_birthday_today
      from customers cu join restaurants r on r.id = cu.restaurant_id
      where cu.restaurant_id = s.restaurant_id
        and (cu.phone = p_phone or (length(_phone_key(p_phone)) = 10 and _phone_key(cu.phone) = _phone_key(p_phone)))
      order by (cu.phone = p_phone) desc, cu.last_visit_at desc nulls last
      limit 1
    ) c
  );
end; $function$;
