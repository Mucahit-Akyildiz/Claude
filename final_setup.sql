-- ============================================================
-- TEMEL TABLOLAR
-- NOT: Bu bölüm sonradan (canlı Supabase veritabanı şemasından birebir
-- geri üretilerek) eklendi - orijinal CREATE TABLE dosyası kaybolmuştu.
-- Kolonlar, varsayılanlar ve silme kuralları (CASCADE/NO ACTION) mevcut
-- veritabanıyla eşleşecek şekilde doğrulandı.
-- ============================================================

create table if not exists restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  package_id text not null default 'paket1',
  is_active boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  code text unique,
  max_users int not null default 3,
  email text,
  phone text
);

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  username text not null,
  password text not null,
  role text not null check (role = any (array['waiter'::text, 'kitchen'::text, 'manager'::text])),
  created_at timestamptz not null default now()
);

create table if not exists stations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  color text default '#8b93a3'
);

create table if not exists zones (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null
);

create table if not exists restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  zone_id uuid not null references zones(id) on delete cascade,
  name text not null
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  station_id uuid references stations(id),
  name text not null,
  price numeric not null default 0,
  cost numeric not null default 0,
  stock int,
  available boolean not null default true
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  table_id uuid references restaurant_tables(id),
  kind text not null default 'dine_in',
  label text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id),
  name text not null,
  price numeric not null,
  cost numeric not null,
  qty int not null,
  status text not null default 'pending',
  note text,
  added_at timestamptz not null default now()
);

create table if not exists sales_history (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  order_id uuid,
  table_name text,
  subtotal numeric,
  discount_amount numeric default 0,
  total numeric not null,
  cost numeric not null,
  payment_method text,
  cash_amount numeric default 0,
  card_amount numeric default 0,
  closed_at timestamptz not null default now()
);

-- payments: asagidaki ana script bu tabloyu ALTER TABLE ile genisletiyor
-- (promo_code_id, promo_code, debug_response), o yuzden once burada CREATE ediliyor.
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  package_id text not null,
  amount numeric not null,
  status text not null default 'pending',
  provider_ref text,
  created_at timestamptz not null default now()
);

-- Eski fonksiyon imzalarını temizler; herhangi biri zaten yoksa veya farklıysa
-- sessizce atlar, script bir daha bu yüzden durmaz.
do $$
begin
  begin drop function if exists login_staff(text, text, text); exception when others then null; end;
  begin drop function if exists get_restaurant_config(uuid); exception when others then null; end;
  begin drop function if exists get_live_orders(uuid); exception when others then null; end;
  begin drop function if exists send_order(uuid, uuid, json); exception when others then null; end;
  begin drop function if exists mark_item_ready(uuid); exception when others then null; end;
  begin drop function if exists cancel_order(uuid); exception when others then null; end;
  begin drop function if exists close_bill(uuid, uuid, text, numeric, numeric, numeric, text, numeric); exception when others then null; end;
  begin drop function if exists get_sales_history(uuid, date); exception when others then null; end;
  begin drop function if exists create_staff_user(uuid, text, text, text); exception when others then null; end;
  begin drop function if exists adjust_stock(uuid, uuid, int); exception when others then null; end;
  begin drop function if exists register_restaurant(text, text, text, text, text); exception when others then null; end;
end $$;

-- ============================================================
-- RESTORAN YÖNETİM SİSTEMİ - SON KURULUM (güvenlik + ayarlar)
-- Bu betik tamamen tekrar-çalıştırılabilir şekilde yazıldı.
-- Baştan sona, sırayla tek seferde çalıştırın.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- OTURUM (SESSION) TABLOSU ----------
create table if not exists staff_sessions (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  username text not null,
  role text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '12 hours'
);

-- Eski/süresi dolmuş oturumları temizleyen yardımcı (isteğe bağlı, zararsız)
create or replace function _cleanup_sessions() returns void language sql as $$
  delete from staff_sessions where expires_at < now() - interval '1 day';
$$;

-- Her fonksiyonun başında çağıracağı doğrulama: token geçerli mi, rol yeterli mi
create or replace function _session_check(p_token uuid, p_required_role text default null)
returns staff_sessions
language plpgsql
security definer
as $$
declare
  s staff_sessions%rowtype;
