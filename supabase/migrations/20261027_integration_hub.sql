-- Ortak entegrasyon altyapısı: ÖKC (yazar kasa) ve pazaryeri bağlantıları işletme başına, sırlar şifreli.
-- * tenant_connectors: işletmenin bağlantıları (sağlayıcı, test/canlı, ayarlar, şifreli sırlar, gelen istek anahtarı)
-- * integration_jobs: iş kuyruğu (satış → ÖKC fişi, bağlantı testi, pazaryeri durum bildirimi); 5 deneme, üstel bekleme
-- * Satış kaydı oluşunca etkin ÖKC bağlantılarına "sale" işi düşer; pg_cron her dakika /api/integration-worker'ı uyandırır.
-- * Pazaryeri siparişleri /api/marketplace-in ile gelir, onay bekleyen müşteri siparişi olarak düşer (aynı dış sipariş bir kez).
create table if not exists tenant_connectors (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  kind text not null check (kind in ('okc','marketplace')),
  provider text not null,
  enabled boolean not null default false,
  mode text not null default 'test' check (mode in ('test','live')),
  config jsonb not null default '{}',
  secret_enc text,
  inbound_key uuid not null default gen_random_uuid(),
  last_ok_at timestamptz, last_error text, updated_at timestamptz default now(),
  unique (restaurant_id, kind, provider));
alter table tenant_connectors enable row level security;

create table if not exists integration_jobs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  connector_id uuid not null references tenant_connectors(id) on delete cascade,
  event text not null,             -- sale | test | order_in | order_status
  ref_id uuid, payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending','processing','done','failed')),
  attempts int not null default 0, next_at timestamptz not null default now(),
  result jsonb, error text, created_at timestamptz default now(), done_at timestamptz);
create index if not exists integration_jobs_queue on integration_jobs(status, next_at);
create index if not exists integration_jobs_rest on integration_jobs(restaurant_id, created_at desc);
create index if not exists integration_jobs_conn on integration_jobs(connector_id);
alter table integration_jobs enable row level security;
alter table customer_order_requests add column if not exists source text, add column if not exists external_id text;
create unique index if not exists cor_external_uq on customer_order_requests(restaurant_id, source, external_id) where external_id is not null;

create or replace function list_connectors(p_token uuid)
returns json language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'settings_flags');
  return coalesce((select json_agg(json_build_object('id', c.id, 'kind', c.kind, 'provider', c.provider, 'enabled', c.enabled, 'mode', c.mode, 'config', c.config,
      'has_secret', c.secret_enc is not null, 'inbound_key', c.inbound_key, 'last_ok_at', c.last_ok_at, 'last_error', c.last_error,
      'pending', (select count(*) from integration_jobs j where j.connector_id = c.id and j.status in ('pending','processing')),
      'failed', (select count(*) from integration_jobs j where j.connector_id = c.id and j.status = 'failed'),
      'done_7d', (select count(*) from integration_jobs j where j.connector_id = c.id and j.status = 'done' and j.created_at > now() - interval '7 days'))
    order by c.kind, c.provider) from tenant_connectors c where c.restaurant_id = s.restaurant_id), '[]');
end $f$;

-- p_secrets: yalnızca girilen alanlar güncellenir (boş bırakılan sır korunur).
create or replace function save_connector(p_token uuid, p_kind text, p_provider text, p_enabled boolean, p_mode text, p_config jsonb, p_secrets jsonb default null)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare s staff_sessions%rowtype; v_id uuid; v_old jsonb; v_new jsonb;
begin
  s := _session_check(p_token, 'settings_flags');
  if p_kind not in ('okc','marketplace') or coalesce(p_provider,'') !~ '^[a-z0-9_]{2,30}$' then raise exception 'Geçersiz bağlantı'; end if;
  insert into tenant_connectors(restaurant_id, kind, provider) values (s.restaurant_id, p_kind, p_provider)
    on conflict (restaurant_id, kind, provider) do nothing;
  select id, coalesce(nullif(_dec(secret_enc),'')::jsonb, '{}') into v_id, v_old from tenant_connectors where restaurant_id = s.restaurant_id and kind = p_kind and provider = p_provider;
  select coalesce(jsonb_object_agg(k, v), '{}') into v_new from jsonb_each(coalesce(p_secrets,'{}')) e(k, v) where coalesce(v #>> '{}','') <> '';
  update tenant_connectors set enabled = coalesce(p_enabled,false), mode = case when p_mode = 'live' then 'live' else 'test' end,
    config = coalesce(p_config,'{}'), secret_enc = case when (v_old || v_new) = '{}'::jsonb then null else _enc((v_old || v_new)::text) end, updated_at = now()
    where id = v_id;
  return v_id;
end $f$;

create or replace function remove_connector(p_token uuid, p_id uuid)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'settings_flags');
  -- Kaldırma: bağlantı kapatılır, sırları ve ayarları temizlenir (iş geçmişi denetim için kalır).
  update tenant_connectors set enabled = false, secret_enc = null, config = '{}', last_error = null, updated_at = now() where id = p_id and restaurant_id = s.restaurant_id;
  return found;
