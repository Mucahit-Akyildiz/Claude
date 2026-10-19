-- Ödeme ekranı: telefonu olmayan kayıtlı müşteri listeden seçilince id ile getirilir.
create or replace function public.get_customer_by_id(p_token uuid, p_id uuid)
 returns json language plpgsql security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
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
      where cu.restaurant_id = s.restaurant_id and cu.id = p_id
    ) c
  );
end; $function$;
revoke all on function public.get_customer_by_id(uuid, uuid) from public;
grant execute on function public.get_customer_by_id(uuid, uuid) to anon, authenticated;
