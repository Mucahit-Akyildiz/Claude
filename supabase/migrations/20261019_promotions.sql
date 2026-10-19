-- Kampanya ve kupon: 'coupon' (kodla) ve 'auto' (gün/saat aralığında otomatik önerilen, örn. happy hour).
create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  kind text not null default 'coupon' check (kind in ('coupon','auto')),
  code text,
  disc_type text not null default 'percent' check (disc_type in ('percent','amount')),
  disc_value numeric not null check (disc_value > 0),
  min_total numeric not null default 0,
  starts_on date, ends_on date,
  days int[],
  hour_from time, hour_to time,
  max_uses int, used_count int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists promotions_code_uq on public.promotions(restaurant_id, upper(code)) where code is not null;
alter table public.promotions enable row level security;
create table if not exists public.promotion_uses (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  sales_history_id uuid,
  amount numeric not null default 0,
  user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists promotion_uses_promo on public.promotion_uses(promotion_id);
alter table public.promotion_uses enable row level security;

-- Şu an geçerli mi (tarih, gün, saat, aktiflik, kullanım limiti).
create or replace function public._promo_valid_now(p public.promotions)
 returns boolean language sql stable set search_path to 'public','pg_temp'
as $f$
  select p.active
    and (p.max_uses is null or p.used_count < p.max_uses)
    and (p.starts_on is null or (now() at time zone 'Europe/Istanbul')::date >= p.starts_on)
    and (p.ends_on is null or (now() at time zone 'Europe/Istanbul')::date <= p.ends_on)
    and (p.days is null or cardinality(p.days) = 0 or extract(isodow from now() at time zone 'Europe/Istanbul')::int = any(p.days))
    and (p.hour_from is null or p.hour_to is null or
         case when p.hour_from <= p.hour_to then (now() at time zone 'Europe/Istanbul')::time between p.hour_from and p.hour_to
              else (now() at time zone 'Europe/Istanbul')::time >= p.hour_from or (now() at time zone 'Europe/Istanbul')::time <= p.hour_to end)
$f$;
revoke all on function public._promo_valid_now(public.promotions) from public, anon, authenticated;

create or replace function public.list_promotions(p_token uuid)
 returns json language plpgsql security definer set search_path to 'public','extensions','pg_temp'
as $f$ declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'crm');
  return coalesce((select json_agg(row_to_json(x) order by x.active desc, x.created_at desc) from (
    select p.*, _promo_valid_now(p) as valid_now,
      (select coalesce(sum(amount),0) from promotion_uses u where u.promotion_id = p.id) as total_discount
    from promotions p where p.restaurant_id = s.restaurant_id) x), '[]'::json);
end $f$;

create or replace function public.upsert_promotion(p_token uuid, p_data jsonb)
 returns uuid language plpgsql security definer set search_path to 'public','extensions','pg_temp'
as $f$ declare s staff_sessions%rowtype; v uuid := nullif(p_data->>'id','')::uuid; k text := coalesce(p_data->>'kind','coupon'); c text := nullif(upper(trim(p_data->>'code')),'');
begin
  s := _session_check(p_token, 'crm');
  if coalesce(trim(p_data->>'name'),'') = '' then raise exception 'Kampanya adı gerekli'; end if;
  if k = 'coupon' and c is null then raise exception 'Kupon kodu gerekli'; end if;
  if coalesce((p_data->>'disc_value')::numeric,0) <= 0 then raise exception 'İndirim değeri 0''dan büyük olmalı'; end if;
  if p_data->>'disc_type' = 'percent' and (p_data->>'disc_value')::numeric > 100 then raise exception 'Yüzde 100''den büyük olamaz'; end if;
  if c is not null and exists(select 1 from promotions where restaurant_id = s.restaurant_id and upper(code) = c and id is distinct from v) then raise exception 'Bu kupon kodu zaten var'; end if;
  if v is null then
    insert into promotions(restaurant_id, name, kind, code, disc_type, disc_value, min_total, starts_on, ends_on, days, hour_from, hour_to, max_uses, active)
    values (s.restaurant_id, trim(p_data->>'name'), k, case when k='coupon' then c end, coalesce(p_data->>'disc_type','percent'), (p_data->>'disc_value')::numeric,
      coalesce(nullif(p_data->>'min_total','')::numeric,0), nullif(p_data->>'starts_on','')::date, nullif(p_data->>'ends_on','')::date,
      (select array_agg(x::int) from jsonb_array_elements_text(coalesce(p_data->'days','[]'::jsonb)) x), nullif(p_data->>'hour_from','')::time, nullif(p_data->>'hour_to','')::time,
      nullif(p_data->>'max_uses','')::int, coalesce((p_data->>'active')::boolean, true))
    returning id into v;
  else
    update promotions set name = trim(p_data->>'name'), kind = k, code = case when k='coupon' then c end, disc_type = coalesce(p_data->>'disc_type','percent'),
      disc_value = (p_data->>'disc_value')::numeric, min_total = coalesce(nullif(p_data->>'min_total','')::numeric,0),
      starts_on = nullif(p_data->>'starts_on','')::date, ends_on = nullif(p_data->>'ends_on','')::date,
      days = (select array_agg(x::int) from jsonb_array_elements_text(coalesce(p_data->'days','[]'::jsonb)) x),
      hour_from = nullif(p_data->>'hour_from','')::time, hour_to = nullif(p_data->>'hour_to','')::time,
      max_uses = nullif(p_data->>'max_uses','')::int, active = coalesce((p_data->>'active')::boolean, active)
    where id = v and restaurant_id = s.restaurant_id;
  end if;
  return v;