end $f$;

create or replace function test_connector(p_token uuid, p_id uuid)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare s staff_sessions%rowtype; v uuid;
begin
  s := _session_check(p_token, 'settings_flags');
  if not exists(select 1 from tenant_connectors where id = p_id and restaurant_id = s.restaurant_id) then raise exception 'Bağlantı bulunamadı'; end if;
  insert into integration_jobs(restaurant_id, connector_id, event, payload) values (s.restaurant_id, p_id, 'test', '{}') returning id into v;
  return v;
end $f$;

create or replace function list_integration_jobs(p_token uuid, p_connector uuid default null, p_status text default null, p_limit int default 50)
returns json language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'settings_flags');
  return coalesce((select json_agg(x) from (select j.id, j.event, j.status, j.attempts, j.error, j.result, j.created_at, j.done_at, c.kind, c.provider,
      (j.payload->>'total')::numeric as total
    from integration_jobs j join tenant_connectors c on c.id = j.connector_id
    where j.restaurant_id = s.restaurant_id and (p_connector is null or j.connector_id = p_connector) and (p_status is null or j.status = p_status)
    order by j.created_at desc limit least(greatest(coalesce(p_limit,50),1),200)) x), '[]');
end $f$;

create or replace function retry_integration_job(p_token uuid, p_id uuid)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'settings_flags');
  update integration_jobs set status = 'pending', next_at = now(), error = null where id = p_id and restaurant_id = s.restaurant_id and status = 'failed';
  return found;
end $f$;

-- Satış kaydı oluşunca etkin ÖKC bağlantılarına "sale" işi düşer (fiş kalemleri + ödeme dağılımı).
create or replace function _trg_enqueue_okc_sale() returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare c record; v_items jsonb;
begin
  if coalesce(new.total,0) <= 0 then return new; end if;
  for c in select id from tenant_connectors where restaurant_id = new.restaurant_id and kind = 'okc' and enabled loop
    if v_items is null then
      select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty, 'price', i.price, 'vat', coalesce(i.vat_rate, 10))), '[]') into v_items
        from order_items i where i.order_id = new.order_id and i.paid and i.paid_at between new.closed_at - interval '5 seconds' and new.closed_at + interval '5 seconds';
    end if;
    insert into integration_jobs(restaurant_id, connector_id, event, ref_id, payload) values (new.restaurant_id, c.id, 'sale', new.id,
      jsonb_build_object('sale_id', new.id, 'table', new.table_name, 'total', new.total, 'subtotal', new.subtotal, 'discount', coalesce(new.discount_amount,0),
        'cash', coalesce(new.cash_amount,0), 'card', coalesce(new.card_amount,0), 'method', new.payment_method, 'closed_at', new.closed_at, 'items', v_items));
  end loop;
  return new;
end $f$;
create or replace trigger trg_enqueue_okc_sale after insert on sales_history for each row execute function _trg_enqueue_okc_sale();

-- İşçi (service_role): bekleyen işleri kilitleyip sırlarıyla birlikte alır.
create or replace function _claim_integration_jobs(p_limit int default 20)
returns json language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare v json; v_ids uuid[];
begin
  update integration_jobs set status = 'pending' where status = 'processing' and next_at < now() - interval '5 minutes';
  with picked as (
    select j.id from integration_jobs j where j.status = 'pending' and j.next_at <= now() order by j.next_at limit p_limit for update skip locked),
  upd as (update integration_jobs j set status = 'processing', attempts = j.attempts + 1, next_at = now() from picked where j.id = picked.id returning j.id)
  select array_agg(id) into v_ids from upd;
  select coalesce(json_agg(json_build_object('id', j.id, 'event', j.event, 'payload', j.payload, 'attempts', j.attempts, 'restaurant_id', j.restaurant_id,
      'connector', json_build_object('id', c.id, 'kind', c.kind, 'provider', c.provider, 'mode', c.mode, 'config', c.config,
        'secrets', coalesce(nullif(_dec(c.secret_enc),'')::json, '{}'::json)))), '[]') into v
    from integration_jobs j join tenant_connectors c on c.id = j.connector_id where j.id = any(coalesce(v_ids, '{}'));
  return v;
