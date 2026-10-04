-- Peyktan kritik akış testleri
-- ---------------------------------------------------------------------------
-- Canlı veritabanında çalışır ama HİÇBİR ŞEYİ KALICI DEĞİŞTİRMEZ: tüm dosya tek
-- bir işlem (transaction) içindedir ve sonunda ROLLBACK edilir. Her test kendi
-- geçici işletmesini (fixture) kurar.
--
-- Çalıştırma (CI: .github/workflows/db-tests.yml):
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/critical_tests.sql
-- Bir test başarısız olursa psql hata koduyla çıkar ve CI kırmızı olur.
-- ---------------------------------------------------------------------------
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
-- Bağlantı türüne göre (pooler/doğrudan) arama yolu farklı olabilir; crypt/gen_salt extensions şemasında.
set local search_path = public, extensions, pg_temp;

create temp table _results (name text, ok boolean, detail text);

do $tests$
declare
  r uuid; z uuid; t uuid; st uuid; mgr uuid; waiter uuid; role_mgr uuid; role_waiter uuid;
  p_plain uuid; p_recipe uuid; ing uuid;
  tok_m uuid := gen_random_uuid(); tok_w uuid := gen_random_uuid();
  o uuid; item uuid; res json; err text; n int; v numeric; code text := 'T' || substr(md5(random()::text), 1, 8);