begin
  select * into s from staff_sessions where token = p_token and expires_at > now();
  if s.token is null then
    raise exception 'Oturum geçersiz veya süresi dolmuş, tekrar giriş yapın';
  end if;
  if p_required_role is not null and s.role <> p_required_role and s.role <> 'manager' then
    raise exception 'Bu işlem için yetkiniz yok';
  end if;
  return s;
end;
$$;

-- ---------- PAKET LİMİTLERİ ----------
alter table restaurants add column if not exists max_users int not null default 3;

-- ---------- GİRİŞ / ÇIKIŞ ----------
create or replace function login_staff(p_code text, p_username text, p_password text)
returns table(session_token uuid, user_id uuid, restaurant_id uuid, role text, restaurant_name text)
language plpgsql
security definer
as $$
declare
  v_user app_users%rowtype;
  v_restaurant_name text;
  v_token uuid;
begin
  select u.* into v_user
    from app_users u
    join restaurants r on r.id = u.restaurant_id
    where r.code = p_code and u.username = p_username
      and r.is_active = true and (r.expires_at is null or r.expires_at > now());

  if v_user.id is null or v_user.password is distinct from crypt(p_password, v_user.password) then
    return;
  end if;

  select r.name into v_restaurant_name from restaurants r where r.id = v_user.restaurant_id;

  insert into staff_sessions (user_id, restaurant_id, username, role)
  values (v_user.id, v_user.restaurant_id, v_user.username, v_user.role)
  returning token into v_token;

  return query select v_token, v_user.id, v_user.restaurant_id, v_user.role, v_restaurant_name;
end;
$$;
grant execute on function login_staff to anon;

create or replace function logout_staff(p_token uuid)
returns void language sql security definer as $$
  delete from staff_sessions where token = p_token;
$$;
grant execute on function logout_staff to anon;

-- ---------- KAYIT (YENİ İŞLETME) - E-posta + Telefon + SMS Doğrulama ----------
create extension if not exists pg_net;

create table if not exists platform_settings (
  key text primary key,
  value text
);

alter table restaurants add column if not exists email text;
alter table restaurants add column if not exists phone text;
create unique index if not exists restaurants_email_unique on restaurants (lower(email)) where email is not null;
create unique index if not exists restaurants_phone_unique on restaurants (phone) where phone is not null;

create table if not exists signup_otps (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  email text not null,
  otp_code text not null,
  attempts int not null default 0,
  expires_at timestamptz not null default now() + interval '10 minutes',
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

-- 1. adım: e-posta/telefon benzersizliğini kontrol eder, 6 haneli kod üretir, e-posta ile gönderir
-- (platform_settings içinde resend_api_key/resend_from_email tanımlıysa - bkz. resend.com).
-- Tanımlı değilse (henüz kurulmadıysa) kodu test amaçlı doğrudan döner.
create or replace function start_registration(p_email text, p_phone text)
returns json
language plpgsql
security definer
as $$
declare
  v_otp text;
  v_resend_key text;
  v_resend_from text;
begin
  if exists(select 1 from restaurants where lower(email) = lower(p_email)) then
    raise exception 'Bu e-posta adresiyle zaten bir hesap var';
  end if;
  if exists(select 1 from restaurants where phone = p_phone) then
    raise exception 'Bu telefon numarasıyla zaten bir hesap var';
  end if;

  v_otp := lpad(floor(random()*1000000)::text, 6, '0');
  insert into signup_otps (phone, email, otp_code) values (p_phone, p_email, v_otp);

  select value into v_resend_key from platform_settings where key='resend_api_key';
  select value into v_resend_from from platform_settings where key='resend_from_email';

  if v_resend_key is not null then
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_resend_key, 'Content-Type', 'application/json'),
      body := jsonb_build_object(
        'from', coalesce(v_resend_from, 'onboarding@resend.dev'),
        'to', jsonb_build_array(p_email),
        'subject', 'Doğrulama Kodunuz',
        'html', '<p>Merhaba,</p><p>İşletme kaydınızı tamamlamak için doğrulama kodunuz:</p>' ||
                '<h2 style="letter-spacing:4px;">' || v_otp || '</h2>' ||
                '<p>Bu kod 10 dakika geçerlidir.</p>'
      )
    );
    return json_build_object('sent', true);
  else
    return json_build_object('sent', false, 'test_otp', v_otp);
  end if;
