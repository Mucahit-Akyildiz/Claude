-- Kayıtlı müşteri önerisi Rezervasyon ve Bekleme Listesi ekranlarında da: rezervasyon /
-- paket izniyle de çalışır ve e-postayı da döndürür.
create or replace function public.search_customers_quick(p_token uuid, p_search text)
returns json language plpgsql security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token);
  if not (_user_has_perm(s.user_id, 'order') or _user_has_perm(s.user_id, 'packages') or _user_has_perm(s.user_id, 'reservations')) then
    raise exception 'Bu işlem için yetkiniz yok';
  end if;
  if length(coalesce(trim(p_search),'')) < 2 then return '[]'::json; end if;
  return (select coalesce(json_agg(row_to_json(c)), '[]'::json) from (
    select cu.id, cu.name, cu.phone, cu.email from customers cu
    where cu.restaurant_id = s.restaurant_id and (cu.name ilike '%'||trim(p_search)||'%' or cu.phone ilike '%'||trim(p_search)||'%')
    order by cu.last_visit_at desc nulls last, cu.name limit 8) c);
end; $function$;
