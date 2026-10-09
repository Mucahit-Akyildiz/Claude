-- Masaya oturtulmuş (açık dine_in sipariş) ama hiç ürün girilmemiş masalar için 5. ve 15. dakikada
-- sipariş alma iznine sahip personele bildirim (api/dispatch-ready-pushes.js mode='idle_tables').
alter table orders add column if not exists idle_stage smallint not null default 0;
create or replace function public._cron_idle_tables() returns void language plpgsql security definer set search_path to 'public','extensions','pg_temp' as $f$
declare v_url text; v_secret text; v_ids uuid[];
begin
  with due as (
    select o.id, case when o.created_at < now() - interval '15 minutes' then 2 else 1 end stage
    from orders o
    where o.status = 'open' and o.kind = 'dine_in' and o.table_id is not null
      and o.created_at < now() - interval '5 minutes' and o.created_at > now() - interval '3 hours'
      and o.idle_stage < case when o.created_at < now() - interval '15 minutes' then 2 else 1 end
      and not exists (select 1 from order_items oi where oi.order_id = o.id)
  ), upd as (
    update orders o set idle_stage = d.stage from due d where o.id = d.id returning o.id
  )
  select array_agg(id) into v_ids from upd;
  if v_ids is null then return; end if;
  select value into v_url from platform_settings where key = 'push_dispatch_url';
  select value into v_secret from platform_settings where key = 'push_dispatch_secret';
  if coalesce(v_url,'') = '' then return; end if;
  perform net.http_post(url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret', coalesce(v_secret,'')),
    body := jsonb_build_object('mode', 'idle_tables', 'order_ids', to_jsonb(v_ids)), timeout_milliseconds := 25000);
end $f$;
revoke execute on function public._cron_idle_tables() from public, anon, authenticated;
select cron.schedule('idle_tables_1m', '* * * * *', 'select public._cron_idle_tables()');