end;
$$;
grant execute on function start_registration to anon;

-- 2. adım: kullanıcı SMS ile gelen kodu girer; doğruysa işletme + yönetici hesabı burada oluşturulur.
create or replace function verify_registration_otp(
  p_phone text, p_otp text,
  p_name text, p_code text, p_package_id text, p_email text,
  p_admin_username text, p_admin_password text
)
returns table(restaurant_id uuid, code text)
language plpgsql
security definer
as $$
declare
  v_otp_row signup_otps%rowtype;
  v_restaurant_id uuid;
  v_max_users int;
  v_duration_days int;
begin
  select * into v_otp_row from signup_otps
    where phone = p_phone and verified = false and expires_at > now()
    order by created_at desc limit 1;

  if v_otp_row.id is null then
    raise exception 'Kod isteği bulunamadı veya süresi doldu, tekrar kod isteyin';
  end if;
  if v_otp_row.attempts >= 5 then
    raise exception 'Çok fazla hatalı deneme yaptınız, yeni bir kod isteyin';
  end if;
  if v_otp_row.otp_code <> p_otp then
    update signup_otps set attempts = attempts + 1 where id = v_otp_row.id;
    raise exception 'Kod hatalı';
  end if;

  update signup_otps set verified = true where id = v_otp_row.id;

  case p_package_id
    when 'paket1' then v_max_users := 3;  v_duration_days := 14;
    when 'paket2' then v_max_users := 8;  v_duration_days := 60;
    when 'paket3' then v_max_users := 20; v_duration_days := 180;
    else raise exception 'Geçersiz paket';
  end case;

  if exists (select 1 from restaurants r where r.code = p_code) then
    raise exception 'Bu işletme kodu zaten kullanılıyor, başka bir kod deneyin';
  end if;

  -- Hesap, ödeme onaylanana kadar pasif kalır (aktivasyonu payment-callback Edge Function yapar).
  insert into restaurants (name, code, package_id, max_users, is_active, expires_at, email, phone)
  values (p_name, p_code, p_package_id, v_max_users, false, null, p_email, p_phone)
  returning id into v_restaurant_id;

  insert into app_users (restaurant_id, username, password, role)
  values (v_restaurant_id, p_admin_username, crypt(p_admin_password, gen_salt('bf')), 'manager');

  return query select v_restaurant_id as restaurant_id, p_code as code;
end;
$$;
grant execute on function verify_registration_otp to anon;

-- ---------- ORTAK VERİ OKUMA ----------
-- ---------- HAMMADDELER (REÇETE TABANLI STOK) ----------
create table if not exists ingredients (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  unit text not null default 'adet',
  stock numeric not null default 0
);
create table if not exists product_ingredients (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  qty_per_unit numeric not null,
  unique(product_id, ingredient_id)
);

create or replace function get_restaurant_config(p_token uuid)
returns json
language plpgsql
security definer
as $$
declare
  s staff_sessions%rowtype;
begin
  s := _session_check(p_token);
  return (
    select json_build_object(
      'stations', (select coalesce(json_agg(json_build_object('id', id, 'name', name, 'color', color)), '[]'::json) from stations where restaurant_id = s.restaurant_id),
      'zones', (
        select coalesce(json_agg(json_build_object(
          'id', z.id, 'name', z.name,
          'tables', (select coalesce(json_agg(json_build_object('id', t.id, 'name', t.name)), '[]'::json) from restaurant_tables t where t.zone_id = z.id)
        )), '[]'::json)
        from zones z where z.restaurant_id = s.restaurant_id
      ),
      'products', (
        select coalesce(json_agg(json_build_object(
          'id', p.id, 'name', p.name, 'price', p.price, 'cost', p.cost,
          'stock', p.stock, 'available', p.available, 'station_id', p.station_id,
          'recipe', (
            select coalesce(json_agg(json_build_object(
              'ingredient_id', pi.ingredient_id, 'qty_per_unit', pi.qty_per_unit,
              'ingredient_name', i.name, 'ingredient_unit', i.unit
            )), '[]'::json)
            from product_ingredients pi join ingredients i on i.id = pi.ingredient_id
            where pi.product_id = p.id
          ),
          'available_qty', (
            select case when count(*) = 0 then null else floor(min(i.stock / pi.qty_per_unit)) end
            from product_ingredients pi join ingredients i on i.id = pi.ingredient_id
            where pi.product_id = p.id and pi.qty_per_unit > 0
          )
        )), '[]'::json)
        from products p where p.restaurant_id = s.restaurant_id
      ),
      'ingredients', (select coalesce(json_agg(json_build_object('id', id, 'name', name, 'unit', unit, 'stock', stock)), '[]'::json) from ingredients where restaurant_id = s.restaurant_id),
      'users', (select coalesce(json_agg(json_build_object('id', id, 'username', username, 'role', role)), '[]'::json) from app_users where restaurant_id = s.restaurant_id),
      'license', (select json_build_object('package_id', package_id, 'max_users', max_users, 'expires_at', expires_at, 'name', name) from restaurants where id = s.restaurant_id)
    )
  );