end $f$;

create or replace function _finish_integration_job(p_id uuid, p_ok boolean, p_result jsonb, p_error text, p_retry boolean default true)
returns void language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare j integration_jobs%rowtype;
begin
  select * into j from integration_jobs where id = p_id;
  if j.id is null then return; end if;
  if p_ok then
    update integration_jobs set status = 'done', result = p_result, error = null, done_at = now() where id = p_id;
    update tenant_connectors set last_ok_at = now(), last_error = null where id = j.connector_id;
  else
    update integration_jobs set status = case when p_retry and j.attempts < 5 then 'pending' else 'failed' end,
      next_at = now() + make_interval(mins => power(2, least(j.attempts, 6))::int), error = left(p_error, 500), result = p_result where id = p_id;
    update tenant_connectors set last_error = left(p_error, 300) where id = j.connector_id;
  end if;
end $f$;

-- Pazaryeri siparişi (adaptörün normalize ettiği biçim) → onay bekleyen müşteri siparişi; aynı dış sipariş iki kez düşmez.
create or replace function _ingest_marketplace_order(p_connector uuid, p_order jsonb)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare c tenant_connectors%rowtype; v uuid;
begin
  select * into c from tenant_connectors where id = p_connector and kind = 'marketplace' and enabled;
  if c.id is null then raise exception 'Bağlantı kapalı'; end if;
  insert into customer_order_requests(restaurant_id, customer_name, customer_phone, delivery_address, items, status, order_type, source, external_id, payment_status, paid_amount)
  values (c.restaurant_id, left(coalesce(p_order->>'customer_name','Pazaryeri müşterisi'), 120), left(p_order->>'customer_phone', 30), left(p_order->>'address', 400),
    coalesce(p_order->'items','[]'), 'pending', coalesce(nullif(p_order->>'order_type',''), 'delivery'), c.provider, left(p_order->>'external_id', 120),
    case when coalesce((p_order->>'paid')::boolean, false) then 'paid' else null end, nullif(p_order->>'total','')::numeric)
  on conflict (restaurant_id, source, external_id) where external_id is not null do nothing
  returning id into v;
  update tenant_connectors set last_ok_at = now() where id = c.id;
  return v;
end $f$;

create or replace function _connector_by_inbound(p_key uuid)
returns json language sql stable security definer set search_path to 'public','pg_temp' as $f$
  select json_build_object('id', id, 'kind', kind, 'provider', provider, 'mode', mode, 'enabled', enabled, 'config', config,
    'secrets', coalesce(nullif(_dec(secret_enc),'')::json, '{}'::json)) from tenant_connectors where inbound_key = p_key $f$;

create or replace function _cron_integration_worker() returns void language plpgsql security definer set search_path to 'public','extensions','pg_temp' as $f$
declare v_url text; v_secret text;
begin
  if not exists(select 1 from integration_jobs where status = 'pending' and next_at <= now()) then return; end if;
  select regexp_replace(value, '/api/.*$', '/api/integration-worker') into v_url from _psv where key = 'push_dispatch_url';
  select value into v_secret from _psv where key = 'push_dispatch_secret';
  if coalesce(v_url,'') = '' then return; end if;
  perform net.http_post(url := v_url, headers := jsonb_build_object('Content-Type','application/json','x-push-secret', coalesce(v_secret,'')), body := '{}'::jsonb);
end $f$;

revoke all on function list_connectors(uuid), save_connector(uuid,text,text,boolean,text,jsonb,jsonb), remove_connector(uuid,uuid), test_connector(uuid,uuid),
  list_integration_jobs(uuid,uuid,text,int), retry_integration_job(uuid,uuid) from public;
