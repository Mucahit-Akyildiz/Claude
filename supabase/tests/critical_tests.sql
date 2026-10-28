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
    update order_items set status = 'ready' where order_id = o;   -- ödeme yalnızca hazır ürünlere
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
  -- Giriş, aynı kullanıcının önceki oturumlarını kapatır (tek cihaz kuralı);
  -- sonraki testler için test oturumu yeniden açılır.
  update staff_sessions set expires_at = now() + interval '1 hour' where token = tok_w;

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

  -- ---- 11) Online sepet ayırma: bir müşterinin sepetindeki son adetler başkasına satılamaz ----
  begin
    update products set stock = 3 where id = p_plain;
    n := set_public_cart_hold(code, 'ci-client-aaaa', p_plain, 5);       -- 3 verilir
    if n <> 3 then raise exception 'A sepeti % aldı (beklenen 3)', n; end if;
    n := set_public_cart_hold(code, 'ci-client-bbbb', p_plain, 2);       -- 0 verilir
    if n <> 0 then raise exception 'B sepeti % aldı (beklenen 0)', n; end if;
    begin
      perform submit_public_order(code, 'pickup', 'B', '5550000002', null, jsonb_build_array(jsonb_build_object('product_id', p_plain, 'qty', 1)), 'ci-client-bbbb');
      insert into _results values ('sepet_ayirma', false, 'ayrılmış ürün başkasına satıldı');
    exception when others then
      perform submit_public_order(code, 'pickup', 'A', '5550000001', null, jsonb_build_array(jsonb_build_object('product_id', p_plain, 'qty', 3)), 'ci-client-aaaa');
      insert into _results values ('sepet_ayirma', true, 'ok');
    end;
  exception when others then insert into _results values ('sepet_ayirma', false, sqlerrm); end;

  -- ---- 12) Hazır olmayan ürün için ödeme alınamaz; açık hesaba aktarım ve tahsilat ----
  declare acc uuid; bal numeric;
  begin
    update restaurants set shift_required = false where id = r;
    perform send_order(tok_m, t, json_build_array(json_build_object('product_id', p_plain, 'name', 'Kola', 'qty', 1)));
    select id into o from orders where restaurant_id = r and table_id = t and status = 'open';
    begin
      perform pay_order_items(tok_m, o, 'cash', 1000000, 0);
      insert into _results values ('hazir_degil_odeme', false, 'hazır olmayan ürün ödendi');
    exception when others then insert into _results values ('hazir_degil_odeme', sqlerrm = 'HAZIR_DEGIL', sqlerrm); end;
    update order_items set status = 'ready' where order_id = o;
    acc := create_open_account(tok_m, 'CI Açık Hesap');
    perform transfer_to_open_account(tok_m, o, acc);
    bal := collect_open_account(tok_m, acc, 10, 'cash');
    insert into _results values ('acik_hesap', (select status from orders where id = o) = 'closed' and bal >= 0, 'kalan: ' || bal);
  exception when others then insert into _results values ('acik_hesap', false, sqlerrm); end;
end $tests$;

-- ---- 14-19) Toplu işlem, yedek/geri yükleme, kullanıcı limiti, raporlar, veri sıfırlama ----
do $more$
declare r uuid; z uuid; mgr uuid; role_mgr uuid; role_w uuid; p1 uuid; tok uuid := gen_random_uuid(); b jsonb; res jsonb; err text; n int; pw text;
  code text := 'U' || substr(md5(random()::text), 1, 8);
