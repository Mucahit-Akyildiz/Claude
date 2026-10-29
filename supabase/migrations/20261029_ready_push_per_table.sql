-- "Sipariş hazır" bildirimi masa başına tek ve yalnız yeni hazır olanlar: ürünler tek tek hazır işaretlense de,
-- siparişin bekleyen ürünü kalmayınca henüz bildirilmemiş hazır ürünlerle bir kez gönderilir (ready_notified_at).
alter table order_items add column if not exists ready_notified_at timestamptz;
create or replace function public._items_ready_push_trg()
 returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_url text; v_secret text; r record;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  select value into v_url from _psv where key = 'push_dispatch_url';
  select value into v_secret from _psv where key = 'push_dispatch_secret';
  if coalesce(v_url,'') = '' then return null; end if;
  for r in select x.order_id, (select array_agg(i.id) from order_items i where i.order_id = x.order_id and i.status = 'ready' and not i.paid and i.ready_notified_at is null) ids
           from (select distinct n.order_id from nt n join ot o on o.id = n.id where n.status = 'ready' and o.status is distinct from 'ready' and not n.paid) x
           where not exists (select 1 from order_items p where p.order_id = x.order_id and p.status = 'pending' and not p.paid) loop
    if r.ids is null then continue; end if;
    update order_items set ready_notified_at = now() where id = any(r.ids);
    begin
      perform net.http_post(url := v_url, headers := jsonb_build_object('Content-Type','application/json','x-push-secret', coalesce(v_secret,'')),
        body := jsonb_build_object('mode','items_ready','order_id', r.order_id, 'item_ids', to_jsonb(r.ids)));
    exception when others then null;
    end;
  end loop;
  return null;
end $function$;