grant execute on function list_connectors(uuid), save_connector(uuid,text,text,boolean,text,jsonb,jsonb), remove_connector(uuid,uuid), test_connector(uuid,uuid),
  list_integration_jobs(uuid,uuid,text,int), retry_integration_job(uuid,uuid) to anon, authenticated;
revoke all on function _trg_enqueue_okc_sale(), _claim_integration_jobs(int), _finish_integration_job(uuid,boolean,jsonb,text,boolean), _ingest_marketplace_order(uuid,jsonb),
  _connector_by_inbound(uuid), _cron_integration_worker() from public, anon, authenticated;
grant execute on function _claim_integration_jobs(int), _finish_integration_job(uuid,boolean,jsonb,text,boolean), _ingest_marketplace_order(uuid,jsonb), _connector_by_inbound(uuid) to service_role;
select cron.schedule('integration-worker', '* * * * *', 'select _cron_integration_worker()');

-- ---- Düzeltmeler ----
-- Satış satırı kalemler "ödendi" işaretlenmeden önce yazılabildiği için fiş kalemleri iş alınırken (işçi anında) tamamlanır.
create or replace function _sale_receipt_items(p_sale uuid) returns jsonb language sql stable security definer set search_path to 'public','pg_temp' as $f$
  select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty, 'price', i.price, 'vat', coalesce(i.vat_rate, 10))), '[]')
  from sales_history h join order_items i on i.order_id = h.order_id
  where h.id = p_sale and i.paid and i.paid_at between h.closed_at - interval '5 seconds' and h.closed_at + interval '5 seconds' $f$;
revoke all on function _sale_receipt_items(uuid) from public, anon, authenticated;
create or replace function _claim_integration_jobs(p_limit int default 20)
returns json language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare v json; v_ids uuid[];
begin
  update integration_jobs set status = 'pending' where status = 'processing' and next_at < now() - interval '5 minutes';
  with picked as (
    select j.id from integration_jobs j where j.status = 'pending' and j.next_at <= now() order by j.next_at limit p_limit for update skip locked),
  upd as (update integration_jobs j set status = 'processing', attempts = j.attempts + 1, next_at = now() from picked where j.id = picked.id returning j.id)
  select array_agg(id) into v_ids from upd;
  update integration_jobs set payload = payload || jsonb_build_object('items', _sale_receipt_items(ref_id))
    where id = any(coalesce(v_ids, '{}')) and event = 'sale' and ref_id is not null and jsonb_array_length(coalesce(payload->'items','[]')) = 0;
  select coalesce(json_agg(json_build_object('id', j.id, 'event', j.event, 'payload', j.payload, 'attempts', j.attempts, 'restaurant_id', j.restaurant_id,
      'connector', json_build_object('id', c.id, 'kind', c.kind, 'provider', c.provider, 'mode', c.mode, 'config', c.config,
        'secrets', coalesce(nullif(_dec(c.secret_enc),'')::json, '{}'::json)))), '[]') into v
    from integration_jobs j join tenant_connectors c on c.id = j.connector_id where j.id = any(coalesce(v_ids, '{}'));
  return v;
end $f$;

-- Ödenmemiş siparişte payment_status 'unpaid' (sütun NOT NULL), paid_amount yalnızca ödenmişte.
create or replace function _ingest_marketplace_order(p_connector uuid, p_order jsonb)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare c tenant_connectors%rowtype; v uuid;
begin
  select * into c from tenant_connectors where id = p_connector and kind = 'marketplace' and enabled;
  if c.id is null then raise exception 'Bağlantı kapalı'; end if;
  insert into customer_order_requests(restaurant_id, customer_name, customer_phone, delivery_address, items, status, order_type, source, external_id, payment_status, paid_amount)
  values (c.restaurant_id, left(coalesce(p_order->>'customer_name','Pazaryeri müşterisi'), 120), left(p_order->>'customer_phone', 30), left(p_order->>'address', 400),
    coalesce(p_order->'items','[]'), 'pending', coalesce(nullif(p_order->>'order_type',''), 'delivery'), c.provider, left(p_order->>'external_id', 120),
    case when coalesce((p_order->>'paid')::boolean, false) then 'paid' else 'unpaid' end,
    case when coalesce((p_order->>'paid')::boolean, false) then nullif(p_order->>'total','')::numeric end)
  on conflict (restaurant_id, source, external_id) where external_id is not null do nothing
  returning id into v;
  update tenant_connectors set last_ok_at = now() where id = c.id;
  return v;
end $f$;