end;
$$;
grant execute on function get_restaurant_config to anon;

create or replace function get_live_orders(p_token uuid)
returns json
language plpgsql
security definer
as $$
declare
  s staff_sessions%rowtype;
begin
  s := _session_check(p_token);
  return (
    select coalesce(json_agg(json_build_object(
      'order_id', o.id, 'table_id', o.table_id, 'kind', o.kind, 'created_at', o.created_at,
      'items', (
        select coalesce(json_agg(json_build_object(
          'id', oi.id, 'name', oi.name, 'price', oi.price, 'cost', oi.cost,
          'qty', oi.qty, 'status', oi.status, 'note', oi.note
        )), '[]'::json)
        from order_items oi where oi.order_id = o.id
      )
    )), '[]'::json)
    from orders o
    where o.restaurant_id = s.restaurant_id and o.status = 'open'
  );
end;
$$;
grant execute on function get_live_orders to anon;

-- ---------- STOK: sepete eklerken/çıkarırken anında ayarlama ----------
-- p_delta negatifse düşürür (sepete ekleme), pozitifse geri ekler (sepetten çıkarma/iptal).
-- Ürünün bir reçetesi (hammadde bağlantısı) varsa hammadde stoklarından düşer/ekler;
-- yoksa ürünün kendi stock alanını kullanır (stock=null ise stok takibi yapılmaz).
create or replace function adjust_stock(p_token uuid, p_product_id uuid, p_delta int)
returns json
language plpgsql
security definer
as $$
declare
  s staff_sessions%rowtype;
  rec record;
  v_has_recipe boolean;
  v_current int;
  v_new_stock int;
begin
  s := _session_check(p_token);

  select exists(select 1 from product_ingredients where product_id = p_product_id) into v_has_recipe;

  if v_has_recipe then
    for rec in
      select i.id, i.name, i.unit, i.stock, pi.qty_per_unit
      from product_ingredients pi join ingredients i on i.id = pi.ingredient_id
      where pi.product_id = p_product_id
    loop
      if p_delta < 0 and rec.stock + (rec.qty_per_unit * p_delta) < 0 then
        raise exception 'Yetersiz stok: % (kalan: % %)', rec.name, rec.stock, rec.unit;
      end if;
    end loop;

    update ingredients ing set stock = ing.stock + (pi.qty_per_unit * p_delta)
      from product_ingredients pi
      where pi.ingredient_id = ing.id and pi.product_id = p_product_id
        and ing.restaurant_id = s.restaurant_id;

    return json_build_object('recipe_based', true);
  end if;

  select stock into v_current from products where id = p_product_id and restaurant_id = s.restaurant_id;
  if v_current is null then
    return json_build_object('recipe_based', false, 'stock', null);
  end if;

  if p_delta < 0 and v_current + p_delta < 0 then
    raise exception 'Stokta yeterli ürün yok (kalan: %)', v_current;
  end if;

  update products set stock = v_current + p_delta
    where id = p_product_id and restaurant_id = s.restaurant_id
    returning stock into v_new_stock;

  return json_build_object('recipe_based', false, 'stock', v_new_stock);
end;
$$;
grant execute on function adjust_stock to anon;