begin
  insert into restaurants (name, code, package_id, is_active, expires_at) values ('CI Test 2', code, 'paket_kurumsal', true, now() + interval '30 days') returning id into r;
  insert into roles (restaurant_id, name, is_system, permissions) values (r, 'Yönetici', true, '{}') returning id into role_mgr;
  insert into roles (restaurant_id, name, is_system, permissions) values (r, 'Garson', false, array['order']) returning id into role_w;
  insert into app_users (restaurant_id, username, password, role_ids) values (r, 'mgr', crypt('Test1234', gen_salt('bf')), array[role_mgr]) returning id into mgr;
  insert into staff_sessions (token, user_id, restaurant_id, username, expires_at) values (tok, mgr, r, 'mgr', now() + interval '1 hour');
  insert into zones (restaurant_id, name) values (r, 'Salon') returning id into z;
  insert into products (restaurant_id, name, price, cost, available) values (r, 'Çay', 20, 5, true) returning id into p1;

  -- 14) bulk_call: tek istekte birden çok kayıt, sıra korunur; listede olmayan fonksiyon reddedilir
  begin
    res := bulk_call(tok, 'upsert_table', jsonb_build_array(jsonb_build_object('p_id', null, 'p_zone_id', z, 'p_name', 'B1'), jsonb_build_object('p_id', null, 'p_zone_id', z, 'p_name', 'B2')));
    select count(*) into n from restaurant_tables where restaurant_id = r and name in ('B1','B2');
    insert into _results values ('toplu_islem', n = 2 and jsonb_array_length(res) = 2, 'masa: ' || n);
    begin perform bulk_call(tok, 'admin_set_user_limit', '[]'::jsonb); insert into _results values ('toplu_islem_beyaz_liste', false, 'izinsiz fonksiyon çalıştı');
    exception when others then insert into _results values ('toplu_islem_beyaz_liste', true, sqlerrm); end;
  exception when others then insert into _results values ('toplu_islem', false, sqlerrm); end;

  -- 15) Yedek indir → değiştir → geri yükle: veri döner, şifre korunur, başka işletmenin yedeği reddedilir
  begin
    select password into pw from app_users where id = mgr;
    b := export_restaurant_backup(tok, 'Test1234');
    update products set name = 'BOZULDU' where id = p1;
    perform import_restaurant_backup(tok, 'Test1234', b);
    insert into _results values ('yedek_geri_yukleme', (select name from products where id = p1) = 'Çay' and (select password from app_users where id = mgr) = pw
      and b::text !~* '"password"', 'ürün: ' || (select name from products where id = p1));
    begin perform import_restaurant_backup(tok, 'Test1234', jsonb_set(b, '{restaurant,id}', to_jsonb(gen_random_uuid()::text)));
      insert into _results values ('yedek_baska_isletme', false, 'yabancı yedek yüklendi');
    exception when others then insert into _results values ('yedek_baska_isletme', sqlerrm ilike '%başka bir işletme%', sqlerrm); end;
  exception when others then insert into _results values ('yedek_geri_yukleme', false, sqlerrm); end;

  -- 16) İşletmeye özel kullanıcı limiti paket limitinin yerine geçer
  begin
    update restaurants set user_limit_override = 1 where id = r;
    begin perform create_staff_user(tok, 'g1', 'Test1234', array[role_w]); err := 'eklendi'; exception when others then err := sqlerrm; end;
    update restaurants set user_limit_override = 50 where id = r;
    perform create_staff_user(tok, 'g2', 'Test1234', array[role_w]);
    insert into _results values ('kullanici_limiti', err ilike '%limit%' and exists(select 1 from app_users where restaurant_id = r and username = 'g2'), err);
  exception when others then insert into _results values ('kullanici_limiti', false, sqlerrm); end;

  -- 17) Raporlar hatasız çalışır (SMS/e-posta geçmişi, iptal & ikram, yönetici özeti)
  begin
    perform get_sms_log(tok, null, null, null, '__failed', null, 10, 0);
    perform get_mail_log(tok, null, null, null, null, null, 10, 0);
    res := get_loss_report(tok, null, null);
    insert into _results values ('raporlar', res ? 'totals' and length(_owner_report_html(r, now() - interval '1 day', now(), 'T')) > 100, 'ok');
  exception when others then insert into _results values ('raporlar', false, sqlerrm); end;

  -- 18) Veri sıfırlama: kullanıcılar/roller seçilince çağıran Yönetici ve rolü korunur
  begin
    perform reset_restaurant_data_ts(tok, 'Test1234', null, null, array['users','roles']);
    insert into _results values ('sifirlama_kullanici_rol', exists(select 1 from app_users where id = mgr) and exists(select 1 from roles where id = role_mgr)
      and not exists(select 1 from app_users where restaurant_id = r and username = 'g2'), 'ok');
  exception when others then insert into _results values ('sifirlama_kullanici_rol', false, sqlerrm); end;
end $more$;

-- ---- 19-20) Uçtan uca sipariş → mutfak → QR hesap → kartla ödeme; vardiya planı ----
do $e2e$
declare r uuid; z uuid; t uuid; st uuid; mgr uuid; role_mgr uuid; p1 uuid; tok uuid := gen_random_uuid(); o uuid; it uuid; qr uuid; b json; pid uuid; okp boolean; n int; err text;
  code text := 'E' || substr(md5(random()::text), 1, 8);
