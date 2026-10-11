-- Çevrimdışı mod: cihazda kuyruğa alınan siparişlerin tek seferlik gönderimi.
-- Bağlantı gönderim sırasında koparsa istemci aynı siparişi (aynı client_id ile) tekrar
-- gönderir; offline_order_claims sayesinde ikinci gönderim işlenmez ('duplicate').
-- İç fonksiyon hata verirse (oturum, stok vb.) kayıt da geri alınır, sipariş tekrar denenebilir.
create table if not exists public.offline_order_claims(
  client_id text primary key check (length(client_id) between 8 and 80),
  kind text not null,
  created_at timestamptz not null default now()
);
alter table public.offline_order_claims enable row level security;
revoke all on public.offline_order_claims from anon, authenticated;

create or replace function public.submit_offline_order(p_token uuid, p_client_id text, p_kind text, p_args jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_tags text[];
begin
  if p_client_id is null or length(p_client_id) < 8 or length(p_client_id) > 80 then raise exception 'Geçersiz istemci kimliği'; end if;
  insert into offline_order_claims(client_id, kind) values (p_client_id, p_kind) on conflict (client_id) do nothing;
  if not found then return 'duplicate'; end if;
  v_tags := coalesce(array(select jsonb_array_elements_text(coalesce(p_args->'p_tags','[]'::jsonb))), '{}');
  if p_kind = 'table' then
    perform send_order(p_token, (p_args->>'p_table_id')::uuid, (p_args->'p_items')::json, v_tags);
  elsif p_kind = 'takeaway' then
    perform send_takeaway_order(p_token, (p_args->'p_items')::json, nullif(p_args->>'p_order_id','')::uuid, p_args->>'p_customer_name', p_args->>'p_customer_phone', p_args->>'p_note', v_tags);
  elsif p_kind = 'waitlist' then
    perform send_waitlist_order(p_token, (p_args->>'p_waitlist_id')::uuid, (p_args->'p_items')::json, v_tags);
  else
    raise exception 'Geçersiz sipariş türü';
  end if;
  return 'ok';
end $$;
revoke all on function public.submit_offline_order(uuid,text,text,jsonb) from public;
grant execute on function public.submit_offline_order(uuid,text,text,jsonb) to anon, authenticated;

-- 2. aşama: çevrimdışı sepete eklenen ürünlerin stoğu ('reserve') gönderimde düşülür;
-- çevrimdışıyken iade edilemeyen sepet stoğu 'stock' türüyle geri eklenir.
create or replace function public.submit_offline_order(p_token uuid, p_client_id text, p_kind text, p_args jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_tags text[]; it jsonb; v_res int;
begin
  if p_client_id is null or length(p_client_id) < 8 or length(p_client_id) > 80 then raise exception 'Geçersiz istemci kimliği'; end if;
  insert into offline_order_claims(client_id, kind) values (p_client_id, p_kind) on conflict (client_id) do nothing;
  if not found then return 'duplicate'; end if;
  if p_kind = 'stock' then
    perform adjust_stock(p_token, (p_args->>'p_product_id')::uuid, (p_args->>'p_delta')::int);
    return 'ok';
  end if;
  for it in select * from jsonb_array_elements(coalesce(p_args->'p_items','[]'::jsonb)) loop
    v_res := coalesce(nullif(it->>'reserve','')::int, 0);
    if v_res > 0 then perform adjust_stock(p_token, (it->>'product_id')::uuid, -v_res); end if;
  end loop;
  v_tags := coalesce(array(select jsonb_array_elements_text(coalesce(p_args->'p_tags','[]'::jsonb))), '{}');
  if p_kind = 'table' then
    perform send_order(p_token, (p_args->>'p_table_id')::uuid, (p_args->'p_items')::json, v_tags);
  elsif p_kind = 'takeaway' then
    perform send_takeaway_order(p_token, (p_args->'p_items')::json, nullif(p_args->>'p_order_id','')::uuid, p_args->>'p_customer_name', p_args->>'p_customer_phone', p_args->>'p_note', v_tags);
  elsif p_kind = 'waitlist' then
    perform send_waitlist_order(p_token, (p_args->>'p_waitlist_id')::uuid, (p_args->'p_items')::json, v_tags);
  else
    raise exception 'Geçersiz sipariş türü';
  end if;
  return 'ok';
end $$;