-- ---------- SİPARİŞ AKIŞI ----------
-- Stok artık burada değil, ürün sepete eklenirken (adjust_stock ile) düşürülüyor;
-- bu fonksiyon sadece siparişi kaydeder.
create or replace function send_order(p_token uuid, p_table_id uuid, p_items json)
returns uuid
language plpgsql
security definer
as $$
declare
  s staff_sessions%rowtype;
  v_order_id uuid;
  item json;
  v_qty int;
  v_product_id uuid;
begin
  s := _session_check(p_token);

  select id into v_order_id from orders
    where restaurant_id = s.restaurant_id and table_id = p_table_id and status = 'open'
    limit 1;

  if v_order_id is null then
    insert into orders (restaurant_id, table_id, kind, status)
    values (s.restaurant_id, p_table_id, 'dine_in', 'open')
    returning id into v_order_id;
  end if;

  for item in select * from json_array_elements(p_items)
  loop
    v_product_id := (item->>'product_id')::uuid;
    v_qty := (item->>'qty')::int;

    insert into order_items (order_id, product_id, name, price, cost, qty, status, note)
    values (
      v_order_id, v_product_id, item->>'name',
      (item->>'price')::numeric, (item->>'cost')::numeric, v_qty,
      'pending', item->>'note'
    );
  end loop;

  return v_order_id;
end;
$$;
grant execute on function send_order to anon;

create or replace function cancel_order(p_token uuid, p_order_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  s staff_sessions%rowtype;
  it record;
  v_has_recipe boolean;
begin
  s := _session_check(p_token);

  for it in select product_id, qty from order_items where order_id = p_order_id
  loop
    select exists(select 1 from product_ingredients where product_id = it.product_id) into v_has_recipe;
    if v_has_recipe then
      update ingredients ing set stock = ing.stock + (pi.qty_per_unit * it.qty)
        from product_ingredients pi
        where pi.ingredient_id = ing.id and pi.product_id = it.product_id
          and ing.restaurant_id = s.restaurant_id;
    else
      update products set stock = stock + it.qty
        where id = it.product_id and restaurant_id = s.restaurant_id and stock is not null;
    end if;
  end loop;

  update orders set status='cancelled' where id = p_order_id and restaurant_id = s.restaurant_id;
end;
$$;
grant execute on function cancel_order to anon;

create or replace function mark_item_ready(p_token uuid, p_order_item_id uuid)
returns void
language plpgsql
security definer
as $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token);
  update order_items set status='ready'
  where id = p_order_item_id
    and order_id in (select id from orders where restaurant_id = s.restaurant_id);
end;
$$;
grant execute on function mark_item_ready to anon;

-- ---------- ÖDEME ----------
create or replace function close_bill(
  p_token uuid, p_order_id uuid, p_payment_method text,
  p_cash numeric, p_card numeric,
  p_discount_amount numeric default 0, p_discount_type text default null, p_discount_value numeric default 0
)
returns uuid
language plpgsql
security definer
as $$
declare
  s staff_sessions%rowtype;
  v_subtotal numeric;
  v_cost numeric;
  v_table_name text;
  v_hist_id uuid;
begin
  s := _session_check(p_token, 'manager');

  select coalesce(sum(price*qty),0), coalesce(sum(cost*qty),0)
    into v_subtotal, v_cost
    from order_items where order_id = p_order_id;

  select rt.name into v_table_name
    from orders o left join restaurant_tables rt on rt.id = o.table_id
    where o.id = p_order_id and o.restaurant_id = s.restaurant_id;

  insert into sales_history (restaurant_id, order_id, table_name, subtotal, discount_amount, total, cost, payment_method, cash_amount, card_amount)
  values (s.restaurant_id, p_order_id, coalesce(v_table_name,'Paket'), v_subtotal, p_discount_amount, v_subtotal-p_discount_amount, v_cost, p_payment_method, p_cash, p_card)
  returning id into v_hist_id;

  update orders set status='closed' where id = p_order_id and restaurant_id = s.restaurant_id;

  return v_hist_id;
end;
$$;
grant execute on function close_bill to anon;

create or replace function get_sales_history(p_token uuid, p_date date)
returns json
language plpgsql
security definer
as $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'manager');
  return (
    select coalesce(json_agg(row_to_json(h)), '[]'::json)
    from (
      select id, table_name, subtotal, discount_amount, total, cost, payment_method, cash_amount, card_amount, closed_at
      from sales_history
      where restaurant_id = s.restaurant_id
        and closed_at >= p_date::timestamptz
        and closed_at < (p_date + 1)::timestamptz
      order by closed_at desc
    ) h
  );
