-- Açık hesap hareketlerinden sipariş detayına geçiş: rapora sales_history_id,
-- hesap hareketleri penceresi için tüm zamanlar uç noktası.
do $t$ declare d text; begin
  d := pg_get_functiondef('get_open_accounts_report(uuid,date,date)'::regprocedure);
  if d not like '%e.sales_history_id%' then
    d := replace(d, 'select e.id, e.account_id, a.name account_name, e.kind,', 'select e.id, e.account_id, a.name account_name, e.sales_history_id, e.kind,');
    execute d;
  end if;
end $t$;
create or replace function public.get_open_account_entries(p_token uuid, p_account_id uuid)
returns json language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'reports');
  return (select coalesce(json_agg(row_to_json(y) order by y.created_at desc), '[]'::json) from (
    select e.id, e.kind, e.amount, e.method, e.table_name, e.note, e.created_at, e.sales_history_id, u.username staff,
      (select coalesce(sum(oi.qty), 0) from order_items oi where oi.order_id = e.order_id) item_count
    from open_account_entries e left join app_users u on u.id = e.created_by
    where e.restaurant_id = s.restaurant_id and e.account_id = p_account_id
    order by e.created_at desc limit 300) y);
end; $function$;
