-- "Sipariş hazır" bildirimi masa başına tek: ürünler tek tek hazır işaretlense de, siparişin bekleyen ürünü
-- kalmayınca o siparişin hazır (ödenmemiş) tüm ürünleriyle bir kez gönderilir.
create or replace function public._items_ready_push_trg()
 returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_url text; v_secret text; r record;
begin
  select value into v_url from _psv where key = 'push_dispatch_url';
  select value into v_secret from _psv where key = 'push_dispatch_secret';
  if coalesce(v_url,'') = '' then return null; end if;
  for r in select x.order_id, (select array_agg(i.id) from order_items i where i.order_id = x.order_id and i.status = 'ready' and not i.paid) ids
           from (select distinct n.order_id from nt n join ot o on o.id = n.id where n.status = 'ready' and o.status is distinct from 'ready' and not n.paid) x
           where not exists (select 1 from order_items p where p.order_id = x.order_id and p.status = 'pending' and not p.paid) loop
    begin
      perform net.http_post(url := v_url, headers := jsonb_build_object('Content-Type','application/json','x-push-secret', coalesce(v_secret,'')),
        body := jsonb_build_object('mode','items_ready','order_id', r.order_id, 'item_ids', to_jsonb(r.ids)));
    exception when others then null;
    end;
  end loop;
  return null;
end $function$;