end;
$$;
grant execute on function get_sales_history to anon;

-- ---------- PERSONEL YÖNETİMİ ----------
create or replace function create_staff_user(p_token uuid, p_username text, p_password text, p_role text)
returns uuid
language plpgsql
security definer
as $$
declare
  s staff_sessions%rowtype;
  new_id uuid;
  v_max_users int;
  v_current_count int;
begin
  s := _session_check(p_token, 'manager');
  select max_users into v_max_users from restaurants where id = s.restaurant_id;
  select count(*) into v_current_count from app_users where restaurant_id = s.restaurant_id;
  if v_current_count >= v_max_users then
    raise exception 'Paketinizin kullanıcı limitine (%) ulaştınız', v_max_users;
  end if;

  insert into app_users (restaurant_id, username, password, role)
  values (s.restaurant_id, p_username, crypt(p_password, gen_salt('bf')), p_role)
  returning id into new_id;
  return new_id;
end;
$$;
grant execute on function create_staff_user to anon;

create or replace function update_staff_user(p_token uuid, p_user_id uuid, p_username text default null, p_password text default null, p_role text default null)
returns void
language plpgsql
security definer
as $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'manager');
  update app_users set
    username = coalesce(p_username, username),
    password = case when p_password is not null then crypt(p_password, gen_salt('bf')) else password end,
    role = coalesce(p_role, role)
  where id = p_user_id and restaurant_id = s.restaurant_id;
end;
$$;
grant execute on function update_staff_user to anon;

create or replace function delete_staff_user(p_token uuid, p_user_id uuid)
returns void
language plpgsql
security definer
as $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'manager');
  delete from app_users where id = p_user_id and restaurant_id = s.restaurant_id;
end;
$$;
grant execute on function delete_staff_user to anon;

-- ---------- İSTASYONLAR ----------
create or replace function upsert_station(p_token uuid, p_id uuid, p_name text, p_color text)
returns uuid
language plpgsql
security definer
as $$
declare s staff_sessions%rowtype; v_id uuid;
begin
  s := _session_check(p_token, 'manager');
  if p_id is null then
    insert into stations (restaurant_id, name, color) values (s.restaurant_id, p_name, p_color) returning id into v_id;
  else
    update stations set name = p_name, color = p_color where id = p_id and restaurant_id = s.restaurant_id;
    v_id := p_id;
  end if;
  return v_id;
end;
$$;
grant execute on function upsert_station to anon;

create or replace function delete_station(p_token uuid, p_id uuid)
returns void language plpgsql security definer as $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'manager');
  delete from stations where id = p_id and restaurant_id = s.restaurant_id;
end;
$$;
grant execute on function delete_station to anon;

-- ---------- BÖLGELER ----------
create or replace function upsert_zone(p_token uuid, p_id uuid, p_name text)
returns uuid language plpgsql security definer as $$
declare s staff_sessions%rowtype; v_id uuid;
begin
  s := _session_check(p_token, 'manager');
  if p_id is null then
    insert into zones (restaurant_id, name) values (s.restaurant_id, p_name) returning id into v_id;
  else
    update zones set name = p_name where id = p_id and restaurant_id = s.restaurant_id;
    v_id := p_id;
  end if;
  return v_id;
end;
$$;
grant execute on function upsert_zone to anon;

create or replace function delete_zone(p_token uuid, p_id uuid)
returns void language plpgsql security definer as $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'manager');
  delete from zones where id = p_id and restaurant_id = s.restaurant_id;
end;
$$;
grant execute on function delete_zone to anon;

-- ---------- MASALAR ----------
create or replace function upsert_table(p_token uuid, p_id uuid, p_zone_id uuid, p_name text)
returns uuid language plpgsql security definer as $$
declare s staff_sessions%rowtype; v_id uuid;
begin
  s := _session_check(p_token, 'manager');
  if p_id is null then
    insert into restaurant_tables (restaurant_id, zone_id, name) values (s.restaurant_id, p_zone_id, p_name) returning id into v_id;
  else
    update restaurant_tables set name = p_name where id = p_id and restaurant_id = s.restaurant_id;
    v_id := p_id;
  end if;
  return v_id;