begin
  -- ---- Fixture: geçici işletme, roller, kullanıcılar, masa, ürünler ----
  begin
  insert into restaurants (name, code, package_id, is_active, expires_at)
    values ('CI Test', code, 'paket_kurumsal', true, now() + interval '30 days') returning id into r;
  insert into roles (restaurant_id, name, is_system, permissions) values (r, 'Yönetici', true, '{}') returning id into role_mgr;
  insert into roles (restaurant_id, name, is_system, permissions) values (r, 'Garson', false, array['order','payments']) returning id into role_waiter;
  insert into app_users (restaurant_id, username, password, role_ids) values (r, 'mgr', crypt('Test1234', gen_salt('bf')), array[role_mgr]) returning id into mgr;
  insert into app_users (restaurant_id, username, password, role_ids) values (r, 'garson', crypt('Test1234', gen_salt('bf')), array[role_waiter]) returning id into waiter;
  insert into staff_sessions (token, user_id, restaurant_id, username, expires_at) values
    (tok_m, mgr, r, 'mgr', now() + interval '1 hour'), (tok_w, waiter, r, 'garson', now() + interval '1 hour');
  insert into zones (restaurant_id, name) values (r, 'Salon') returning id into z;
  insert into restaurant_tables (restaurant_id, zone_id, name) values (r, z, 'Masa1') returning id into t;
  insert into stations (restaurant_id, name) values (r, 'Izgara') returning id into st;
  insert into products (restaurant_id, name, price, cost, stock, available, station_id) values (r, 'Kola', 50, 10, 3, true, st) returning id into p_plain;
  insert into products (restaurant_id, name, price, cost, available, station_id) values (r, 'Köfte', 100, 40, true, st) returning id into p_recipe;
  insert into ingredients (restaurant_id, name, stock) values (r, 'Kıyma', 0.5) returning id into ing;
  insert into product_ingredients (product_id, ingredient_id, qty_per_unit) values (p_recipe, ing, 0.2);
  exception when others then
    insert into _results values ('fixture_kurulumu', false, sqlerrm);
    return;
  end;

  -- ---- 1) Sipariş gönderilir, mutfağa düşer ----
  begin
    perform send_order(tok_w, t, json_build_array(json_build_object('product_id', p_plain, 'name', 'Kola', 'qty', 2)));
    select id into o from orders where restaurant_id = r and table_id = t and status = 'open';
    select count(*) into n from order_items where order_id = o and status = 'pending';
    insert into _results values ('siparis_gonderme', n = 1, 'bekleyen kalem: ' || n);
  exception when others then insert into _results values ('siparis_gonderme', false, sqlerrm); end;

  -- ---- 2) Ödeme: hesabın tamamı ödenince satış kaydı oluşur, sipariş kapanır ----
  begin
    res := pay_order_items(tok_w, o, 'cash', 100, 0);
    select count(*) into n from sales_history where order_id = o;
    insert into _results values ('odeme_tam', n = 1 and (select status from orders where id = o) = 'closed', 'satis kaydi: ' || n);
  exception when others then insert into _results values ('odeme_tam', false, sqlerrm); end;

  -- ---- 3) Ödenmiş hesap tekrar ödenemez (çifte ödeme) ----
  begin
    perform pay_order_items(tok_w, o, 'cash', 100, 0);
    insert into _results values ('cifte_odeme_reddi', false, 'ikinci odeme kabul edildi');
  exception when others then insert into _results values ('cifte_odeme_reddi', true, sqlerrm); end;

  -- ---- 4) Yetkisiz kullanıcı ödeme alamaz ----
  begin
    update roles set permissions = array['order'] where id = role_waiter;
    perform send_order(tok_w, t, json_build_array(json_build_object('product_id', p_plain, 'name', 'Kola', 'qty', 1)));
    select id into o from orders where restaurant_id = r and table_id = t and status = 'open';
    begin
      perform pay_order_items(tok_w, o, 'cash', 50, 0);
      insert into _results values ('odeme_yetki', false, 'yetkisiz odeme kabul edildi');
    exception when others then insert into _results values ('odeme_yetki', sqlerrm like '%yetki%', sqlerrm); end;
    update roles set permissions = array['order','payments'] where id = role_waiter;
  exception when others then insert into _results values ('odeme_yetki', false, sqlerrm); end;

  -- ---- 5) Stok: ürün stoğundan fazlası düşülemez, reçetede hammadde yetmezse reddedilir ----
  begin
    perform adjust_stock(tok_w, p_plain, -10);
    insert into _results values ('stok_urun_reddi', false, 'stok eksiye dustu');
  exception when others then insert into _results values ('stok_urun_reddi', true, sqlerrm); end;
  begin
    perform adjust_stock(tok_w, p_recipe, -2);          -- 0.4 kıyma: yeter
    select stock into v from ingredients where id = ing;
    begin
      perform adjust_stock(tok_w, p_recipe, -1);        -- 0.2 daha: yetmez (0.1 kaldı)
      insert into _results values ('stok_recete', false, 'yetersiz hammadde kabul edildi');
    exception when others then insert into _results values ('stok_recete', abs(v - 0.1) < 0.0001, 'kalan kiyma: ' || v || ' / ' || sqlerrm); end;
  exception when others then insert into _results values ('stok_recete', false, sqlerrm); end;

  -- ---- 6) Online sipariş: tükenen ürün sipariş edilemez ----
  begin
    update restaurants set online_ordering_enabled = true where id = r;
    insert into entitlements (restaurant_id, addon_id) values (r, 'online_ordering');
    begin
      perform submit_public_order(code, 'pickup', 'Ali', '5550000000', null, jsonb_build_array(jsonb_build_object('product_id', p_recipe, 'qty', 1)));
      insert into _results values ('online_stok', false, 'tukenen urun siparis edildi');
    exception when others then insert into _results values ('online_stok', sqlerrm like '%stok%', sqlerrm); end;
  exception when others then insert into _results values ('online_stok', false, sqlerrm); end;

  -- ---- 7) Giriş: yanlış şifre reddedilir, doğru şifre oturum açar ----
  begin
    select count(*) into n from login_staff(code, 'garson', 'yanlis') x where x.session_token is not null;
    insert into _results values ('giris_yanlis_sifre', n = 0, 'oturum: ' || n);
  exception when others then insert into _results values ('giris_yanlis_sifre', true, sqlerrm); end;
  begin
    select count(*) into n from login_staff(code, 'garson', 'Test1234') x where x.session_token is not null;
    insert into _results values ('giris_dogru_sifre', n = 1, 'oturum: ' || n);
  exception when others then insert into _results values ('giris_dogru_sifre', false, sqlerrm); end;

  -- ---- 8) OTP: 5 hatalı denemeden sonra doğru kod da reddedilir ----
  begin
    insert into password_reset_otps (restaurant_id, user_id, otp_code, expires_at) values (r, waiter, '123456', now() + interval '10 minutes');
    for n in 1..5 loop perform verify_password_reset(code, 'garson', '000000', 'Yeni1234'); end loop;
    begin
      perform verify_password_reset(code, 'garson', '123456', 'Yeni1234');
      insert into _results values ('otp_deneme_siniri', false, 'deneme siniri asildi');
    exception when others then insert into _results values ('otp_deneme_siniri', sqlerrm like '%deneme%', sqlerrm); end;
  exception when others then insert into _results values ('otp_deneme_siniri', false, sqlerrm); end;

  -- ---- 9) Vardiya zorunluluğu (esnek): vardiyasız personel reddedilir, talep sonrası çalışır, yönetici muaf ----
  begin
    update restaurants set shift_required = true, shift_approval_required = true where id = r;
    begin
      perform send_order(tok_w, t, json_build_array(json_build_object('product_id', p_plain, 'name', 'Kola', 'qty', 1)));
      insert into _results values ('vardiya_zorunlu', false, 'vardiyasiz siparis kabul edildi');
    exception when others then
      if sqlerrm <> 'VARDIYA_GEREKLI' then raise; end if;
      perform clock_in(tok_w);
      perform send_order(tok_w, t, json_build_array(json_build_object('product_id', p_plain, 'name', 'Kola', 'qty', 1)));
      perform send_order(tok_m, t, json_build_array(json_build_object('product_id', p_plain, 'name', 'Kola', 'qty', 1)));
      insert into _results values ('vardiya_zorunlu', true, 'ok');
    end;
    update restaurants set shift_required = false where id = r;
  exception when others then insert into _results values ('vardiya_zorunlu', false, sqlerrm); end;

  -- ---- 10) İşletmeler arası izolasyon: başka işletmenin siparişi ödenemez ----
  declare r2 uuid; tok2 uuid := gen_random_uuid(); u2 uuid; role2 uuid;
  begin
    insert into restaurants (name, code, package_id, is_active, expires_at)
      values ('CI Test 2', code || 'b', 'paket_kurumsal', true, now() + interval '30 days') returning id into r2;
    insert into roles (restaurant_id, name, is_system, permissions) values (r2, 'Yönetici', true, '{}') returning id into role2;
    insert into app_users (restaurant_id, username, password, role_ids) values (r2, 'x', 'x', array[role2]) returning id into u2;
    insert into staff_sessions (token, user_id, restaurant_id, username, expires_at) values (tok2, u2, r2, 'x', now() + interval '1 hour');
    select id into o from orders where restaurant_id = r and status = 'open' limit 1;
    begin
      perform pay_order_items(tok2, o, 'cash', 1000, 0);
      insert into _results values ('isletme_izolasyonu', false, 'baska isletmenin siparisi odendi');
    exception when others then insert into _results values ('isletme_izolasyonu', true, sqlerrm); end;
  exception when others then insert into _results values ('isletme_izolasyonu', false, sqlerrm); end;
end $tests$;

-- Sonuçları yazdır; başarısız varsa hata ver (psql ON_ERROR_STOP ile çıkış kodu 3).
select case when ok then 'GEÇTİ ' else 'KALDI ' end || name as test, detail from _results order by ok, name;
do $check$
declare f text;
begin
  select string_agg(name || ' (' || coalesce(detail,'') || ')', '; ') into f from _results where not ok;
  if f is not null then raise exception 'BAŞARISIZ TESTLER: %', f; end if;
  if (select count(*) from _results) < 12 then raise exception 'Beklenenden az test çalıştı: %', (select count(*) from _results); end if;
end $check$;

rollback;