end $f$;

create or replace function public.delete_promotion(p_token uuid, p_id uuid)
 returns void language plpgsql security definer set search_path to 'public','extensions','pg_temp'
as $f$ declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'crm');
  delete from promotions where id = p_id and restaurant_id = s.restaurant_id;
end $f$;

-- Ödeme ekranı: kupon kodunu doğrular.
create or replace function public.check_coupon(p_token uuid, p_code text, p_subtotal numeric)
 returns json language plpgsql security definer set search_path to 'public','extensions','pg_temp'
as $f$ declare s staff_sessions%rowtype; p promotions%rowtype;
begin
  s := _session_check(p_token, 'payments');
  select * into p from promotions where restaurant_id = s.restaurant_id and upper(code) = upper(trim(p_code)) and kind = 'coupon';
  if not found then raise exception 'Kupon bulunamadı'; end if;
  if not p.active then raise exception 'Bu kupon pasif'; end if;
  if p.max_uses is not null and p.used_count >= p.max_uses then raise exception 'Kupon kullanım limiti doldu'; end if;
  if not _promo_valid_now(p) then raise exception 'Kupon şu an geçerli değil (tarih/gün/saat)'; end if;
  if coalesce(p_subtotal,0) < p.min_total then raise exception 'Bu kupon için en az % TL harcama gerekli', p.min_total; end if;
  return json_build_object('id', p.id, 'name', p.name, 'code', p.code, 'disc_type', p.disc_type, 'disc_value', p.disc_value, 'min_total', p.min_total);
end $f$;

-- Ödeme ekranı: şu an geçerli otomatik kampanyalar (öneri olarak gösterilir).
create or replace function public.list_active_promotions(p_token uuid)
 returns json language plpgsql security definer set search_path to 'public','extensions','pg_temp'
as $f$ declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'payments');
  return coalesce((select json_agg(json_build_object('id', p.id, 'name', p.name, 'disc_type', p.disc_type, 'disc_value', p.disc_value, 'min_total', p.min_total))
    from promotions p where p.restaurant_id = s.restaurant_id and p.kind = 'auto' and _promo_valid_now(p)), '[]'::json);
end $f$;

-- Ödeme tamamlanınca kullanım kaydedilir.
create or replace function public.redeem_promotion(p_token uuid, p_id uuid, p_history_id uuid, p_amount numeric)
 returns void language plpgsql security definer set search_path to 'public','extensions','pg_temp'
as $f$ declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'payments');
  update promotions set used_count = used_count + 1 where id = p_id and restaurant_id = s.restaurant_id;
  if not found then return; end if;
  insert into promotion_uses(promotion_id, restaurant_id, sales_history_id, amount, user_id) values (p_id, s.restaurant_id, p_history_id, coalesce(p_amount,0), s.user_id);
end $f$;

do $$ declare f text; begin
  foreach f in array array['list_promotions(uuid)','upsert_promotion(uuid,jsonb)','delete_promotion(uuid,uuid)','check_coupon(uuid,text,numeric)','list_active_promotions(uuid)','redeem_promotion(uuid,uuid,uuid,numeric)'] loop
    execute 'revoke all on function public.' || f || ' from public';
    execute 'grant execute on function public.' || f || ' to anon, authenticated';
  end loop;
end $$;