end;
$$;
grant execute on function upsert_table to anon;

create or replace function delete_table(p_token uuid, p_id uuid)
returns void language plpgsql security definer as $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'manager');
  delete from restaurant_tables where id = p_id and restaurant_id = s.restaurant_id;
end;
$$;
grant execute on function delete_table to anon;

-- ---------- ÜRÜNLER ----------
create or replace function upsert_product(p_token uuid, p_id uuid, p_station_id uuid, p_name text, p_price numeric, p_cost numeric, p_stock int, p_available boolean)
returns uuid language plpgsql security definer as $$
declare s staff_sessions%rowtype; v_id uuid;
begin
  s := _session_check(p_token, 'manager');
  if p_id is null then
    insert into products (restaurant_id, station_id, name, price, cost, stock, available)
    values (s.restaurant_id, p_station_id, p_name, p_price, p_cost, p_stock, p_available)
    returning id into v_id;
  else
    update products set
      station_id = p_station_id, name = p_name, price = p_price, cost = p_cost, stock = p_stock, available = p_available
    where id = p_id and restaurant_id = s.restaurant_id;
    v_id := p_id;
  end if;
  return v_id;
end;
$$;
grant execute on function upsert_product to anon;

create or replace function delete_product(p_token uuid, p_id uuid)
returns void language plpgsql security definer as $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'manager');
  delete from products where id = p_id and restaurant_id = s.restaurant_id;
end;
$$;
grant execute on function delete_product to anon;

-- ---------- HAMMADDELER (STOK KALEMLERİ) ----------
create or replace function upsert_ingredient(p_token uuid, p_id uuid, p_name text, p_unit text, p_stock numeric)
returns uuid language plpgsql security definer as $$
declare s staff_sessions%rowtype; v_id uuid;
begin
  s := _session_check(p_token, 'manager');
  if p_id is null then
    insert into ingredients (restaurant_id, name, unit, stock) values (s.restaurant_id, p_name, p_unit, p_stock) returning id into v_id;
  else
    update ingredients set name = p_name, unit = p_unit, stock = p_stock where id = p_id and restaurant_id = s.restaurant_id;
    v_id := p_id;
  end if;
  return v_id;
end;
$$;
grant execute on function upsert_ingredient to anon;

create or replace function delete_ingredient(p_token uuid, p_id uuid)
returns void language plpgsql security definer as $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'manager');
  delete from ingredients where id = p_id and restaurant_id = s.restaurant_id;
end;
$$;
grant execute on function delete_ingredient to anon;

-- Bir ürünün reçetesini (hangi hammaddeden porsiyon başına ne kadar tükettiğini) baştan yazar.
create or replace function set_recipe(p_token uuid, p_product_id uuid, p_items json)
returns void
language plpgsql
security definer
as $$
declare
  s staff_sessions%rowtype;
  item json;
begin
  s := _session_check(p_token, 'manager');
  if not exists(select 1 from products where id = p_product_id and restaurant_id = s.restaurant_id) then
    raise exception 'Ürün bulunamadı';
  end if;

  delete from product_ingredients where product_id = p_product_id;

  for item in select * from json_array_elements(p_items)
  loop
    insert into product_ingredients (product_id, ingredient_id, qty_per_unit)
    values (p_product_id, (item->>'ingredient_id')::uuid, (item->>'qty_per_unit')::numeric);
  end loop;
end;
$$;
grant execute on function set_recipe to anon;

-- ---------- İNDİRİM / PROMOSYON KODLARI (ödeme akışı için) ----------
create table if not exists promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null default 'percent', -- 'percent' | 'amount'
  discount_value numeric not null,
  max_uses int,                 -- null = sınırsız kullanım
  used_count int not null default 0,
  active boolean not null default true,
  expires_at timestamptz,       -- null = süresiz
  created_at timestamptz not null default now()
);

alter table payments add column if not exists promo_code_id uuid references promo_codes(id);
alter table payments add column if not exists promo_code text;

-- Örnek: kullanıma hazır bir test kodu (silebilir/değiştirebilirsiniz)
insert into promo_codes (code, discount_type, discount_value, max_uses, expires_at)
values ('HOSGELDIN20', 'percent', 20, 100, now() + interval '90 days')
on conflict (code) do nothing;