begin
  insert into restaurants (name, code, package_id, is_active, expires_at) values ('CI E2E', code, 'paket_kurumsal', true, now() + interval '30 days') returning id into r;
  insert into roles (restaurant_id, name, is_system, permissions) values (r, 'Yönetici', true, '{}') returning id into role_mgr;
  insert into app_users (restaurant_id, username, password, role_ids) values (r, 'mgr', crypt('Test1234', gen_salt('bf')), array[role_mgr]) returning id into mgr;
  insert into staff_sessions (token, user_id, restaurant_id, username, expires_at) values (tok, mgr, r, 'mgr', now() + interval '1 hour');
  insert into zones (restaurant_id, name) values (r, 'Salon') returning id into z;
  insert into restaurant_tables (restaurant_id, zone_id, name) values (r, z, 'E1') returning id into t;
  select qr_token into qr from restaurant_tables where id = t;
  insert into stations (restaurant_id, name) values (r, 'Mutfak') returning id into st;
  insert into products (restaurant_id, name, price, cost, available, station_id) values (r, 'Lahmacun', 80, 20, true, st) returning id into p1;

  -- 19) Uçtan uca: sipariş → mutfak (hazır değilken ödeme reddi, mutfak "hazır") → QR'dan hesap → kartla online ödeme kapanışı
  begin
    perform send_order(tok, t, json_build_array(json_build_object('product_id', p1, 'name', 'Lahmacun', 'qty', 2)));
    select id into o from orders where table_id = t and status = 'open';
    select id into it from order_items where order_id = o;
    begin perform pay_order_items(tok, o, 'cash', 160, 0); err := 'kabul'; exception when others then err := sqlerrm; end;
    perform mark_item_ready(tok, it);
    b := get_table_bill(qr);
    insert into online_payments (restaurant_id, amount, status, payload) values (r, 160, 'pending', jsonb_build_object('kind', 'table', 'qr', qr::text, 'order_id', o)) returning id into pid;
    okp := _finalize_table_payment(pid, 'TEST', 160);
    okp := okp and (select status from online_payments where id = pid) = 'paid';
    select count(*) into n from sales_history where order_id = o;
    insert into _results values ('uctan_uca_siparis_mutfak_odeme', err <> 'kabul' and (select status from order_items where id = it) is not null
      and b::text like '%160%' and okp and n >= 1 and (select status from orders where id = o) = 'closed',
      'hazirsiz: ' || left(err, 40) || ' | satis: ' || n || ' | bill: ' || left(b::text, 60));
  exception when others then insert into _results values ('uctan_uca_siparis_mutfak_odeme', false, sqlerrm); end;

  -- 20) Vardiya planı: kaydet, geçen haftayı kopyala, boş saatle sil
  begin
    perform set_shift_plan(tok, mgr, date '2026-01-05', '09:00', '17:00');
    n := copy_shift_plan_week(tok, date '2026-01-12');
    perform set_shift_plan(tok, mgr, date '2026-01-05', '', '');
    insert into _results values ('vardiya_plani', n = 1 and json_array_length(get_shift_plan(tok, date '2026-01-12')->'plan') = 1
      and json_array_length(get_shift_plan(tok, date '2026-01-05')->'plan') = 0, 'kopya: ' || n);
  exception when others then insert into _results values ('vardiya_plani', false, sqlerrm); end;
end $e2e$;

-- ---- 21-22) Entegrasyon altyapısı: ÖKC fiş kuyruğu (satış → iş → işçi → sonuç) ve pazaryeri siparişi (tekrar düşmez) ----
do $hub$
declare r uuid; z uuid; t uuid; mgr uuid; role_mgr uuid; p1 uuid; tok uuid := gen_random_uuid(); o uuid; cid uuid; mid uuid; jobs json; jid uuid; n int; a uuid; b uuid;
  code text := 'H' || substr(md5(random()::text), 1, 8);