-- ---------- PLATFORM YÖNETİCİSİ (sadece siz - promosyon kodu yönetimi için) ----------
create table if not exists platform_admins (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password text not null,
  created_at timestamptz not null default now()
);

create table if not exists platform_admin_sessions (
  token uuid primary key default gen_random_uuid(),
  admin_id uuid not null references platform_admins(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '12 hours'
);

-- İlk giriş bilgisi: kullanıcı adı "admin", şifre "degistir123" - giriş yaptıktan sonra
-- Ayarlar'dan şifrenizi mutlaka değiştirin.
insert into platform_admins (username, password)
values ('admin', crypt('degistir123', gen_salt('bf')))
on conflict (username) do nothing;

create or replace function platform_admin_login(p_username text, p_password text)
returns table(session_token uuid)
language plpgsql
security definer
as $$
declare
  v_admin platform_admins%rowtype;
  v_token uuid;
begin
  select * into v_admin from platform_admins where username = p_username;
  if v_admin.id is null or v_admin.password is distinct from crypt(p_password, v_admin.password) then
    return;
  end if;
  insert into platform_admin_sessions (admin_id) values (v_admin.id) returning token into v_token;
  return query select v_token;
end;
$$;
grant execute on function platform_admin_login to anon;

create or replace function _platform_admin_check(p_token uuid)
returns uuid
language plpgsql
security definer
as $$
declare v_admin_id uuid;
begin
  select admin_id into v_admin_id from platform_admin_sessions where token = p_token and expires_at > now();
  if v_admin_id is null then
    raise exception 'Oturum geçersiz, tekrar giriş yapın';
  end if;
  return v_admin_id;
end;
$$;

create or replace function change_platform_admin_password(p_token uuid, p_new_password text)
returns void language plpgsql security definer as $$
declare v_admin_id uuid;
begin
  v_admin_id := _platform_admin_check(p_token);
  update platform_admins set password = crypt(p_new_password, gen_salt('bf')) where id = v_admin_id;
end;
$$;
grant execute on function change_platform_admin_password to anon;

create or replace function list_promo_codes(p_token uuid)
returns json
language plpgsql
security definer
as $$
begin
  perform _platform_admin_check(p_token);
  return (select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
    select id, code, discount_type, discount_value, max_uses, used_count, active, expires_at, created_at
    from promo_codes order by created_at desc
  ) t);
end;
$$;
grant execute on function list_promo_codes to anon;

create or replace function create_promo_code(p_token uuid, p_code text, p_discount_type text, p_discount_value numeric, p_max_uses int, p_expires_at timestamptz)
returns uuid
language plpgsql
security definer
as $$
declare v_id uuid;
begin
  perform _platform_admin_check(p_token);
  insert into promo_codes (code, discount_type, discount_value, max_uses, expires_at)
  values (upper(p_code), p_discount_type, p_discount_value, p_max_uses, p_expires_at)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function create_promo_code to anon;

create or replace function update_promo_code(p_token uuid, p_id uuid, p_code text, p_discount_type text, p_discount_value numeric, p_max_uses int, p_expires_at timestamptz, p_active boolean)
returns void
language plpgsql
security definer
as $$
begin
  perform _platform_admin_check(p_token);
  update promo_codes set code=upper(p_code), discount_type=p_discount_type, discount_value=p_discount_value,
    max_uses=p_max_uses, expires_at=p_expires_at, active=p_active
  where id = p_id;
end;
$$;
grant execute on function update_promo_code to anon;

create or replace function delete_promo_code(p_token uuid, p_id uuid)
returns void language plpgsql security definer as $$
begin
  perform _platform_admin_check(p_token);
  delete from promo_codes where id = p_id;
end;
$$;
grant execute on function delete_promo_code to anon;

create or replace function toggle_promo_code(p_token uuid, p_id uuid)
returns void language plpgsql security definer as $$
begin
  perform _platform_admin_check(p_token);
  update promo_codes set active = not active where id = p_id;
end;
$$;
grant execute on function toggle_promo_code to anon;

-- ============================================================
-- BİTTİ. Buraya kadar hatasız çalıştıysa kurulum tamamlanmıştır.
-- ============================================================