begin
  insert into restaurants (name, code, package_id, is_active, expires_at) values ('CI Hub', code, 'paket_kurumsal', true, now() + interval '30 days') returning id into r;
  insert into roles (restaurant_id, name, is_system, permissions) values (r, 'Yönetici', true, '{}') returning id into role_mgr;
  insert into app_users (restaurant_id, username, password, role_ids) values (r, 'mgr', crypt('Test1234', gen_salt('bf')), array[role_mgr]) returning id into mgr;
  insert into staff_sessions (token, user_id, restaurant_id, username, expires_at) values (tok, mgr, r, 'mgr', now() + interval '1 hour');
  insert into zones (restaurant_id, name) values (r, 'Salon') returning id into z;
  insert into restaurant_tables (restaurant_id, zone_id, name) values (r, z, 'H1') returning id into t;
  insert into products (restaurant_id, name, price, cost, available) values (r, 'Ayran', 30, 5, true) returning id into p1;
  begin
    cid := save_connector(tok, 'okc', 'test', true, 'test', '{}'::jsonb, '{"api_key":"gizli1"}'::jsonb);
    perform save_connector(tok, 'okc', 'test', true, 'test', '{}'::jsonb, '{"api_key":""}'::jsonb);  -- boş sır eskisini korur
    perform send_order(tok, t, json_build_array(json_build_object('product_id', p1, 'name', 'Ayran', 'qty', 2)));
    select id into o from orders where table_id = t and status = 'open';
    perform pay_order_items(tok, o, 'cash', 60, 0);
    update integration_jobs set next_at = now() - interval '1 second' where connector_id = cid;
    jobs := _claim_integration_jobs(200);
    select json_agg(x) into jobs from json_array_elements(jobs) x where x->'connector'->>'id' = cid::text;  -- canlıda başka işler de olabilir
    jid := (jobs->0->>'id')::uuid;
    perform _finish_integration_job(jid, true, '{"ref":"SIM-1"}'::jsonb, null, true);
    insert into _results values ('entegrasyon_okc_kuyrugu', json_array_length(jobs) = 1 and jobs->0->>'event' = 'sale' and (jobs->0->'payload'->>'total')::numeric = 60
      and jobs->0->'connector'->'secrets'->>'api_key' = 'gizli1' and json_array_length(jobs->0->'payload'->'items') = 1
      and (select status from integration_jobs where id = jid) = 'done', left(jobs::text, 160));
  exception when others then insert into _results values ('entegrasyon_okc_kuyrugu', false, sqlerrm); end;
  begin
    mid := save_connector(tok, 'marketplace', 'test', true, 'test', '{}'::jsonb, null);
    a := _ingest_marketplace_order(mid, '{"external_id":"X1","customer_name":"Test","total":90,"items":[{"name":"Ayran","qty":3,"price":30}]}'::jsonb);
    b := _ingest_marketplace_order(mid, '{"external_id":"X1","customer_name":"Test","total":90,"items":[{"name":"Ayran","qty":3,"price":30}]}'::jsonb);
    select count(*) into n from customer_order_requests where restaurant_id = r and source = 'test';
    perform remove_connector(tok, mid);
    insert into _results values ('entegrasyon_pazaryeri', a is not null and b is null and n = 1
      and not (select enabled from tenant_connectors where id = mid) and json_array_length(list_connectors(tok)) = 2, 'kayit: ' || n);
  exception when others then insert into _results values ('entegrasyon_pazaryeri', false, sqlerrm); end;
end $hub$;

-- ---- 13) Herkese açık anahtar (anon) iç fonksiyonları ve abonelik uzatmayı çağıramaz ----
do $sec$
declare v_open text;
begin
  select string_agg(p.proname, ', ') into v_open from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and (p.proname like '\_%' or p.proname = 'extend_restaurant_subscription')
      and has_function_privilege('anon', p.oid, 'execute');
  insert into _results values ('anon_ic_fonksiyon_kapali', v_open is null, coalesce('açık: ' || v_open, 'hepsi kapalı'));
end $sec$;

-- Sonuçları yazdır; başarısız varsa hata ver (psql ON_ERROR_STOP ile çıkış kodu 3).
select case when ok then 'GEÇTİ ' else 'KALDI ' end || name as test, detail from _results order by ok, name;
do $check$
declare f text;
begin
  select string_agg(name || ' (' || coalesce(detail,'') || ')', '; ') into f from _results where not ok;
  if f is not null then raise exception 'BAŞARISIZ TESTLER: %', f; end if;
  if (select count(*) from _results) < 27 then raise exception 'Beklenenden az test çalıştı: %', (select count(*) from _results); end if;
end $check$;

rollback;
