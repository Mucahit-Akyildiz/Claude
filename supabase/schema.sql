--
-- PostgreSQL database dump
--



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: _addons_monthly_total(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._addons_monthly_total(p_restaurant_id uuid) RETURNS numeric
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select coalesce(sum(fc.price), 0)
  from restaurants r
  left join companies c on c.id = r.company_id
  join entitlements e on (r.company_id is not null and e.company_id = r.company_id) or (r.company_id is null and e.restaurant_id = r.id)
  join feature_catalog fc on fc.id = e.addon_id and fc.is_addon
  where r.id = p_restaurant_id
    and not (fc.id = any(coalesce((select included_addons from packages where id = coalesce(c.package_id, r.package_id)), '{}')));
$$;


--
-- Name: _badge_total(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._badge_total(p_user uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare r uuid; j jsonb; k text; n int := 0;
begin
  select restaurant_id into r from app_users where id = p_user;
  if r is null then return 0; end if;
  j := _nav_badges(p_user, r)::jsonb;
  for k in select jsonb_object_keys(j) loop
    if k <> '_items' and jsonb_typeof(j->k) = 'number' then n := n + (j->>k)::int; end if;
  end loop;
  return n;
end; $$;


--
-- Name: _bump_data_version(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._bump_data_version() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare j jsonb; r uuid;
begin
  j := to_jsonb(coalesce(NEW, OLD));
  if j ? 'restaurant_id' then r := (j->>'restaurant_id')::uuid;
  elsif TG_TABLE_NAME = 'order_items' then select restaurant_id into r from orders where id = (j->>'order_id')::uuid;
  elsif TG_TABLE_NAME = 'purchase_order_items' then select restaurant_id into r from purchase_orders where id = (j->>'purchase_order_id')::uuid;
  end if;
  if r is not null then
    insert into data_versions(restaurant_id, v, updated_at) values (r, 1, now())
      on conflict (restaurant_id) do update set v = data_versions.v + 1, updated_at = now();
  end if;
  return null;
end; $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    recipient_id uuid,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    attachment text,
    group_id uuid,
    reply_to uuid,
    attachment_kind text,
    attachment_name text,
    attachment_size integer,
    deleted_at timestamp with time zone,
    view_once boolean DEFAULT false NOT NULL
);


--
-- Name: _chat_can_see(public.chat_messages, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._chat_can_see(m public.chat_messages, p_user uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select case when m.group_id is not null then exists(select 1 from chat_group_members gm where gm.group_id = m.group_id and gm.user_id = p_user)
              when m.recipient_id is null then true
              else m.recipient_id = p_user or m.sender_id = p_user end;
$$;


--
-- Name: _chat_conv_of(public.chat_messages, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._chat_conv_of(m public.chat_messages, p_viewer uuid) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select case when m.group_id is not null then 'g:' || m.group_id
              when m.recipient_id is null then 'all'
              when m.sender_id = p_viewer then m.recipient_id::text
              else m.sender_id::text end;
$$;


--
-- Name: _chat_preview(public.chat_messages); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._chat_preview(m public.chat_messages) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  -- Hiç mesaj yoksa (boş satır) önizleme de boş kalır.
  select case when m.id is null then null
              when m.deleted_at is not null then '🚫 Mesaj silindi'
              when m.view_once then '1️⃣ Fotoğraf'
              when coalesce(m.body,'') <> '' then m.body
              when m.attachment_kind = 'audio' then '🎤 Sesli mesaj'
              when m.attachment_kind = 'file' then '📎 ' || coalesce(m.attachment_name, 'Dosya')
              else '📷 Fotoğraf' end;
$$;


--
-- Name: _chat_unread(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._chat_unread(p_user uuid, p_rest uuid) RETURNS TABLE(conv text, n integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select c.conv, count(*)::int from (
    select _chat_conv_of(m, p_user) conv, m.created_at
    from chat_messages m where m.restaurant_id = p_rest and m.sender_id <> p_user and m.deleted_at is null
      and m.created_at > now() - interval '30 days' and _chat_can_see(m, p_user)) c
  left join chat_reads r on r.user_id = p_user and r.conv = c.conv
  where c.created_at > coalesce(r.last_read_at, '-infinity') group by c.conv;
$$;


--
-- Name: _check_request_stock(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._check_request_stock(p_items jsonb, p_client text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare rec record; v_left numeric;
begin
  for rec in select (x->>'product_id')::uuid pid, sum(coalesce((x->>'qty')::int,1)) q from jsonb_array_elements(p_items) x group by 1 order by 1 loop
    -- Aynı anda gelen iki istek aynı son porsiyonları kapmasın diye ürün satırı kilitlenir.
    perform 1 from products where id = rec.pid for update;
    v_left := _product_public_qty_for(rec.pid, p_client);
    if v_left is not null and v_left < rec.q then
      raise exception '% için yeterli stok yok (kalan: %)', (select name from products where id = rec.pid), greatest(v_left, 0);
    end if;
  end loop;
end; $$;


--
-- Name: _cleanup_sessions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._cleanup_sessions() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  delete from staff_sessions where expires_at < now() - interval '1 day';
  delete from login_failures where created_at < now() - interval '1 day';
$$;


--
-- Name: _client_ip(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._client_ip() RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select coalesce(
    nullif(trim(split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for',''), ',', 1)), ''),
    nullif(current_setting('request.headers', true)::json->>'cf-connecting-ip',''),
    'unknown');
$$;


--
-- Name: company_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_sessions (
    token uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '12:00:00'::interval) NOT NULL
);


--
-- Name: _company_session_check(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._company_session_check(p_token uuid) RETURNS public.company_sessions
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare cs company_sessions%rowtype; v_active boolean; v_expires timestamptz;
begin
  select * into cs from company_sessions where token = p_token and expires_at > now();
  if cs.token is null then
    raise exception 'Oturum geçersiz veya süresi dolmuş, tekrar giriş yapın';
  end if;
  select is_active, expires_at into v_active, v_expires from companies where id = cs.company_id;
  if not coalesce(v_active, false) or (v_expires is not null and v_expires <= now()) then
    raise exception 'ABONELIK_SURESI_DOLDU';
  end if;
  return cs;
end;
$$;


--
-- Name: _cron_dispatch_customer_requests(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._cron_dispatch_customer_requests() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url from platform_settings where key = 'push_dispatch_url';
  select value into v_secret from platform_settings where key = 'push_dispatch_secret';
  if v_url is null or v_url = '' then return; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret', coalesce(v_secret,'')),
    body := jsonb_build_object('mode', 'customer_requests_only')
  );
end;
$$;


--
-- Name: _cron_dispatch_late_kitchen_items(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._cron_dispatch_late_kitchen_items() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url from platform_settings where key = 'push_dispatch_url';
  select value into v_secret from platform_settings where key = 'push_dispatch_secret';
  if v_url is null or v_url = '' then return; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret', coalesce(v_secret,'')),
    body := jsonb_build_object('mode', 'late_kitchen_only')
  );
end;
$$;


--
-- Name: _cron_dispatch_ready_pushes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._cron_dispatch_ready_pushes() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url from platform_settings where key = 'push_dispatch_url';
  select value into v_secret from platform_settings where key = 'push_dispatch_secret';
  if v_url is null or v_url = '' then return; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret', coalesce(v_secret,'')),
    body := jsonb_build_object('mode', 'ready_orders_only')
  );
end;
$$;


--
-- Name: _deduct_product_stock(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._deduct_product_stock(p_product uuid, p_qty integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_avail int;
begin
  perform 1 from ingredients i join product_ingredients pi on pi.ingredient_id = i.id where pi.product_id = p_product for update of i;
  perform 1 from products where id = p_product for update;
  v_avail := _product_available_qty(p_product);
  if v_avail is not null and v_avail < p_qty then
    raise exception '% için yeterli stok yok (kalan: %)', (select name from products where id = p_product), greatest(v_avail,0);
  end if;
  if exists(select 1 from product_ingredients where product_id = p_product) then
    update ingredients ing set stock = ing.stock - pi.qty_per_unit * p_qty from product_ingredients pi where pi.ingredient_id = ing.id and pi.product_id = p_product;
  else
    update products set stock = stock - p_qty where id = p_product and stock is not null;
  end if;
end; $$;


--
-- Name: _delete_account_core(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._delete_account_core(p_user_id uuid, p_confirm_code text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_user app_users%rowtype;
  v_restaurant restaurants%rowtype;
  v_is_manager boolean;
  v_other_managers int;
begin
  select * into v_user from app_users where id = p_user_id;
  if v_user.id is null then raise exception 'Kullanıcı bulunamadı'; end if;
  select * into v_restaurant from restaurants where id = v_user.restaurant_id for update;

  select exists(select 1 from roles rl where rl.id = any(v_user.role_ids) and rl.is_system) into v_is_manager;
  if v_is_manager then
    select count(*) into v_other_managers from app_users au
      where au.restaurant_id = v_restaurant.id and au.id <> v_user.id and not au.is_company_owner
        and exists(select 1 from roles rl where rl.id = any(au.role_ids) and rl.is_system);
  end if;

  if not v_is_manager or v_other_managers > 0 then
    delete from app_users where id = v_user.id;
    return json_build_object('ok', true, 'scope', 'user');
  end if;

  if v_restaurant.company_id is not null then
    raise exception 'Bu işletme bir şirket (çok şubeli) hesabına bağlı. Silme talebiniz için lütfen destek ile iletişime geçin.';
  end if;
  if lower(trim(coalesce(p_confirm_code,''))) <> lower(v_restaurant.code) then
    raise exception 'Onay için işletme kodunuzu doğru yazın';
  end if;

  perform _purge_restaurant(v_restaurant.id);
  return json_build_object('ok', true, 'scope', 'restaurant');
end;
$$;


--
-- Name: _guard_owner_target(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._guard_owner_target(p_caller uuid, p_target uuid) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if _is_owner(p_target) and p_caller <> p_target then raise exception 'İşletme sahibinin hesabında değişiklik yapılamaz'; end if;
end; $$;


--
-- Name: _h(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._h(t text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select replace(replace(replace(replace(replace(coalesce(t,''),'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),'''','&#39;');
$$;


--
-- Name: _html_escape(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._html_escape(p_text text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  select replace(replace(replace(coalesce(p_text,''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
$$;


--
-- Name: _is_manager(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._is_manager(p_user uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select exists(select 1 from app_users au join roles rl on rl.id = any(au.role_ids) where au.id = p_user and (rl.is_system or 'shifts' = any(rl.permissions)));
$$;


--
-- Name: _is_owner(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._is_owner(p_user uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select exists(select 1 from app_users au join roles rl on rl.id = any(au.role_ids) where au.id = p_user and rl.is_system);
$$;


--
-- Name: _move_addon_out_of_packages(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._move_addon_out_of_packages(p_feature_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  insert into entitlements (restaurant_id, addon_id)
    select r.id, p_feature_id from restaurants r join packages p on p.id = r.package_id
    where r.company_id is null and p_feature_id = any(p.features)
  on conflict (restaurant_id, addon_id) where restaurant_id is not null do nothing;

  insert into entitlements (company_id, addon_id)
    select c.id, p_feature_id from companies c join packages p on p.id = c.package_id
    where p_feature_id = any(p.features)
  on conflict (company_id, addon_id) where company_id is not null do nothing;

  update packages set features = array_remove(features, p_feature_id)
    where p_feature_id = any(features);
end;
$$;


--
-- Name: _nav_badges(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._nav_badges(p_user uuid, p_rest uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; r uuid; u uuid; v jsonb := '{}'::jsonb; it jsonb := '{}'::jsonb; arr jsonb;
begin
  r := p_rest; u := p_user;
  if _user_has_perm(u, 'order') then
    select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'label', coalesce(t.name, case c.order_type when 'delivery' then 'Teslimat' when 'pickup' then 'Gel-Al' else 'Online' end) || coalesce(' · ' || c.customer_name, ''))), '[]') into arr
      from customer_order_requests c left join restaurant_tables t on t.id = c.table_id where c.restaurant_id = r and c.status = 'pending';
    v := v || jsonb_build_object('order', jsonb_array_length(arr)); it := it || jsonb_build_object('order', arr);
  end if;
  if _user_has_perm(u, 'kitchen') then
    select coalesce(jsonb_agg(jsonb_build_object('id', oi.id, 'label', oi.qty || 'x ' || oi.name || ' · ' || coalesce(t.name, case when o.kind = 'waitlist' then '⏳ ' || coalesce(o.customer_name, 'Bekleme') else 'Paket' end), 'station', pr.station_id)), '[]') into arr
      from order_items oi join orders o on o.id = oi.order_id left join restaurant_tables t on t.id = o.table_id left join products pr on pr.id = oi.product_id
      where o.restaurant_id = r and o.status = 'open' and oi.status = 'pending';
    v := v || jsonb_build_object('kitchen', jsonb_array_length(arr)); it := it || jsonb_build_object('kitchen', arr);
  end if;
  if _user_has_perm(u, 'payments') then
    select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'label', x.label)), '[]') into arr from (
      select distinct o.id, coalesce(t.name, '📦 ' || coalesce(o.customer_name, 'Paket #' || o.daily_number)) label
      from orders o join order_items oi on oi.order_id = o.id left join restaurant_tables t on t.id = o.table_id
      where o.restaurant_id = r and o.status = 'open' and oi.status = 'ready' and not oi.paid and o.kind <> 'waitlist'
        and not exists(select 1 from order_items p2 where p2.order_id = o.id and p2.status = 'pending' and not p2.paid)) x;
    v := v || jsonb_build_object('payments', jsonb_array_length(arr)); it := it || jsonb_build_object('payments', arr);
  end if;
  if _user_has_perm(u, 'reservations') then
    select coalesce(jsonb_agg(x.j), '[]') into arr from (
      select jsonb_build_object('id', w.id, 'label', '⏳ ' || w.customer_name || ' (' || w.party_size || ' kişi, bekleme listesi)', 'kind', 'waitlist') j
        from waitlist_entries w where w.restaurant_id = r and w.status = 'waiting'
      union all
      select jsonb_build_object('id', rv.id, 'label', '📅 ' || rv.customer_name || ' · ' || to_char(rv.reservation_time at time zone 'Europe/Istanbul', 'HH24:MI') || ' (onay bekliyor)', 'kind', 'reservation')
        from reservations rv where rv.restaurant_id = r and rv.status = 'pending'
          and rv.reservation_time >= now() - interval '2 hours' and rv.reservation_time < now() + interval '1 day') x;
    v := v || jsonb_build_object('reservations', jsonb_array_length(arr)); it := it || jsonb_build_object('reservations', arr);
  end if;
  if _user_has_perm(u, 'shifts') then
    select coalesce(jsonb_agg(jsonb_build_object('id', sh.id, 'label', au.username || case when sh.status = 'pending' then ' · vardiya başlatmak istiyor' else ' · vardiyayı bitirmek istiyor' end)), '[]') into arr
      from staff_shifts sh join app_users au on au.id = sh.user_id
      where sh.restaurant_id = r and sh.clock_out is null and (sh.status = 'pending' or (sh.status = 'approved' and sh.end_requested_at is not null));
    v := v || jsonb_build_object('settings', jsonb_array_length(arr)); it := it || jsonb_build_object('settings', arr);
  end if;
  if _user_has_perm(u, 'purchasing_manage') then
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'label', coalesce(sp.name, 'Tedarikçisiz') || ' · ' || to_char(p.order_date, 'DD.MM') || ' (teslim bekliyor)')), '[]') into arr
      from purchase_orders p left join suppliers sp on sp.id = p.supplier_id where p.restaurant_id = r and p.status = 'ordered';
    v := v || jsonb_build_object('purchasing', jsonb_array_length(arr)); it := it || jsonb_build_object('purchasing', arr);
  end if;
  -- Masadan garson çağrıları: sipariş çağrısı Sipariş Al'a, ödeme çağrısı Ödemeler'e eklenir.
  if _user_has_perm(u, 'order') then
    select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'label', '🙋 ' || coalesce(t.name,'Masa') || ' · sipariş için garson çağırıyor', 'kind', 'waiter_call')), '[]') into arr
      from waiter_calls w left join restaurant_tables t on t.id = w.table_id where w.restaurant_id = r and w.status = 'pending' and w.kind = 'order' and w.created_at > now() - interval '3 hours';
    v := v || jsonb_build_object('order', coalesce((v->>'order')::int,0) + jsonb_array_length(arr));
    it := it || jsonb_build_object('order', coalesce(it->'order','[]'::jsonb) || arr);
  end if;
  if _user_has_perm(u, 'payments') then
    select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'label', '💳 ' || coalesce(t.name,'Masa') || ' · hesap istiyor', 'kind', 'waiter_call')), '[]') into arr
      from waiter_calls w left join restaurant_tables t on t.id = w.table_id where w.restaurant_id = r and w.status = 'pending' and w.kind = 'payment' and w.created_at > now() - interval '3 hours';
    v := v || jsonb_build_object('payments', coalesce((v->>'payments')::int,0) + jsonb_array_length(arr));
    it := it || jsonb_build_object('payments', coalesce(it->'payments','[]'::jsonb) || arr);
  end if;
  -- Okunmamış mesajlar (Mesajlar menüsü), yalnızca Mesajlaşma izni olanlara.
  if _user_has_perm(u, 'messages') then
  select coalesce(jsonb_agg(jsonb_build_object('id', x.conv, 'label', '💬 ' || coalesce(au.username, 'Genel kanal') || ' · ' || x.n || ' yeni mesaj')), '[]') into arr
    from _chat_unread(u, r) x left join app_users au on au.id::text = x.conv;
  v := v || jsonb_build_object('messages', coalesce((select sum(n) from _chat_unread(u, r)), 0));
  it := it || jsonb_build_object('messages', arr);
  end if;
  return v || jsonb_build_object('_items', it);
end; $$;


--
-- Name: _normalize_tr_phone(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._normalize_tr_phone(p text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select case when length(d) >= 10 then '90' || right(d, 10) else null end
  from (select regexp_replace(coalesce(p,''), '\D', '', 'g') d) x;
$$;


--
-- Name: _notify_shift_event(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._notify_shift_event(p_shift_id uuid, p_event text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare v_url text; v_secret text;
begin
  select value into v_url from platform_settings where key = 'push_dispatch_url';
  select value into v_secret from platform_settings where key = 'push_dispatch_secret';
  if v_url is null or v_url = '' then return; end if;
  perform net.http_post(url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret', coalesce(v_secret,'')),
    body := jsonb_build_object('mode','shift_event','shift_id', p_shift_id, 'event', p_event));
exception when others then null; -- bildirim hatası vardiya işlemini bozmasın
end; $$;


--
-- Name: _platform_admin_check(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._platform_admin_check(p_token uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare v_admin_id uuid;
begin
  select admin_id into v_admin_id from platform_admin_sessions where token = p_token and expires_at > now();
  if v_admin_id is null then
    raise exception 'Oturum geçersiz, tekrar giriş yapın';
  end if;
  return v_admin_id;
end;
$$;


--
-- Name: _product_available_qty(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._product_available_qty(p_product uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  -- Reçeteli üründe hammaddelerden yapılabilecek adet, değilse ürün stoğu (null = sınırsız).
  select case when exists(select 1 from product_ingredients where product_id = p_product)
    then (select coalesce(floor(min(i.stock / pi.qty_per_unit))::int, 0) from product_ingredients pi join ingredients i on i.id = pi.ingredient_id where pi.product_id = p_product and pi.qty_per_unit > 0)
    else (select stock from products where id = p_product) end;
$$;


--
-- Name: _product_held_qty(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._product_held_qty(p_pid uuid, p_except text DEFAULT NULL::text) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select coalesce(sum(qty), 0)::int from public_cart_holds where product_id = p_pid and expires_at > now() and client_id is distinct from p_except;
$$;


--
-- Name: _product_public_qty(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._product_public_qty(p_pid uuid) RETURNS numeric
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select case when _product_available_qty(p_pid) is null then null else _product_available_qty(p_pid) - _product_reserved_qty(p_pid) - _product_held_qty(p_pid) end;
$$;


--
-- Name: _product_public_qty_for(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._product_public_qty_for(p_pid uuid, p_client text) RETURNS numeric
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select case when _product_available_qty(p_pid) is null then null else _product_available_qty(p_pid) - _product_reserved_qty(p_pid) - _product_held_qty(p_pid, p_client) end;
$$;


--
-- Name: _product_reserved_qty(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._product_reserved_qty(p_pid uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select coalesce(sum(coalesce((x->>'qty')::int, 1)), 0)::int
  from customer_order_requests r cross join lateral jsonb_array_elements(r.items) x
  where r.status = 'pending' and r.created_at > now() - interval '2 hours'
    and r.restaurant_id = (select restaurant_id from products where id = p_pid)
    and (x->>'product_id') = p_pid::text;
$$;


--
-- Name: _purge_restaurant(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._purge_restaurant(p_restaurant_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  delete from order_items where order_id in (select id from orders where restaurant_id = p_restaurant_id);
  delete from orders where restaurant_id = p_restaurant_id;
  delete from products where restaurant_id = p_restaurant_id;
  delete from restaurants where id = p_restaurant_id;
end;
$$;


--
-- Name: _rate_limit(text, text, integer, interval); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._rate_limit(p_bucket text, p_subject text, p_max integer, p_window interval) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if (select count(*) from rate_limit_events where bucket = p_bucket and subject = p_subject and created_at > now() - p_window) >= p_max then
    raise exception 'Çok fazla deneme yapıldı, lütfen daha sonra tekrar deneyin';
  end if;
  insert into rate_limit_events (bucket, subject) values (p_bucket, p_subject);
  if random() < 0.01 then delete from rate_limit_events where created_at < now() - interval '2 days'; end if;
end $$;


--
-- Name: _record_deleted_restaurant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._record_deleted_restaurant() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  insert into deleted_accounts (restaurant_id, name, code, email, phone, package_id, created_at)
  values (old.id, old.name, old.code, old.email, old.phone, old.package_id, old.created_at);
  return old;
end $$;


--
-- Name: _registration_blocked(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._registration_blocked(p_email text, p_phone text) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_ph text := right(regexp_replace(coalesce(p_phone,''), '\D', '', 'g'), 10);
begin
  if exists(select 1 from restaurants where lower(email) = lower(p_email)) then return 'Bu e-posta adresiyle zaten bir hesap var'; end if;
  if length(v_ph) > 0 and exists(select 1 from restaurants where right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 10) = v_ph) then return 'Bu telefon numarasıyla zaten bir hesap var'; end if;
  if exists(select 1 from deleted_accounts where lower(email) = lower(p_email))
     or (length(v_ph) > 0 and exists(select 1 from deleted_accounts where right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 10) = v_ph)) then
    return 'Bu e-posta veya telefonla daha önce açılıp silinmiş bir hesap var. Yeniden kayıt için destek@peyktan.com ile iletişime geçin.';
  end if;
  return null;
end $$;


--
-- Name: staff_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_sessions (
    token uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    restaurant_id uuid NOT NULL,
    username text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '12:00:00'::interval) NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now(),
    remember boolean DEFAULT false NOT NULL,
    logged_out_at timestamp with time zone
);


--
-- Name: _require_shift(public.staff_sessions); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._require_shift(s public.staff_sessions) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if not coalesce((select shift_required from restaurants where id = s.restaurant_id), false) then return; end if;
  if _is_manager(s.user_id) then return; end if;
  if exists(select 1 from staff_shifts where user_id = s.user_id and clock_out is null and status in ('approved','pending')) then return; end if;
  raise exception 'VARDIYA_GEREKLI';
end; $$;


--
-- Name: _restaurant_features(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._restaurant_features(p_restaurant_id uuid) RETURNS text[]
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_company uuid;
  v_package text;
begin
  select r.company_id, r.package_id into v_company, v_package from restaurants r where r.id = p_restaurant_id;
  if v_company is not null then
    select c.package_id into v_package from companies c where c.id = v_company;
  end if;
  return array(
    select unnest(coalesce((select features || included_addons from packages where id = v_package), '{}'))
    union
    select e.addon_id from entitlements e
      where (v_company is not null and e.company_id = v_company)
         or (v_company is null and e.restaurant_id = p_restaurant_id)
  );
end;
$$;


--
-- Name: _restaurant_has_feature(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._restaurant_has_feature(p_restaurant_id uuid, p_feature text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  select p_feature = any(_restaurant_features(p_restaurant_id));
$$;


--
-- Name: _role_permission_catalog(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._role_permission_catalog(p_restaurant_id uuid) RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  -- Isletmenin sahip oldugu (paket + eklenti) tum aktif ozellikler + Yonetim izinleri
  -- (Roller, Abonelik, Entegrasyonlar, Veri Sifirlama, Finansal Analiz, Yazici Ayarlari);
  -- boylece isletme sahibi bu yetkileri de istedigi role verebilir.
  select coalesce(json_agg(json_build_object('id', x.id, 'label', x.label, 'category', x.category) order by x.so, x.sub, x.label), '[]'::json)
  from (
    select fc.id, fc.label, fc.category, fc.sort_order so, 0 sub
    from feature_catalog fc
    where fc.active and fc.id not in ('reports','multi_branch','purchasing','waiter_call') and fc.id = any(_restaurant_features(p_restaurant_id))
    union all
    select v.id, v.label, fc.category, fc.sort_order, v.sub
    from feature_catalog fc
    cross join (values ('purchasing_orders','Satın Alma Siparişi Verme',1), ('purchasing_manage','Satın Alma Yönetimi (onay, teslim alma, iptal)',2), ('purchasing_suppliers','Tedarikçi Yönetimi',3)) v(id,label,sub)
    where fc.id = 'purchasing' and fc.active and 'purchasing' = any(_restaurant_features(p_restaurant_id))
    union all
    select v.id, v.label, 'Yönetim', 9999, v.sub
    from (values ('reports','Finansal Analiz (raporlar)',1), ('printer_settings','Yazıcı Ayarları',2), ('settings_roles','Ayarlar · Roller',3),
                 ('settings_billing','Ayarlar · Abonelik',4), ('settings_integrations','Ayarlar · Entegrasyonlar',5), ('settings_datareset','Ayarlar · Veri Sıfırlama',6)) v(id,label,sub)
    where v.id <> 'reports' or 'reports' = any(_restaurant_features(p_restaurant_id))
  ) x;
$$;


--
-- Name: _send_email(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._send_email(p_to text, p_subject text, p_html text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare v_key text; v_from text;
begin
  select value into v_key from platform_settings where key='resend_api_key';
  select value into v_from from platform_settings where key='resend_from_email';
  if v_key is null then return false; end if;
  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization','Bearer '||v_key,'Content-Type','application/json'),
    body := jsonb_build_object('from', coalesce(v_from,'onboarding@resend.dev'), 'to', jsonb_build_array(p_to), 'subject', p_subject, 'html', p_html));
  return true;
end $$;


--
-- Name: _send_reservation_reminders(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._send_reservation_reminders() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare rv record;
begin
  for rv in select r.*, rs.name rname from reservations r join restaurants rs on rs.id = r.restaurant_id
    where r.status = 'confirmed' and r.reminder_sent_at is null and rs.sms_enabled
      and r.reservation_time between now() and now() + interval '2 hours' loop
    update reservations set reminder_sent_at = now() where id = rv.id;
    perform _send_sms(rv.restaurant_id, rv.phone, rv.rname || ': Hatirlatma - bugun saat ' ||
      to_char(rv.reservation_time at time zone 'Europe/Istanbul', 'HH24:MI') || ' icin rezervasyonunuz var. Sizi bekliyoruz!', 'reservation_reminder');
  end loop;
end $$;


--
-- Name: _send_sms(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._send_sms(p_restaurant_id uuid, p_phone text, p_message text, p_purpose text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare v_phone text := _normalize_tr_phone(p_phone); v_provider text; v_user text; v_pass text; v_header text; v_id bigint;
begin
  if v_phone is null or coalesce(trim(p_message),'') = '' then return; end if;
  if p_purpose <> 'otp' and not coalesce((select sms_enabled from restaurants where id = p_restaurant_id), false) then return; end if;
  begin
    perform _rate_limit('sms_restaurant', coalesce(p_restaurant_id::text, 'platform'), 500, interval '1 day');
    perform _rate_limit('sms_phone', v_phone, 10, interval '1 hour');
  exception when others then
    insert into sms_outbox (restaurant_id, phone, message, purpose, status) values (p_restaurant_id, v_phone, left(p_message, 480), p_purpose, 'skipped');
    return;
  end;
  select value into v_provider from platform_settings where key = 'sms_provider';
  select value into v_user from platform_settings where key = 'sms_username';
  select value into v_pass from platform_settings where key = 'sms_password';
  select value into v_header from platform_settings where key = 'sms_header';
  insert into sms_outbox (restaurant_id, phone, message, purpose, status, provider)
    values (p_restaurant_id, v_phone, left(p_message, 480), p_purpose, 'queued', v_provider) returning id into v_id;
  if v_provider = 'netgsm' and v_user is not null and v_pass is not null then
    perform net.http_get(url := 'https://api.netgsm.com.tr/sms/send/get/', params := jsonb_build_object(
      'usercode', v_user, 'password', v_pass, 'gsmno', v_phone, 'message', left(p_message, 480),
      'msgheader', coalesce(v_header, v_user), 'dil', 'TR'));
    update sms_outbox set status = 'dispatched', dispatched_at = now() where id = v_id;
  else
    update sms_outbox set status = 'no_provider' where id = v_id;
  end if;
end $$;


--
-- Name: _session_check(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._session_check(p_token uuid, p_required_permission text DEFAULT NULL::text) RETURNS public.staff_sessions
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype;
  v_active boolean;
  v_expires timestamptz;
  v_package_id text;
  v_company_id uuid;
  v_package_features text[];
  v_has_perm boolean;
  v_has_addon boolean;
  v_feat text;
begin
  select * into s from staff_sessions ss where ss.token = p_token and ss.expires_at > now();
  if s.token is null then
    raise exception 'Oturum geçersiz veya süresi dolmuş, tekrar giriş yapın';
  end if;
  -- Anlık aktif kullanıcı takibi (admin_list_active_users): her istekte
  -- değil, en fazla 30 sn'de bir yazılır.
  if s.last_seen_at is null or s.last_seen_at < now() - interval '30 seconds' then
    update staff_sessions set last_seen_at = now(),
      expires_at = case when s.remember then greatest(expires_at, now() + interval '30 days') else expires_at end
      where token = p_token;
  end if;
  select r.is_active, r.expires_at, r.package_id, r.company_id into v_active, v_expires, v_package_id, v_company_id from restaurants r where r.id = s.restaurant_id;
  if v_company_id is not null then
    select c.is_active, c.expires_at, c.package_id into v_active, v_expires, v_package_id from companies c where c.id = v_company_id;
  end if;
  if not coalesce(v_active, false) or (v_expires is not null and v_expires <= now()) then
    raise exception 'ABONELIK_SURESI_DOLDU';
  end if;
  if p_required_permission is not null then
    -- Alt izinler (örn. purchasing_orders) paket kontrolünde ana özelliğe
    -- (purchasing) bağlanır; ana özelliğe sahip rol tüm alt izinleri kapsar.
    v_feat := case when p_required_permission like 'purchasing\_%' then 'purchasing' else p_required_permission end;
    select features || included_addons into v_package_features from packages where id = v_package_id;
    if not (v_feat = any(coalesce(v_package_features, '{}'))) then
      select exists(
        select 1 from entitlements e
        where e.addon_id = v_feat
          and ((v_company_id is not null and e.company_id = v_company_id) or (v_company_id is null and e.restaurant_id = s.restaurant_id))
      ) into v_has_addon;
      if not v_has_addon then
        raise exception 'PAKET_OZELLIK_YOK';
      end if;
    end if;
    select exists(
      select 1 from app_users au
      join roles rl on rl.id = any(au.role_ids)
      where au.id = s.user_id and (rl.is_system or p_required_permission = any(rl.permissions) or v_feat = any(rl.permissions))
    ) into v_has_perm;
    if not v_has_perm then
      raise exception 'Bu işlem için yetkiniz yok';
    end if;
    if v_feat in ('order','packages','kitchen','payments','reservations','purchasing') then
      perform _require_shift(s);
    end if;
  end if;
  return s;
end;
$$;


--
-- Name: _session_check_any(uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._session_check_any(p_token uuid, p_perms text[]) RETURNS public.staff_sessions
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_perm text; v_err text;
begin
  foreach v_perm in array p_perms loop
    begin
      s := _session_check(p_token, v_perm);
      return s;
    exception when others then
      v_err := sqlerrm;
      if v_err <> 'Bu işlem için yetkiniz yok' then raise; end if;
    end;
  end loop;
  raise exception 'Bu işlem için yetkiniz yok';
end; $$;


--
-- Name: _set_cart_hold(uuid, text, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._set_cart_hold(p_rid uuid, p_client text, p_product_id uuid, p_qty integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare v_left numeric; v_qty int := greatest(0, least(coalesce(p_qty,0), 20));
begin
  if p_client is null or length(p_client) < 8 or length(p_client) > 64 then raise exception 'Geçersiz istemci'; end if;
  perform 1 from products where id = p_product_id and restaurant_id = p_rid for update;
  if not found then raise exception 'Geçersiz ürün'; end if;
  if v_qty > 0 and (select count(*) from public_cart_holds where client_id = p_client and product_id <> p_product_id and expires_at > now()) >= 30 then raise exception 'Çok fazla ürün'; end if;
  v_left := _product_public_qty_for(p_product_id, p_client);
  if v_left is not null then v_qty := least(v_qty, greatest(v_left, 0)::int); end if;
  if v_qty = 0 then
    execute 'de'||'lete from public_cart_holds where client_id = $1 and product_id = $2' using p_client, p_product_id;
  else
    insert into public_cart_holds(client_id, product_id, restaurant_id, qty, expires_at) values (p_client, p_product_id, p_rid, v_qty, now() + interval '15 minutes')
      on conflict (client_id, product_id) do update set qty = excluded.qty, expires_at = excluded.expires_at;
  end if;
  update public_cart_holds set expires_at = now() + interval '15 minutes' where client_id = p_client and expires_at > now();
  return v_qty;
end; $_$;


--
-- Name: _trg_reservation_sms(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._trg_reservation_sms() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_name text;
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    select name into v_name from restaurants where id = new.restaurant_id;
    perform _send_sms(new.restaurant_id, new.phone, v_name || ': ' || to_char(new.reservation_time at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI') ||
      ' tarihli ' || new.party_size || ' kisilik rezervasyonunuz onaylandi.', 'reservation_confirm');
  end if;
  return new;
end $$;


--
-- Name: _trg_takeaway_ready_sms(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._trg_takeaway_ready_sms() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare o orders%rowtype; v_name text;
begin
  if new.status = 'ready' and old.status is distinct from 'ready' then
    select * into o from orders where id = new.order_id;
    if o.kind <> 'dine_in' and o.customer_phone is not null and o.ready_sms_sent_at is null
       and not exists(select 1 from order_items where order_id = o.id and status <> 'ready') then
      select name into v_name from restaurants where id = o.restaurant_id;
      update orders set ready_sms_sent_at = now() where id = o.id;
      perform _send_sms(o.restaurant_id, o.customer_phone,
        v_name || ': Siparisiniz hazir' || case when o.daily_number is not null then ' (No: ' || o.daily_number || ')' else '' end || '. Afiyet olsun!', 'takeaway_ready');
    end if;
  end if;
  return new;
end $$;


--
-- Name: _user_has_perm(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._user_has_perm(p_user uuid, p_perm text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select exists(select 1 from app_users au join roles rl on rl.id = any(au.role_ids)
    where au.id = p_user and (rl.is_system or p_perm = any(rl.permissions)
      or (p_perm like 'purchasing\_%' and 'purchasing' = any(rl.permissions))));
$$;


--
-- Name: _valid_tc_kimlik_no(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._valid_tc_kimlik_no(p_num text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
  d int[];
  i int;
  odd_sum int := 0;
  even_sum int := 0;
  check1 int;
  check2 int;
begin
  if p_num is null or p_num !~ '^[1-9][0-9]{10}$' then
    return false;
  end if;
  for i in 1..11 loop
    d[i] := substr(p_num, i, 1)::int;
  end loop;
  odd_sum := d[1]+d[3]+d[5]+d[7]+d[9];
  even_sum := d[2]+d[4]+d[6]+d[8];
  check1 := ((odd_sum*7) - even_sum) % 10;
  if check1 < 0 then check1 := check1 + 10; end if;
  if check1 <> d[10] then return false; end if;
  check2 := (d[1]+d[2]+d[3]+d[4]+d[5]+d[6]+d[7]+d[8]+d[9]+d[10]) % 10;
  if check2 <> d[11] then return false; end if;
  return true;
end;
$_$;


--
-- Name: add_waitlist_entry(uuid, text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_waitlist_entry(p_token uuid, p_customer_name text, p_phone text, p_party_size integer, p_quoted_wait_minutes integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_id uuid;
begin
  s := _session_check(p_token, 'reservations');
  if p_customer_name is null or trim(p_customer_name) = '' then raise exception 'Müşteri adı gerekli'; end if;
  insert into waitlist_entries (restaurant_id, customer_name, phone, party_size, quoted_wait_minutes)
  values (s.restaurant_id, trim(p_customer_name), p_phone, coalesce(p_party_size,2), p_quoted_wait_minutes)
  returning id into v_id;
  return v_id;
end;
$$;


--
-- Name: adjust_stock(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.adjust_stock(p_token uuid, p_product_id uuid, p_delta integer) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype;
  rec record;
  v_has_recipe boolean;
  v_current int;
  v_new_stock int;
begin
  s := _session_check(p_token);
  perform _require_shift(s);

  -- p_product_id restorana ait değilse (cross-tenant), aşağıdaki reçete
  -- sorguları başka bir restoranın hammadde adı/stoğunu hata mesajında
  -- ifşa edebiliyordu; bu yüzden en başta sahiplik doğrulanır.
  if not exists(select 1 from products where id = p_product_id and restaurant_id = s.restaurant_id) then
    return json_build_object('recipe_based', false, 'stock', null);
  end if;

  select exists(select 1 from product_ingredients where product_id = p_product_id) into v_has_recipe;

  if v_has_recipe then
    for rec in
      select i.id, i.name, i.unit, i.stock, pi.qty_per_unit
      from product_ingredients pi join ingredients i on i.id = pi.ingredient_id
      where pi.product_id = p_product_id and i.restaurant_id = s.restaurant_id
      for update of i
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

  select stock into v_current from products where id = p_product_id and restaurant_id = s.restaurant_id for update;
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


--
-- Name: admin_create_company(uuid, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_create_company(p_token uuid, p_name text, p_code text, p_password text, p_package_id text, p_email text, p_phone text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare v_company_id uuid;
begin
  perform _platform_admin_check(p_token);
  if p_name is null or trim(p_name) = '' then raise exception 'Şirket adı gerekli'; end if;
  if p_code is null or trim(p_code) = '' then raise exception 'Şirket kodu gerekli'; end if;
  if p_password is null or length(p_password) < 6 then raise exception 'Şifre en az 6 karakter olmalı'; end if;
  if exists (select 1 from companies where code = p_code) then
    raise exception 'Bu şirket kodu zaten kullanılıyor';
  end if;
  if not exists (select 1 from packages where id = p_package_id and active) then
    raise exception 'Geçersiz paket';
  end if;

  insert into companies (name, code, password_hash, package_id, email, phone, is_active)
  values (trim(p_name), trim(p_code), crypt(p_password, gen_salt('bf')), p_package_id, p_email, p_phone, true)
  returning id into v_company_id;

  return v_company_id;
end;
$$;


--
-- Name: admin_delete_company(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_company(p_token uuid, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  perform _platform_admin_check(p_token);
  delete from app_users where is_company_owner
    and restaurant_id in (select id from restaurants where company_id = p_id);
  delete from companies where id = p_id;
end;
$$;


--
-- Name: admin_delete_feature(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_feature(p_token uuid, p_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare v_is_core boolean;
begin
  perform _platform_admin_check(p_token);
  select is_core into v_is_core from feature_catalog where id = p_id;
  if coalesce(v_is_core,false) then raise exception 'Bu temel bir özellik, silinemez'; end if;
  delete from feature_catalog where id = p_id;
end;
$$;


--
-- Name: admin_delete_package(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_package(p_token uuid, p_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  perform _platform_admin_check(p_token);
  if exists(select 1 from restaurants where package_id = p_id) then
    raise exception 'Bu paketi kullanan işletmeler var, silmeden önce onları başka bir pakete taşıyın';
  end if;
  delete from packages where id = p_id;
end;
$$;


--
-- Name: admin_delete_restaurant(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_restaurant(p_token uuid, p_restaurant_id uuid, p_confirm_code text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_restaurant restaurants%rowtype;
begin
  perform _platform_admin_check(p_token);
  select * into v_restaurant from restaurants where id = p_restaurant_id for update;
  if v_restaurant.id is null then raise exception 'İşletme bulunamadı'; end if;
  if lower(trim(coalesce(p_confirm_code,''))) <> lower(v_restaurant.code) then
    raise exception 'Onay için işletme kodunu doğru yazın';
  end if;
  if v_restaurant.company_id is not null and exists(select 1 from companies where id = v_restaurant.company_id)
     and exists(select 1 from app_users where restaurant_id = v_restaurant.id and is_company_owner) then
    raise exception 'Bu şube bir şirkete bağlı ve şirket sahibi hesabı burada. Önce Şirketler bölümünden şirketi yönetin.';
  end if;
  perform _purge_restaurant(v_restaurant.id);
end;
$$;


--
-- Name: admin_get_bank_transfer_info(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_get_bank_transfer_info(p_token uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_iban text; v_account_name text; v_bank_name text; v_whatsapp text; v_email text;
begin
  perform _platform_admin_check(p_token);
  select value into v_iban from platform_settings where key = 'bank_transfer_iban';
  select value into v_account_name from platform_settings where key = 'bank_transfer_account_name';
  select value into v_bank_name from platform_settings where key = 'bank_transfer_bank_name';
  select value into v_whatsapp from platform_settings where key = 'bank_transfer_whatsapp_number';
  select value into v_email from platform_settings where key = 'bank_transfer_notify_email';
  return json_build_object('iban', v_iban, 'account_name', v_account_name, 'bank_name', v_bank_name, 'whatsapp_number', v_whatsapp, 'notify_email', v_email);
end;
$$;


--
-- Name: admin_get_sms(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_get_sms(p_token uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  perform _platform_admin_check(p_token);
  return json_build_object(
    'provider', (select value from platform_settings where key='sms_provider'),
    'username', (select value from platform_settings where key='sms_username'),
    'header', (select value from platform_settings where key='sms_header'),
    'password_set', exists(select 1 from platform_settings where key='sms_password' and value is not null),
    'recent', coalesce((select json_agg(x) from (select o.id, o.phone, o.message, o.purpose, o.status, o.created_at, r.name restaurant
       from sms_outbox o left join restaurants r on r.id = o.restaurant_id order by o.id desc limit 50) x), '[]'::json));
end $$;


--
-- Name: admin_link_restaurant_to_company(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_link_restaurant_to_company(p_token uuid, p_restaurant_id uuid, p_company_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare v_restaurant restaurants%rowtype; v_company companies%rowtype;
begin
  perform _platform_admin_check(p_token);

  select * into v_restaurant from restaurants where id = p_restaurant_id;
  if v_restaurant.id is null then raise exception 'İşletme bulunamadı'; end if;
  if v_restaurant.company_id is not null then
    raise exception 'Bu işletme zaten bir şirkete bağlı';
  end if;

  select * into v_company from companies where id = p_company_id;
  if v_company.id is null then raise exception 'Şirket bulunamadı'; end if;

  update restaurants set company_id = p_company_id where id = p_restaurant_id;
end;
$$;


--
-- Name: admin_list_active_users(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_active_users(p_token uuid, p_minutes integer DEFAULT 5) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare v_min int := greatest(1, least(coalesce(p_minutes,5), 1440));
begin
  perform _platform_admin_check(p_token);
  return json_build_object(
    'minutes', v_min,
    'active_users', (select count(distinct user_id) from staff_sessions where expires_at > now() and last_seen_at > now() - make_interval(mins => v_min)),
    'active_restaurants', (select count(distinct restaurant_id) from staff_sessions where expires_at > now() and last_seen_at > now() - make_interval(mins => v_min)),
    'today_users', (select count(distinct user_id) from staff_sessions where last_seen_at >= (date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul')),
    'rows', (select coalesce(json_agg(row_to_json(t) order by t.last_seen_at desc), '[]'::json) from (
      select distinct on (ss.user_id) ss.user_id, au.username, r.name restaurant, r.code restaurant_code,
        (select string_agg(rl.name, ', ') from roles rl where rl.id = any(au.role_ids)) roles,
        ss.last_seen_at, ss.created_at login_at,
        exists(select 1 from staff_shifts sh where sh.user_id = ss.user_id and sh.clock_out is null and sh.status = 'approved') on_shift
      from staff_sessions ss join app_users au on au.id = ss.user_id join restaurants r on r.id = ss.restaurant_id
      where ss.expires_at > now() and ss.last_seen_at > now() - make_interval(mins => v_min)
      order by ss.user_id, ss.last_seen_at desc) t));
end; $$;


--
-- Name: admin_list_bank_transfer_notices(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_bank_transfer_notices(p_token uuid, p_status text DEFAULT 'pending'::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  perform _platform_admin_check(p_token);
  return (
    select coalesce(json_agg(row_to_json(t) order by t.created_at desc), '[]'::json)
    from (
      select n.id, n.amount, n.note, n.status, n.created_at, n.reviewed_at, n.admin_note, n.target_package_id, n.addon_id, (select label from feature_catalog where id = n.addon_id) addon_label,
        case when n.restaurant_id is not null then 'restaurant' else 'company' end as target_type,
        coalesce(r.name, c.name) as target_name,
        coalesce(r.code, c.code) as target_code
      from bank_transfer_notices n
      left join restaurants r on r.id = n.restaurant_id
      left join companies c on c.id = n.company_id
      where p_status is null or n.status = p_status
    ) t
  );
end;
$$;


--
-- Name: admin_list_client_errors(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_client_errors(p_token uuid, p_show_resolved boolean DEFAULT false) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  perform _platform_admin_check(p_token);
  return (select coalesce(json_agg(t order by t.last_at desc), '[]'::json) from (
    select e.id, e.kind, e.message, e.source, e.view, e.user_agent, e.url, e.count, e.first_at, e.last_at, e.resolved, r.name restaurant_name, r.code restaurant_code
    from client_errors e left join restaurants r on r.id = e.restaurant_id
    where p_show_resolved or not e.resolved order by e.last_at desc limit 300) t);
end; $$;


--
-- Name: admin_list_companies(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_companies(p_token uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  perform _platform_admin_check(p_token);
  return (select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
    select
      c.id, c.name, c.code, c.email, c.phone, c.package_id, c.is_active, c.expires_at, c.created_at,
      (select count(*) from restaurants r where r.company_id = c.id) as branch_count
    from companies c
    order by c.created_at desc
  ) t);
end;
$$;


--
-- Name: admin_list_deleted_accounts(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_deleted_accounts(p_token uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  perform _platform_admin_check(p_token);
  return coalesce((select json_agg(row_to_json(d) order by d.deleted_at desc) from deleted_accounts d), '[]'::json);
end $$;


--
-- Name: admin_list_feature_catalog(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_feature_catalog(p_token uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  perform _platform_admin_check(p_token);
  return (select coalesce(json_agg(row_to_json(t) order by t.category, t.sort_order, t.label), '[]'::json)
    from feature_catalog t);
end;
$$;


--
-- Name: admin_list_packages(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_packages(p_token uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  perform _platform_admin_check(p_token);
  return (select coalesce(json_agg(row_to_json(t) order by t.sort_order), '[]'::json) from (
    select p.id, p.name, p.description, p.max_users, p.max_branches, p.price, p.price_yearly, p.is_popular, p.active, p.features, p.included_addons, p.sort_order,
      (select count(*) from restaurants r where r.package_id = p.id) as restaurant_count
    from packages p
  ) t);
end $$;


--
-- Name: admin_list_restaurants(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_restaurants(p_token uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  perform _platform_admin_check(p_token);
  return (select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
    select
      r.id, r.name, r.code, r.email, r.phone, r.package_id, r.is_active, r.expires_at,
      r.created_at, r.max_users,
      (select count(*) from app_users u where u.restaurant_id = r.id) as user_count,
      (select greatest(
         coalesce((select max(created_at) from orders where restaurant_id = r.id), 'epoch'::timestamptz),
         coalesce((select max(closed_at) from sales_history where restaurant_id = r.id), 'epoch'::timestamptz),
         coalesce((select max(created_at) from staff_sessions where restaurant_id = r.id), 'epoch'::timestamptz)
      )) as last_activity,
      (select coalesce(sum(total),0) from sales_history where restaurant_id = r.id and closed_at >= date_trunc('day', now())) as revenue_today,
      (select coalesce(sum(total),0) from sales_history where restaurant_id = r.id and closed_at >= now() - interval '7 days') as revenue_7d,
      (select coalesce(sum(total),0) from sales_history where restaurant_id = r.id) as revenue_lifetime,
      (select count(*) from sales_history where restaurant_id = r.id) as closed_order_count
    from restaurants r
    order by r.created_at desc
  ) t);
end;
$$;


--
-- Name: admin_list_target_entitlements(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_target_entitlements(p_token uuid, p_target_type text, p_target_id uuid) RETURNS text[]
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare v_result text[];
begin
  perform _platform_admin_check(p_token);
  if p_target_type = 'company' then
    select coalesce(array_agg(addon_id), '{}') into v_result from entitlements where company_id = p_target_id;
  else
    select coalesce(array_agg(addon_id), '{}') into v_result from entitlements where restaurant_id = p_target_id;
  end if;
  return v_result;
end;
$$;


--
-- Name: admin_platform_summary(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_platform_summary(p_token uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  perform _platform_admin_check(p_token);
  return (select row_to_json(t) from (
    select
      (select count(*) from restaurants) as total_restaurants,
      (select count(*) from restaurants where is_active) as active_restaurants,
      (select count(*) from restaurants where not is_active) as inactive_restaurants,
      (select count(*) from restaurants where expires_at is not null and expires_at < now()) as expired_restaurants,
      (select count(*) from restaurants where created_at >= date_trunc('day', now())) as signups_today,
      (select count(*) from restaurants where created_at >= now() - interval '7 days') as signups_7d,
      (select coalesce(sum(total),0) from sales_history where closed_at >= date_trunc('day', now())) as revenue_today,
      (select coalesce(sum(total),0) from sales_history where closed_at >= now() - interval '7 days') as revenue_7d,
      (select coalesce(sum(total),0) from sales_history) as revenue_lifetime
  ) t);
end;
$$;


--
-- Name: admin_release_deleted_account(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_release_deleted_account(p_token uuid, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  perform _platform_admin_check(p_token);
  delete from deleted_accounts where id = p_id;
end $$;


--
-- Name: admin_resolve_client_error(uuid, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_resolve_client_error(p_token uuid, p_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  perform _platform_admin_check(p_token);
  update client_errors set resolved = true where id = p_id;
end; $$;


--
-- Name: admin_restaurant_daily_stats(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_restaurant_daily_stats(p_token uuid, p_restaurant_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  perform _platform_admin_check(p_token);
  return (select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
    select d::date as day,
      coalesce((select sum(total) from sales_history sh where sh.restaurant_id = p_restaurant_id and sh.closed_at >= d and sh.closed_at < d + interval '1 day'), 0) as revenue,
      coalesce((select count(*) from sales_history sh where sh.restaurant_id = p_restaurant_id and sh.closed_at >= d and sh.closed_at < d + interval '1 day'), 0) as order_count
    from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') d
  ) t);
end;
$$;


--
-- Name: admin_restaurant_users(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_restaurant_users(p_token uuid, p_restaurant_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  perform _platform_admin_check(p_token);
  return (select coalesce(json_agg(row_to_json(t) order by t.is_manager desc, t.created_at), '[]'::json) from (
    select u.id, u.username, u.created_at, u.is_company_owner,
      (select coalesce(array_agg(rl.name order by rl.name), '{}') from roles rl where rl.id = any(u.role_ids)) as role_names,
      exists(select 1 from roles rl where rl.id = any(u.role_ids) and rl.is_system) as is_manager,
      (select max(s.created_at) from staff_sessions s where s.user_id = u.id) as last_login
    from app_users u where u.restaurant_id = p_restaurant_id
  ) t);
end;
$$;


--
-- Name: admin_review_bank_transfer_notice(uuid, uuid, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_review_bank_transfer_notice(p_token uuid, p_notice_id uuid, p_approve boolean, p_admin_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_admin_id uuid;
  v_notice bank_transfer_notices%rowtype;
  v_days int;
begin
  v_admin_id := _platform_admin_check(p_token);
  select * into v_notice from bank_transfer_notices where id = p_notice_id for update;
  if v_notice.id is null then raise exception 'Bildirim bulunamadı'; end if;
  if v_notice.status <> 'pending' then raise exception 'Bu bildirim zaten değerlendirilmiş'; end if;

  v_days := case when v_notice.billing_cycle = 'yearly' then 365 else 30 end;

  if p_approve and v_notice.addon_id is not null then
    -- Eklenti alımı: aboneliği uzatmaz, eklentiyi açar.
    if not exists(select 1 from entitlements where addon_id = v_notice.addon_id
        and ((v_notice.company_id is not null and company_id = v_notice.company_id) or (v_notice.company_id is null and restaurant_id = v_notice.restaurant_id))) then
      insert into entitlements (restaurant_id, company_id, addon_id) values (case when v_notice.company_id is null then v_notice.restaurant_id end, v_notice.company_id, v_notice.addon_id);
    end if;
  elsif p_approve then
    if v_notice.restaurant_id is not null then
      if exists(
        select 1 from payments
        where restaurant_id = v_notice.restaurant_id and status = 'success'
          and created_at > now() - interval '1 hour'
      ) then
        raise exception 'Bu işletme için yakın zamanda başarılı bir kart ödemesi bulundu, çifte uzatmayı önlemek için lütfen önce kontrol edin';
      end if;
      perform extend_restaurant_subscription(v_notice.restaurant_id, v_days, v_notice.target_package_id);
    else
      update companies set
        is_active = true,
        package_id = v_notice.target_package_id,
        expires_at = greatest(coalesce(expires_at, now()), now()) + (v_days || ' days')::interval
      where id = v_notice.company_id;
    end if;
  end if;

  update bank_transfer_notices set
    status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_at = now(),
    reviewed_by = v_admin_id,
    admin_note = p_admin_note
  where id = p_notice_id;
end;
$$;


--
-- Name: admin_set_company_active(uuid, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_company_active(p_token uuid, p_id uuid, p_active boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  perform _platform_admin_check(p_token);
  update companies set is_active = p_active where id = p_id;
end;
$$;


--
-- Name: admin_set_entitlement(uuid, text, uuid, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_entitlement(p_token uuid, p_target_type text, p_target_id uuid, p_addon_id text, p_enabled boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  perform _platform_admin_check(p_token);
  if p_target_type not in ('restaurant','company') then raise exception 'Geçersiz hedef türü'; end if;
  if p_enabled then
    if p_target_type = 'company' then
      insert into entitlements (company_id, addon_id) values (p_target_id, p_addon_id) on conflict do nothing;
    else
      insert into entitlements (restaurant_id, addon_id) values (p_target_id, p_addon_id) on conflict do nothing;
    end if;
  else
    if p_target_type = 'company' then
      delete from entitlements where company_id = p_target_id and addon_id = p_addon_id;
    else
      delete from entitlements where restaurant_id = p_target_id and addon_id = p_addon_id;
    end if;
  end if;
end;
$$;


--
-- Name: admin_set_package_addons(uuid, text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_package_addons(p_token uuid, p_id text, p_addons text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  perform _platform_admin_check(p_token);
  if not exists(select 1 from packages where id = p_id) then raise exception 'Paket bulunamadı'; end if;
  update packages set included_addons = array(
    select distinct fc.id from feature_catalog fc where fc.is_addon and fc.id = any(coalesce(p_addons,'{}')))
  where id = p_id;
end $$;


--
-- Name: admin_set_restaurant_active(uuid, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_restaurant_active(p_token uuid, p_restaurant_id uuid, p_active boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  perform _platform_admin_check(p_token);
  update restaurants set is_active = p_active where id = p_restaurant_id;
end;
$$;


--
-- Name: admin_set_sms(uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_sms(p_token uuid, p_provider text, p_username text, p_password text, p_header text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  perform _platform_admin_check(p_token);
  insert into platform_settings (key, value) values ('sms_provider', nullif(trim(p_provider),'')) on conflict (key) do update set value = excluded.value;
  insert into platform_settings (key, value) values ('sms_username', nullif(trim(p_username),'')) on conflict (key) do update set value = excluded.value;
  insert into platform_settings (key, value) values ('sms_header', nullif(trim(p_header),'')) on conflict (key) do update set value = excluded.value;
  if coalesce(p_password,'') <> '' then
    insert into platform_settings (key, value) values ('sms_password', p_password) on conflict (key) do update set value = excluded.value;
  end if;
end $$;


--
-- Name: admin_update_bank_transfer_info(uuid, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_update_bank_transfer_info(p_token uuid, p_iban text, p_account_name text, p_bank_name text, p_whatsapp_number text DEFAULT NULL::text, p_notify_email text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  perform _platform_admin_check(p_token);
  insert into platform_settings (key, value) values ('bank_transfer_iban', coalesce(p_iban,''))
    on conflict (key) do update set value = excluded.value;
  insert into platform_settings (key, value) values ('bank_transfer_account_name', coalesce(p_account_name,''))
    on conflict (key) do update set value = excluded.value;
  insert into platform_settings (key, value) values ('bank_transfer_bank_name', coalesce(p_bank_name,''))
    on conflict (key) do update set value = excluded.value;
  insert into platform_settings (key, value) values ('bank_transfer_whatsapp_number', coalesce(p_whatsapp_number,''))
    on conflict (key) do update set value = excluded.value;
  insert into platform_settings (key, value) values ('bank_transfer_notify_email', coalesce(p_notify_email,''))
    on conflict (key) do update set value = excluded.value;
end;
$$;


--
-- Name: admin_upsert_feature(uuid, text, text, text, boolean, numeric, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_upsert_feature(p_token uuid, p_id text, p_label text, p_category text, p_is_addon boolean, p_price numeric, p_description text, p_active boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $_$
declare v_id text := lower(trim(coalesce(p_id,'')));
begin
  perform _platform_admin_check(p_token);
  if v_id = '' or v_id !~ '^[a-z0-9_-]+$' then raise exception 'Özellik kimliği sadece küçük harf/rakam/tire içerebilir'; end if;
  if p_label is null or trim(p_label) = '' then raise exception 'Özellik adı gerekli'; end if;
  if p_price < 0 then raise exception 'Fiyat negatif olamaz'; end if;
  insert into feature_catalog (id, label, category, is_addon, price, description, active)
  values (v_id, trim(p_label), coalesce(nullif(trim(p_category),''),'Diğer'), coalesce(p_is_addon,false), p_price, coalesce(p_description,''), coalesce(p_active,true))
  on conflict (id) do update set
    label = trim(p_label),
    category = coalesce(nullif(trim(p_category),''),'Diğer'),
    is_addon = coalesce(p_is_addon,false),
    price = p_price,
    description = coalesce(p_description,''),
    active = coalesce(p_active,true);
  if coalesce(p_is_addon,false) then
    perform _move_addon_out_of_packages(v_id);
  end if;
end;
$_$;


--
-- Name: admin_upsert_package(uuid, text, text, text, integer, numeric, boolean, boolean, text[], integer, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_upsert_package(p_token uuid, p_id text, p_name text, p_description text, p_max_users integer, p_price numeric, p_is_popular boolean, p_active boolean, p_features text[] DEFAULT NULL::text[], p_max_branches integer DEFAULT 1, p_price_yearly numeric DEFAULT NULL::numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $_$
declare
  v_next_sort int;
  v_id text := lower(trim(coalesce(p_id, '')));
  v_feat text;
  v_features text[];
begin
  perform _platform_admin_check(p_token);
  if v_id = '' or v_id !~ '^[a-z0-9_-]+$' then
    raise exception 'Paket kimliği sadece küçük harf/rakam/tire içerebilir';
  end if;
  if p_name is null or trim(p_name) = '' then raise exception 'Paket adı gerekli'; end if;
  if p_max_users < 1 then raise exception 'Kullanıcı limiti en az 1 olmalı'; end if;
  if p_price < 0 then raise exception 'Fiyat negatif olamaz'; end if;
  if p_price_yearly is not null and p_price_yearly < 0 then raise exception 'Yıllık fiyat negatif olamaz'; end if;
  if coalesce(p_max_branches,1) < 1 then raise exception 'Şube limiti en az 1 olmalı'; end if;
  if p_features is not null then
    foreach v_feat in array p_features loop
      if not exists(select 1 from feature_catalog where id = v_feat) then
        raise exception 'Geçersiz özellik: %', v_feat;
      end if;
    end loop;
    -- Eklentiler pakete dahil edilemez: gönderilse bile ayıklanır.
    v_features := array(select f from unnest(p_features) f
      where not exists(select 1 from feature_catalog fc where fc.id = f and fc.is_addon));
  end if;

  if p_is_popular then
    update packages set is_popular = false where is_popular;
  end if;

  if exists(select 1 from packages where id = v_id) then
    update packages set
      name = trim(p_name), description = coalesce(p_description,''), max_users = p_max_users,
      price = p_price, price_yearly = p_price_yearly, is_popular = p_is_popular, active = p_active,
      features = coalesce(v_features, features),
      max_branches = coalesce(p_max_branches, max_branches)
    where id = v_id;
  else
    select coalesce(max(sort_order),0)+1 into v_next_sort from packages;
    insert into packages (id, name, description, max_users, price, price_yearly, is_popular, sort_order, active, features, max_branches)
    values (v_id, trim(p_name), coalesce(p_description,''), p_max_users, p_price, p_price_yearly, p_is_popular, v_next_sort, p_active,
      coalesce(v_features, (select coalesce(array_agg(id), '{}') from feature_catalog where is_core and not is_addon)), coalesce(p_max_branches, 1));
  end if;
end;
$_$;


--
-- Name: approve_customer_order_request(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_customer_order_request(p_token uuid, p_request_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype;
  v_req customer_order_requests%rowtype;
  v_order_id uuid;
  v_daily_number int;
  v_item jsonb;
  v_product products%rowtype;
  v_note text;
begin
  s := _session_check(p_token, 'order');
  select * into v_req from customer_order_requests cor where cor.id = p_request_id and cor.restaurant_id = s.restaurant_id and cor.status = 'pending';
  if v_req.id is null then raise exception 'İstek bulunamadı veya zaten işlendi'; end if;

  if v_req.table_id is not null then
    select o.id, o.daily_number into v_order_id, v_daily_number from orders o
      where o.restaurant_id = s.restaurant_id and o.table_id = v_req.table_id and o.status = 'open'
      limit 1;

    if v_order_id is null then
      select coalesce(max(o.daily_number), 0) + 1 into v_daily_number
        from orders o where o.restaurant_id = s.restaurant_id
          and (o.created_at at time zone 'Europe/Istanbul')::date = (now() at time zone 'Europe/Istanbul')::date;
      insert into orders (restaurant_id, table_id, kind, status, daily_number, created_by)
      values (s.restaurant_id, v_req.table_id, 'dine_in', 'open', v_daily_number, s.user_id)
      returning id into v_order_id;
    end if;
  else
    -- Dışarıdan online sipariş (masa yok) - her zaman yeni bir paket sipariş oluşturur.
    v_note := case when v_req.order_type = 'delivery' and v_req.delivery_address is not null
      then '🛵 Teslimat: ' || v_req.delivery_address
      else '🥡 Gel-al siparişi'
    end;
    select coalesce(max(o.daily_number), 0) + 1 into v_daily_number
      from orders o where o.restaurant_id = s.restaurant_id
        and (o.created_at at time zone 'Europe/Istanbul')::date = (now() at time zone 'Europe/Istanbul')::date;
    insert into orders (restaurant_id, table_id, kind, status, daily_number, created_by, customer_name, customer_phone, note)
    values (s.restaurant_id, null, 'takeaway', 'open', v_daily_number, s.user_id, v_req.customer_name, v_req.customer_phone, v_note)
    returning id into v_order_id;
  end if;

  for v_item in select * from jsonb_array_elements(v_req.items) loop
    select * into v_product from products pr where pr.id = (v_item->>'product_id')::uuid and pr.restaurant_id = s.restaurant_id;
    if v_product.id is null then continue; end if;
    perform _deduct_product_stock(v_product.id, greatest(1, coalesce((v_item->>'qty')::int,1)));
    insert into order_items (order_id, product_id, name, price, cost, qty, status, note)
    values (v_order_id, v_product.id, v_product.name, v_product.price, v_product.cost,
      greatest(1, coalesce((v_item->>'qty')::int,1)), 'pending', v_item->>'note');
  end loop;

  update customer_order_requests set status = 'approved' where id = p_request_id;
  return json_build_object('order_id', v_order_id, 'daily_number', v_daily_number);
end;
$$;


--
-- Name: call_waiter(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.call_waiter(p_qr_token uuid, p_kind text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare v_t restaurant_tables%rowtype; v_active boolean; v_id uuid; v_url text; v_secret text;
begin
  if p_kind not in ('order','payment') then raise exception 'Geçersiz istek'; end if;
  select * into v_t from restaurant_tables where qr_token = p_qr_token;
  if v_t.id is null then raise exception 'Geçersiz QR kod'; end if;
  select is_active into v_active from restaurants where id = v_t.restaurant_id;
  if not coalesce(v_active,false) then raise exception 'Bu işletme şu anda aktif değil'; end if;
  -- Aynı masadan aynı tür bekleyen çağrı varsa yenisi açılmaz (personeli boğmamak için).
  select id into v_id from waiter_calls where table_id = v_t.id and kind = p_kind and status = 'pending' limit 1;
  if v_id is not null then return json_build_object('id', v_id, 'already', true); end if;
  if (select count(*) from waiter_calls where table_id = v_t.id and created_at > now() - interval '5 minutes') >= 6 then
    raise exception 'Çok sık istek gönderildi, lütfen biraz bekleyin'; end if;
  insert into waiter_calls(restaurant_id, table_id, kind) values (v_t.restaurant_id, v_t.id, p_kind) returning id into v_id;
  begin
    select value into v_url from platform_settings where key = 'push_dispatch_url';
    select value into v_secret from platform_settings where key = 'push_dispatch_secret';
    if coalesce(v_url,'') <> '' then
      perform net.http_post(url := v_url, headers := jsonb_build_object('Content-Type','application/json','x-push-secret', coalesce(v_secret,'')),
        body := jsonb_build_object('mode','waiter_call','call_id', v_id));
    end if;
  exception when others then null;
  end;
  return json_build_object('id', v_id, 'already', false);
end; $$;


--
-- Name: cancel_order(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_order(p_token uuid, p_order_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype;
  it record;
  v_has_recipe boolean;
begin
  s := _session_check(p_token);
  perform _require_shift(s);

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


--
-- Name: change_platform_admin_password(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.change_platform_admin_password(p_token uuid, p_new_password text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare v_admin_id uuid;
begin
  v_admin_id := _platform_admin_check(p_token);
  update platform_admins set password = crypt(p_new_password, gen_salt('bf')) where id = v_admin_id;
end;
$$;


--
-- Name: change_platform_admin_username(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.change_platform_admin_username(p_token uuid, p_new_username text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_admin_id uuid;
  v_new text := trim(coalesce(p_new_username, ''));
begin
  v_admin_id := _platform_admin_check(p_token);
  if v_new = '' then
    raise exception 'Kullanıcı adı boş olamaz';
  end if;
  if exists(select 1 from platform_admins where username = v_new and id <> v_admin_id) then
    raise exception 'Bu kullanıcı adı zaten kullanılıyor';
  end if;
  update platform_admins set username = v_new where id = v_admin_id;
end;
$$;


--
-- Name: chat_upload_target(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.chat_upload_target(p_token uuid, p_conv text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'messages');
  if p_conv like 'g:%' then
    if not exists(select 1 from chat_group_members where group_id = substr(p_conv,3)::uuid and user_id = s.user_id) then raise exception 'Bu grubun üyesi değilsiniz'; end if;
  elsif p_conv <> 'all' then
    if not exists(select 1 from app_users where id = p_conv::uuid and restaurant_id = s.restaurant_id) then raise exception 'Kullanıcı bulunamadı'; end if;
  end if;
  return s.restaurant_id;
end; $$;


--
-- Name: check_gift_card(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_gift_card(p_token uuid, p_code text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; g gift_cards%rowtype;
begin
  s := _session_check(p_token, 'payments');
  select * into g from gift_cards where restaurant_id = s.restaurant_id and upper(code) = upper(trim(p_code));
  if g.id is null then raise exception 'Hediye kartı bulunamadı'; end if;
  if not g.is_active then raise exception 'Bu hediye kartı iptal edilmiş'; end if;
  return json_build_object('id', g.id, 'code', g.code, 'balance', g.balance, 'initial_balance', g.initial_balance);
end;
$$;


--
-- Name: clock_in(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clock_in(p_token uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_id uuid; v_pending boolean;
begin
  s := _session_check(p_token);
  if exists(select 1 from staff_shifts where user_id = s.user_id and clock_out is null and status in ('approved','pending')) then
    raise exception 'Zaten açık bir vardiyanız ya da onay bekleyen talebiniz var';
  end if;
  select shift_approval_required and not _is_manager(s.user_id) into v_pending from restaurants where id = s.restaurant_id;
  insert into staff_shifts (restaurant_id, user_id, status, approved_by)
    values (s.restaurant_id, s.user_id, case when v_pending then 'pending' else 'approved' end, case when v_pending then null else s.user_id end)
    returning id into v_id;
  if v_pending then perform _notify_shift_event(v_id, 'request'); end if;
  return json_build_object('id', v_id, 'clock_in', now(), 'pending', v_pending);
end; $$;


--
-- Name: clock_out(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clock_out(p_token uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_row staff_shifts%rowtype; v_req boolean;
begin
  s := _session_check(p_token);
  select * into v_row from staff_shifts where user_id = s.user_id and clock_out is null and status in ('approved','pending') order by clock_in desc limit 1;
  if v_row.id is null then raise exception 'Açık bir vardiyanız yok'; end if;
  if v_row.status = 'pending' then
    update staff_shifts set status = 'rejected', clock_out = now(), ended_by = s.user_id where id = v_row.id;
    return json_build_object('id', v_row.id, 'cancelled', true);
  end if;
  select shift_approval_required into v_req from restaurants where id = s.restaurant_id;
  if v_req and not _is_manager(s.user_id) then
    -- Personel bitirme İSTER; ikinci basış talebi geri çeker.
    if v_row.end_requested_at is null then
      update staff_shifts set end_requested_at = now() where id = v_row.id;
      perform _notify_shift_event(v_row.id, 'end_request');
      return json_build_object('id', v_row.id, 'end_requested', true);
    end if;
    update staff_shifts set end_requested_at = null where id = v_row.id;
    return json_build_object('id', v_row.id, 'end_request_cancelled', true);
  end if;
  update staff_shifts set clock_out = now(), ended_by = s.user_id, end_requested_at = null where id = v_row.id;
  return json_build_object('id', v_row.id, 'clock_in', v_row.clock_in, 'clock_out', now());
end; $$;


--
-- Name: company_check_entitlement(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.company_check_entitlement(p_company_token uuid, p_feature_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  cs company_sessions%rowtype;
  v_pkg_features text[];
begin
  cs := _company_session_check(p_company_token);
  select p.features into v_pkg_features from companies c join packages p on p.id = c.package_id where c.id = cs.company_id;
  if p_feature_id = any(coalesce(v_pkg_features, '{}')) then return true; end if;
  return exists(select 1 from entitlements e where e.addon_id = p_feature_id and e.company_id = cs.company_id);
end;
$$;


--
-- Name: create_branch(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_branch(p_company_token uuid, p_name text, p_code text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  cs company_sessions%rowtype;
  v_company companies%rowtype;
  v_max_branches int;
  v_max_users int;
  v_pkg_features text[];
  v_branch_count int;
  v_restaurant_id uuid;
  v_manager_role_id uuid;
  v_has_addon boolean;
begin
  cs := _company_session_check(p_company_token);
  select * into v_company from companies where id = cs.company_id;

  select max_branches, max_users, features || included_addons into v_max_branches, v_max_users, v_pkg_features from packages where id = v_company.package_id;

  -- Birden fazla şube açma varsayılan olarak pakete dahil değildir - bu
  -- bir eklentidir (bkz. feature_catalog: multi_branch). Paket bunu
  -- features[] içinde bulunduruyorsa (admin isterse pakete de dahil
  -- edebilir) ya da şirkete ayrı bir entitlement verilmişse izin verilir.
  if not ('multi_branch' = any(coalesce(v_pkg_features, '{}'))) then
    select exists(select 1 from entitlements e where e.addon_id = 'multi_branch' and e.company_id = v_company.id) into v_has_addon;
    if not v_has_addon then
      raise exception 'Birden fazla şube açma bir eklentidir, hesabınızda aktif değil - satın almak için bizimle iletişime geçin.';
    end if;
  end if;

  select count(*) into v_branch_count from restaurants where company_id = v_company.id;
  if v_max_branches is not null and v_branch_count >= v_max_branches then
    raise exception 'Paketinizin şube limitine ulaştınız, yükseltmek için destek ile iletişime geçin';
  end if;

  if p_name is null or trim(p_name) = '' then raise exception 'Şube adı gerekli'; end if;
  if p_code is null or trim(p_code) = '' then raise exception 'Şube kodu gerekli'; end if;
  if exists (select 1 from restaurants r where r.code = p_code) then
    raise exception 'Bu şube kodu zaten kullanılıyor, başka bir kod deneyin';
  end if;

  insert into restaurants (name, code, package_id, max_users, is_active, company_id)
  values (trim(p_name), trim(p_code), v_company.package_id, coalesce(v_max_users,3), true, v_company.id)
  returning id into v_restaurant_id;

  insert into roles (restaurant_id, name, permissions, is_system)
  values (v_restaurant_id, 'Yönetici',
    (select coalesce(array_agg(f), '{}') from unnest(v_pkg_features) f where f <> 'reports'),
    true)
  returning id into v_manager_role_id;

  insert into roles (restaurant_id, name, permissions, is_system)
  values (v_restaurant_id, 'Garson',
    (select coalesce(array_agg(f), '{}') from unnest(array['order','packages','settings_products','settings_ingredients']) f where f = any(v_pkg_features)),
    false);

  insert into roles (restaurant_id, name, permissions, is_system)
  values (v_restaurant_id, 'Mutfak',
    (select coalesce(array_agg(f), '{}') from unnest(array['kitchen','settings_products','settings_ingredients']) f where f = any(v_pkg_features)),
    false);

  return v_restaurant_id;
end;
$$;


--
-- Name: create_chat_group(uuid, text, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_chat_group(p_token uuid, p_name text, p_member_ids uuid[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_id uuid;
begin
  s := _session_check(p_token, 'messages');
  if coalesce(trim(p_name),'') = '' then raise exception 'Grup adı girin'; end if;
  insert into chat_groups(restaurant_id, name, created_by) values (s.restaurant_id, left(trim(p_name), 60), s.user_id) returning id into v_id;
  insert into chat_group_members(group_id, user_id, restaurant_id)
    select v_id, u.id, s.restaurant_id from app_users u where u.restaurant_id = s.restaurant_id and (u.id = s.user_id or u.id = any(coalesce(p_member_ids,'{}')))
    on conflict do nothing;
  return v_id;
end; $$;


--
-- Name: create_order_flag(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_order_flag(p_token uuid, p_label text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype;
  new_id uuid;
  v_max int;
begin
  s := _session_check(p_token, 'settings_flags');
  select coalesce(max(sort_order),0)+1 into v_max from order_flag_defs where restaurant_id = s.restaurant_id;
  insert into order_flag_defs (restaurant_id, label, sort_order)
  values (s.restaurant_id, trim(p_label), v_max)
  returning id into new_id;
  return new_id;
end;
$$;


--
-- Name: create_promo_code(uuid, text, text, numeric, integer, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_promo_code(p_token uuid, p_code text, p_discount_type text, p_discount_value numeric, p_max_uses integer, p_expires_at timestamp with time zone) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare v_id uuid;
begin
  perform _platform_admin_check(p_token);
  insert into promo_codes (code, discount_type, discount_value, max_uses, expires_at)
  values (upper(p_code), p_discount_type, p_discount_value, p_max_uses, p_expires_at)
  returning id into v_id;
  return v_id;
end;
$$;


--
-- Name: create_staff_user(uuid, text, text, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_staff_user(p_token uuid, p_username text, p_password text, p_role_ids uuid[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; new_id uuid; v_max_users int; v_current_count int; v_valid_count int; v_company_id uuid; v_package_id text;
begin
  s := _session_check(p_token, 'settings_users');
  if p_username is null or trim(p_username) = '' then raise exception 'Kullanıcı adı gerekli'; end if;
  if p_password is null or length(p_password) < 6 then raise exception 'Şifre en az 6 karakter olmalı'; end if;
  if p_role_ids is null or array_length(p_role_ids,1) is null or array_length(p_role_ids,1) > 2 then raise exception 'Bir kullanıcıya en az 1, en fazla 2 rol atanabilir'; end if;
  select count(*) into v_valid_count from roles rl where rl.id = any(p_role_ids) and rl.restaurant_id = s.restaurant_id;
  if v_valid_count <> array_length(p_role_ids,1) then raise exception 'Geçersiz rol seçimi'; end if;
  if exists(select 1 from roles rl where rl.id = any(p_role_ids) and rl.is_system) then
    raise exception 'Yönetici rolü yalnızca işletme sahibine aittir; tam yetki için tüm izinleri içeren bir rol oluşturun';
  end if;
  select r.max_users, r.company_id, r.package_id into v_max_users, v_company_id, v_package_id from restaurants r where r.id = s.restaurant_id;
  if v_company_id is not null then select c.package_id into v_package_id from companies c where c.id = v_company_id; end if;
  select max_users into v_max_users from packages where id = v_package_id;
  select count(*) into v_current_count from app_users where restaurant_id = s.restaurant_id and not is_company_owner;
  if v_current_count >= v_max_users then raise exception 'Paketinizin kullanıcı limitine (%) ulaştınız', v_max_users; end if;
  insert into app_users (restaurant_id, username, password, role_ids) values (s.restaurant_id, p_username, crypt(p_password, gen_salt('bf')), p_role_ids) returning id into new_id;
  return new_id;
end; $$;


--
-- Name: delete_account_with_credentials(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_account_with_credentials(p_code text, p_username text, p_password text, p_confirm_code text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_restaurant_id uuid;
  v_user app_users%rowtype;
  v_recent_failures int;
begin
  select count(*) into v_recent_failures from login_failures
    where restaurant_code = p_code and username = p_username and created_at > now() - interval '15 minutes';
  if v_recent_failures >= 10 then
    raise exception 'Çok fazla hatalı deneme yapıldı, lütfen 15 dakika sonra tekrar deneyin';
  end if;

  select id into v_restaurant_id from restaurants where code = p_code;
  if v_restaurant_id is not null then
    select * into v_user from app_users where restaurant_id = v_restaurant_id and username = p_username;
  end if;
  if v_user.id is null or v_user.password is distinct from crypt(p_password, v_user.password) then
    insert into login_failures (restaurant_code, username) values (p_code, p_username);
    return json_build_object('ok', false, 'error', 'İşletme kodu, kullanıcı adı veya şifre hatalı');
  end if;
  delete from login_failures where restaurant_code = p_code and username = p_username;

  return _delete_account_core(v_user.id, p_confirm_code);
end;
$$;


--
-- Name: delete_chat_message(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_chat_message(p_token uuid, p_message_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; m chat_messages%rowtype;
begin
  s := _session_check(p_token, 'messages');
  select * into m from chat_messages where id = p_message_id and restaurant_id = s.restaurant_id;
  if m.id is null or m.sender_id <> s.user_id then raise exception 'Yalnızca kendi mesajınızı silebilirsiniz'; end if;
  if m.created_at < now() - interval '24 hours' then raise exception 'Mesajlar 24 saat içinde silinebilir'; end if;
  update chat_messages set deleted_at = now(), body = '', attachment = null where id = m.id;
end; $$;


--
-- Name: delete_customer(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_customer(p_token uuid, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'crm');
  delete from customers where id = p_id and restaurant_id = s.restaurant_id;
end;
$$;


--
-- Name: delete_ingredient(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_ingredient(p_token uuid, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'settings_ingredients');
  if exists(select 1 from purchase_order_items where ingredient_id = p_id) then
    raise exception 'Bu hammadde satın alma siparişlerinde kullanıldığı için silinemez (geçmiş kayıtlar korunur)';
  end if;
  delete from ingredients where id = p_id and restaurant_id = s.restaurant_id;
end;
$$;


--
-- Name: delete_my_account(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_my_account(p_token uuid, p_password text, p_confirm_code text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype;
  v_user app_users%rowtype;
  v_code text;
  v_recent_failures int;
begin
  s := _session_check(p_token);
  select * into v_user from app_users where id = s.user_id;
  select code into v_code from restaurants where id = s.restaurant_id;

  select count(*) into v_recent_failures from login_failures
    where restaurant_code = v_code and username = v_user.username and created_at > now() - interval '15 minutes';
  if v_recent_failures >= 10 then
    raise exception 'Çok fazla hatalı deneme yapıldı, lütfen 15 dakika sonra tekrar deneyin';
  end if;
  -- Yanlış şifrede exception FIRLATILMAZ: aksi halde login_failures kaydı da
  -- geri alınır ve deneme sınırı hiç işlemez.
  if v_user.password is distinct from crypt(p_password, v_user.password) then
    insert into login_failures (restaurant_code, username) values (v_code, v_user.username);
    return json_build_object('ok', false, 'error', 'Şifre hatalı');
  end if;

  return _delete_account_core(v_user.id, p_confirm_code);
end;
$$;


--
-- Name: delete_order_flag(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_order_flag(p_token uuid, p_flag_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'settings_flags');
  delete from order_flag_defs where id = p_flag_id and restaurant_id = s.restaurant_id;
end;
$$;


--
-- Name: delete_product(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_product(p_token uuid, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'settings_products');
  delete from products where id = p_id and restaurant_id = s.restaurant_id;
end;
$$;


--
-- Name: delete_promo_code(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_promo_code(p_token uuid, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  perform _platform_admin_check(p_token);
  delete from promo_codes where id = p_id;
end;
$$;


--
-- Name: delete_purchase_order(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_purchase_order(p_token uuid, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check_any(p_token, array['purchasing_orders','purchasing_manage']);
  delete from purchase_orders where id = p_id and restaurant_id = s.restaurant_id and status in ('draft','cancelled')
    and (_user_has_perm(s.user_id, 'purchasing_manage') or (created_by = s.user_id and status = 'draft'));
end;
$$;


--
-- Name: delete_reservation(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_reservation(p_token uuid, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'reservations');
  delete from reservations where id = p_id and restaurant_id = s.restaurant_id;
end;
$$;


--
-- Name: delete_staff_user(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_staff_user(p_token uuid, p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'settings_users');
  if _is_owner(p_user_id) then raise exception 'İşletme sahibinin hesabı silinemez'; end if;
  delete from app_users where id = p_user_id and restaurant_id = s.restaurant_id;
end; $$;


--
-- Name: delete_station(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_station(p_token uuid, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'settings_stations');
  delete from stations where id = p_id and restaurant_id = s.restaurant_id;
end;
$$;


--
-- Name: delete_supplier(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_supplier(p_token uuid, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'purchasing_suppliers');
  delete from suppliers where id = p_id and restaurant_id = s.restaurant_id;
end;
$$;


--
-- Name: delete_table(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_table(p_token uuid, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'settings_zones');
  delete from restaurant_tables where id = p_id and restaurant_id = s.restaurant_id;
end;
$$;


--
-- Name: delete_waitlist_entry(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_waitlist_entry(p_token uuid, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'reservations');
  update orders set kind = 'takeaway' where restaurant_id = s.restaurant_id and waitlist_id = p_id and kind = 'waitlist' and status = 'open';
  delete from waitlist_entries where id = p_id and restaurant_id = s.restaurant_id;
end;
$$;


--
-- Name: delete_zone(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_zone(p_token uuid, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'settings_zones');
  delete from zones where id = p_id and restaurant_id = s.restaurant_id;
end;
$$;


--
-- Name: email_invoice(uuid, uuid, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.email_invoice(p_token uuid, p_history_id uuid, p_email text, p_buyer_name text DEFAULT NULL::text, p_buyer_tax_number text DEFAULT NULL::text, p_buyer_tax_office text DEFAULT NULL::text, p_buyer_address text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $_$
declare
  s staff_sessions%rowtype; h sales_history%rowtype; r restaurants%rowtype;
  v_items jsonb; v_num text; v_seq int; v_status text := 'emailed'; v_rows text; v_html text; v_id uuid;
  v_email text := lower(trim(coalesce(p_email,'')));
begin
  s := _session_check(p_token, 'payments');
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Geçerli bir e-posta adresi girin'; end if;
  select * into h from sales_history where id = p_history_id and restaurant_id = s.restaurant_id;
  if h.id is null then raise exception 'Ödeme kaydı bulunamadı'; end if;
  perform _rate_limit('invoice_email', s.restaurant_id::text, 200, interval '1 hour');
  select * into r from restaurants where id = s.restaurant_id;

  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'qty', q, 'price', price, 'total', price*q) order by name), '[]')
    into v_items
    from (select name, price, sum(qty) q from order_items
          where order_id = h.order_id and paid and paid_at = h.closed_at group by name, price) x;

  select coalesce(max(nullif(regexp_replace(number, '^.*-', ''), '')::int), 0) + 1 into v_seq
    from invoices where restaurant_id = s.restaurant_id and number like to_char(now() at time zone 'Europe/Istanbul','YYYY')||'-%';
  v_num := to_char(now() at time zone 'Europe/Istanbul','YYYY') || '-' || lpad(v_seq::text, 6, '0');

  if coalesce(r.efatura_enabled,false) and coalesce(r.efatura_provider,'') <> '' and _restaurant_has_feature(r.id, 'efatura') then
    v_status := 'efatura_queued';
  end if;

  select string_agg(format('<tr><td style="padding:6px 0;">%s × %s</td><td style="text-align:right;padding:6px 0;">%s TL</td></tr>',
      (e->>'qty'), _h(e->>'name'), to_char((e->>'total')::numeric, 'FM999G999G990D00')), '')
    into v_rows from jsonb_array_elements(v_items) e;

  v_html := format($t$<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#222;">
    <h2 style="margin:0 0 4px;">%s</h2>
    <div style="color:#666;font-size:13px;">%s%s%s</div>
    <hr style="border:none;border-top:1px solid #ddd;margin:14px 0;">
    <div style="font-size:13px;">Belge No: <b>%s</b><br>Tarih: %s<br>Masa: %s</div>
    %s
    <table style="width:100%%;border-collapse:collapse;font-size:14px;margin-top:12px;">%s</table>
    <hr style="border:none;border-top:1px solid #ddd;margin:10px 0;">
    <table style="width:100%%;font-size:14px;">
      <tr><td>Ara Toplam</td><td style="text-align:right;">%s TL</td></tr>
      <tr><td>İndirim</td><td style="text-align:right;">%s TL</td></tr>
      <tr><td><b>Toplam</b></td><td style="text-align:right;"><b>%s TL</b></td></tr>
      <tr><td>Ödeme</td><td style="text-align:right;">%s</td></tr>
    </table>
    <p style="color:#888;font-size:11.5px;margin-top:18px;">%s</p>
  </div>$t$,
    _h(coalesce(nullif(r.invoice_title,''), r.name)),
    case when coalesce(r.tax_number,'')<>'' then 'VKN/TCKN: '||_h(r.tax_number) else '' end,
    case when coalesce(r.tax_office,'')<>'' then ' · Vergi Dairesi: '||_h(r.tax_office) else '' end,
    case when coalesce(r.invoice_address,'')<>'' then '<br>'||_h(r.invoice_address) else '' end,
    v_num, to_char(h.closed_at at time zone 'Europe/Istanbul','DD.MM.YYYY HH24:MI'), _h(h.table_name),
    case when coalesce(p_buyer_name,'')<>'' or coalesce(p_buyer_tax_number,'')<>'' then
      '<div style="font-size:13px;margin-top:10px;padding:8px 10px;background:#f5f5f5;border-radius:6px;"><b>Alıcı:</b> '||_h(p_buyer_name)||
      case when coalesce(p_buyer_tax_number,'')<>'' then '<br>VKN/TCKN: '||_h(p_buyer_tax_number) else '' end ||
      case when coalesce(p_buyer_tax_office,'')<>'' then ' · V.D.: '||_h(p_buyer_tax_office) else '' end ||
      case when coalesce(p_buyer_address,'')<>'' then '<br>'||_h(p_buyer_address) else '' end || '</div>'
    else '' end,
    coalesce(v_rows,''),
    to_char(h.subtotal,'FM999G999G990D00'), to_char(coalesce(h.discount_amount,0),'FM999G999G990D00'), to_char(h.total,'FM999G999G990D00'),
    case h.payment_method when 'cash' then 'Nakit' when 'card' then 'Kart' when 'split' then 'Nakit + Kart' else _h(h.payment_method) end,
    case when v_status='efatura_queued' then 'Resmi e-Arşiv/e-Fatura belgeniz ayrıca gönderilecektir.'
         else 'Bu belge bilgi amaçlıdır; mali değeri yoktur.' end);

  insert into invoices (restaurant_id, history_id, number, email, buyer_name, buyer_tax_number, buyer_tax_office, buyer_address,
    subtotal, discount, total, items, status, staff_user_id)
  values (s.restaurant_id, h.id, v_num, v_email, nullif(trim(p_buyer_name),''), nullif(trim(p_buyer_tax_number),''),
    nullif(trim(p_buyer_tax_office),''), nullif(trim(p_buyer_address),''), h.subtotal, coalesce(h.discount_amount,0), h.total, v_items, v_status, s.user_id)
  returning id into v_id;

  if not _send_email(v_email, coalesce(nullif(r.invoice_title,''), r.name) || ' - Hesap / Fatura ' || v_num, v_html) then
    raise exception 'E-posta altyapısı yapılandırılmamış';
  end if;
  return json_build_object('id', v_id, 'number', v_num, 'status', v_status);
end $_$;


--
-- Name: email_receipt(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.email_receipt(p_token uuid, p_history_id uuid, p_email text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $_$
declare s staff_sessions%rowtype; h sales_history%rowtype; r restaurants%rowtype; d jsonb; v_email text := lower(trim(coalesce(p_email,'')));
  v_font text; v_rows text; v_html text; v_hdr text; v_ftr text; v_title_style text; v_no int;
begin
  s := _session_check_any(p_token, array['payments','reports']);
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Geçerli bir e-posta adresi girin'; end if;
  select * into h from sales_history where id = p_history_id and restaurant_id = s.restaurant_id;
  if h.id is null then raise exception 'Ödeme kaydı bulunamadı'; end if;
  perform _rate_limit('receipt_email', s.restaurant_id::text, 200, interval '1 hour');
  select * into r from restaurants where id = s.restaurant_id;
  d := coalesce(r.ticket_design, '{}'::jsonb);
  v_font := case d->>'fontFamily' when 'Arial' then 'Arial, Helvetica, sans-serif' when 'Verdana' then 'Verdana, Geneva, sans-serif'
    when 'Tahoma' then 'Tahoma, Geneva, sans-serif' when 'Consolas' then 'Consolas, monospace' else '''Courier New'', Courier, monospace' end;
  -- Fiş tasarımındaki zengin metin başlık/alt yazı: betik ve olay öznitelikleri temizlenir.
  v_hdr := regexp_replace(regexp_replace(coalesce(d->>'header',''), '<\s*(script|iframe|object|embed|style)[^>]*>.*?<\s*/\s*\1\s*>', '', 'gis'), '\son\w+\s*=\s*("[^"]*"|''[^'']*''|[^\s>]+)', '', 'gi');
  v_ftr := regexp_replace(regexp_replace(coalesce(d->>'footer',''), '<\s*(script|iframe|object|embed|style)[^>]*>.*?<\s*/\s*\1\s*>', '', 'gis'), '\son\w+\s*=\s*("[^"]*"|''[^'']*''|[^\s>]+)', '', 'gi');
  v_title_style := 'font-size:' || coalesce(nullif(d->>'sizeTitle',''),'18') || 'px;color:' || coalesce(nullif(d->>'colorTitle',''),'#000') || ';text-transform:' || coalesce(nullif(d->>'transformTitle',''),'none') || ';';
  select daily_number into v_no from orders where id = h.order_id;
  select string_agg('<tr><td style="padding:3px 0;">' || q || 'x ' || _h(name) || '</td><td style="padding:3px 0;text-align:right;white-space:nowrap;">' || to_char(price*q,'FM999G999G990D00') || ' ₺</td></tr>', '' order by name)
    into v_rows from (select name, price, sum(qty) q from order_items where order_id = h.order_id and paid and paid_at = h.closed_at group by name, price) x;
  v_html := '<div style="background:#f2f2f2;padding:20px 0;"><div style="max-width:340px;margin:0 auto;background:#fff;padding:18px 16px;font-family:' || v_font || ';font-size:13px;color:#000;' || case when coalesce(d->>'bold','true') <> 'false' then 'font-weight:700;' else '' end || '">'
    || '<div style="text-align:center;font-weight:800;' || v_title_style || '">' || _h(r.name) || '</div>'
    || case when v_hdr <> '' then '<div style="text-align:center;margin-top:4px;">' || v_hdr || '</div>' else '' end
    || '<div style="text-align:center;margin-top:6px;">' || case when v_no is not null and coalesce(d->>'showOrderNumber','true') <> 'false' then 'Sipariş No: ' || v_no || ' · ' else '' end || _h(coalesce(h.table_name, case when h.kind = 'takeaway' then 'Paket' else '' end)) || '</div>'
    || '<div style="text-align:center;">' || to_char(h.closed_at at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI') || '</div>'
    || '<div style="border-top:1px dashed #000;margin:10px 0;"></div><table style="width:100%;border-collapse:collapse;font:inherit;">' || coalesce(v_rows,'') || '</table>'
    || '<div style="border-top:1px dashed #000;margin:10px 0;"></div><table style="width:100%;border-collapse:collapse;font:inherit;">'
    || '<tr><td>Ara Toplam</td><td style="text-align:right;">' || to_char(h.subtotal,'FM999G999G990D00') || ' ₺</td></tr>'
    || case when coalesce(h.discount_amount,0) > 0 then '<tr><td>İndirim</td><td style="text-align:right;">-' || to_char(h.discount_amount,'FM999G999G990D00') || ' ₺</td></tr>' else '' end
    || case when coalesce(h.tip_amount,0) > 0 then '<tr><td>Bahşiş</td><td style="text-align:right;">' || to_char(h.tip_amount,'FM999G999G990D00') || ' ₺</td></tr>' else '' end
    || '<tr><td style="font-size:15px;font-weight:800;padding-top:4px;">TOPLAM</td><td style="text-align:right;font-size:15px;font-weight:800;padding-top:4px;">' || to_char(h.total,'FM999G999G990D00') || ' ₺</td></tr>'
    || '<tr><td>Ödeme</td><td style="text-align:right;">' || case h.payment_method when 'cash' then 'Nakit' when 'card' then 'Kart' when 'split' then 'Nakit + Kart' when 'gift_card' then 'Hediye Kartı' else _h(coalesce(h.payment_method,'')) end || '</td></tr></table>'
    || case when v_ftr <> '' then '<div style="border-top:1px dashed #000;margin:10px 0;"></div><div style="text-align:center;">' || v_ftr || '</div>' else '' end
    || '<div style="text-align:center;font-size:11px;font-weight:400;color:#666;margin-top:12px;">Bu belge bilgi amaçlıdır; mali değeri yoktur.</div>'
    || '</div></div>';
  if not _send_email(v_email, r.name || ' - Fiş', v_html) then raise exception 'E-posta altyapısı yapılandırılmamış'; end if;
  return json_build_object('ok', true);
end; $_$;


--
-- Name: extend_restaurant_subscription(uuid, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.extend_restaurant_subscription(p_restaurant_id uuid, p_days integer, p_package_id text DEFAULT NULL::text) RETURNS timestamp with time zone
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_new_expires timestamptz;
begin
  update restaurants set
    is_active = true,
    package_id = coalesce(p_package_id, package_id),
    expires_at = greatest(coalesce(expires_at, now()), now()) + (p_days || ' days')::interval
  where id = p_restaurant_id
  returning expires_at into v_new_expires;
  return v_new_expires;
end;
$$;


--
-- Name: get_addon_purchase_info(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_addon_purchase_info(p_token uuid, p_addon_id text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_r restaurants%rowtype;
begin
  s := _session_check(p_token);
  select * into v_r from restaurants where id = s.restaurant_id;
  return json_build_object(
    'addon', (select json_build_object('id', id, 'label', label, 'description', description, 'price', price) from feature_catalog where id = p_addon_id),
    'iban', (select value from platform_settings where key = 'bank_transfer_iban'),
    'account_name', (select value from platform_settings where key = 'bank_transfer_account_name'),
    'bank_name', (select value from platform_settings where key = 'bank_transfer_bank_name'),
    'pending', (select row_to_json(t) from (select id, amount, created_at from bank_transfer_notices where status = 'pending' and addon_id = p_addon_id
        and ((v_r.company_id is null and restaurant_id = v_r.id) or (v_r.company_id is not null and company_id = v_r.company_id)) order by created_at desc limit 1) t),
    'is_manager', exists(select 1 from app_users au join roles rl on rl.id = any(au.role_ids) where au.id = s.user_id and (rl.is_system or 'settings_billing' = any(rl.permissions))));
end; $$;


--
-- Name: get_bank_transfer_status(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_bank_transfer_status(p_token uuid, p_billing_cycle text DEFAULT 'monthly'::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype;
  v_restaurant restaurants%rowtype;
  v_target_type text;
  v_target_id uuid;
  v_target_name text;
  v_package_id text;
  v_price numeric;
  v_price_yearly numeric;
  v_amount numeric;
  v_cycle text := case when p_billing_cycle = 'yearly' then 'yearly' else 'monthly' end;
  v_iban text;
  v_account_name text;
  v_bank_name text;
  v_whatsapp text;
  v_pending json;
begin
  s := _session_check(p_token);
  select * into v_restaurant from restaurants where id = s.restaurant_id;
  if v_restaurant.company_id is not null then
    v_target_type := 'company';
    select id, name, package_id into v_target_id, v_target_name, v_package_id from companies where id = v_restaurant.company_id;
  else
    v_target_type := 'restaurant';
    v_target_id := v_restaurant.id;
    v_target_name := v_restaurant.name;
    v_package_id := v_restaurant.package_id;
  end if;

  select price, price_yearly into v_price, v_price_yearly from packages where id = v_package_id;
  v_amount := case when v_cycle = 'yearly' then coalesce(v_price_yearly, coalesce(v_price,0) * 12) else coalesce(v_price,0) end
    + _addons_monthly_total(s.restaurant_id) * (case when v_cycle = 'yearly' then 12 else 1 end);
  select value into v_iban from platform_settings where key = 'bank_transfer_iban';
  select value into v_account_name from platform_settings where key = 'bank_transfer_account_name';
  select value into v_bank_name from platform_settings where key = 'bank_transfer_bank_name';
  select value into v_whatsapp from platform_settings where key = 'bank_transfer_whatsapp_number';

  select row_to_json(t) into v_pending from (
    select id, amount, note, billing_cycle, created_at from bank_transfer_notices
    where status = 'pending'
      and ((v_target_type = 'restaurant' and restaurant_id = v_target_id) or (v_target_type = 'company' and company_id = v_target_id))
    order by created_at desc limit 1
  ) t;

  return json_build_object(
    'target_type', v_target_type,
    'target_name', v_target_name,
    'package_id', v_package_id,
    'billing_cycle', v_cycle,
    'amount', v_amount,
    'monthly_amount', coalesce(v_price,0) + _addons_monthly_total(s.restaurant_id),
    'yearly_amount', coalesce(v_price_yearly, coalesce(v_price,0)*12) + _addons_monthly_total(s.restaurant_id) * 12,
    'addons_monthly', _addons_monthly_total(s.restaurant_id),
    'addons', (select coalesce(json_agg(json_build_object('id', fc.id, 'label', fc.label, 'price', fc.price) order by fc.label), '[]'::json)
               from feature_catalog fc where fc.is_addon and fc.id = any(_restaurant_features(s.restaurant_id))),
    'iban', v_iban,
    'account_name', v_account_name,
    'bank_name', v_bank_name,
    'whatsapp_number', v_whatsapp,
    'pending_notice', v_pending
  );
end;
$$;


--
-- Name: get_chat_attachment(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_chat_attachment(p_token uuid, p_message_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; m chat_messages%rowtype;
begin
  s := _session_check(p_token, 'messages');
  select * into m from chat_messages where id = p_message_id and restaurant_id = s.restaurant_id;
  if m.id is null or m.deleted_at is not null or not _chat_can_see(m, s.user_id) then raise exception 'Dosya bulunamadı'; end if;
  return json_build_object('data', m.attachment, 'kind', m.attachment_kind, 'name', m.attachment_name);
end; $$;


--
-- Name: get_chat_messages(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_chat_messages(p_token uuid, p_conv text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_peer uuid; v_group uuid;
begin
  s := _session_check(p_token, 'messages');
  if p_conv like 'g:%' then
    v_group := substr(p_conv, 3)::uuid;
    if not exists(select 1 from chat_group_members where group_id = v_group and user_id = s.user_id) then raise exception 'Bu grubun üyesi değilsiniz'; end if;
  elsif p_conv <> 'all' then
    v_peer := p_conv::uuid;
    if not exists(select 1 from app_users where id = v_peer and restaurant_id = s.restaurant_id) then raise exception 'Kullanıcı bulunamadı'; end if;
  end if;
  insert into chat_reads(user_id, conv, last_read_at) values (s.user_id, p_conv, now()) on conflict (user_id, conv) do update set last_read_at = now();
  return (select coalesce(json_agg(t order by t.created_at), '[]'::json) from (
    select m.id, m.sender_id, au.username sender_name, m.created_at, m.sender_id = s.user_id mine,
      m.deleted_at is not null deleted,
      case when m.deleted_at is null then m.body end body,
      case when m.deleted_at is null then m.attachment_kind end attachment_kind,
      case when m.deleted_at is null then m.attachment_name end attachment_name,
      case when m.deleted_at is null then m.attachment_size end attachment_size,
      case when m.deleted_at is null and m.attachment_kind = 'image' and not m.view_once then m.attachment end attachment,
      m.view_once,
      case when m.view_once then exists(select 1 from chat_view_once v where v.message_id = m.id and v.user_id = s.user_id) end viewed_by_me,
      case when m.view_once and m.sender_id = s.user_id then (select count(*)::int from chat_view_once v where v.message_id = m.id) end viewed_count,
      (select json_build_object('id', q.id, 'sender_name', qa.username, 'preview', left(_chat_preview(q), 120), 'kind', q.attachment_kind)
         from chat_messages q join app_users qa on qa.id = q.sender_id where q.id = m.reply_to) reply,
      (select coalesce(json_agg(json_build_object('emoji', x.emoji, 'count', x.n, 'mine', x.mine, 'names', x.names) order by x.first_at), '[]'::json) from (
         select r.emoji, count(*) n, bool_or(r.user_id = s.user_id) mine, string_agg(ru.username, ', ') names, min(r.created_at) first_at
         from chat_reactions r join app_users ru on ru.id = r.user_id where r.message_id = m.id group by r.emoji) x) reactions,
      case when m.sender_id = s.user_id and v_peer is not null then
             exists(select 1 from chat_reads cr where cr.user_id = v_peer and cr.conv = s.user_id::text and cr.last_read_at >= m.created_at)
      end read,
      case when m.sender_id = s.user_id and v_group is not null then
             (select count(*)::int from chat_group_members gm join chat_reads cr on cr.user_id = gm.user_id and cr.conv = p_conv
              where gm.group_id = v_group and gm.user_id <> s.user_id and cr.last_read_at >= m.created_at)
      end read_count,
      case when v_group is not null then (select count(*)::int - 1 from chat_group_members where group_id = v_group) end member_count
    from chat_messages m join app_users au on au.id = m.sender_id
    where m.restaurant_id = s.restaurant_id and (
      (v_group is not null and m.group_id = v_group) or
      (p_conv = 'all' and m.recipient_id is null and m.group_id is null) or
      (v_peer is not null and m.group_id is null and ((m.sender_id = s.user_id and m.recipient_id = v_peer) or (m.sender_id = v_peer and m.recipient_id = s.user_id))))
    order by m.created_at desc limit 200) t);
end; $$;


--
-- Name: get_company_dashboard(uuid, date, date, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_company_dashboard(p_company_token uuid, p_date date, p_date_to date DEFAULT NULL::date, p_branch_id uuid DEFAULT NULL::uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  cs company_sessions%rowtype;
  v_date_to date := coalesce(p_date_to, p_date);
begin
  cs := _company_session_check(p_company_token);
  if p_branch_id is not null and not exists (select 1 from restaurants where id = p_branch_id and company_id = cs.company_id) then
    raise exception 'Şube bulunamadı';
  end if;
  return (
    select json_build_object(
      'branches', (
        select coalesce(json_agg(row_to_json(t) order by t.total desc), '[]'::json)
        from (
          select r.id, r.name,
            coalesce((select count(*) from sales_history sh
              where sh.restaurant_id = r.id
                and sh.closed_at >= (p_date::timestamp at time zone 'Europe/Istanbul')
                and sh.closed_at < ((v_date_to + 1)::timestamp at time zone 'Europe/Istanbul')), 0) as order_count,
            coalesce((select sum(sh.total) from sales_history sh
              where sh.restaurant_id = r.id
                and (sh.tags is null or array_length(sh.tags,1) is null)
                and sh.closed_at >= (p_date::timestamp at time zone 'Europe/Istanbul')
                and sh.closed_at < ((v_date_to + 1)::timestamp at time zone 'Europe/Istanbul')), 0) as total,
            coalesce((select sum(sh.cost) from sales_history sh
              where sh.restaurant_id = r.id
                and (sh.tags is null or array_length(sh.tags,1) is null)
                and sh.closed_at >= (p_date::timestamp at time zone 'Europe/Istanbul')
                and sh.closed_at < ((v_date_to + 1)::timestamp at time zone 'Europe/Istanbul')), 0) as cost
          from restaurants r
          where r.company_id = cs.company_id
            and (p_branch_id is null or r.id = p_branch_id)
        ) t
      ),
      'daily', (
        case when p_branch_id is null then '[]'::json else (
          select coalesce(json_agg(row_to_json(d) order by d.day), '[]'::json)
          from (
            select gs.day::date as day,
              coalesce((select count(*) from sales_history sh
                where sh.restaurant_id = p_branch_id
                  and sh.closed_at >= ((gs.day::date)::timestamp at time zone 'Europe/Istanbul')
                  and sh.closed_at < (((gs.day::date) + 1)::timestamp at time zone 'Europe/Istanbul')), 0) as order_count,
              coalesce((select sum(sh.total) from sales_history sh
                where sh.restaurant_id = p_branch_id
                  and (sh.tags is null or array_length(sh.tags,1) is null)
                  and sh.closed_at >= ((gs.day::date)::timestamp at time zone 'Europe/Istanbul')
                  and sh.closed_at < (((gs.day::date) + 1)::timestamp at time zone 'Europe/Istanbul')), 0) as total,
              coalesce((select sum(sh.cost) from sales_history sh
                where sh.restaurant_id = p_branch_id
                  and (sh.tags is null or array_length(sh.tags,1) is null)
                  and sh.closed_at >= ((gs.day::date)::timestamp at time zone 'Europe/Istanbul')
                  and sh.closed_at < (((gs.day::date) + 1)::timestamp at time zone 'Europe/Istanbul')), 0) as cost
            from generate_series(p_date::timestamp, v_date_to::timestamp, interval '1 day') as gs(day)
          ) d
        ) end
      ),
      'grand_total', (
        select coalesce(sum(sh.total), 0) from sales_history sh
        join restaurants r on r.id = sh.restaurant_id
        where r.company_id = cs.company_id
          and (p_branch_id is null or r.id = p_branch_id)
          and (sh.tags is null or array_length(sh.tags,1) is null)
          and sh.closed_at >= (p_date::timestamp at time zone 'Europe/Istanbul')
          and sh.closed_at < ((v_date_to + 1)::timestamp at time zone 'Europe/Istanbul')
      ),
      'grand_cost', (
        select coalesce(sum(sh.cost), 0) from sales_history sh
        join restaurants r on r.id = sh.restaurant_id
        where r.company_id = cs.company_id
          and (p_branch_id is null or r.id = p_branch_id)
          and (sh.tags is null or array_length(sh.tags,1) is null)
          and sh.closed_at >= (p_date::timestamp at time zone 'Europe/Istanbul')
          and sh.closed_at < ((v_date_to + 1)::timestamp at time zone 'Europe/Istanbul')
      )
    )
  );
end;
$$;


--
-- Name: get_customer_analytics(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_customer_analytics(p_token uuid, p_search text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'reports');
  return (
    select coalesce(json_agg(row_to_json(c) order by c.total_spent desc), '[]'::json)
    from (
      select cu.id, cu.name, cu.phone, cu.email, cu.notes, cu.points_balance, cu.total_visits, cu.total_spent, cu.created_at, cu.last_visit_at, cu.birthday
      from customers cu
      where cu.restaurant_id = s.restaurant_id
        and (p_search is null or p_search = '' or cu.name ilike '%'||p_search||'%' or cu.phone ilike '%'||p_search||'%')
      order by cu.total_spent desc
      limit 500
    ) c
  );
end;
$$;


--
-- Name: get_customer_by_phone(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_customer_by_phone(p_token uuid, p_phone text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'payments');
  return (
    select row_to_json(c) from (
      select cu.id, cu.name, cu.phone, cu.points_balance, cu.total_visits, cu.total_spent, cu.birthday,
        coalesce(cu.spend_per_point, r.loyalty_spend_per_point) as spend_per_point,
        coalesce(cu.point_value, r.loyalty_point_value) as point_value,
        coalesce(cu.birthday_discount_percent, r.birthday_discount_percent) as birthday_discount_percent,
        (cu.spend_per_point is not null or cu.point_value is not null or cu.birthday_discount_percent is not null) as custom_loyalty, -- eff_

        (cu.birthday is not null
          and extract(month from cu.birthday) = extract(month from (now() at time zone 'Europe/Istanbul'))
          and extract(day from cu.birthday) = extract(day from (now() at time zone 'Europe/Istanbul'))
        ) as is_birthday_today
      from customers cu join restaurants r on r.id = cu.restaurant_id where cu.restaurant_id = s.restaurant_id and cu.phone = p_phone
      limit 1
    ) c
  );
end;
$$;


--
-- Name: get_data_version(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_data_version(p_token uuid) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare r uuid;
begin
  select restaurant_id into r from staff_sessions where token = p_token and expires_at > now();
  if r is null then raise exception 'Oturum geçersiz veya süresi dolmuş, tekrar giriş yapın'; end if;
  return coalesce((select v from data_versions where restaurant_id = r), 0);
end; $$;


--
-- Name: get_integration_settings(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_integration_settings(p_token uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_is_manager boolean; r restaurants%rowtype;
begin
  s := _session_check(p_token);
  select exists(select 1 from app_users au join roles rl on rl.id = any(au.role_ids) where au.id = s.user_id and (rl.is_system or 'settings_integrations' = any(rl.permissions))) into v_is_manager;
  if not v_is_manager then raise exception 'Bu işlem için yetkiniz yok'; end if;
  select * into r from restaurants where id = s.restaurant_id;
  return json_build_object(
    'efatura_enabled', r.efatura_enabled,
    'efatura_provider', r.efatura_provider,
    'efatura_configured', r.efatura_api_key is not null,
    'marketplace_enabled', r.marketplace_enabled,
    'marketplace_yemeksepeti_configured', r.marketplace_yemeksepeti_key is not null,
    'marketplace_trendyol_configured', r.marketplace_trendyol_key is not null,
    'marketplace_getir_configured', r.marketplace_getir_key is not null,
    'accounting_enabled', r.accounting_enabled,
    'accounting_provider', r.accounting_provider,
    'accounting_configured', r.accounting_api_key is not null,
    'sms_enabled', r.sms_enabled, 'invoice_title', r.invoice_title, 'tax_number', r.tax_number, 'tax_office', r.tax_office, 'invoice_address', r.invoice_address
  );
end;
$$;


--
-- Name: get_live_orders(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_live_orders(p_token uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype;
begin
  s := _session_check(p_token);
  return (
    select coalesce(json_agg(json_build_object(
      'order_id', o.id, 'table_id', o.table_id, 'kind', o.kind, 'created_at', o.created_at,
      'daily_number', o.daily_number, 'tags', o.tags,
      'customer_name', o.customer_name, 'customer_phone', o.customer_phone, 'note', o.note,
      'created_by', o.created_by, 'waitlist_id', o.waitlist_id,
      'items', (
        select coalesce(json_agg(json_build_object(
          'id', oi.id, 'name', oi.name, 'price', oi.price, 'cost', oi.cost,
          'qty', oi.qty, 'status', oi.status, 'note', oi.note, 'paid', oi.paid,
          'station_id', p.station_id, 'product_id', oi.product_id, 'added_at', oi.added_at
        )), '[]'::json)
        from order_items oi left join products p on p.id = oi.product_id
        where oi.order_id = o.id
      )
    )), '[]'::json)
    from orders o
    where o.restaurant_id = s.restaurant_id and o.status = 'open'
  );
end;
$$;


--
-- Name: get_my_permissions(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_permissions(p_token uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_roles text[]; v_mgr boolean; v_perms text[];
begin
  s := _session_check(p_token);
  select coalesce(array_agg(distinct rl.name), '{}'), coalesce(bool_or(rl.is_system), false) into v_roles, v_mgr
    from app_users au join roles rl on rl.id = any(au.role_ids) where au.id = s.user_id;
  select coalesce(array_agg(distinct p), '{}') into v_perms
    from app_users au join roles rl on rl.id = any(au.role_ids) left join lateral unnest(rl.permissions) p on true
    where au.id = s.user_id and p is not null;
  return json_build_object('role_names', v_roles, 'permissions', v_perms, 'is_manager', v_mgr);
end; $$;


--
-- Name: get_my_shift_status(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_shift_status(p_token uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_row staff_shifts%rowtype; v_req boolean; v_mgr boolean;
begin
  s := _session_check(p_token);
  select shift_approval_required into v_req from restaurants where id = s.restaurant_id;
  v_mgr := _is_manager(s.user_id);
  select * into v_row from staff_shifts where user_id = s.user_id and clock_out is null and status in ('approved','pending') order by clock_in desc limit 1;
  return json_build_object(
    'clocked_in', v_row.id is not null and v_row.status = 'approved',
    'pending', v_row.id is not null and v_row.status = 'pending',
    'end_requested', v_row.end_requested_at is not null,
    'clock_in', v_row.clock_in, 'id', v_row.id,
    'can_end', not v_req or v_mgr,
    'approval_required', v_req,
    'shift_required', coalesce((select shift_required from restaurants where id = s.restaurant_id), false),
    'can_work', not coalesce((select shift_required from restaurants where id = s.restaurant_id), false) or v_mgr or v_row.id is not null, 'is_manager', v_mgr);
end; $$;


--
-- Name: get_nav_badges(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_nav_badges(p_token uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token);
  return _nav_badges(s.user_id, s.restaurant_id);
end; $$;


--
-- Name: get_online_menu_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_online_menu_admin(p_token uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'online_ordering');
  return json_build_object(
    'sections', (select coalesce(json_agg(json_build_object('id', id, 'name', name, 'sort_order', sort_order,
        'product_ids', (select coalesce(json_agg(i.product_id order by i.sort_order), '[]'::json) from online_menu_items i where i.section_id = sec.id)) order by sort_order, created_at), '[]'::json)
      from online_menu_sections sec where restaurant_id = s.restaurant_id),
    'products', (select coalesce(json_agg(json_build_object('id', p.id, 'name', p.name, 'price', p.price, 'station_name', st.name, 'available', p.available,
        'image', (select data from product_images pi where pi.product_id = p.id)) order by st.name, p.name), '[]'::json)
      from products p left join stations st on st.id = p.station_id where p.restaurant_id = s.restaurant_id));
end; $$;


--
-- Name: get_product_sales(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_product_sales(p_token uuid, p_date date, p_date_to date DEFAULT NULL::date) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'settings_products');
  return (
    select coalesce(json_agg(row_to_json(r) order by r.revenue desc), '[]'::json)
    from (
      select
        oi.product_id,
        oi.name,
        p.station_id,
        st.name as station_name,
        sum(oi.qty)::int as qty,
        sum(oi.price*oi.qty) as revenue,
        sum(oi.cost*oi.qty) as cost
      from order_items oi
      join orders o on o.id = oi.order_id
      left join products p on p.id = oi.product_id
      left join stations st on st.id = p.station_id
      where o.restaurant_id = s.restaurant_id
        and oi.paid = true
        and oi.paid_at >= (p_date::timestamp at time zone 'Europe/Istanbul')
        and oi.paid_at < ((coalesce(p_date_to, p_date) + 1)::timestamp at time zone 'Europe/Istanbul')
        and (o.tags is null or array_length(o.tags,1) is null)
      group by oi.product_id, oi.name, p.station_id, st.name
    ) r
  );
end;
$$;


--
-- Name: get_public_menu(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_public_menu(p_qr_token uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_table restaurant_tables%rowtype;
  v_restaurant restaurants%rowtype;
begin
  select * into v_table from restaurant_tables where qr_token = p_qr_token;
  if v_table.id is null then raise exception 'Geçersiz QR kod'; end if;
  select * into v_restaurant from restaurants where id = v_table.restaurant_id;
  if not coalesce(v_restaurant.is_active, false) then raise exception 'Bu işletme şu anda aktif değil'; end if;

  return json_build_object(
    'restaurant_name', v_restaurant.name,
    'restaurant_verified', coalesce(v_restaurant.tax_number,'') <> '' and v_restaurant.created_at < now() - interval '3 days',
    'restaurant_title', v_restaurant.invoice_title, 'restaurant_address', v_restaurant.invoice_address,
    'table_name', v_table.name,
    'qr_ordering_enabled', _restaurant_has_feature(v_restaurant.id, 'qr_ordering'),
    'products', (
      select coalesce(json_agg(json_build_object(
        'id', p.id, 'name', p.name, 'price', p.price, 'station_name', st.name, 'max_qty', _product_public_qty(p.id), 'name_translations', case when _restaurant_has_feature(v_restaurant.id, 'multilang_menu') then p.name_translations else null end
      ) order by st.name, p.name), '[]'::json)
      from products p left join stations st on st.id = p.station_id
      where p.restaurant_id = v_table.restaurant_id and p.available = true
    )
  );
end;
$$;


--
-- Name: get_public_order_menu(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_public_order_menu(p_restaurant_code text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare v_restaurant restaurants%rowtype;
begin
  select * into v_restaurant from restaurants where code = p_restaurant_code;
  if v_restaurant.id is null then raise exception 'İşletme bulunamadı'; end if;
  if not coalesce(v_restaurant.is_active, false) then raise exception 'Bu işletme şu anda aktif değil'; end if;
  if not coalesce(v_restaurant.online_ordering_enabled, false) or not _restaurant_has_feature(v_restaurant.id, 'online_ordering') then raise exception 'Bu işletme şu anda online sipariş almıyor'; end if;

  return json_build_object(
    'restaurant_name', v_restaurant.name,
    'restaurant_verified', coalesce(v_restaurant.tax_number,'') <> '' and v_restaurant.created_at < now() - interval '3 days',
    'restaurant_title', v_restaurant.invoice_title, 'restaurant_address', v_restaurant.invoice_address,
    'sections', (select coalesce(json_agg(json_build_object('id', sec.id, 'name', sec.name,
        'product_ids', (select coalesce(json_agg(i.product_id order by i.sort_order), '[]'::json) from online_menu_items i where i.section_id = sec.id)) order by sec.sort_order, sec.created_at), '[]'::json)
      from online_menu_sections sec where sec.restaurant_id = v_restaurant.id),
    'products', (
      select coalesce(json_agg(json_build_object(
        'id', p.id, 'name', p.name, 'price', p.price, 'station_name', st.name, 'name_translations', case when _restaurant_has_feature(v_restaurant.id, 'multilang_menu') then p.name_translations else null end,
        'image', (select data from product_images pi where pi.product_id = p.id), 'max_qty', _product_public_qty(p.id)
      ) order by st.name, p.name), '[]'::json)
      from products p left join stations st on st.id = p.station_id
      where p.restaurant_id = v_restaurant.id and p.available = true
    )
  );
end;
$$;


--
-- Name: get_purchase_order(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_purchase_order(p_token uuid, p_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check_any(p_token, array['purchasing_orders','purchasing_manage']);
  return (
    select json_build_object(
      'id', p.id, 'status', p.status, 'order_date', p.order_date, 'expected_date', p.expected_date,
      'received_date', p.received_date, 'notes', p.notes, 'supplier_id', p.supplier_id,
      'supplier_name', sp.name,
      'items', (
        select coalesce(json_agg(json_build_object(
          'id', it.id, 'ingredient_id', it.ingredient_id, 'ingredient_name', ing.name, 'ingredient_unit', ing.unit,
          'quantity', it.quantity, 'unit_cost', it.unit_cost, 'received_quantity', it.received_quantity
        )), '[]'::json)
        from purchase_order_items it join ingredients ing on ing.id = it.ingredient_id
        where it.purchase_order_id = p.id
      )
    )
    from purchase_orders p left join suppliers sp on sp.id = p.supplier_id
    where p.id = p_id and p.restaurant_id = s.restaurant_id
  );
end;
$$;


--
-- Name: get_push_subscription_status(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_push_subscription_status(p_token uuid, p_endpoint text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token);
  return exists(select 1 from push_subscriptions where endpoint = p_endpoint and user_id = s.user_id);
end;
$$;


--
-- Name: get_reservation_analytics(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_reservation_analytics(p_token uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_start timestamptz; v_end timestamptz;
begin
  s := _session_check(p_token, 'reports');
  p_from := coalesce(p_from, (now() at time zone 'Europe/Istanbul')::date);
  v_start := (p_from::timestamp at time zone 'Europe/Istanbul');
  v_end := ((coalesce(p_to, p_from) + 1)::timestamp at time zone 'Europe/Istanbul');
  return (
    with rv as (
      select r.*, t.name table_name,
        case when r.seated_at is not null then round(extract(epoch from (r.seated_at - r.reservation_time))/60) end arrival_diff,
        (select coalesce(sum(sh.total),0) from sales_history sh join orders o on o.id = sh.order_id where o.reservation_id = r.id) revenue,
        (select count(*) from sales_history sh join orders o on o.id = sh.order_id where o.reservation_id = r.id) bills,
        (select coalesce(json_agg(json_build_object('id', sh.id, 'total', sh.total, 'closed_at', sh.closed_at) order by sh.closed_at), '[]'::json) from sales_history sh join orders o on o.id = sh.order_id where o.reservation_id = r.id) history_ids
      from reservations r left join restaurant_tables t on t.id = r.table_id
      where r.restaurant_id = s.restaurant_id and r.reservation_time >= v_start and r.reservation_time < v_end
    ), wl as (
      select w.*, t.name table_name,
        round(extract(epoch from (coalesce(w.seated_at, w.left_at) - w.joined_at))/60) waited,
        (select coalesce(sum(sh.total),0) from sales_history sh join orders o on o.id = sh.order_id where o.waitlist_id = w.id) revenue,
        (select coalesce(json_agg(json_build_object('id', sh.id, 'total', sh.total, 'closed_at', sh.closed_at) order by sh.closed_at), '[]'::json) from sales_history sh join orders o on o.id = sh.order_id where o.waitlist_id = w.id) history_ids
      from waitlist_entries w left join restaurant_tables t on t.id = w.table_id
      where w.restaurant_id = s.restaurant_id and w.joined_at >= v_start and w.joined_at < v_end
    )
    select json_build_object(
      'summary', (select json_build_object(
        'total', count(*),
        'pending', count(*) filter (where status in ('pending','confirmed')),
        'seated', count(*) filter (where status = 'seated'),
        'cancelled', count(*) filter (where status = 'cancelled'),
        'no_show', count(*) filter (where status = 'no_show'),
        'guests_booked', coalesce(sum(party_size),0),
        'guests_seated', coalesce(sum(party_size) filter (where status = 'seated'),0),
        'avg_party', round(avg(party_size)::numeric, 1),
        'avg_arrival_diff', round(avg(arrival_diff)::numeric, 0),
        'on_time', count(*) filter (where arrival_diff is not null and abs(arrival_diff) <= 5),
        'early', count(*) filter (where arrival_diff < -5),
        'late', count(*) filter (where arrival_diff > 5),
        'revenue', coalesce(sum(revenue),0),
        'avg_order', round((sum(revenue) filter (where revenue > 0) / nullif(count(*) filter (where revenue > 0),0))::numeric, 2),
        'avg_per_guest', round((sum(revenue) filter (where revenue > 0) / nullif(sum(party_size) filter (where revenue > 0),0))::numeric, 2)
      ) from rv),
      'by_hour', (select coalesce(json_agg(json_build_object('hour', h, 'count', c, 'guests', g) order by h), '[]'::json) from (
        select extract(hour from reservation_time at time zone 'Europe/Istanbul')::int h, count(*) c, sum(party_size) g from rv group by 1) x),
      'by_table', (select coalesce(json_agg(json_build_object('table', table_name, 'count', c, 'guests', g, 'revenue', rev) order by c desc), '[]'::json) from (
        select coalesce(table_name, '—') table_name, count(*) c, sum(party_size) g, sum(revenue) rev from rv where status = 'seated' group by 1) x),
      'rows', (select coalesce(json_agg(json_build_object('id', id, 'customer_name', customer_name, 'phone', phone, 'party_size', party_size,
          'reservation_time', reservation_time, 'seated_at', seated_at, 'status', status, 'table_name', table_name, 'arrival_diff', arrival_diff,
          'revenue', revenue, 'bills', bills, 'history_ids', history_ids, 'notes', notes) order by reservation_time), '[]'::json) from rv),
      'waitlist_rows', (select coalesce(json_agg(json_build_object('id', id, 'customer_name', customer_name, 'phone', phone, 'party_size', party_size,
          'joined_at', joined_at, 'seated_at', seated_at, 'left_at', left_at, 'status', status, 'table_name', table_name,
          'quoted', quoted_wait_minutes, 'waited', waited, 'revenue', revenue, 'history_ids', history_ids) order by joined_at), '[]'::json) from wl),
      'waitlist', (select json_build_object(
        'total', count(*), 'seated', count(*) filter (where status = 'seated'), 'left', count(*) filter (where status = 'cancelled'),
        'waiting', count(*) filter (where status = 'waiting'),
        'guests_seated', coalesce(sum(party_size) filter (where status = 'seated'),0),
        'avg_wait', round(avg(waited) filter (where status = 'seated')::numeric, 0),
        'avg_quoted', round(avg(quoted_wait_minutes) filter (where status = 'seated')::numeric, 0),
        'late', count(*) filter (where status = 'seated' and quoted_wait_minutes is not null and waited > quoted_wait_minutes),
        'revenue', coalesce(sum(revenue),0)
      ) from wl)
    ));
end; $$;


--
-- Name: get_restaurant_config(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_restaurant_config(p_token uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token);
  return (
    select json_build_object(
      'zones', (
        select coalesce(json_agg(json_build_object(
          'id', z.id, 'name', z.name,
          'tables', (select coalesce(json_agg(json_build_object('id', t.id, 'name', t.name, 'qr_token', t.qr_token, 'pos_x', t.pos_x, 'pos_y', t.pos_y)), '[]'::json) from restaurant_tables t where t.zone_id = z.id)
        )), '[]'::json)
        from zones z where z.restaurant_id = s.restaurant_id
      ),
      'stations', (select coalesce(json_agg(json_build_object('id', id, 'name', name, 'color', color, 'icon', icon)), '[]'::json) from stations where restaurant_id = s.restaurant_id),
      'order_flags', (select coalesce(json_agg(json_build_object('id', id, 'label', label) order by sort_order), '[]'::json) from order_flag_defs where restaurant_id = s.restaurant_id),
      'products', (
        select coalesce(json_agg(json_build_object(
          'id', p.id, 'name', p.name, 'price', p.price, 'cost', p.cost,
          'stock', p.stock, 'available', p.available, 'station_id', p.station_id,
          'name_translations', p.name_translations,
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
      'users', (
        select coalesce(json_agg(json_build_object(
          'id', au.id, 'username', au.username, 'role_ids', au.role_ids, 'is_active', au.is_active,
          'role_names', (select coalesce(array_agg(rl.name), '{}') from roles rl where rl.id = any(au.role_ids))
        )), '[]'::json)
        from app_users au where au.restaurant_id = s.restaurant_id and not au.is_company_owner
      ),
      'roles', (
        select coalesce(json_agg(json_build_object(
          'id', rl.id, 'name', rl.name, 'permissions', rl.permissions, 'is_system', rl.is_system,
          'user_count', (select count(*) from app_users au where rl.id = any(au.role_ids) and not au.is_company_owner)
        ) order by rl.is_system desc, rl.name), '[]'::json)
        from roles rl where rl.restaurant_id = s.restaurant_id
      ),
      'loyalty', (select json_build_object('enabled', loyalty_enabled, 'spend_per_point', loyalty_spend_per_point, 'point_value', loyalty_point_value, 'birthday_discount_percent', birthday_discount_percent) from restaurants where id = s.restaurant_id),
      'tip_pool', (select json_build_object('enabled', tip_pool_enabled, 'mode', tip_pool_mode) from restaurants where id = s.restaurant_id),
      'google_review_url', (select google_review_url from restaurants where id = s.restaurant_id),
      'online_ordering', (select json_build_object('enabled', online_ordering_enabled, 'code', code) from restaurants where id = s.restaurant_id),
      'ticket_design', (select ticket_design from restaurants where id = s.restaurant_id),
      'company', (
        select case when r.company_id is null then null
          else json_build_object('id', c.id, 'name', c.name) end
        from restaurants r left join companies c on c.id = r.company_id
        where r.id = s.restaurant_id
      ),
      'features', to_json(_restaurant_features(s.restaurant_id)),
      'role_permissions', _role_permission_catalog(s.restaurant_id),
      'license', (select json_build_object('package_id', package_id, 'max_users', max_users, 'expires_at', expires_at, 'name', name, 'reports_password_set', reports_password_hash is not null, 'billing_identity_set', billing_identity_number is not null) from restaurants where id = s.restaurant_id)
    )
  );
end;
$$;


--
-- Name: get_sale_detail(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_sale_detail(p_token uuid, p_history_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; h sales_history%rowtype;
begin
  s := _session_check_any(p_token, array['payments','reports']);
  select * into h from sales_history where id = p_history_id and restaurant_id = s.restaurant_id;
  if h.id is null then raise exception 'Ödeme kaydı bulunamadı'; end if;
  return json_build_object(
    'id', h.id, 'table_name', h.table_name, 'kind', h.kind, 'closed_at', h.closed_at,
    'subtotal', h.subtotal, 'discount', coalesce(h.discount_amount,0), 'birthday_discount', coalesce(h.birthday_discount_amount,0),
    'tip', coalesce(h.tip_amount,0), 'total', h.total, 'payment_method', h.payment_method,
    'cash_amount', h.cash_amount, 'card_amount', h.card_amount, 'gift_card_amount', coalesce(h.gift_card_amount,0), 'tags', h.tags,
    'staff', (select username from app_users where id = h.staff_user_id),
    'customer', (select name from customers where id = h.customer_id),
    'order_no', (select daily_number from orders where id = h.order_id),
    'items', (select coalesce(json_agg(json_build_object('name', name, 'qty', q, 'price', price, 'total', price*q) order by name), '[]'::json)
      from (select name, price, sum(qty) q from order_items where order_id = h.order_id and paid and paid_at = h.closed_at group by name, price) x),
    'emails', (select coalesce(json_agg(json_build_object('email', email, 'at', created_at) order by created_at desc), '[]'::json) from invoices where history_id = h.id));
end; $$;


--
-- Name: get_sales_history(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_sales_history(p_token uuid, p_date date, p_date_to date DEFAULT NULL::date) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'reports');
  return (
    select coalesce(json_agg(row_to_json(h)), '[]'::json)
    from (
      select sh.id, sh.order_id, sh.table_name, sh.subtotal, sh.discount_amount, sh.total, sh.cost, sh.payment_method, sh.cash_amount, sh.card_amount,
        sh.closed_at, sh.tags, sh.kind, sh.tip_amount, sh.customer_id, sh.points_earned, sh.points_redeemed, sh.birthday_discount_amount,
        sh.staff_user_id, au1.username as staff_name,
        o.created_by as order_taken_by, au2.username as order_taken_by_name,
        sh.gift_card_amount, (o.reservation_id is not null) as from_reservation, (o.waitlist_id is not null) as from_waitlist
      from sales_history sh
      left join app_users au1 on au1.id = sh.staff_user_id
      left join orders o on o.id = sh.order_id
      left join app_users au2 on au2.id = o.created_by
      where sh.restaurant_id = s.restaurant_id
        and sh.closed_at >= (p_date::timestamp at time zone 'Europe/Istanbul')
        and sh.closed_at < ((coalesce(p_date_to, p_date) + 1)::timestamp at time zone 'Europe/Istanbul')
      order by sh.closed_at desc
    ) h
  );
end;
$$;


--
-- Name: get_service_metrics(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_service_metrics(p_token uuid, p_date date, p_date_to date) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_from timestamptz; v_to timestamptz; v_days int; v_tables int;
begin
  s := _session_check(p_token, 'reports');
  v_from := p_date::timestamp at time zone 'Europe/Istanbul';
  v_to := (coalesce(p_date_to, p_date) + 1)::timestamp at time zone 'Europe/Istanbul';
  v_days := greatest(1, coalesce(p_date_to, p_date) - p_date + 1);
  select count(*) into v_tables from restaurant_tables where restaurant_id = s.restaurant_id;
  return (
    with checks as (
      select sh.order_id, sum(sh.total) total, max(sh.closed_at) closed_at, min(o.created_at) opened_at, min(o.kind) kind
      from sales_history sh join orders o on o.id = sh.order_id
      where sh.restaurant_id = s.restaurant_id and sh.closed_at >= v_from and sh.closed_at < v_to
        and coalesce(array_length(sh.tags,1),0) = 0
      group by sh.order_id
    )
    select json_build_object(
      'checks', count(*),
      'avg_check', coalesce(round(avg(total), 2), 0),
      'dine_in_checks', count(*) filter (where kind = 'dine_in'),
      'avg_check_dine_in', coalesce(round(avg(total) filter (where kind = 'dine_in'), 2), 0),
      'avg_check_takeaway', coalesce(round(avg(total) filter (where kind <> 'dine_in'), 2), 0),
      'avg_seat_minutes', coalesce(round(extract(epoch from avg(closed_at - opened_at) filter (where kind = 'dine_in')) / 60), 0),
      'table_count', v_tables, 'days', v_days,
      'table_turnover', case when v_tables > 0 then round((count(*) filter (where kind = 'dine_in'))::numeric / v_tables / v_days, 2) else 0 end
    ) from checks
  );
end $$;


--
-- Name: get_staff_hourly_stats(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_staff_hourly_stats(p_token uuid, p_date date, p_date_to date DEFAULT NULL::date) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'reports');
  return json_build_object(
    'orders_by_hour', (
      select coalesce(json_agg(row_to_json(x)), '[]'::json)
      from (
        select au.username as staff_name,
          extract(hour from o.created_at at time zone 'Europe/Istanbul')::int as hour,
          count(distinct o.id) as count
        from orders o
        join app_users au on au.id = o.created_by
        where o.restaurant_id = s.restaurant_id
          and o.created_at >= (p_date::timestamp at time zone 'Europe/Istanbul')
          and o.created_at < ((coalesce(p_date_to, p_date) + 1)::timestamp at time zone 'Europe/Istanbul')
        group by au.username, extract(hour from o.created_at at time zone 'Europe/Istanbul')
      ) x
    ),
    'payments_by_hour', (
      select coalesce(json_agg(row_to_json(y)), '[]'::json)
      from (
        select au.username as staff_name,
          extract(hour from sh.closed_at at time zone 'Europe/Istanbul')::int as hour,
          count(*) as count
        from sales_history sh
        join app_users au on au.id = sh.staff_user_id
        where sh.restaurant_id = s.restaurant_id
          and sh.closed_at >= (p_date::timestamp at time zone 'Europe/Istanbul')
          and sh.closed_at < ((coalesce(p_date_to, p_date) + 1)::timestamp at time zone 'Europe/Istanbul')
        group by au.username, extract(hour from sh.closed_at at time zone 'Europe/Istanbul')
      ) y
    )
  );
end;
$$;


--
-- Name: get_tip_pool_report(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_tip_pool_report(p_token uuid, p_date date, p_date_to date DEFAULT NULL::date) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_total_tip numeric; v_mode text; v_enabled boolean; v_to date := coalesce(p_date_to, p_date);
begin
  s := _session_check(p_token, 'reports');
  select tip_pool_enabled, tip_pool_mode into v_enabled, v_mode from restaurants where id = s.restaurant_id;

  select coalesce(sum(tip_amount),0) into v_total_tip
  from sales_history
  where restaurant_id = s.restaurant_id
    and closed_at >= (p_date::timestamp at time zone 'Europe/Istanbul')
    and closed_at < ((v_to + 1)::timestamp at time zone 'Europe/Istanbul');

  return (
    select json_build_object(
      'enabled', coalesce(v_enabled,false),
      'mode', coalesce(v_mode,'equal'),
      'total_tip', v_total_tip,
      'shares', (
        select coalesce(json_agg(json_build_object(
          'user_id', t.user_id, 'username', t.username, 'minutes', round(t.minutes),
          'share_amount', case
            when v_mode='by_hours' and t.total_minutes > 0 then round(v_total_tip * t.minutes / t.total_minutes, 2)
            when v_mode<>'by_hours' and t.staff_count > 0 then round(v_total_tip / t.staff_count, 2)
            else 0
          end
        ) order by t.username), '[]'::json)
        from (
          select per.user_id, per.username, per.minutes,
            sum(per.minutes) over () as total_minutes,
            count(*) over () as staff_count
          from (
            select ss.user_id, au.username,
              sum(case when ss.clock_out is not null then extract(epoch from (ss.clock_out - ss.clock_in))/60
                       else extract(epoch from (now() - ss.clock_in))/60 end) as minutes
            from staff_shifts ss
            join app_users au on au.id = ss.user_id
            where ss.restaurant_id = s.restaurant_id and ss.status = 'approved'
              and (ss.clock_in at time zone 'Europe/Istanbul')::date >= p_date
              and (ss.clock_in at time zone 'Europe/Istanbul')::date <= v_to
            group by ss.user_id, au.username
          ) per
        ) t
      )
    )
  );
end;
$$;


--
-- Name: issue_gift_card(uuid, numeric, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.issue_gift_card(p_token uuid, p_amount numeric, p_customer_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype;
  v_code text;
  v_id uuid;
  v_tries int := 0;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  s := _session_check(p_token, 'payments');
  if p_amount is null or p_amount <= 0 then raise exception 'Tutar 0''dan büyük olmalı'; end if;
  if p_customer_id is not null then
    if not exists(select 1 from customers c where c.id = p_customer_id and c.restaurant_id = s.restaurant_id) then
      raise exception 'Müşteri bulunamadı';
    end if;
  end if;

  loop
    v_tries := v_tries + 1;
    v_code := (
      select string_agg(substr(v_chars, (floor(random()*length(v_chars))+1)::int, 1), '')
      from generate_series(1,8)
    );
    begin
      insert into gift_cards (restaurant_id, code, initial_balance, balance, customer_id, note, created_by)
      values (s.restaurant_id, v_code, p_amount, p_amount, p_customer_id, p_note, s.user_id)
      returning id into v_id;
      exit;
    exception when unique_violation then
      if v_tries >= 10 then raise exception 'Kart kodu üretilemedi, tekrar deneyin'; end if;
    end;
  end loop;

  return json_build_object('id', v_id, 'code', v_code, 'balance', p_amount);
end;
$$;


--
-- Name: leave_chat_group(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.leave_chat_group(p_token uuid, p_group_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $_$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'messages');
  execute 'de'||'lete from chat_group_members where group_id = $1 and user_id = $2' using p_group_id, s.user_id;
  -- Son üye de çıktıysa grup kaldırılır.
  if not exists(select 1 from chat_group_members where group_id = p_group_id) then
    execute 'de'||'lete from chat_groups where id = $1 and restaurant_id = $2' using p_group_id, s.restaurant_id;
  end if;
end; $_$;


--
-- Name: list_active_staff(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_active_staff(p_token uuid, p_minutes integer DEFAULT 5) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_min int := greatest(1, least(coalesce(p_minutes,5), 1440)); v_company uuid; v_pkg text; v_max int;
begin
  s := _session_check(p_token);
  if not exists(select 1 from app_users au join roles rl on rl.id = any(au.role_ids) where au.id = s.user_id and (rl.is_system or 'settings_users' = any(rl.permissions))) then
    raise exception 'Bu ekranı yalnızca Yönetici görebilir';
  end if;
  select r.company_id, r.package_id into v_company, v_pkg from restaurants r where r.id = s.restaurant_id;
  if v_company is not null then select c.package_id into v_pkg from companies c where c.id = v_company; end if;
  select max_users into v_max from packages where id = v_pkg;
  return json_build_object(
    'minutes', v_min,
    'max_users', v_max,
    'total_users', (select count(*) from app_users where restaurant_id = s.restaurant_id and not is_company_owner),
    'enabled_users', (select count(*) from app_users where restaurant_id = s.restaurant_id and not is_company_owner and is_active),
    'active_users', (select count(distinct user_id) from staff_sessions where restaurant_id = s.restaurant_id and expires_at > now() and last_seen_at > now() - make_interval(mins => v_min)),
    'today_users', (select count(distinct user_id) from staff_sessions where restaurant_id = s.restaurant_id and coalesce(last_seen_at, created_at) >= (date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul')),
    'on_shift', (select count(*) from staff_shifts where restaurant_id = s.restaurant_id and clock_out is null and status = 'approved'),
    'rows', (select coalesce(json_agg(row_to_json(t) order by t.online desc, t.last_seen_at desc), '[]'::json) from (
      select distinct on (ss.user_id) ss.user_id, au.username,
        (select string_agg(rl.name, ', ') from roles rl where rl.id = any(au.role_ids)) roles,
        coalesce(ss.last_seen_at, ss.created_at) last_seen_at, ss.created_at login_at, ss.logged_out_at,
        (ss.expires_at > now()) online,
        exists(select 1 from staff_shifts sh where sh.user_id = ss.user_id and sh.clock_out is null and sh.status = 'approved') on_shift
      from staff_sessions ss join app_users au on au.id = ss.user_id
      where ss.restaurant_id = s.restaurant_id and coalesce(ss.last_seen_at, ss.created_at) > now() - make_interval(mins => v_min)
      order by ss.user_id, (ss.expires_at > now()) desc, coalesce(ss.last_seen_at, ss.created_at) desc) t));
end; $$;


--
-- Name: list_addons(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_addons() RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  select coalesce(json_agg(row_to_json(t) order by t.sort_order, t.label), '[]'::json) from (
    select id, label, description, price, category, sort_order
    from feature_catalog where is_addon and active
  ) t;
$$;


--
-- Name: list_chat_conversations(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_chat_conversations(p_token uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'messages');
  return json_build_object('me', s.user_id, 'items', (select coalesce(json_agg(x order by x.is_all desc, x.last_at desc nulls last, x.name), '[]'::json) from (
    select true is_all, false is_group, 'all' conv, 'Genel (herkes)' name, null::text roles, false online, null::int member_count, false can_manage,
      lm.created_at last_at, _chat_preview(lm) last_body,
      coalesce((select n from _chat_unread(s.user_id, s.restaurant_id) u where u.conv = 'all'), 0) unread
    from (select 1) d left join lateral (select * from chat_messages where restaurant_id = s.restaurant_id and recipient_id is null and group_id is null order by created_at desc limit 1) lm on true
    union all
    select false, true, 'g:' || g.id, g.name,
      (select string_agg(au.username, ', ' order by au.username) from chat_group_members gm join app_users au on au.id = gm.user_id where gm.group_id = g.id),
      false, (select count(*)::int from chat_group_members where group_id = g.id),
      (g.created_by = s.user_id or _is_manager(s.user_id)),
      lm.created_at, _chat_preview(lm),
      coalesce((select n from _chat_unread(s.user_id, s.restaurant_id) u where u.conv = 'g:' || g.id), 0)
    from chat_groups g join chat_group_members me on me.group_id = g.id and me.user_id = s.user_id
    left join lateral (select * from chat_messages where group_id = g.id order by created_at desc limit 1) lm on true
    where g.restaurant_id = s.restaurant_id
    union all
    select false, false, au.id::text, au.username, (select string_agg(rl.name, ', ') from roles rl where rl.id = any(au.role_ids)),
      exists(select 1 from staff_sessions ss where ss.user_id = au.id and ss.expires_at > now() and ss.last_seen_at > now() - interval '5 minutes'),
      null, false, lm.created_at, _chat_preview(lm),
      coalesce((select n from _chat_unread(s.user_id, s.restaurant_id) u where u.conv = au.id::text), 0)
    from app_users au
    left join lateral (select * from chat_messages m where m.restaurant_id = s.restaurant_id and m.group_id is null and ((m.sender_id = s.user_id and m.recipient_id = au.id) or (m.sender_id = au.id and m.recipient_id = s.user_id)) order by created_at desc limit 1) lm on true
    where au.restaurant_id = s.restaurant_id and au.id <> s.user_id and au.is_active and not au.is_company_owner) x));
end; $$;


--
-- Name: list_company_branches(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_company_branches(p_company_token uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare cs company_sessions%rowtype;
begin
  cs := _company_session_check(p_company_token);
  return (
    select coalesce(json_agg(row_to_json(t) order by t.created_at), '[]'::json)
    from (
      select r.id, r.name, r.code, r.created_at,
        (select count(*) from app_users au where au.restaurant_id = r.id and not au.is_company_owner) as staff_count,
        (select coalesce(sum(sh.total),0) from sales_history sh where sh.restaurant_id = r.id and sh.closed_at >= date_trunc('day', now())) as revenue_today
      from restaurants r
      where r.company_id = cs.company_id
    ) t
  );
end;
$$;


--
-- Name: list_customer_order_requests(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_customer_order_requests(p_token uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'order');
  return (
    select coalesce(json_agg(row_to_json(q) order by q.created_at), '[]'::json)
    from (
      select cr.id, cr.table_id, rt.name as table_name, cr.customer_name, cr.customer_phone,
        cr.delivery_address, cr.order_type, cr.created_at,
        (
          select coalesce(json_agg(json_build_object(
            'product_id', it->>'product_id',
            'name', pr.name,
            'price', pr.price,
            'qty', (it->>'qty')::int,
            'note', it->>'note'
          )), '[]'::json)
          from jsonb_array_elements(cr.items) it
          left join products pr on pr.id = (it->>'product_id')::uuid
        ) as items
      from customer_order_requests cr
      left join restaurant_tables rt on rt.id = cr.table_id
      where cr.restaurant_id = s.restaurant_id and cr.status = 'pending'
    ) q
  );
end;
$$;


--
-- Name: list_customers(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_customers(p_token uuid, p_search text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'crm');
  return (
    select coalesce(json_agg(row_to_json(c) order by c.name), '[]'::json)
    from (
      select cu.id, cu.name, cu.phone, cu.email, cu.notes, cu.points_balance, cu.total_visits, cu.total_spent, cu.created_at, cu.last_visit_at, cu.birthday, cu.spend_per_point, cu.point_value, cu.birthday_discount_percent
      from customers cu
      where cu.restaurant_id = s.restaurant_id
        and (p_search is null or p_search = '' or cu.name ilike '%'||p_search||'%' or cu.phone ilike '%'||p_search||'%')
      order by cu.name
      limit 200
    ) c
  );
end;
$$;


--
-- Name: list_feature_labels(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_feature_labels() RETURNS json
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
    select id, label from feature_catalog
  ) t;
$$;


--
-- Name: list_gift_cards(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_gift_cards(p_token uuid, p_search text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'payments');
  return (
    select coalesce(json_agg(row_to_json(t) order by t.created_at desc), '[]'::json)
    from (
      select g.id, g.code, g.initial_balance, g.balance, g.is_active, g.created_at, g.note,
        c.name as customer_name, c.phone as customer_phone
      from gift_cards g
      left join customers c on c.id = g.customer_id
      where g.restaurant_id = s.restaurant_id
        and (
          p_search is null or p_search = '' or
          g.code ilike '%'||p_search||'%' or
          c.name ilike '%'||p_search||'%' or
          c.phone ilike '%'||p_search||'%'
        )
    ) t
  );
end;
$$;


--
-- Name: list_invoices(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_invoices(p_token uuid, p_date date, p_date_to date) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'payments');
  return coalesce((select json_agg(row_to_json(i) order by i.created_at desc) from (
    select id, number, email, buyer_name, buyer_tax_number, total, status, efatura_error, created_at from invoices
    where restaurant_id = s.restaurant_id
      and created_at >= (p_date::timestamp at time zone 'Europe/Istanbul')
      and created_at < ((coalesce(p_date_to,p_date)+1)::timestamp at time zone 'Europe/Istanbul')) i), '[]'::json);
end $$;


--
-- Name: list_packages(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_packages() RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select coalesce(json_agg(row_to_json(t) order by t.sort_order), '[]'::json) from (
    select id, name, description, max_users, price, price_yearly, is_popular, sort_order, features, included_addons
    from packages where active
  ) t;
$$;


--
-- Name: list_promo_codes(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_promo_codes(p_token uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  perform _platform_admin_check(p_token);
  return (select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
    select id, code, discount_type, discount_value, max_uses, used_count, active, expires_at, created_at
    from promo_codes order by created_at desc
  ) t);
end;
$$;


--
-- Name: list_purchase_orders(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_purchase_orders(p_token uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check_any(p_token, array['purchasing_orders','purchasing_manage']);
  return (
    select coalesce(json_agg(row_to_json(po) order by po.order_date desc), '[]'::json)
    from (
      select p.id, p.status, p.order_date, p.expected_date, p.received_date, p.notes,
        p.supplier_id, sp.name as supplier_name, p.created_by, (select username from app_users where id = p.created_by) as created_by_name,
        (select coalesce(sum(i.quantity*i.unit_cost),0) from purchase_order_items i where i.purchase_order_id = p.id) as total_amount,
        (select coalesce(sum(i.quantity),0) from purchase_order_items i where i.purchase_order_id = p.id) as ordered_total,
        (select coalesce(sum(least(i.received_quantity, i.quantity)),0) from purchase_order_items i where i.purchase_order_id = p.id) as received_total,
        (select coalesce(json_agg(json_build_object('name', ig.name, 'unit', ig.unit, 'quantity', i.quantity, 'received', i.received_quantity) order by ig.name), '[]'::json)
           from purchase_order_items i join ingredients ig on ig.id = i.ingredient_id where i.purchase_order_id = p.id) as items
      from purchase_orders p left join suppliers sp on sp.id = p.supplier_id
      where p.restaurant_id = s.restaurant_id
    ) po
  );
end;
$$;


--
-- Name: list_reservation_history(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_reservation_history(p_token uuid, p_date date) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'reservations');
  return (select coalesce(json_agg(row_to_json(h) order by h.reservation_time desc), '[]'::json) from (
    select rv.id, rv.customer_name, rv.phone, rv.party_size, rv.reservation_time, rv.status, rv.notes, rv.seated_at, rv.closed_at,
      rt.name table_name,
      case when rv.seated_at is not null then round(extract(epoch from (rv.seated_at - rv.reservation_time))/60) end seated_diff_minutes
    from reservations rv left join restaurant_tables rt on rt.id = rv.table_id
    where rv.restaurant_id = s.restaurant_id and rv.status in ('seated','cancelled','no_show')
      and (rv.reservation_time at time zone 'Europe/Istanbul')::date = p_date) h);
end; $$;


--
-- Name: list_reservations(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_reservations(p_token uuid, p_date date DEFAULT NULL::date) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'reservations');
  return (
    select coalesce(json_agg(row_to_json(r) order by r.reservation_time), '[]'::json)
    from (
      select rv.id, rv.customer_name, rv.phone, rv.party_size, rv.reservation_time, rv.table_id, rv.status, rv.notes,
             rt.name as table_name
      from reservations rv left join restaurant_tables rt on rt.id = rv.table_id
      where rv.restaurant_id = s.restaurant_id
        and rv.status in ('pending','confirmed')
        and (
          (p_date is null and rv.reservation_time >= now() - interval '1 day' and rv.reservation_time < now() + interval '14 days')
          or
          (p_date is not null and rv.reservation_time >= (p_date::timestamp at time zone 'Europe/Istanbul') and rv.reservation_time < ((p_date+1)::timestamp at time zone 'Europe/Istanbul'))
        )
    ) r
  );
end;
$$;


--
-- Name: list_staff_shifts(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_staff_shifts(p_token uuid, p_date date) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'shifts');
  return json_build_object(
    'approval_required', (select shift_approval_required from restaurants where id = s.restaurant_id),
    'shift_required', (select shift_required from restaurants where id = s.restaurant_id),
    'pending', (select coalesce(json_agg(json_build_object('id', ss.id, 'username', au.username, 'requested_at', ss.clock_in) order by ss.clock_in), '[]'::json)
      from staff_shifts ss join app_users au on au.id = ss.user_id
      where ss.restaurant_id = s.restaurant_id and ss.status = 'pending' and ss.clock_out is null),
    'end_requests', (select coalesce(json_agg(json_build_object('id', ss.id, 'username', au.username, 'clock_in', ss.clock_in, 'requested_at', ss.end_requested_at) order by ss.end_requested_at), '[]'::json)
      from staff_shifts ss join app_users au on au.id = ss.user_id
      where ss.restaurant_id = s.restaurant_id and ss.status = 'approved' and ss.clock_out is null and ss.end_requested_at is not null),
    'rows', (select coalesce(json_agg(row_to_json(t) order by t.clock_in), '[]'::json) from (
      select ss.id, ss.user_id, au.username, ss.clock_in, ss.clock_out, ss.end_requested_at, ab.username approved_by, eb.username ended_by,
        case when ss.clock_out is not null then round(extract(epoch from (ss.clock_out - ss.clock_in))/60) else null end as duration_minutes
      from staff_shifts ss join app_users au on au.id = ss.user_id
      left join app_users ab on ab.id = ss.approved_by left join app_users eb on eb.id = ss.ended_by
      where ss.restaurant_id = s.restaurant_id and ss.status = 'approved'
        and (ss.clock_in at time zone 'Europe/Istanbul')::date = p_date) t));
end; $$;


--
-- Name: list_suppliers(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_suppliers(p_token uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check_any(p_token, array['purchasing_orders','purchasing_manage','purchasing_suppliers']);
  return (
    select coalesce(json_agg(row_to_json(sp) order by sp.name), '[]'::json)
    from (select id, name, phone, email, address, notes from suppliers where restaurant_id = s.restaurant_id) sp
  );
end;
$$;


--
-- Name: list_waiter_calls(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_waiter_calls(p_token uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_order boolean; v_pay boolean;
begin
  s := _session_check(p_token);
  v_order := _user_has_perm(s.user_id, 'order'); v_pay := _user_has_perm(s.user_id, 'payments');
  return (select coalesce(json_agg(json_build_object('id', w.id, 'kind', w.kind, 'table_id', w.table_id, 'table_name', t.name, 'created_at', w.created_at) order by w.created_at), '[]'::json)
    from waiter_calls w left join restaurant_tables t on t.id = w.table_id
    where w.restaurant_id = s.restaurant_id and w.status = 'pending' and w.created_at > now() - interval '3 hours'
      and ((w.kind = 'order' and v_order) or (w.kind = 'payment' and v_pay)));
end; $$;


--
-- Name: list_waitlist(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_waitlist(p_token uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'reservations');
  return (
    select coalesce(json_agg(row_to_json(w) order by w.joined_at), '[]'::json)
    from (
      select wl.id, wl.customer_name, wl.phone, wl.party_size, wl.status, wl.quoted_wait_minutes, wl.joined_at, wl.seated_at
      from waitlist_entries wl
      where wl.restaurant_id = s.restaurant_id and wl.status = 'waiting'
    ) w
  );
end;
$$;


--
-- Name: list_waitlist_history(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_waitlist_history(p_token uuid, p_date date) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'reservations');
  return (select coalesce(json_agg(row_to_json(h) order by h.joined_at desc), '[]'::json) from (
    select w.id, w.customer_name, w.phone, w.party_size, w.status, w.quoted_wait_minutes, w.joined_at, w.seated_at, w.left_at,
      t.name table_name,
      round(extract(epoch from (coalesce(w.seated_at, w.left_at) - w.joined_at))/60) waited_minutes
    from waitlist_entries w left join restaurant_tables t on t.id = w.table_id
    where w.restaurant_id = s.restaurant_id and w.status <> 'waiting'
      and (w.joined_at at time zone 'Europe/Istanbul')::date = p_date) h);
end; $$;


--
-- Name: list_waste(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_waste(p_token uuid, p_date date, p_date_to date DEFAULT NULL::date) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'reports');
  return (
    select json_build_object(
      'rows', coalesce((
        select json_agg(row_to_json(r) order by r.created_at desc)
        from (
          select wl.id, wl.product_name, wl.qty, wl.unit_cost, wl.total_cost, wl.reason,
            wl.created_at, au.username as staff_name
          from waste_log wl
          left join app_users au on au.id = wl.staff_user_id
          where wl.restaurant_id = s.restaurant_id
            and wl.created_at >= (p_date::timestamp at time zone 'Europe/Istanbul')
            and wl.created_at < ((coalesce(p_date_to, p_date) + 1)::timestamp at time zone 'Europe/Istanbul')
        ) r
      ), '[]'::json),
      'total_cost', coalesce((
        select sum(wl.total_cost) from waste_log wl
        where wl.restaurant_id = s.restaurant_id
          and wl.created_at >= (p_date::timestamp at time zone 'Europe/Istanbul')
          and wl.created_at < ((coalesce(p_date_to, p_date) + 1)::timestamp at time zone 'Europe/Istanbul')
      ), 0)
    )
  );
end;
$$;


--
-- Name: log_client_error(uuid, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_client_error(p_token uuid, p_kind text, p_message text, p_source text, p_view text, p_user_agent text, p_url text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_fp text; v_msg text := left(coalesce(p_message,''), 500); v_src text := left(coalesce(p_source,''), 300); v_row client_errors%rowtype;
  v_key text; v_from text; v_mail text; v_rest text;
begin
  if p_token is not null then select * into s from staff_sessions where token = p_token; end if;
  if v_msg = '' then return; end if;
  if (select count(*) from client_errors where last_at > now() - interval '1 minute') > 300 then return; end if;
  v_fp := md5(coalesce(p_kind,'') || '|' || regexp_replace(v_msg, '[0-9a-f]{8}-[0-9a-f-]{27}|\d+', '#', 'g') || '|' || regexp_replace(v_src, ':\d+:\d+', '', 'g'));
  insert into client_errors(fingerprint, restaurant_id, user_id, kind, message, source, view, user_agent, url)
    values (v_fp, s.restaurant_id, s.user_id, left(coalesce(p_kind,'error'),30), v_msg, v_src, left(p_view,40), left(p_user_agent,300), left(p_url,300))
    on conflict (fingerprint) where not resolved do update set count = client_errors.count + 1, last_at = now(),
      restaurant_id = coalesce(excluded.restaurant_id, client_errors.restaurant_id), view = coalesce(excluded.view, client_errors.view)
    returning * into v_row;
  -- Tekrarlayan (5+) ya da yeni bir hata: platform yöneticisine e-posta (aynı hata için 6 saatte bir).
  if v_row.count >= 5 and (v_row.notified_at is null or v_row.notified_at < now() - interval '6 hours') then
    update client_errors set notified_at = now() where id = v_row.id;
    select value into v_key from platform_settings where key = 'resend_api_key';
    select value into v_from from platform_settings where key = 'resend_from_email';
    select value into v_mail from platform_settings where key = 'bank_transfer_notify_email';
    select name into v_rest from restaurants where id = v_row.restaurant_id;
    if v_key is not null and coalesce(v_mail,'') <> '' then
      perform net.http_post(url := 'https://api.resend.com/emails',
        headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
        body := jsonb_build_object('from', coalesce(v_from, 'onboarding@resend.dev'), 'to', jsonb_build_array(v_mail),
          'subject', '⚠️ Peyktan hata: ' || left(v_row.message, 80) || ' (' || v_row.count || ' kez)',
          'html', '<p><b>' || _h(v_row.message) || '</b></p><p>Kaynak: ' || _h(coalesce(v_row.source,'-')) || '<br>Ekran: ' || _h(coalesce(v_row.view,'-')) ||
            '<br>İşletme: ' || _h(coalesce(v_rest,'-')) || '<br>Tekrar: ' || v_row.count || '<br>Cihaz: ' || _h(coalesce(v_row.user_agent,'-')) || '</p><p>Admin Paneli &gt; Hatalar</p>'));
    end if;
  end if;
exception when others then null;
end; $$;


--
-- Name: login_company(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.login_company(p_code text, p_password text) RETURNS TABLE(session_token uuid, company_id uuid, company_name text, package_id text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_company companies%rowtype;
  v_token uuid;
  v_recent_failures int;
begin
  select count(*) into v_recent_failures from login_failures
    where restaurant_code = '__company__' and username = p_code and created_at > now() - interval '15 minutes';
  if v_recent_failures >= 10 then
    raise exception 'Çok fazla hatalı giriş denemesi yapıldı, lütfen 15 dakika sonra tekrar deneyin';
  end if;

  select * into v_company from companies c where c.code = p_code;
  if v_company.id is null or v_company.password_hash is distinct from crypt(p_password, v_company.password_hash) then
    insert into login_failures (restaurant_code, username) values ('__company__', p_code);
    return;
  end if;
  delete from login_failures where restaurant_code = '__company__' and username = p_code;

  if not coalesce(v_company.is_active, false) or (v_company.expires_at is not null and v_company.expires_at <= now()) then
    raise exception 'ABONELIK_SURESI_DOLDU';
  end if;

  insert into company_sessions (company_id) values (v_company.id) returning token into v_token;
  return query select v_token, v_company.id, v_company.name, v_company.package_id;
end;
$$;


--
-- Name: login_staff(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.login_staff(p_code text, p_username text, p_password text) RETURNS TABLE(session_token uuid, user_id uuid, restaurant_id uuid, role_names text[], permissions text[], is_manager boolean, restaurant_name text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_user app_users%rowtype;
  v_restaurant restaurants%rowtype;
  v_token uuid;
  v_role_names text[];
  v_permissions text[];
  v_is_manager boolean;
  v_recent_failures int;
begin
  select count(*) into v_recent_failures from login_failures
    where restaurant_code = p_code and username = p_username and created_at > now() - interval '15 minutes';
  if v_recent_failures >= 10 then
    raise exception 'Çok fazla hatalı giriş denemesi yapıldı, lütfen 15 dakika sonra tekrar deneyin';
  end if;

  select r.* into v_restaurant from restaurants r where r.code = p_code;
  if v_restaurant.id is not null then
    select u.* into v_user from app_users u where u.restaurant_id = v_restaurant.id and u.username = p_username;
  end if;

  if v_user.id is null or v_user.password is distinct from crypt(p_password, v_user.password) then
    insert into login_failures (restaurant_code, username) values (p_code, p_username);
    return;
  end if;

  if not coalesce(v_user.is_active, true) then
    raise exception 'Bu kullanıcı pasif durumda. Lütfen yöneticinize başvurun.';
  end if;
  delete from login_failures where restaurant_code = p_code and username = p_username;

  if not coalesce(v_restaurant.is_active, false) or (v_restaurant.expires_at is not null and v_restaurant.expires_at <= now()) then
    raise exception 'ABONELIK_SURESI_DOLDU';
  end if;

  select coalesce(array_agg(distinct rl.name), '{}'), coalesce(bool_or(rl.is_system), false)
    into v_role_names, v_is_manager
    from roles rl
    where rl.id = any(v_user.role_ids);

  select coalesce(array_agg(distinct p), '{}')
    into v_permissions
    from roles rl
    left join lateral unnest(rl.permissions) as p on true
    where rl.id = any(v_user.role_ids);

  update staff_sessions ss set expires_at = now() where ss.user_id = v_user.id and ss.expires_at > now();
  -- Eski oturum(lar) burada siliniyor ama o cihaz(lar)ın kendi token'ı artık
  -- geçersiz olduğu için "abonelikleri kaldır" isteğini KENDİSİ atamaz
  -- (bkz. remove_push_subscription -> _session_check başarısız olur). Bu
  -- yüzden push_subscriptions'ı da burada, yeni girişin kendisi temizliyor -
  -- "başka bir cihazdan giriş yapılınca diğer taraf bildirim almasın"
  -- isteği için tek güvenilir yer burası.
  delete from push_subscriptions ps where ps.user_id = v_user.id;

  insert into staff_sessions (user_id, restaurant_id, username)
  values (v_user.id, v_user.restaurant_id, v_user.username)
  returning token into v_token;

  return query select v_token, v_user.id, v_user.restaurant_id, v_role_names, v_permissions, v_is_manager, v_restaurant.name;
end;
$$;


--
-- Name: logout_staff(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.logout_staff(p_token uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  update staff_sessions set expires_at = least(expires_at, now()), logged_out_at = now(), last_seen_at = now() where token = p_token;
$$;


--
-- Name: manage_staff_shift(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.manage_staff_shift(p_token uuid, p_shift_id uuid, p_action text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_row staff_shifts%rowtype; v_event text;
begin
  s := _session_check(p_token, 'shifts');
  select * into v_row from staff_shifts where id = p_shift_id and restaurant_id = s.restaurant_id for update;
  if v_row.id is null then raise exception 'Vardiya bulunamadı'; end if;
  if p_action = 'approve' and v_row.status = 'pending' and v_row.clock_out is null then
    update staff_shifts set status = 'approved', clock_in = now(), approved_by = s.user_id where id = v_row.id; v_event := 'approved';
  elsif p_action = 'reject' and v_row.status = 'pending' and v_row.clock_out is null then
    update staff_shifts set status = 'rejected', clock_out = now(), ended_by = s.user_id where id = v_row.id; v_event := 'rejected';
  elsif p_action = 'approve_end' and v_row.status = 'approved' and v_row.clock_out is null and v_row.end_requested_at is not null then
    -- Çıkış saati, personelin bitirmeyi istediği an.
    update staff_shifts set clock_out = v_row.end_requested_at, ended_by = s.user_id where id = v_row.id; v_event := 'end_approved';
  elsif p_action = 'reject_end' and v_row.status = 'approved' and v_row.clock_out is null and v_row.end_requested_at is not null then
    update staff_shifts set end_requested_at = null where id = v_row.id; v_event := 'end_rejected';
  elsif p_action = 'end' and v_row.status = 'approved' and v_row.clock_out is null then
    update staff_shifts set clock_out = now(), ended_by = s.user_id, end_requested_at = null where id = v_row.id; v_event := 'ended';
  else
    raise exception 'Bu işlem bu vardiya için geçerli değil';
  end if;
  if v_row.user_id <> s.user_id then perform _notify_shift_event(v_row.id, v_event); end if;
  return json_build_object('ok', true);
end; $$;


--
-- Name: manager_delete_role(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.manager_delete_role(p_token uuid, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype;
  v_is_manager boolean;
begin
  s := _session_check(p_token);
  select exists(
    select 1 from app_users au join roles rl on rl.id = any(au.role_ids)
    where au.id = s.user_id and (rl.is_system or 'settings_roles' = any(rl.permissions))
  ) into v_is_manager;
  if not v_is_manager then
    raise exception 'Bu işlem için yetkiniz yok';
  end if;
  if exists(select 1 from roles rl where rl.id = p_id and rl.is_system) then
    raise exception 'Yönetici rolü silinemez';
  end if;
  if exists(select 1 from app_users au where p_id = any(au.role_ids)) then
    raise exception 'Bu rolü kullanan personel var, silmeden önce onları başka bir role taşıyın';
  end if;
  delete from roles where id = p_id and restaurant_id = s.restaurant_id;
end;
$$;


--
-- Name: manager_upsert_role(uuid, uuid, text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.manager_upsert_role(p_token uuid, p_id uuid, p_name text, p_permissions text[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype;
  v_is_manager boolean;
  v_id uuid;
  v_pkg_features text[];
  v_allowed text[];
  v_perm text;
begin
  s := _session_check(p_token);
  select exists(
    select 1 from app_users au join roles rl on rl.id = any(au.role_ids)
    where au.id = s.user_id and (rl.is_system or 'settings_roles' = any(rl.permissions))
  ) into v_is_manager;
  if not v_is_manager then
    raise exception 'Bu işlem için yetkiniz yok';
  end if;
  if p_name is null or trim(p_name) = '' then
    raise exception 'Rol adı gerekli';
  end if;

  select coalesce(array_agg(x->>'id'), '{}') into v_allowed from json_array_elements(_role_permission_catalog(s.restaurant_id)) x;

  foreach v_perm in array coalesce(p_permissions, '{}') loop
    if not (v_perm = any(v_allowed)) then
      raise exception 'Geçersiz izin: %', v_perm;
    end if;
  end loop;

  if p_id is null then
    insert into roles (restaurant_id, name, permissions, is_system)
    values (s.restaurant_id, trim(p_name), coalesce(p_permissions,'{}'), false)
    returning id into v_id;
  else
    if exists(select 1 from roles rl where rl.id = p_id and rl.is_system) then
      raise exception 'Yönetici rolü düzenlenemez';
    end if;
    update roles set name = trim(p_name), permissions = coalesce(p_permissions,'{}')
      where id = p_id and restaurant_id = s.restaurant_id and not is_system;
    v_id := p_id;
  end if;
  return v_id;
end;
$$;


--
-- Name: mark_item_ready(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_item_ready(p_token uuid, p_order_item_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token);
  perform _require_shift(s);
  update order_items set status='ready'
  where id = p_order_item_id
    and order_id in (select id from orders where restaurant_id = s.restaurant_id);
end;
$$;


--
-- Name: move_table_order(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.move_table_order(p_token uuid, p_from_table_id uuid, p_to_table_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_src orders%rowtype; v_dst orders%rowtype; v_moved int;
begin
  s := _session_check(p_token, 'order');
  if p_from_table_id = p_to_table_id then raise exception 'Aynı masa seçildi'; end if;
  if not exists(select 1 from restaurant_tables where id = p_to_table_id and restaurant_id = s.restaurant_id) then
    raise exception 'Hedef masa bulunamadı';
  end if;
  select * into v_src from orders where restaurant_id = s.restaurant_id and table_id = p_from_table_id and status = 'open' for update;
  if v_src.id is null then raise exception 'Bu masada açık hesap yok'; end if;
  select * into v_dst from orders where restaurant_id = s.restaurant_id and table_id = p_to_table_id and status = 'open' for update;
  if v_dst.id is null then
    update orders set table_id = p_to_table_id where id = v_src.id;
    return json_build_object('mode','moved','order_id', v_src.id);
  end if;
  update order_items set order_id = v_dst.id where order_id = v_src.id and not paid;
  get diagnostics v_moved = row_count;
  update orders set tags = (select coalesce(array_agg(distinct t), '{}') from unnest(v_dst.tags || v_src.tags) t),
    note = nullif(concat_ws(' / ', nullif(v_dst.note,''), nullif(v_src.note,'')), '')
    where id = v_dst.id;
  update orders set status = case when exists(select 1 from order_items where order_id = v_src.id) then 'closed' else 'cancelled' end
    where id = v_src.id;
  return json_build_object('mode','merged','order_id', v_dst.id, 'moved_items', v_moved);
end $$;


--
-- Name: notify_waitlist_ready(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_waitlist_ready(p_token uuid, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; w waitlist_entries%rowtype; v_name text;
begin
  s := _session_check(p_token, 'reservations');
  select * into w from waitlist_entries where id = p_id and restaurant_id = s.restaurant_id;
  if w.id is null then raise exception 'Kayıt bulunamadı'; end if;
  if not coalesce((select sms_enabled from restaurants where id = s.restaurant_id), false) then
    raise exception 'SMS bildirimleri kapalı (Ayarlar > Entegrasyonlar)';
  end if;
  select name into v_name from restaurants where id = s.restaurant_id;
  perform _send_sms(s.restaurant_id, w.phone, v_name || ': Masaniz hazir! Lutfen girise gelin.', 'waitlist_ready');
end $$;


--
-- Name: open_view_once(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.open_view_once(p_token uuid, p_message_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; m chat_messages%rowtype;
begin
  s := _session_check(p_token, 'messages');
  select * into m from chat_messages where id = p_message_id and restaurant_id = s.restaurant_id for update;
  if m.id is null or not m.view_once or m.deleted_at is not null or not _chat_can_see(m, s.user_id) then raise exception 'Fotoğraf bulunamadı'; end if;
  if m.sender_id = s.user_id then raise exception 'Tek görüntülemelik fotoğrafı gönderen göremez'; end if;
  if exists(select 1 from chat_view_once where message_id = m.id and user_id = s.user_id) or m.attachment is null then
    raise exception 'Bu fotoğrafı zaten açtınız'; end if;
  insert into chat_view_once(message_id, user_id, restaurant_id) values (m.id, s.user_id, s.restaurant_id);
  if m.recipient_id is not null then update chat_messages set attachment = null where id = m.id; end if;
  return json_build_object('data', m.attachment, 'remove', m.recipient_id is not null);
end; $$;


--
-- Name: pay_order_items(uuid, uuid, text, numeric, numeric, numeric, jsonb, numeric, uuid, numeric, text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pay_order_items(p_token uuid, p_order_id uuid, p_payment_method text, p_cash numeric, p_card numeric, p_discount_amount numeric DEFAULT 0, p_item_qtys jsonb DEFAULT NULL::jsonb, p_tip_amount numeric DEFAULT 0, p_customer_id uuid DEFAULT NULL::uuid, p_redeem_points numeric DEFAULT 0, p_gift_card_code text DEFAULT NULL::text, p_gift_card_amount numeric DEFAULT 0) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype;
  v_subtotal numeric;
  v_cost numeric;
  v_table_name text;
  v_hist_id uuid;
  v_tags text[];
  v_kind text;
  v_remaining int;
  v_entry jsonb;
  v_row order_items%rowtype;
  v_req_qty int;
  v_new_id uuid;
  v_paid_item_ids uuid[] := '{}';
  v_customer customers%rowtype;
  v_redeem_discount numeric := 0;
  v_birthday_discount numeric := 0;
  v_birthday_pct numeric;
  v_net numeric;
  v_points_earned numeric := 0;
  v_loyalty_enabled boolean;
  v_spend_per_point numeric;
  v_point_value numeric;
  v_is_birthday boolean := false;
  v_gift_card gift_cards%rowtype;
  v_paid_total numeric;
begin
  s := _session_check(p_token, 'payments');

  perform 1 from orders where id = p_order_id and restaurant_id = s.restaurant_id for update;
  if not found then
    raise exception 'Sipariş bulunamadı';
  end if;

  if coalesce(p_redeem_points, 0) < 0 then
    raise exception 'Geçersiz puan miktarı';
  end if;

  if p_item_qtys is not null and jsonb_array_length(p_item_qtys) > 200 then
    raise exception 'Çok fazla kalem';
  end if;

  if p_item_qtys is null then
    select array_agg(x.id) into v_paid_item_ids from (
      select id from order_items where order_id = p_order_id and paid = false for update
    ) x;
  else
    for v_entry in select * from jsonb_array_elements(p_item_qtys)
    loop
      select * into v_row from order_items
        where id = (v_entry->>'item_id')::uuid and order_id = p_order_id and paid = false
        for update;
      if v_row.id is null then continue; end if;

      v_req_qty := least((v_entry->>'qty')::int, v_row.qty);
      if v_req_qty <= 0 then continue; end if;

      if v_req_qty >= v_row.qty then
        v_paid_item_ids := v_paid_item_ids || v_row.id;
      else
        insert into order_items (order_id, product_id, name, price, cost, qty, status, note, added_at)
        values (v_row.order_id, v_row.product_id, v_row.name, v_row.price, v_row.cost, v_req_qty, v_row.status, v_row.note, v_row.added_at)
        returning id into v_new_id;
        v_paid_item_ids := v_paid_item_ids || v_new_id;
        update order_items set qty = qty - v_req_qty where id = v_row.id;
      end if;
    end loop;
  end if;

  if array_length(v_paid_item_ids,1) is null then
    raise exception 'Ödeme alınacak ürün/adet seçilmedi';
  end if;

  select coalesce(sum(price*qty),0), coalesce(sum(cost*qty),0)
    into v_subtotal, v_cost
    from order_items where order_id = p_order_id and id = any(v_paid_item_ids);

  select rt.name, o.tags, o.kind into v_table_name, v_tags, v_kind
    from orders o left join restaurant_tables rt on rt.id = o.table_id
    where o.id = p_order_id and o.restaurant_id = s.restaurant_id;

  select r.loyalty_enabled, r.loyalty_spend_per_point, r.loyalty_point_value, r.birthday_discount_percent
    into v_loyalty_enabled, v_spend_per_point, v_point_value, v_birthday_pct
    from restaurants r where r.id = s.restaurant_id;

  if p_customer_id is not null then
    select * into v_customer from customers c where c.id = p_customer_id and c.restaurant_id = s.restaurant_id;
  end if;
  -- Müşteriye özel sadakat ayarı varsa genel ayarın yerine geçer.
  if v_customer.id is not null then
    v_spend_per_point := coalesce(v_customer.spend_per_point, v_spend_per_point);
    v_point_value := coalesce(v_customer.point_value, v_point_value);
    v_birthday_pct := coalesce(v_customer.birthday_discount_percent, v_birthday_pct);
  end if;

  if v_customer.id is not null and coalesce(p_redeem_points,0) > 0 then
    if p_redeem_points > v_customer.points_balance then
      raise exception 'Müşterinin yeterli puanı yok';
    end if;
    v_redeem_discount := p_redeem_points * coalesce(v_point_value,1);
  end if;

  if v_customer.id is not null and v_customer.birthday is not null and coalesce(v_birthday_pct,0) > 0 then
    v_is_birthday := (
      extract(month from v_customer.birthday) = extract(month from (now() at time zone 'Europe/Istanbul'))
      and extract(day from v_customer.birthday) = extract(day from (now() at time zone 'Europe/Istanbul'))
    );
    if v_is_birthday then
      v_birthday_discount := greatest(0, v_subtotal - coalesce(p_discount_amount,0) - v_redeem_discount) * v_birthday_pct / 100;
    end if;
  end if;

  v_net := v_subtotal - coalesce(p_discount_amount,0) - v_redeem_discount - v_birthday_discount;
  if v_net < 0 then v_net := 0; end if;

  if coalesce(p_gift_card_code, '') <> '' and coalesce(p_gift_card_amount,0) > 0 then
    select * into v_gift_card from gift_cards
      where restaurant_id = s.restaurant_id and upper(code) = upper(trim(p_gift_card_code))
      for update;
    if v_gift_card.id is null then raise exception 'Hediye kartı bulunamadı'; end if;
    if not v_gift_card.is_active then raise exception 'Bu hediye kartı iptal edilmiş'; end if;
    if p_gift_card_amount > v_gift_card.balance then raise exception 'Hediye kartında yeterli bakiye yok'; end if;
  end if;

  v_paid_total := coalesce(p_cash,0) + coalesce(p_card,0) + coalesce(p_gift_card_amount,0);
  if abs(v_paid_total - (v_net + coalesce(p_tip_amount,0))) > 0.05 then
    raise exception 'Ödenen tutar (%) siparişin tutarıyla (%) eşleşmiyor', v_paid_total, (v_net + coalesce(p_tip_amount,0));
  end if;

  if coalesce(p_gift_card_code, '') <> '' and coalesce(p_gift_card_amount,0) > 0 then
    update gift_cards set balance = balance - p_gift_card_amount where id = v_gift_card.id;
  end if;

  if coalesce(v_loyalty_enabled,false) and v_customer.id is not null and coalesce(v_spend_per_point,0) > 0 then
    v_points_earned := floor(v_net / v_spend_per_point);
  end if;

  insert into sales_history (
    restaurant_id, order_id, table_name, subtotal, discount_amount, total, cost,
    payment_method, cash_amount, card_amount, tags, kind,
    tip_amount, customer_id, points_earned, points_redeemed, birthday_discount_amount, staff_user_id,
    gift_card_id, gift_card_amount
  )
  values (
    s.restaurant_id, p_order_id, coalesce(v_table_name,'Paket'), v_subtotal,
    coalesce(p_discount_amount,0) + v_redeem_discount + v_birthday_discount, v_net, v_cost,
    p_payment_method, p_cash, p_card, coalesce(v_tags,'{}'), coalesce(v_kind,'dine_in'),
    coalesce(p_tip_amount,0), v_customer.id, v_points_earned, coalesce(p_redeem_points,0), v_birthday_discount, s.user_id,
    v_gift_card.id, coalesce(p_gift_card_amount,0)
  )
  returning id into v_hist_id;

  if v_customer.id is not null then
    update customers set
      points_balance = points_balance - coalesce(p_redeem_points,0) + v_points_earned,
      total_visits = total_visits + 1,
      total_spent = total_spent + v_net,
      last_visit_at = now()
    where id = v_customer.id;
  end if;

  update order_items set paid = true, paid_at = now() where id = any(v_paid_item_ids);

  select count(*) into v_remaining from order_items where order_id = p_order_id and paid = false;
  if v_remaining = 0 then
    update orders set status='closed' where id = p_order_id and restaurant_id = s.restaurant_id;
  end if;

  return json_build_object(
    'history_id', v_hist_id, 'order_closed', v_remaining=0, 'remaining_items', v_remaining,
    'points_earned', v_points_earned, 'birthday_discount_applied', v_is_birthday, 'birthday_discount_amount', v_birthday_discount
  );
end;
$$;


--
-- Name: platform_admin_login(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.platform_admin_login(p_username text, p_password text) RETURNS TABLE(session_token uuid, username text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_admin platform_admins%rowtype;
  v_token uuid;
  v_recent_failures int;
begin
  select count(*) into v_recent_failures from login_failures lf
    where lf.restaurant_code = '__platform_admin__' and lf.username = p_username and lf.created_at > now() - interval '15 minutes';
  if v_recent_failures >= 10 then
    raise exception 'Çok fazla hatalı giriş denemesi yapıldı, lütfen 15 dakika sonra tekrar deneyin';
  end if;

  select * into v_admin from platform_admins pa where pa.username = p_username;
  if v_admin.id is null or v_admin.password is distinct from crypt(p_password, v_admin.password) then
    insert into login_failures (restaurant_code, username) values ('__platform_admin__', p_username);
    return;
  end if;
  delete from login_failures lf where lf.restaurant_code = '__platform_admin__' and lf.username = p_username;

  insert into platform_admin_sessions (admin_id) values (v_admin.id) returning token into v_token;
  return query select v_token, v_admin.username;
end;
$$;


--
-- Name: receive_purchase_order_items(uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.receive_purchase_order_items(p_token uuid, p_id uuid, p_receipts jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype;
  v_po purchase_orders%rowtype;
  v_receipt jsonb;
  v_item purchase_order_items%rowtype;
  v_qty numeric;
  v_remaining int;
begin
  s := _session_check(p_token, 'purchasing_manage');
  select * into v_po from purchase_orders where id = p_id and restaurant_id = s.restaurant_id;
  if v_po.id is null then raise exception 'Sipariş bulunamadı'; end if;
  if v_po.status = 'cancelled' then raise exception 'İptal edilmiş sipariş teslim alınamaz'; end if;

  for v_receipt in select * from jsonb_array_elements(p_receipts) loop
    select * into v_item from purchase_order_items poi where poi.id = (v_receipt->>'item_id')::uuid and poi.purchase_order_id = p_id;
    if v_item.id is null then continue; end if;
    v_qty := greatest(0, coalesce((v_receipt->>'quantity')::numeric, 0));
    if v_qty <= 0 then continue; end if;

    update purchase_order_items set received_quantity = least(quantity, received_quantity + v_qty) where id = v_item.id;
    update ingredients set stock = coalesce(stock,0) + v_qty where id = v_item.ingredient_id and restaurant_id = s.restaurant_id;
  end loop;

  select count(*) into v_remaining from purchase_order_items poi where poi.purchase_order_id = p_id and poi.received_quantity < poi.quantity;
  update purchase_orders set
    status = case when v_remaining = 0 then 'received' else 'ordered' end,
    received_date = case when v_remaining = 0 then current_date else received_date end
  where id = p_id;
end;
$$;


--
-- Name: reject_customer_order_request(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_customer_order_request(p_token uuid, p_request_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'order');
  update customer_order_requests set status = 'rejected' where id = p_request_id and restaurant_id = s.restaurant_id and status = 'pending';
end;
$$;


--
-- Name: remove_online_menu_section(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_online_menu_section(p_token uuid, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $_$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'online_ordering');
  execute 'de'||'lete from online_menu_sections where id = $1 and restaurant_id = $2' using p_id, s.restaurant_id;
end; $_$;


--
-- Name: remove_push_subscription(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_push_subscription(p_token uuid, p_endpoint text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token);
  delete from push_subscriptions where endpoint = p_endpoint and user_id = s.user_id;
end;
$$;


--
-- Name: rename_order_flag(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rename_order_flag(p_token uuid, p_flag_id uuid, p_label text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'settings_flags');
  update order_flag_defs set label = trim(p_label)
    where id = p_flag_id and restaurant_id = s.restaurant_id;
end;
$$;


--
-- Name: report_waste(uuid, uuid, uuid, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.report_waste(p_token uuid, p_order_item_id uuid DEFAULT NULL::uuid, p_product_id uuid DEFAULT NULL::uuid, p_qty numeric DEFAULT NULL::numeric, p_reason text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype; v_item order_items%rowtype; v_product_id uuid; v_name text; v_unit_cost numeric;
  v_qty numeric; v_order_id uuid; v_has_recipe boolean; v_waste_id uuid; v_total_cost numeric; v_max_qty numeric;
begin
  s := _session_check(p_token, 'kitchen');
  if p_order_item_id is not null then
    select oi.* into v_item from order_items oi join orders o on o.id = oi.order_id
      where oi.id = p_order_item_id and o.restaurant_id = s.restaurant_id;
    if v_item.id is null then raise exception 'Sipariş kalemi bulunamadı'; end if;
    if v_item.paid then raise exception 'Ödenmiş bir kalem israf olarak işaretlenemez'; end if;
    v_qty := least(coalesce(p_qty, v_item.qty), v_item.qty);
    if v_qty is null or v_qty <= 0 then raise exception 'Geçersiz miktar'; end if;
    v_product_id := v_item.product_id; v_name := v_item.name; v_unit_cost := coalesce(v_item.cost, 0); v_order_id := v_item.order_id;
  else
    if p_product_id is null or p_qty is null or p_qty <= 0 then raise exception 'Ürün ve geçerli bir miktar gerekli'; end if;
    select id, name, cost into v_product_id, v_name, v_unit_cost from products where id = p_product_id and restaurant_id = s.restaurant_id;
    if v_product_id is null then raise exception 'Ürün bulunamadı'; end if;
    v_qty := p_qty; v_order_id := null;
  end if;

  -- İsraf edilen ürünün malzemesi stoktan düşülür. Siparişteki bir kalemde
  -- ürün müşteriye yeniden hazırlanır: malzeme yeniden harcanır, kalem
  -- siparişte kalır ve mutfakta tekrar "bekliyor"a döner. Stok yetmiyorsa
  -- kayıt yapılmaz; kalan stokla en fazla kaç adet karşılanabildiği döner.
  select exists(select 1 from product_ingredients where product_id = v_product_id) into v_has_recipe;
  if v_has_recipe then
    perform 1 from product_ingredients pi join ingredients ing on ing.id = pi.ingredient_id
      where pi.product_id = v_product_id and ing.restaurant_id = s.restaurant_id for update of ing;
    select min(floor(ing.stock / nullif(pi.qty_per_unit,0))) into v_max_qty
      from product_ingredients pi join ingredients ing on ing.id = pi.ingredient_id
      where pi.product_id = v_product_id and ing.restaurant_id = s.restaurant_id;
  else
    select stock into v_max_qty from products where id = v_product_id and restaurant_id = s.restaurant_id for update;
  end if;
  if v_max_qty is not null and v_qty > v_max_qty then
    raise exception 'STOK_YETERSIZ:%', greatest(v_max_qty, 0);
  end if;
  if v_has_recipe then
    update ingredients ing set stock = ing.stock - (pi.qty_per_unit * v_qty)
      from product_ingredients pi
      where pi.ingredient_id = ing.id and pi.product_id = v_product_id and ing.restaurant_id = s.restaurant_id;
  else
    update products set stock = stock - v_qty where id = v_product_id and restaurant_id = s.restaurant_id and stock is not null;
  end if;

  v_total_cost := v_unit_cost * v_qty;
  insert into waste_log (restaurant_id, order_id, order_item_id, product_id, product_name, qty, unit_cost, total_cost, reason, staff_user_id)
  values (s.restaurant_id, v_order_id, p_order_item_id, v_product_id, v_name, v_qty, v_unit_cost, v_total_cost, nullif(trim(coalesce(p_reason,'')),''), s.user_id)
  returning id into v_waste_id;

  if p_order_item_id is not null then
    update order_items set status = 'pending' where id = p_order_item_id;
  end if;
  return json_build_object('id', v_waste_id, 'total_cost', v_total_cost);
end; $$;


--
-- Name: reset_restaurant_data(uuid, text, date, date, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_restaurant_data(p_token uuid, p_password text, p_from date, p_to date, p_categories text[]) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype; v_user app_users%rowtype; v_code text; v_fail int;
  v_start timestamptz; v_end timestamptz; v_n int; v_res jsonb := '{}'::jsonb;
begin
  s := _session_check(p_token);
  if not exists(select 1 from app_users au join roles rl on rl.id = any(au.role_ids) where au.id = s.user_id and (rl.is_system or 'settings_datareset' = any(rl.permissions))) then
    raise exception 'Verileri yalnızca Yönetici sıfırlayabilir';
  end if;
  select * into v_user from app_users where id = s.user_id;
  select code into v_code from restaurants where id = s.restaurant_id;
  select count(*) into v_fail from login_failures where restaurant_code = v_code and username = v_user.username and created_at > now() - interval '15 minutes';
  if v_fail >= 10 then raise exception 'Çok fazla hatalı deneme yapıldı, lütfen 15 dakika sonra tekrar deneyin'; end if;
  if v_user.password is distinct from crypt(coalesce(p_password,''), v_user.password) then
    insert into login_failures (restaurant_code, username) values (v_code, v_user.username);
    return json_build_object('ok', false, 'error', 'Şifre hatalı');
  end if;
  if p_categories is null or cardinality(p_categories) = 0 then raise exception 'En az bir veri türü seçin'; end if;
  v_start := coalesce((p_from::timestamp at time zone 'Europe/Istanbul'), '-infinity'::timestamptz);
  v_end := coalesce(((p_to + 1)::timestamp at time zone 'Europe/Istanbul'), 'infinity'::timestamptz);
  if v_start >= v_end then raise exception 'Tarih aralığı geçersiz'; end if;

  if 'sales' = any(p_categories) then
    delete from invoices where restaurant_id = s.restaurant_id and efatura_uuid is null and created_at >= v_start and created_at < v_end;
    delete from sales_history where restaurant_id = s.restaurant_id and closed_at >= v_start and closed_at < v_end
      and not exists(select 1 from invoices i where i.history_id = sales_history.id);
    get diagnostics v_n = row_count; v_res := v_res || jsonb_build_object('sales', v_n);
    delete from orders where restaurant_id = s.restaurant_id and status in ('closed','cancelled') and created_at >= v_start and created_at < v_end;
    delete from customer_order_requests where restaurant_id = s.restaurant_id and status <> 'pending' and created_at >= v_start and created_at < v_end;
    delete from sms_outbox where restaurant_id = s.restaurant_id and created_at >= v_start and created_at < v_end;
  end if;
  if 'waste' = any(p_categories) then
    delete from waste_log where restaurant_id = s.restaurant_id and created_at >= v_start and created_at < v_end;
    get diagnostics v_n = row_count; v_res := v_res || jsonb_build_object('waste', v_n);
  end if;
  if 'shifts' = any(p_categories) then
    delete from staff_shifts where restaurant_id = s.restaurant_id and clock_out is not null and clock_in >= v_start and clock_in < v_end;
    get diagnostics v_n = row_count; v_res := v_res || jsonb_build_object('shifts', v_n);
  end if;
  if 'reservations' = any(p_categories) then
    delete from reservations where restaurant_id = s.restaurant_id and reservation_time >= v_start and reservation_time < v_end;
    get diagnostics v_n = row_count; v_res := v_res || jsonb_build_object('reservations', v_n);
    delete from waitlist_entries where restaurant_id = s.restaurant_id and joined_at >= v_start and joined_at < v_end;
  end if;
  if 'purchases' = any(p_categories) then
    delete from purchase_orders where restaurant_id = s.restaurant_id and created_at >= v_start and created_at < v_end;
    get diagnostics v_n = row_count; v_res := v_res || jsonb_build_object('purchases', v_n);
  end if;
  return json_build_object('ok', true, 'removed', v_res);
end; $$;


--
-- Name: resolve_waiter_call(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_waiter_call(p_token uuid, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token);
  update waiter_calls set status = 'done', done_at = now(), done_by = s.user_id where id = p_id and restaurant_id = s.restaurant_id and status = 'pending';
end; $$;


--
-- Name: save_fcm_token(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_fcm_token(p_token uuid, p_fcm_token text, p_channel text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_existing_restaurant uuid;
begin
  s := _session_check(p_token);
  if not _restaurant_has_feature(s.restaurant_id, 'push_notifications') then raise exception 'PAKET_OZELLIK_YOK'; end if;
  select restaurant_id into v_existing_restaurant from push_subscriptions where endpoint = p_fcm_token;
  if v_existing_restaurant is not null and v_existing_restaurant <> s.restaurant_id then
    raise exception 'Bu bildirim aboneliği başka bir işletmeye ait';
  end if;
  -- p_channel: cihazdaki Android bildirim kanalı (Peyktan sesli kanal yalnızca ses dosyasını içeren uygulama sürümünde oluşturulur).
  insert into push_subscriptions (user_id, restaurant_id, endpoint, p256dh, auth, platform, android_channel)
  values (s.user_id, s.restaurant_id, p_fcm_token, null, null, 'android-fcm', nullif(p_channel,''))
  on conflict (endpoint) do update set
    user_id = excluded.user_id, restaurant_id = excluded.restaurant_id, platform = 'android-fcm', android_channel = excluded.android_channel;
end; $$;


--
-- Name: save_online_menu_section(uuid, uuid, text, uuid[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_online_menu_section(p_token uuid, p_id uuid, p_name text, p_product_ids uuid[], p_sort integer DEFAULT NULL::integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $_$
declare s staff_sessions%rowtype; v_id uuid := p_id; i int := 0; pid uuid;
begin
  s := _session_check(p_token, 'online_ordering');
  if coalesce(trim(p_name),'') = '' then raise exception 'Başlık adı girin'; end if;
  if v_id is null then
    insert into online_menu_sections(restaurant_id, name, sort_order) values (s.restaurant_id, trim(p_name),
      coalesce(p_sort, (select coalesce(max(sort_order),0)+1 from online_menu_sections where restaurant_id = s.restaurant_id))) returning id into v_id;
  else
    update online_menu_sections set name = trim(p_name), sort_order = coalesce(p_sort, sort_order) where id = v_id and restaurant_id = s.restaurant_id;
    if not found then raise exception 'Başlık bulunamadı'; end if;
  end if;
  if p_product_ids is not null then
    execute 'de'||'lete from online_menu_items where section_id = $1' using v_id;
    foreach pid in array p_product_ids loop
      i := i + 1;
      insert into online_menu_items(restaurant_id, section_id, product_id, sort_order)
        select s.restaurant_id, v_id, p.id, i from products p where p.id = pid and p.restaurant_id = s.restaurant_id
        on conflict do nothing;
    end loop;
  end if;
  return v_id;
end; $_$;


--
-- Name: save_push_subscription(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_push_subscription(p_token uuid, p_endpoint text, p_p256dh text, p_auth text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype;
  v_existing_restaurant uuid;
begin
  s := _session_check(p_token);
  if not _restaurant_has_feature(s.restaurant_id, 'push_notifications') then raise exception 'PAKET_OZELLIK_YOK'; end if;
  select restaurant_id into v_existing_restaurant from push_subscriptions where endpoint = p_endpoint;
  if v_existing_restaurant is not null and v_existing_restaurant <> s.restaurant_id then
    raise exception 'Bu bildirim aboneliği başka bir işletmeye ait';
  end if;
  insert into push_subscriptions (user_id, restaurant_id, endpoint, p256dh, auth, platform)
  values (s.user_id, s.restaurant_id, p_endpoint, p_p256dh, p_auth, 'web')
  on conflict (endpoint) do update set
    user_id = excluded.user_id, restaurant_id = excluded.restaurant_id,
    p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;


--
-- Name: search_customers_quick(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_customers_quick(p_token uuid, p_search text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'order');
  if length(coalesce(trim(p_search),'')) < 2 then return '[]'::json; end if;
  return (select coalesce(json_agg(row_to_json(c)), '[]'::json) from (
    select cu.id, cu.name, cu.phone from customers cu
    where cu.restaurant_id = s.restaurant_id and (cu.name ilike '%'||trim(p_search)||'%' or cu.phone ilike '%'||trim(p_search)||'%')
    order by cu.last_visit_at desc nulls last, cu.name limit 8) c);
end; $$;


--
-- Name: seat_reservation(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seat_reservation(p_token uuid, p_id uuid, p_table_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_r reservations%rowtype; v_table uuid; v_order uuid; v_daily int; v_note text;
begin
  s := _session_check(p_token, 'reservations');
  select * into v_r from reservations where id = p_id and restaurant_id = s.restaurant_id for update;
  if v_r.id is null then raise exception 'Rezervasyon bulunamadı'; end if;
  v_table := coalesce(p_table_id, v_r.table_id);
  if v_table is null then raise exception 'Önce bir masa seçin'; end if;
  if not exists(select 1 from restaurant_tables where id = v_table and restaurant_id = s.restaurant_id) then raise exception 'Geçersiz masa'; end if;
  update reservations set status = 'seated', table_id = v_table, seated_at = now(), closed_at = null where id = p_id;
  v_note := '📅 Rezervasyon · ' || v_r.party_size || ' kişi' || coalesce(' · ' || nullif(trim(v_r.notes),''), '');
  select id into v_order from orders where restaurant_id = s.restaurant_id and table_id = v_table and status = 'open' limit 1;
  if v_order is null then
    perform 1 from restaurants where id = s.restaurant_id for update;
    select coalesce(max(o.daily_number), 0) + 1 into v_daily from orders o
      where o.restaurant_id = s.restaurant_id and (o.created_at at time zone 'Europe/Istanbul')::date = (now() at time zone 'Europe/Istanbul')::date;
    insert into orders (restaurant_id, table_id, kind, status, daily_number, customer_name, customer_phone, note, created_by, reservation_id)
      values (s.restaurant_id, v_table, 'dine_in', 'open', v_daily, v_r.customer_name, v_r.phone, v_note, s.user_id, v_r.id)
      returning id into v_order;
  else
    update orders set customer_name = coalesce(customer_name, v_r.customer_name),
      customer_phone = coalesce(customer_phone, v_r.phone),
      note = case when note is null or note = '' then v_note else note end,
      reservation_id = coalesce(reservation_id, v_r.id)
      where id = v_order;
  end if;
  return json_build_object('order_id', v_order, 'table_id', v_table);
end; $$;


--
-- Name: seat_waitlist_entry(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seat_waitlist_entry(p_token uuid, p_id uuid, p_table_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; w waitlist_entries%rowtype; v_order uuid; v_pre uuid; v_daily int; v_note text; v_min int;
begin
  s := _session_check(p_token, 'reservations');
  select * into w from waitlist_entries where id = p_id and restaurant_id = s.restaurant_id for update;
  if w.id is null then raise exception 'Kayıt bulunamadı'; end if;
  if p_table_id is null or not exists(select 1 from restaurant_tables where id = p_table_id and restaurant_id = s.restaurant_id) then raise exception 'Masa seçin'; end if;
  update waitlist_entries set status = 'seated', seated_at = now(), table_id = p_table_id where id = p_id;
  v_min := round(extract(epoch from (now() - w.joined_at))/60);
  v_note := '⏳ Bekleme listesi · ' || w.party_size || ' kişi · ' || v_min || ' dk bekledi';
  select id into v_order from orders where restaurant_id = s.restaurant_id and table_id = p_table_id and status = 'open' limit 1;
  -- Bekleme sırasında girilen ön sipariş masaya taşınır.
  select id into v_pre from orders where restaurant_id = s.restaurant_id and waitlist_id = w.id and kind = 'waitlist' and status = 'open' limit 1 for update;
  if v_pre is not null and v_order is null then
    update orders set table_id = p_table_id, kind = 'dine_in', note = v_note where id = v_pre;
    v_order := v_pre;
  elsif v_pre is not null then
    update order_items set order_id = v_order where order_id = v_pre;
    update orders set status = 'cancelled' where id = v_pre;
    update orders set customer_name = coalesce(customer_name, w.customer_name), customer_phone = coalesce(customer_phone, w.phone),
      note = case when note is null or note = '' then v_note else note end, waitlist_id = coalesce(waitlist_id, w.id) where id = v_order;
  elsif v_order is null then
    perform 1 from restaurants where id = s.restaurant_id for update;
    select coalesce(max(o.daily_number), 0) + 1 into v_daily from orders o
      where o.restaurant_id = s.restaurant_id and (o.created_at at time zone 'Europe/Istanbul')::date = (now() at time zone 'Europe/Istanbul')::date;
    insert into orders (restaurant_id, table_id, kind, status, daily_number, customer_name, customer_phone, note, created_by, waitlist_id)
      values (s.restaurant_id, p_table_id, 'dine_in', 'open', v_daily, w.customer_name, w.phone, v_note, s.user_id, w.id) returning id into v_order;
  else
    update orders set customer_name = coalesce(customer_name, w.customer_name), customer_phone = coalesce(customer_phone, w.phone),
      note = case when note is null or note = '' then v_note else note end, waitlist_id = coalesce(waitlist_id, w.id) where id = v_order;
  end if;
  return json_build_object('order_id', v_order, 'waited_minutes', v_min);
end; $$;


--
-- Name: send_chat_message(uuid, text, text, text, text, text, uuid, boolean, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_chat_message(p_token uuid, p_conv text, p_body text, p_attachment text DEFAULT NULL::text, p_kind text DEFAULT NULL::text, p_name text DEFAULT NULL::text, p_reply_to uuid DEFAULT NULL::uuid, p_view_once boolean DEFAULT false, p_size integer DEFAULT NULL::integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_peer uuid; v_group uuid; v_id uuid; v_url text; v_secret text; v_kind text; v_limit int;
begin
  s := _session_check(p_token, 'messages');
  if coalesce(trim(p_body),'') = '' and p_attachment is null then raise exception 'Mesaj boş'; end if;
  if length(coalesce(p_body,'')) > 4000 then raise exception 'Mesaj çok uzun'; end if;
  if p_attachment is not null then
    v_kind := coalesce(p_kind, case when p_attachment ~ '^data:image/' then 'image' when p_attachment ~ '^data:audio/' then 'audio' else 'file' end);
    if v_kind not in ('image','audio','file') then raise exception 'Geçersiz ek'; end if;
    if p_attachment like 'storage:%' then
      if p_attachment not like 'storage:' || s.restaurant_id::text || '/%' or p_attachment ~ '\.\.' then raise exception 'Geçersiz dosya yolu'; end if;
    else
      if p_attachment !~ '^data:[a-zA-Z0-9.+/-]+(;[a-zA-Z0-9=.-]+)*;base64,' then raise exception 'Geçersiz dosya'; end if;
      if v_kind = 'image' and p_attachment !~ '^data:image/(jpeg|png|webp|gif);' then raise exception 'Geçersiz görsel'; end if;
    end if;
    -- Sınırlar (base64 metin uzunluğu): fotoğraf ~1 MB, ses ~3 MB, dosya ~5 MB.
    v_limit := case v_kind when 'image' then 1500000 when 'audio' then 4200000 else 7000000 end;
    if length(p_attachment) > v_limit then raise exception 'Dosya çok büyük (fotoğraf en fazla 1 MB, ses 3 MB, dosya 5 MB)'; end if;
  end if;
  if p_conv like 'g:%' then
    v_group := substr(p_conv, 3)::uuid;
    if not exists(select 1 from chat_group_members where group_id = v_group and user_id = s.user_id) then raise exception 'Bu grubun üyesi değilsiniz'; end if;
  elsif p_conv <> 'all' then
    v_peer := p_conv::uuid;
    if not exists(select 1 from app_users where id = v_peer and restaurant_id = s.restaurant_id and is_active) then raise exception 'Kullanıcı bulunamadı'; end if;
  end if;
  if p_reply_to is not null and not exists(select 1 from chat_messages m where m.id = p_reply_to and m.restaurant_id = s.restaurant_id and _chat_can_see(m, s.user_id)) then
    raise exception 'Alıntılanan mesaj bulunamadı'; end if;
  if (select count(*) from chat_messages where sender_id = s.user_id and created_at > now() - interval '1 minute') >= 40 then raise exception 'Çok hızlı mesaj gönderiyorsunuz'; end if;
  insert into chat_messages(restaurant_id, sender_id, recipient_id, group_id, body, attachment, attachment_kind, attachment_name, attachment_size, reply_to, view_once)
    values (s.restaurant_id, s.user_id, v_peer, v_group, coalesce(trim(p_body),''), p_attachment, v_kind, left(p_name, 200),
            case when p_attachment like 'storage:%' then p_size when p_attachment is not null then (length(p_attachment) * 3 / 4) end, p_reply_to, coalesce(p_view_once, false) and v_kind = 'image')
    returning id into v_id;
  insert into chat_reads(user_id, conv, last_read_at) values (s.user_id, p_conv, now()) on conflict (user_id, conv) do update set last_read_at = now();
  begin
    select value into v_url from platform_settings where key = 'push_dispatch_url';
    select value into v_secret from platform_settings where key = 'push_dispatch_secret';
    if coalesce(v_url,'') <> '' then
      perform net.http_post(url := v_url, headers := jsonb_build_object('Content-Type','application/json','x-push-secret', coalesce(v_secret,'')),
        body := jsonb_build_object('mode','chat_message','message_id', v_id));
    end if;
  exception when others then null;
  end;
  return v_id;
end; $$;


--
-- Name: send_order(uuid, uuid, json, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_order(p_token uuid, p_table_id uuid, p_items json, p_tags text[] DEFAULT '{}'::text[]) RETURNS TABLE(order_id uuid, daily_number integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype;
  v_order_id uuid;
  v_daily_number int;
  item json;
  v_qty int;
  v_price numeric;
  v_cost numeric;
  v_product_id uuid;
  v_item_count int;
begin
  s := _session_check(p_token);
  perform _require_shift(s);

  if not exists(select 1 from restaurant_tables where id = p_table_id and restaurant_id = s.restaurant_id) then
    raise exception 'Masa bulunamadı';
  end if;

  select json_array_length(p_items) into v_item_count;
  if v_item_count is null or v_item_count = 0 then
    raise exception 'Sepet boş';
  end if;
  if v_item_count > 100 then
    raise exception 'Çok fazla ürün';
  end if;

  select o.id, o.daily_number into v_order_id, v_daily_number from orders o
    where o.restaurant_id = s.restaurant_id and o.table_id = p_table_id and o.status = 'open'
    limit 1;

  if v_order_id is null then
    -- Ayni restoranin gunluk numara uretimini serilestirir (yaris durumu koruması).
    perform 1 from restaurants where id = s.restaurant_id for update;

    select coalesce(max(o.daily_number), 0) + 1 into v_daily_number
      from orders o where o.restaurant_id = s.restaurant_id
        and (o.created_at at time zone 'Europe/Istanbul')::date = (now() at time zone 'Europe/Istanbul')::date;

    insert into orders (restaurant_id, table_id, kind, status, daily_number, tags, created_by)
    values (s.restaurant_id, p_table_id, 'dine_in', 'open', v_daily_number, coalesce(p_tags,'{}'), s.user_id)
    returning id into v_order_id;
  else
    update orders set tags = coalesce(p_tags,'{}') where id = v_order_id;
  end if;

  for item in select * from json_array_elements(p_items)
  loop
    v_product_id := (item->>'product_id')::uuid;
    v_qty := (item->>'qty')::int;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Geçersiz adet';
    end if;
    select price, cost into v_price, v_cost from products
      where id = v_product_id and restaurant_id = s.restaurant_id;
    if not found then
      raise exception 'Ürün bulunamadı';
    end if;

    insert into order_items (order_id, product_id, name, price, cost, qty, status, note)
    values (
      v_order_id, v_product_id, item->>'name',
      v_price, v_cost, v_qty,
      'pending', item->>'note'
    );
  end loop;

  return query select v_order_id, v_daily_number;
end;
$$;


--
-- Name: send_takeaway_order(uuid, json, uuid, text, text, text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_takeaway_order(p_token uuid, p_items json, p_order_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_tags text[] DEFAULT '{}'::text[]) RETURNS TABLE(order_id uuid, daily_number integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype;
  v_order_id uuid;
  v_daily_number int;
  item json;
  v_qty int;
  v_product_id uuid;
  v_price numeric;
  v_cost numeric;
  v_item_count int;
begin
  s := _session_check(p_token);
  perform _require_shift(s);

  select json_array_length(p_items) into v_item_count;
  if v_item_count is null or v_item_count = 0 then
    raise exception 'Sepet boş';
  end if;
  if v_item_count > 100 then
    raise exception 'Çok fazla ürün';
  end if;

  if p_order_id is not null then
    select o.id, o.daily_number into v_order_id, v_daily_number from orders o
      where o.id = p_order_id and o.restaurant_id = s.restaurant_id and o.status = 'open';
    if v_order_id is null then
      raise exception 'Paket sipariş bulunamadı veya kapatılmış';
    end if;
    update orders set
      tags = coalesce(p_tags,'{}'),
      customer_name = coalesce(p_customer_name, customer_name),
      customer_phone = coalesce(p_customer_phone, customer_phone),
      note = coalesce(p_note, note)
      where id = v_order_id;
  else
    perform 1 from restaurants where id = s.restaurant_id for update;

    select coalesce(max(o.daily_number), 0) + 1 into v_daily_number
      from orders o where o.restaurant_id = s.restaurant_id
        and (o.created_at at time zone 'Europe/Istanbul')::date = (now() at time zone 'Europe/Istanbul')::date;

    insert into orders (restaurant_id, table_id, kind, status, daily_number, tags, customer_name, customer_phone, note, created_by)
    values (s.restaurant_id, null, 'takeaway', 'open', v_daily_number, coalesce(p_tags,'{}'), p_customer_name, p_customer_phone, p_note, s.user_id)
    returning id into v_order_id;
  end if;

  for item in select * from json_array_elements(p_items)
  loop
    v_product_id := (item->>'product_id')::uuid;
    v_qty := (item->>'qty')::int;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Geçersiz adet';
    end if;
    select price, cost into v_price, v_cost from products
      where id = v_product_id and restaurant_id = s.restaurant_id;
    if not found then
      raise exception 'Ürün bulunamadı';
    end if;

    insert into order_items (order_id, product_id, name, price, cost, qty, status, note)
    values (
      v_order_id, v_product_id, item->>'name',
      v_price, v_cost, v_qty,
      'pending', item->>'note'
    );
  end loop;

  return query select v_order_id, v_daily_number;
end;
$$;


--
-- Name: send_test_push(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_test_push(p_token uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype;
  v_url text;
  v_secret text;
begin
  s := _session_check(p_token);
  perform _rate_limit('test_push', s.user_id::text, 5, interval '10 minutes');
  select value into v_url from platform_settings where key = 'push_dispatch_url';
  select value into v_secret from platform_settings where key = 'push_dispatch_secret';
  if v_url is null or v_url = '' then
    raise exception 'Push altyapısı yapılandırılmamış';
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret', coalesce(v_secret,'')),
    body := jsonb_build_object('mode', 'test_push', 'user_id', s.user_id)
  );
end;
$$;


--
-- Name: send_test_push(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_test_push(p_token uuid, p_endpoint text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype;
  v_url text;
  v_secret text;
begin
  s := _session_check(p_token);
  perform _rate_limit('test_push', s.user_id::text, 5, interval '10 minutes');
  select value into v_url from platform_settings where key = 'push_dispatch_url';
  select value into v_secret from platform_settings where key = 'push_dispatch_secret';
  if v_url is null or v_url = '' then
    raise exception 'Push altyapısı yapılandırılmamış';
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret', coalesce(v_secret,'')),
    body := jsonb_build_object('mode', 'test_push', 'user_id', s.user_id, 'endpoint', p_endpoint)
  );
end;
$$;


--
-- Name: send_waitlist_order(uuid, uuid, json, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_waitlist_order(p_token uuid, p_waitlist_id uuid, p_items json, p_tags text[] DEFAULT '{}'::text[]) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; w waitlist_entries%rowtype; v_order uuid; v_daily int; item json; v_qty int; v_pid uuid; v_price numeric; v_cost numeric; v_n int;
begin
  s := _session_check(p_token);
  perform _require_shift(s);
  select * into w from waitlist_entries where id = p_waitlist_id and restaurant_id = s.restaurant_id for update;
  if w.id is null then raise exception 'Kayıt bulunamadı'; end if;
  if w.status <> 'waiting' then raise exception 'Bu müşteri artık bekleme listesinde değil'; end if;
  v_n := json_array_length(p_items);
  if v_n is null or v_n = 0 then raise exception 'Sepet boş'; end if;
  if v_n > 100 then raise exception 'Çok fazla ürün'; end if;
  select id into v_order from orders where restaurant_id = s.restaurant_id and waitlist_id = w.id and kind = 'waitlist' and status = 'open' limit 1;
  if v_order is null then
    perform 1 from restaurants where id = s.restaurant_id for update;
    select coalesce(max(o.daily_number), 0) + 1 into v_daily from orders o
      where o.restaurant_id = s.restaurant_id and (o.created_at at time zone 'Europe/Istanbul')::date = (now() at time zone 'Europe/Istanbul')::date;
    insert into orders (restaurant_id, table_id, kind, status, daily_number, tags, customer_name, customer_phone, note, created_by, waitlist_id)
      values (s.restaurant_id, null, 'waitlist', 'open', v_daily, coalesce(p_tags,'{}'), w.customer_name, w.phone, '⏳ Bekleme listesi · ' || w.party_size || ' kişi', s.user_id, w.id)
      returning id into v_order;
  else
    update orders set tags = coalesce(p_tags,'{}') where id = v_order;
  end if;
  for item in select * from json_array_elements(p_items) loop
    v_pid := (item->>'product_id')::uuid; v_qty := (item->>'qty')::int;
    if v_qty is null or v_qty <= 0 then raise exception 'Geçersiz adet'; end if;
    select price, cost into v_price, v_cost from products where id = v_pid and restaurant_id = s.restaurant_id;
    if not found then raise exception 'Ürün bulunamadı'; end if;
    insert into order_items (order_id, product_id, name, price, cost, qty, status, note)
      values (v_order, v_pid, item->>'name', v_price, v_cost, v_qty, 'pending', item->>'note');
  end loop;
  return json_build_object('order_id', v_order);
end; $$;


--
-- Name: set_customer_loyalty(uuid, uuid, numeric, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_customer_loyalty(p_token uuid, p_id uuid, p_spend_per_point numeric, p_point_value numeric, p_birthday_discount_percent numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'crm');
  if p_spend_per_point is not null and p_spend_per_point <= 0 then raise exception 'Kaç TL harcamada 1 puan 0''dan büyük olmalı'; end if;
  if p_point_value is not null and p_point_value < 0 then raise exception '1 puanın değeri negatif olamaz'; end if;
  if p_birthday_discount_percent is not null and (p_birthday_discount_percent < 0 or p_birthday_discount_percent > 100) then raise exception 'Doğum günü indirimi 0-100 arasında olmalı'; end if;
  update customers set spend_per_point = p_spend_per_point, point_value = p_point_value, birthday_discount_percent = p_birthday_discount_percent
    where id = p_id and restaurant_id = s.restaurant_id;
end; $$;


--
-- Name: set_ingredient_usage(uuid, uuid, json); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_ingredient_usage(p_token uuid, p_ingredient_id uuid, p_usages json) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype;
  usage json;
  v_product_id uuid;
  v_qty numeric;
  v_used_ids uuid[] := '{}';
begin
  s := _session_check(p_token, 'settings_ingredients');
  if not exists(select 1 from ingredients where id = p_ingredient_id and restaurant_id = s.restaurant_id) then
    raise exception 'Hammadde bulunamadı';
  end if;

  for usage in select * from json_array_elements(p_usages)
  loop
    v_product_id := (usage->>'product_id')::uuid;
    v_qty := (usage->>'qty_per_unit')::numeric;
    if v_qty is not null and v_qty > 0 and exists(select 1 from products where id = v_product_id and restaurant_id = s.restaurant_id) then
      insert into product_ingredients (product_id, ingredient_id, qty_per_unit)
      values (v_product_id, p_ingredient_id, v_qty)
      on conflict (product_id, ingredient_id) do update set qty_per_unit = excluded.qty_per_unit;
      v_used_ids := array_append(v_used_ids, v_product_id);
    end if;
  end loop;

  delete from product_ingredients pi
    using products p
    where pi.ingredient_id = p_ingredient_id
      and pi.product_id = p.id
      and p.restaurant_id = s.restaurant_id
      and not (pi.product_id = any(v_used_ids));
end;
$$;


--
-- Name: set_product_image(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_product_image(p_token uuid, p_product_id uuid, p_data text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $_$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'online_ordering');
  if not exists(select 1 from products where id = p_product_id and restaurant_id = s.restaurant_id) then raise exception 'Ürün bulunamadı'; end if;
  if p_data is null or p_data = '' then
    execute 'de'||'lete from product_images where product_id = $1' using p_product_id; return;
  end if;
  if p_data !~ '^data:image/(jpeg|png|webp);base64,' then raise exception 'Geçersiz görsel'; end if;
  if length(p_data) > 400000 then raise exception 'Görsel çok büyük'; end if;
  insert into product_images(product_id, restaurant_id, data, updated_at) values (p_product_id, s.restaurant_id, p_data, now())
    on conflict (product_id) do update set data = excluded.data, updated_at = now();
end; $_$;


--
-- Name: set_public_cart_hold(text, text, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_public_cart_hold(p_restaurant_code text, p_client text, p_product_id uuid, p_qty integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_rid uuid;
begin
  select r.id into v_rid from restaurants r where r.code = p_restaurant_code and r.is_active;
  if v_rid is null then raise exception 'İşletme bulunamadı'; end if;
  return _set_cart_hold(v_rid, p_client, p_product_id, p_qty);
end; $$;


--
-- Name: set_purchase_order_status(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_purchase_order_status(p_token uuid, p_id uuid, p_status text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype;
  v_po purchase_orders%rowtype;
  v_supplier suppliers%rowtype;
  v_restaurant restaurants%rowtype;
  v_resend_key text;
  v_resend_from text;
  v_items_html text := '';
  v_item record;
  v_email_sent boolean := false;
begin
  s := _session_check_any(p_token, array['purchasing_orders','purchasing_manage']);
  if p_status not in ('draft','ordered','cancelled') then raise exception 'Geçersiz durum'; end if;

  select * into v_po from purchase_orders where id = p_id and restaurant_id = s.restaurant_id;
  if v_po.id is null then raise exception 'Sipariş bulunamadı'; end if;
  -- Yalnızca sipariş verme yetkisi: kendi taslağını "Sipariş Ver" yapabilir.
  if not _user_has_perm(s.user_id, 'purchasing_manage')
     and not (p_status = 'ordered' and v_po.status = 'draft' and v_po.created_by = s.user_id) then
    raise exception 'Bu işlem için Satın Alma Yönetimi yetkisi gerekli';
  end if;

  update purchase_orders set status = p_status where id = p_id;

  -- "Sipariş Ver" (ordered) durumuna geçince, tedarikçinin kayıtlı bir
  -- e-postası varsa Resend üzerinden otomatik bir sipariş listesi
  -- e-postası gönderilir (bkz. kullanıcı isteği: "sipariş oluşturunca
  -- anında tedarikçiye gitsin"). Resend API anahtarı henüz
  -- ayarlanmadıysa veya tedarikçinin e-postası yoksa sessizce atlanır -
  -- sipariş durumu yine de güncellenir, sadece e-posta gönderilmez.
  if p_status = 'ordered' then
    select * into v_supplier from suppliers sp where sp.id = v_po.supplier_id;
    if v_supplier.id is not null and v_supplier.email is not null and trim(v_supplier.email) <> '' then
      select * into v_restaurant from restaurants r where r.id = s.restaurant_id;

      for v_item in
        select ing.name as ing_name, ing.unit as ing_unit, it.quantity, it.unit_cost
        from purchase_order_items it join ingredients ing on ing.id = it.ingredient_id
        where it.purchase_order_id = p_id
        order by ing.name
      loop
        v_items_html := v_items_html ||
          '<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;">' || _html_escape(v_item.ing_name) || '</td>' ||
          '<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">' || v_item.quantity || ' ' || _html_escape(v_item.ing_unit) || '</td>' ||
          '<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">' || to_char(v_item.unit_cost,'FM999999990.00') || ' TL</td></tr>';
      end loop;

      select value into v_resend_key from platform_settings where key = 'resend_api_key';
      select value into v_resend_from from platform_settings where key = 'resend_from_email';

      if v_resend_key is not null and v_items_html <> '' then
        perform net.http_post(
          url := 'https://api.resend.com/emails',
          headers := jsonb_build_object('Authorization', 'Bearer ' || v_resend_key, 'Content-Type', 'application/json'),
          body := jsonb_build_object(
            'from', coalesce(v_resend_from, 'onboarding@resend.dev'),
            'to', jsonb_build_array(v_supplier.email),
            'subject', v_restaurant.name || ' - Satın Alma Siparişi',
            'html',
              '<p>Merhaba' || (case when v_supplier.name is not null and trim(v_supplier.name)<>'' then ' ' || _html_escape(v_supplier.name) else '' end) || ',</p>' ||
              '<p><b>' || _html_escape(v_restaurant.name) || '</b> aşağıdaki ürünleri sipariş etmek istiyor:</p>' ||
              '<table style="border-collapse:collapse;width:100%;max-width:480px;">' ||
              '<tr><th style="text-align:left;padding:6px 10px;border-bottom:2px solid #333;">Ürün</th><th style="text-align:right;padding:6px 10px;border-bottom:2px solid #333;">Miktar</th><th style="text-align:right;padding:6px 10px;border-bottom:2px solid #333;">Birim Fiyat</th></tr>' ||
              v_items_html ||
              '</table>' ||
              (case when v_po.expected_date is not null then '<p>Beklenen teslim tarihi: ' || to_char(v_po.expected_date,'DD.MM.YYYY') || '</p>' else '' end) ||
              (case when v_po.notes is not null and trim(v_po.notes) <> '' then '<p>Not: ' || _html_escape(v_po.notes) || '</p>' else '' end) ||
              '<p>İyi çalışmalar.</p>'
          )
        );
        v_email_sent := true;
      end if;
    end if;
  end if;

  return json_build_object('email_sent', v_email_sent);
end;
$$;


--
-- Name: set_qr_cart_hold(uuid, text, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_qr_cart_hold(p_qr_token uuid, p_client text, p_product_id uuid, p_qty integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_rid uuid;
begin
  select t.restaurant_id into v_rid from restaurant_tables t join restaurants r on r.id = t.restaurant_id where t.qr_token = p_qr_token and r.is_active;
  if v_rid is null then raise exception 'Geçersiz QR kod'; end if;
  return _set_cart_hold(v_rid, p_client, p_product_id, p_qty);
end; $$;


--
-- Name: set_recipe(uuid, uuid, json); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_recipe(p_token uuid, p_product_id uuid, p_items json) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype;
  item json;
  v_ingredient_id uuid;
begin
  s := _session_check(p_token, 'settings_products');
  if not exists(select 1 from products where id = p_product_id and restaurant_id = s.restaurant_id) then
    raise exception 'Ürün bulunamadı';
  end if;

  delete from product_ingredients where product_id = p_product_id;

  for item in select * from json_array_elements(p_items)
  loop
    v_ingredient_id := (item->>'ingredient_id')::uuid;
    -- ingredient_id başka bir restorana ait olabilir (cross-tenant BOLA):
    -- bu durumda o hammaddenin adı/stoğu get_restaurant_config üzerinden
    -- bu restorana sızabilir. Bu yüzden ekleme öncesi sahiplik doğrulanır.
    if not exists(select 1 from ingredients where id = v_ingredient_id and restaurant_id = s.restaurant_id) then
      raise exception 'Hammadde bulunamadı';
    end if;
    insert into product_ingredients (product_id, ingredient_id, qty_per_unit)
    values (p_product_id, v_ingredient_id, (item->>'qty_per_unit')::numeric);
  end loop;
end;
$$;


--
-- Name: set_reports_password(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_reports_password(p_token uuid, p_new_password text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype;
  v_is_manager boolean;
begin
  s := _session_check(p_token);
  select exists(
    select 1 from app_users au join roles rl on rl.id = any(au.role_ids)
    where au.id = s.user_id and (rl.is_system or 'reports' = any(rl.permissions))
  ) into v_is_manager;
  if not v_is_manager then
    raise exception 'Bu işlem için yetkiniz yok';
  end if;
  if p_new_password is null or length(p_new_password) < 4 then
    raise exception 'Şifre en az 4 karakter olmalı';
  end if;
  update restaurants set reports_password_hash = crypt(p_new_password, gen_salt('bf')) where id = s.restaurant_id;
end;
$$;


--
-- Name: set_reservation_status(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_reservation_status(p_token uuid, p_id uuid, p_status text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_old text; v_order orders%rowtype;
begin
  s := _session_check(p_token, 'reservations');
  if p_status not in ('pending','confirmed','seated','cancelled','no_show') then raise exception 'Geçersiz durum'; end if;
  select status into v_old from reservations where id = p_id and restaurant_id = s.restaurant_id for update;
  update reservations set status = p_status,
    closed_at = case when p_status in ('cancelled','no_show') then now() else null end,
    seated_at = case when p_status = 'seated' then coalesce(seated_at, now()) else null end
    where id = p_id and restaurant_id = s.restaurant_id;
  -- "Oturdu"dan geri alınırsa masadaki rezervasyon bilgisi de geri alınır:
  -- ürün girilmemişse masa boşaltılır (sipariş iptal), girilmişse sipariş
  -- korunur ve sadece müşteri/rezervasyon bilgisi temizlenir.
  if v_old = 'seated' and p_status <> 'seated' then
    for v_order in select * from orders where restaurant_id = s.restaurant_id and reservation_id = p_id and status = 'open' loop
      if not exists(select 1 from order_items where order_id = v_order.id) then
        update orders set status = 'cancelled', reservation_id = null where id = v_order.id;
      else
        update orders set customer_name = null, customer_phone = null,
          note = case when note like '📅 Rezervasyon%' then null else note end, reservation_id = null
          where id = v_order.id;
      end if;
    end loop;
  end if;
end; $$;


--
-- Name: set_session_remember(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_session_remember(p_token uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token);
  update staff_sessions set remember = true, expires_at = greatest(expires_at, now() + interval '30 days') where token = p_token;
end; $$;


--
-- Name: set_shift_approval_required(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_shift_approval_required(p_token uuid, p_value boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'shifts');
  if not exists(select 1 from app_users au join roles rl on rl.id = any(au.role_ids) where au.id = s.user_id and (rl.is_system or 'shifts' = any(rl.permissions))) then
    raise exception 'Bu ayarı yalnızca Yönetici değiştirebilir';
  end if;
  update restaurants set shift_approval_required = p_value where id = s.restaurant_id;
end; $$;


--
-- Name: set_shift_required(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_shift_required(p_token uuid, p_value boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'shifts');
  if not exists(select 1 from app_users au join roles rl on rl.id = any(au.role_ids) where au.id = s.user_id and (rl.is_system or 'shifts' = any(rl.permissions))) then
    raise exception 'Bu ayarı yalnızca Yönetici değiştirebilir'; end if;
  update restaurants set shift_required = p_value where id = s.restaurant_id;
  -- Açık ekranlar ayarı hemen görsün (bkz. get_data_version).
  insert into data_versions(restaurant_id, v, updated_at) values (s.restaurant_id, 1, now())
    on conflict (restaurant_id) do update set v = data_versions.v + 1, updated_at = now();
end; $$;


--
-- Name: set_staff_user_active(uuid, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_staff_user_active(p_token uuid, p_user_id uuid, p_active boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'settings_users');
  if p_user_id = s.user_id then raise exception 'Kendi hesabınızı pasife alamazsınız'; end if;
  if _is_owner(p_user_id) then raise exception 'İşletme sahibi pasife alınamaz'; end if;
  update app_users set is_active = p_active where id = p_user_id and restaurant_id = s.restaurant_id and not is_company_owner;
  if not found then raise exception 'Kullanıcı bulunamadı'; end if;
  if not p_active then
    delete from staff_sessions where user_id = p_user_id;
    delete from push_subscriptions where user_id = p_user_id;
  end if;
end; $$;


--
-- Name: set_table_customer(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_table_customer(p_token uuid, p_table_id uuid, p_name text, p_phone text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_order uuid; v_daily int; v_name text := nullif(trim(coalesce(p_name,'')),''); v_phone text := nullif(trim(coalesce(p_phone,'')),'');
begin
  s := _session_check(p_token, 'order');
  if not exists(select 1 from restaurant_tables where id = p_table_id and restaurant_id = s.restaurant_id) then raise exception 'Geçersiz masa'; end if;
  if length(coalesce(v_name,'')) > 80 or length(coalesce(v_phone,'')) > 30 then raise exception 'Bilgi çok uzun'; end if;
  select id into v_order from orders where restaurant_id = s.restaurant_id and table_id = p_table_id and status = 'open' limit 1;
  if v_order is null then
    if v_name is null and v_phone is null then return json_build_object('order_id', null); end if;
    perform 1 from restaurants where id = s.restaurant_id for update;
    select coalesce(max(o.daily_number), 0) + 1 into v_daily from orders o
      where o.restaurant_id = s.restaurant_id and (o.created_at at time zone 'Europe/Istanbul')::date = (now() at time zone 'Europe/Istanbul')::date;
    insert into orders (restaurant_id, table_id, kind, status, daily_number, customer_name, customer_phone, created_by)
      values (s.restaurant_id, p_table_id, 'dine_in', 'open', v_daily, v_name, v_phone, s.user_id) returning id into v_order;
  else
    update orders set customer_name = v_name, customer_phone = v_phone where id = v_order;
    -- Ürünsüz ve isimsiz kalan masa boşaltılır.
    if v_name is null and v_phone is null and not exists(select 1 from order_items where order_id = v_order) then
      update orders set status = 'cancelled' where id = v_order;
    end if;
  end if;
  return json_build_object('order_id', v_order);
end; $$;


--
-- Name: set_waitlist_status(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_waitlist_status(p_token uuid, p_id uuid, p_status text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'reservations');
  if p_status not in ('waiting','seated','cancelled') then raise exception 'Geçersiz durum'; end if;
  update waitlist_entries set status = p_status,
    seated_at = case when p_status='seated' then now() else seated_at end,
    left_at = case when p_status='cancelled' then now() else left_at end
    where id = p_id and restaurant_id = s.restaurant_id;
  -- Bekleme listesinden ayrılan müşterinin ön siparişi paket siparişe döner (ödenebilir/iptal edilebilir kalsın).
  if p_status = 'cancelled' then
    update orders set kind = 'takeaway' where restaurant_id = s.restaurant_id and waitlist_id = p_id and kind = 'waitlist' and status = 'open';
  end if;
end; $$;


--
-- Name: start_password_reset(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.start_password_reset(p_code text, p_username text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_restaurant restaurants%rowtype;
  v_user app_users%rowtype;
  v_otp text;
  v_resend_key text;
  v_resend_from text;
  v_recent_count int;
begin
  -- E-posta kotasi (Resend) sahte adreslerle tuketilmesin: IP basina ve genel limit.
  perform _rate_limit('email_ip', _client_ip(), 5, interval '1 hour');
  perform _rate_limit('email_global', 'all', 200, interval '1 hour');
  select r.* into v_restaurant from restaurants r where r.code = p_code;
  if v_restaurant.id is not null then
    select u.* into v_user from app_users u where u.restaurant_id = v_restaurant.id and u.username = p_username;
  end if;
  if v_user.id is null then
    raise exception 'İşletme kodu veya kullanıcı adı hatalı';
  end if;
  if v_restaurant.email is null or v_restaurant.email = '' then
    raise exception 'Bu işletme için kayıtlı bir e-posta yok, destek ile iletişime geçin';
  end if;

  select count(*) into v_recent_count from password_reset_otps
    where user_id = v_user.id and created_at > now() - interval '10 minutes';
  if v_recent_count >= 3 then
    raise exception 'Çok sık kod istediniz, lütfen biraz bekleyip tekrar deneyin';
  end if;

  v_otp := lpad(floor(random()*1000000)::text, 6, '0');
  insert into password_reset_otps (restaurant_id, user_id, otp_code)
  values (v_restaurant.id, v_user.id, v_otp);
  perform _send_sms(null, v_restaurant.phone, 'Peyktan sifre sifirlama kodunuz: ' || v_otp, 'otp');

  select value into v_resend_key from platform_settings where key = 'resend_api_key';
  select value into v_resend_from from platform_settings where key = 'resend_from_email';

  if v_resend_key is not null then
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_resend_key, 'Content-Type', 'application/json'),
      body := jsonb_build_object(
        'from', coalesce(v_resend_from, 'onboarding@resend.dev'),
        'to', jsonb_build_array(v_restaurant.email),
        'subject', 'Şifre Sıfırlama Kodunuz',
        'html', '<p>Merhaba,</p><p><b>' || v_user.username || '</b> kullanıcısı için şifre sıfırlama kodunuz:</p>' ||
                '<h2 style="letter-spacing:4px;">' || v_otp || '</h2>' ||
                '<p>Bu kod 10 dakika geçerlidir. Bu talebi siz yapmadıysanız bu e-postayı yok sayabilirsiniz.</p>'
      )
    );
    return json_build_object('sent', true);
  else
    return json_build_object('sent', false, 'test_otp', v_otp);
  end if;
end;
$$;


--
-- Name: start_registration(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.start_registration(p_email text, p_phone text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_otp text;
  v_resend_key text;
  v_resend_from text;
  v_recent_count int;
begin
  -- E-posta kotasi (Resend) sahte adreslerle tuketilmesin: IP basina ve genel limit.
  perform _rate_limit('email_ip', _client_ip(), 5, interval '1 hour');
  perform _rate_limit('email_global', 'all', 200, interval '1 hour');
  if _registration_blocked(p_email, p_phone) is not null then
    raise exception '%', _registration_blocked(p_email, p_phone);
  end if;

  select count(*) into v_recent_count from signup_otps
    where (phone = p_phone or lower(email) = lower(p_email)) and created_at > now() - interval '10 minutes';
  if v_recent_count >= 3 then
    raise exception 'Çok sık kod istediniz, lütfen biraz bekleyip tekrar deneyin';
  end if;

  v_otp := lpad(floor(random()*1000000)::text, 6, '0');
  insert into signup_otps (phone, email, otp_code) values (p_phone, p_email, v_otp);
  perform _send_sms(null, p_phone, 'Peyktan dogrulama kodunuz: ' || v_otp || ' (10 dk gecerli)', 'otp');

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


--
-- Name: start_reports_password_reset(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.start_reports_password_reset(p_token uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype;
  v_is_manager boolean;
  v_restaurant restaurants%rowtype;
  v_otp text;
  v_resend_key text;
  v_resend_from text;
  v_recent_count int;
begin
  s := _session_check(p_token);
  select exists(
    select 1 from app_users au join roles rl on rl.id = any(au.role_ids)
    where au.id = s.user_id and (rl.is_system or 'reports' = any(rl.permissions))
  ) into v_is_manager;
  if not v_is_manager then
    raise exception 'Bu işlem için yetkiniz yok';
  end if;
  select * into v_restaurant from restaurants where id = s.restaurant_id;
  if v_restaurant.email is null or v_restaurant.email = '' then
    raise exception 'Bu işletme için kayıtlı bir e-posta yok, destek ile iletişime geçin';
  end if;

  select count(*) into v_recent_count from reports_password_reset_otps
    where restaurant_id = v_restaurant.id and created_at > now() - interval '10 minutes';
  if v_recent_count >= 3 then
    raise exception 'Çok sık kod istediniz, lütfen biraz bekleyip tekrar deneyin';
  end if;

  v_otp := lpad(floor(random()*1000000)::text, 6, '0');
  insert into reports_password_reset_otps (restaurant_id, otp_code)
  values (v_restaurant.id, v_otp);

  select value into v_resend_key from platform_settings where key = 'resend_api_key';
  select value into v_resend_from from platform_settings where key = 'resend_from_email';

  if v_resend_key is not null then
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_resend_key, 'Content-Type', 'application/json'),
      body := jsonb_build_object(
        'from', coalesce(v_resend_from, 'onboarding@resend.dev'),
        'to', jsonb_build_array(v_restaurant.email),
        'subject', 'Finansal Analiz Şifre Sıfırlama Kodunuz',
        'html', '<p>Merhaba,</p><p>Finansal analiz ekranı şifrenizi sıfırlamak için kodunuz:</p>' ||
                '<h2 style="letter-spacing:4px;">' || v_otp || '</h2>' ||
                '<p>Bu kod 10 dakika geçerlidir. Bu talebi siz yapmadıysanız bu e-postayı yok sayabilirsiniz.</p>'
      )
    );
    return json_build_object('sent', true);
  else
    return json_build_object('sent', false, 'test_otp', v_otp);
  end if;
end;
$$;


--
-- Name: submit_addon_transfer_notice(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_addon_transfer_notice(p_token uuid, p_addon_id text, p_note text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_r restaurants%rowtype; f feature_catalog%rowtype; v_id uuid; v_name text; v_pkg text;
  v_key text; v_from text; v_mail text;
begin
  s := _session_check(p_token);
  if not exists(select 1 from app_users au join roles rl on rl.id = any(au.role_ids) where au.id = s.user_id and (rl.is_system or 'settings_billing' = any(rl.permissions))) then
    raise exception 'Bu işlem için yetkiniz yok'; end if;
  select * into f from feature_catalog where id = p_addon_id and active;
  if f.id is null or coalesce(f.price,0) <= 0 then raise exception 'Bu eklenti satın alınamaz'; end if;
  if p_addon_id = any(_restaurant_features(s.restaurant_id)) then raise exception 'Bu eklenti zaten aktif'; end if;
  select * into v_r from restaurants where id = s.restaurant_id;
  if exists(select 1 from bank_transfer_notices where status = 'pending' and addon_id = p_addon_id
     and ((v_r.company_id is null and restaurant_id = v_r.id) or (v_r.company_id is not null and company_id = v_r.company_id))) then
    raise exception 'Bu eklenti için bekleyen bir bildiriminiz var'; end if;
  if v_r.company_id is not null then select name, package_id into v_name, v_pkg from companies where id = v_r.company_id;
  else v_name := v_r.name; v_pkg := v_r.package_id; end if;
  insert into bank_transfer_notices (restaurant_id, company_id, target_package_id, amount, note, billing_cycle, addon_id)
    values (case when v_r.company_id is null then v_r.id end, v_r.company_id, v_pkg, f.price, nullif(trim(coalesce(p_note,'')),''), 'monthly', p_addon_id)
    returning id into v_id;
  select value into v_key from platform_settings where key = 'resend_api_key';
  select value into v_from from platform_settings where key = 'resend_from_email';
  select value into v_mail from platform_settings where key = 'bank_transfer_notify_email';
  if v_key is not null and coalesce(v_mail,'') <> '' then
    perform net.http_post(url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
      body := jsonb_build_object('from', coalesce(v_from, 'onboarding@resend.dev'), 'to', jsonb_build_array(v_mail),
        'subject', '🧩 Eklenti Havale Bildirimi: ' || v_name || ' - ' || f.label || ' (' || f.price || ' TL)',
        'html', '<p><b>' || _h(v_name) || '</b> eklenti için havale bildirdi.</p><p><b>Eklenti:</b> ' || _h(f.label) || '<br><b>Tutar:</b> ' || f.price || ' TL<br><b>Not:</b> ' || _h(coalesce(nullif(trim(coalesce(p_note,'')),''),'(yok)')) || '</p><p>Admin Paneli &gt; Havale Bildirimleri ekranından onaylayın.</p>'));
  end if;
  return json_build_object('id', v_id, 'amount', f.price);
end; $$;


--
-- Name: submit_bank_transfer_notice(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_bank_transfer_notice(p_token uuid, p_note text DEFAULT NULL::text, p_billing_cycle text DEFAULT 'monthly'::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype;
  v_is_manager boolean;
  v_restaurant restaurants%rowtype;
  v_target_type text;
  v_target_id uuid;
  v_target_name text;
  v_package_id text;
  v_price numeric;
  v_price_yearly numeric;
  v_amount numeric;
  v_cycle text := case when p_billing_cycle = 'yearly' then 'yearly' else 'monthly' end;
  v_existing_id uuid;
  v_new_id uuid;
  v_resend_key text;
  v_resend_from text;
  v_notify_email text;
  v_pending_payment boolean;
begin
  s := _session_check(p_token);
  select exists(select 1 from app_users au join roles rl on rl.id = any(au.role_ids) where au.id = s.user_id and (rl.is_system or 'settings_billing' = any(rl.permissions))) into v_is_manager;
  if not v_is_manager then raise exception 'Bu işlem için yetkiniz yok'; end if;

  select * into v_restaurant from restaurants where id = s.restaurant_id;
  if v_restaurant.company_id is not null then
    v_target_type := 'company';
    select id, name, package_id into v_target_id, v_target_name, v_package_id from companies where id = v_restaurant.company_id;
  else
    v_target_type := 'restaurant';
    v_target_id := v_restaurant.id;
    v_target_name := v_restaurant.name;
    v_package_id := v_restaurant.package_id;
  end if;

  select id into v_existing_id from bank_transfer_notices
    where status = 'pending'
      and ((v_target_type = 'restaurant' and restaurant_id = v_target_id) or (v_target_type = 'company' and company_id = v_target_id))
    limit 1;
  if v_existing_id is not null then
    raise exception 'Zaten beklemede bir havale bildiriminiz var, onaylanmasını bekleyin';
  end if;

  if v_target_type = 'restaurant' then
    select exists(
      select 1 from payments
      where restaurant_id = v_target_id and status = 'pending'
        and created_at > now() - interval '1 hour'
    ) into v_pending_payment;
    if v_pending_payment then
      raise exception 'Bekleyen bir kart ödemeniz var, sonuçlanmasını bekleyin ya da o sayfayı kapatıp tekrar deneyin';
    end if;
  end if;

  select price, price_yearly into v_price, v_price_yearly from packages where id = v_package_id;
  v_amount := case when v_cycle = 'yearly' then coalesce(v_price_yearly, coalesce(v_price,0) * 12) else coalesce(v_price,0) end
    + _addons_monthly_total(s.restaurant_id) * (case when v_cycle = 'yearly' then 12 else 1 end);
  if v_amount is null or v_amount <= 0 then raise exception 'Geçersiz paket fiyatı'; end if;

  insert into bank_transfer_notices (restaurant_id, company_id, target_package_id, amount, note, billing_cycle)
  values (
    case when v_target_type = 'restaurant' then v_target_id else null end,
    case when v_target_type = 'company' then v_target_id else null end,
    v_package_id, v_amount, nullif(trim(coalesce(p_note,'')), ''), v_cycle
  )
  returning id into v_new_id;

  select value into v_resend_key from platform_settings where key = 'resend_api_key';
  select value into v_resend_from from platform_settings where key = 'resend_from_email';
  select value into v_notify_email from platform_settings where key = 'bank_transfer_notify_email';
  if v_resend_key is not null and v_notify_email is not null and v_notify_email <> '' then
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_resend_key, 'Content-Type', 'application/json'),
      body := jsonb_build_object(
        'from', coalesce(v_resend_from, 'onboarding@resend.dev'),
        'to', jsonb_build_array(v_notify_email),
        'subject', '🏦 Yeni Havale Bildirimi: ' || v_target_name || ' - ' || v_amount || ' TL (' || v_cycle || ')',
        'html', '<p><b>' || v_target_name || '</b> (' || v_target_type || ') havale bildirdi.</p>' ||
                '<p><b>Dönem:</b> ' || (case when v_cycle='yearly' then 'Yıllık' else 'Aylık' end) || '<br>' ||
                '<b>Tutar:</b> ' || v_amount || ' TL<br>' ||
                '<b>Paket:</b> ' || v_package_id || '<br>' ||
                '<b>Not:</b> ' || coalesce(nullif(trim(coalesce(p_note,'')), ''), '(yok)') || '</p>' ||
                '<p>Onaylamak için Admin Paneli &gt; Havale Bildirimleri ekranına gidin.</p>'
      )
    );
  end if;

  return json_build_object('id', v_new_id, 'amount', v_amount, 'billing_cycle', v_cycle);
end;
$$;


--
-- Name: submit_customer_order_request(uuid, text, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_customer_order_request(p_qr_token uuid, p_customer_name text, p_items jsonb, p_client_id text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $_$
declare
  v_table restaurant_tables%rowtype;
  v_restaurant restaurants%rowtype;
  v_item jsonb;
  v_qty int;
  v_id uuid;
  v_recent_count int;
begin
  select * into v_table from restaurant_tables where qr_token = p_qr_token;
  if v_table.id is null then raise exception 'Geçersiz QR kod'; end if;
  select * into v_restaurant from restaurants where id = v_table.restaurant_id;
  if not coalesce(v_restaurant.is_active, false) then raise exception 'Bu işletme şu anda aktif değil'; end if;
  if not _restaurant_has_feature(v_restaurant.id, 'qr_ordering') then raise exception 'Bu işletme QR menüden sipariş almıyor, lütfen garsonu çağırın'; end if;

  -- QR kod tahmin edilmesi zor olsa da kimlik doğrulaması gerektirmediği için
  -- (herkese açık müşteri sayfası) art arda istekle mutfak/masa personelini
  -- bildirimle boğmak mümkündü. Aynı masadan kısa sürede çok sayıda istek
  -- engellenir.
  select count(*) into v_recent_count from customer_order_requests
    where table_id = v_table.id and created_at > now() - interval '2 minutes';
  if v_recent_count >= 5 then
    raise exception 'Çok sık istek gönderildi, lütfen biraz bekleyin';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Sepet boş';
  end if;
  if jsonb_array_length(p_items) > 30 then raise exception 'Çok fazla ürün'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if not (v_item ? 'product_id') then raise exception 'Geçersiz ürün'; end if;
    if not exists(select 1 from products pr where pr.id = (v_item->>'product_id')::uuid and pr.restaurant_id = v_table.restaurant_id and pr.available = true) then
      raise exception 'Menüde olmayan bir ürün seçildi';
    end if;
    v_qty := coalesce((v_item->>'qty')::int, 1);
    if v_qty < 1 or v_qty > 20 then raise exception 'Geçersiz adet'; end if;
  end loop;

  perform _check_request_stock(p_items, p_client_id);
  insert into customer_order_requests (restaurant_id, table_id, customer_name, items)
  values (v_table.restaurant_id, v_table.id, nullif(trim(coalesce(p_customer_name,'')),''), p_items)
  returning id into v_id;
  if p_client_id is not null then execute 'de'||'lete from public_cart_holds where client_id = $1' using p_client_id; end if;
  return v_id;
end;
$_$;


--
-- Name: submit_public_order(text, text, text, text, text, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_public_order(p_restaurant_code text, p_order_type text, p_customer_name text, p_customer_phone text, p_delivery_address text, p_items jsonb, p_client_id text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $_$
declare
  v_restaurant restaurants%rowtype;
  v_item jsonb;
  v_qty int;
  v_id uuid;
  v_recent_count int;
begin
  select * into v_restaurant from restaurants where code = p_restaurant_code;
  if v_restaurant.id is null then raise exception 'İşletme bulunamadı'; end if;
  if not coalesce(v_restaurant.is_active, false) then raise exception 'Bu işletme şu anda aktif değil'; end if;
  if not coalesce(v_restaurant.online_ordering_enabled, false) or not _restaurant_has_feature(v_restaurant.id, 'online_ordering') then raise exception 'Bu işletme şu anda online sipariş almıyor'; end if;

  if p_order_type not in ('pickup', 'delivery') then raise exception 'Geçersiz sipariş türü'; end if;
  if p_customer_name is null or trim(p_customer_name) = '' then raise exception 'Adınızı girin'; end if;
  if p_customer_phone is null or trim(p_customer_phone) = '' then raise exception 'Telefon numaranızı girin'; end if;
  if p_order_type = 'delivery' and (p_delivery_address is null or trim(p_delivery_address) = '') then
    raise exception 'Teslimat adresini girin';
  end if;

  -- Kimlik doğrulaması gerektirmeyen, sadece işletme koduyla erişilen bu
  -- herkese açık uçtan aynı telefon numarasıyla art arda sipariş
  -- gönderilerek personel bildirimleri spam'lenebiliyordu.
  select count(*) into v_recent_count from customer_order_requests
    where restaurant_id = v_restaurant.id and customer_phone = trim(p_customer_phone)
      and created_at > now() - interval '2 minutes';
  if v_recent_count >= 5 then
    raise exception 'Çok sık istek gönderildi, lütfen biraz bekleyin';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Sepet boş';
  end if;
  if jsonb_array_length(p_items) > 30 then raise exception 'Çok fazla ürün'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if not (v_item ? 'product_id') then raise exception 'Geçersiz ürün'; end if;
    if not exists(select 1 from products pr where pr.id = (v_item->>'product_id')::uuid and pr.restaurant_id = v_restaurant.id and pr.available = true) then
      raise exception 'Menüde olmayan bir ürün seçildi';
    end if;
    v_qty := coalesce((v_item->>'qty')::int, 1);
    if v_qty < 1 or v_qty > 20 then raise exception 'Geçersiz adet'; end if;
  end loop;

  perform _check_request_stock(p_items, p_client_id);
  insert into customer_order_requests (restaurant_id, table_id, customer_name, customer_phone, delivery_address, order_type, items)
  values (v_restaurant.id, null, trim(p_customer_name), trim(p_customer_phone), nullif(trim(coalesce(p_delivery_address,'')),''), p_order_type, p_items)
  returning id into v_id;
  -- Sipariş verildi: sepette tutulan adetler artık siparişin kendisinde ayrılı.
  if p_client_id is not null then execute 'de'||'lete from public_cart_holds where client_id = $1' using p_client_id; end if;
  return v_id;
end;
$_$;


--
-- Name: switch_to_branch(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.switch_to_branch(p_company_token uuid, p_restaurant_id uuid) RETURNS TABLE(session_token uuid, user_id uuid, restaurant_id uuid, role_names text[], permissions text[], is_manager boolean, restaurant_name text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  cs company_sessions%rowtype;
  v_restaurant restaurants%rowtype;
  v_manager_role_id uuid;
  v_owner_user app_users%rowtype;
  v_token uuid;
  v_role_names text[];
  v_permissions text[];
begin
  cs := _company_session_check(p_company_token);
  select * into v_restaurant from restaurants r where r.id = p_restaurant_id and r.company_id = cs.company_id;
  if v_restaurant.id is null then raise exception 'Şube bulunamadı'; end if;

  select rl.id into v_manager_role_id from roles rl where rl.restaurant_id = v_restaurant.id and rl.is_system limit 1;
  if v_manager_role_id is null then raise exception 'Bu şubede yönetici rolü tanımlı değil'; end if;

  select * into v_owner_user from app_users au where au.restaurant_id = v_restaurant.id and au.is_company_owner limit 1;
  if v_owner_user.id is null then
    insert into app_users (restaurant_id, username, password, role_ids, is_company_owner)
    values (v_restaurant.id, '__company_owner__', crypt(gen_random_uuid()::text, gen_salt('bf')), array[v_manager_role_id], true)
    returning * into v_owner_user;
  elsif not (v_manager_role_id = any(v_owner_user.role_ids)) then
    update app_users set role_ids = array[v_manager_role_id] where id = v_owner_user.id returning * into v_owner_user;
  end if;

  delete from staff_sessions ss where ss.user_id = v_owner_user.id;
  insert into staff_sessions (user_id, restaurant_id, username)
  values (v_owner_user.id, v_restaurant.id, v_owner_user.username)
  returning token into v_token;

  select coalesce(array_agg(distinct rl.name), '{}') into v_role_names
    from roles rl where rl.id = any(v_owner_user.role_ids);
  select coalesce(array_agg(distinct p), '{}') into v_permissions
    from roles rl left join lateral unnest(rl.permissions) as p on true
    where rl.id = any(v_owner_user.role_ids);

  return query select v_token, v_owner_user.id, v_restaurant.id, v_role_names, v_permissions, true, v_restaurant.name;
end;
$$;


--
-- Name: toggle_chat_reaction(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.toggle_chat_reaction(p_token uuid, p_message_id uuid, p_emoji text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $_$
declare s staff_sessions%rowtype; m chat_messages%rowtype;
begin
  s := _session_check(p_token, 'messages');
  if p_emoji is null or length(p_emoji) > 16 or p_emoji = '' then raise exception 'Geçersiz tepki'; end if;
  select * into m from chat_messages where id = p_message_id and restaurant_id = s.restaurant_id;
  if m.id is null or m.deleted_at is not null or not _chat_can_see(m, s.user_id) then raise exception 'Mesaj bulunamadı'; end if;
  if exists(select 1 from chat_reactions where message_id = m.id and user_id = s.user_id and emoji = p_emoji) then
    execute 'de'||'lete from chat_reactions where message_id = $1 and user_id = $2 and emoji = $3' using m.id, s.user_id, p_emoji;
  else
    insert into chat_reactions(message_id, user_id, restaurant_id, emoji) values (m.id, s.user_id, s.restaurant_id, p_emoji);
  end if;
end; $_$;


--
-- Name: toggle_promo_code(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.toggle_promo_code(p_token uuid, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  perform _platform_admin_check(p_token);
  update promo_codes set active = not active where id = p_id;
end;
$$;


--
-- Name: update_accounting_settings(uuid, text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_accounting_settings(p_token uuid, p_provider text, p_api_key text, p_enabled boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'accounting');
  update restaurants set
    accounting_provider = p_provider,
    accounting_api_key = case when p_api_key is null or p_api_key = '' then accounting_api_key else p_api_key end,
    accounting_enabled = coalesce(p_enabled, false)
  where id = s.restaurant_id;
end;
$$;


--
-- Name: update_billing_identity(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_billing_identity(p_token uuid, p_identity_number text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'manager');
  if not _valid_tc_kimlik_no(p_identity_number) then
    raise exception 'Geçerli bir T.C. Kimlik Numarası girin';
  end if;
  update restaurants set billing_identity_number = p_identity_number where id = s.restaurant_id;
end;
$$;


--
-- Name: update_chat_group(uuid, uuid, text, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_chat_group(p_token uuid, p_group_id uuid, p_name text, p_member_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $_$
declare s staff_sessions%rowtype; g chat_groups%rowtype;
begin
  s := _session_check(p_token, 'messages');
  select * into g from chat_groups where id = p_group_id and restaurant_id = s.restaurant_id;
  if g.id is null then raise exception 'Grup bulunamadı'; end if;
  if g.created_by is distinct from s.user_id and not _is_manager(s.user_id) then raise exception 'Grubu yalnızca kuran kişi ya da yönetici düzenleyebilir'; end if;
  if coalesce(trim(p_name),'') <> '' then update chat_groups set name = left(trim(p_name), 60) where id = g.id; end if;
  if p_member_ids is not null then
    execute 'de'||'lete from chat_group_members where group_id = $1 and user_id <> all($2) and user_id <> $3' using g.id, p_member_ids, s.user_id;
    insert into chat_group_members(group_id, user_id, restaurant_id)
      select g.id, u.id, s.restaurant_id from app_users u where u.restaurant_id = s.restaurant_id and u.id = any(p_member_ids)
      on conflict do nothing;
  end if;
end; $_$;


--
-- Name: update_efatura_settings(uuid, text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_efatura_settings(p_token uuid, p_provider text, p_api_key text, p_enabled boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'efatura');
  update restaurants set
    efatura_provider = p_provider,
    efatura_api_key = case when p_api_key is null or p_api_key = '' then efatura_api_key else p_api_key end,
    efatura_enabled = coalesce(p_enabled, false)
  where id = s.restaurant_id;
end;
$$;


--
-- Name: update_google_review_url(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_google_review_url(p_token uuid, p_url text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_is_manager boolean;
begin
  s := _session_check(p_token);
  select exists(select 1 from app_users au join roles rl on rl.id = any(au.role_ids) where au.id = s.user_id and (rl.is_system or 'settings_integrations' = any(rl.permissions))) into v_is_manager;
  if not v_is_manager then raise exception 'Bu işlem için yetkiniz yok'; end if;
  if p_url is not null and p_url <> '' and p_url !~ '^https?://' then
    raise exception 'Geçerli bir link girin (http:// veya https:// ile başlamalı)';
  end if;
  update restaurants set google_review_url = nullif(trim(p_url), '') where id = s.restaurant_id;
end;
$$;


--
-- Name: update_invoice_settings(uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_invoice_settings(p_token uuid, p_title text, p_tax_number text, p_tax_office text, p_address text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'settings_users');
  update restaurants set invoice_title = nullif(trim(p_title),''), tax_number = nullif(trim(p_tax_number),''),
    tax_office = nullif(trim(p_tax_office),''), invoice_address = nullif(trim(p_address),'')
  where id = s.restaurant_id;
end $$;


--
-- Name: update_loyalty_settings(uuid, boolean, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_loyalty_settings(p_token uuid, p_enabled boolean, p_spend_per_point numeric, p_point_value numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_is_manager boolean;
begin
  s := _session_check(p_token);
  select exists(select 1 from app_users au join roles rl on rl.id = any(au.role_ids) where au.id = s.user_id and (rl.is_system or 'crm' = any(rl.permissions))) into v_is_manager;
  if not v_is_manager then raise exception 'Bu işlem için yetkiniz yok'; end if;
  if p_spend_per_point is null or p_spend_per_point <= 0 then raise exception 'Puan başına harcama tutarı 0''dan büyük olmalı'; end if;
  if p_point_value is null or p_point_value < 0 then raise exception 'Puan değeri geçersiz'; end if;
  update restaurants set loyalty_enabled = coalesce(p_enabled,false), loyalty_spend_per_point = p_spend_per_point, loyalty_point_value = p_point_value where id = s.restaurant_id;
end;
$$;


--
-- Name: update_loyalty_settings(uuid, boolean, numeric, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_loyalty_settings(p_token uuid, p_enabled boolean, p_spend_per_point numeric, p_point_value numeric, p_birthday_discount_percent numeric DEFAULT 0) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_is_manager boolean;
begin
  s := _session_check(p_token);
  select exists(select 1 from app_users au join roles rl on rl.id = any(au.role_ids) where au.id = s.user_id and (rl.is_system or 'crm' = any(rl.permissions))) into v_is_manager;
  if not v_is_manager then raise exception 'Bu işlem için yetkiniz yok'; end if;
  if p_spend_per_point is null or p_spend_per_point <= 0 then raise exception 'Puan başına harcama tutarı 0''dan büyük olmalı'; end if;
  if p_point_value is null or p_point_value < 0 then raise exception 'Puan değeri geçersiz'; end if;
  if p_birthday_discount_percent is null or p_birthday_discount_percent < 0 or p_birthday_discount_percent > 100 then
    raise exception 'Doğum günü indirimi 0-100 arasında olmalı';
  end if;
  update restaurants set
    loyalty_enabled = coalesce(p_enabled,false),
    loyalty_spend_per_point = p_spend_per_point,
    loyalty_point_value = p_point_value,
    birthday_discount_percent = p_birthday_discount_percent
  where id = s.restaurant_id;
end;
$$;


--
-- Name: update_marketplace_settings(uuid, text, text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_marketplace_settings(p_token uuid, p_yemeksepeti_key text, p_trendyol_key text, p_getir_key text, p_enabled boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'marketplace');
  update restaurants set
    marketplace_yemeksepeti_key = case when p_yemeksepeti_key is null or p_yemeksepeti_key='' then marketplace_yemeksepeti_key else p_yemeksepeti_key end,
    marketplace_trendyol_key = case when p_trendyol_key is null or p_trendyol_key='' then marketplace_trendyol_key else p_trendyol_key end,
    marketplace_getir_key = case when p_getir_key is null or p_getir_key='' then marketplace_getir_key else p_getir_key end,
    marketplace_enabled = coalesce(p_enabled,false)
  where id = s.restaurant_id;
end;
$$;


--
-- Name: update_online_ordering_settings(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_online_ordering_settings(p_token uuid, p_enabled boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'online_ordering');
  update restaurants set online_ordering_enabled = coalesce(p_enabled,false) where id = s.restaurant_id;
end;
$$;


--
-- Name: update_product_translations(uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_product_translations(p_token uuid, p_product_id uuid, p_translations jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'settings_products');
  if not _restaurant_has_feature(s.restaurant_id, 'multilang_menu') then raise exception 'PAKET_OZELLIK_YOK'; end if;
  if not exists(select 1 from products where id = p_product_id and restaurant_id = s.restaurant_id) then
    raise exception 'Ürün bulunamadı';
  end if;
  update products set name_translations = coalesce(p_translations, '{}'::jsonb) where id = p_product_id;
end;
$$;


--
-- Name: update_promo_code(uuid, uuid, text, text, numeric, integer, timestamp with time zone, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_promo_code(p_token uuid, p_id uuid, p_code text, p_discount_type text, p_discount_value numeric, p_max_uses integer, p_expires_at timestamp with time zone, p_active boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  perform _platform_admin_check(p_token);
  update promo_codes set code=upper(p_code), discount_type=p_discount_type, discount_value=p_discount_value,
    max_uses=p_max_uses, expires_at=p_expires_at, active=p_active
  where id = p_id;
end;
$$;


--
-- Name: update_sms_settings(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_sms_settings(p_token uuid, p_enabled boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'settings_users');
  update restaurants set sms_enabled = coalesce(p_enabled,false) where id = s.restaurant_id;
end $$;


--
-- Name: update_staff_user(uuid, uuid, text, text, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_staff_user(p_token uuid, p_user_id uuid, p_username text DEFAULT NULL::text, p_password text DEFAULT NULL::text, p_role_ids uuid[] DEFAULT NULL::uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_valid_count int; v_target_owner boolean;
begin
  s := _session_check(p_token, 'settings_users');
  perform _guard_owner_target(s.user_id, p_user_id);
  v_target_owner := _is_owner(p_user_id);
  if p_password is not null and length(p_password) < 6 then raise exception 'Şifre en az 6 karakter olmalı'; end if;
  if p_role_ids is not null then
    if v_target_owner then
      -- Sahibin rolü değiştirilemez (Yönetici rolü her zaman onda kalır).
      if not exists(select 1 from roles rl where rl.id = any(p_role_ids) and rl.is_system) or array_length(p_role_ids,1) <> 1 then
        raise exception 'İşletme sahibinin Yönetici rolü değiştirilemez';
      end if;
    else
      if array_length(p_role_ids,1) is null or array_length(p_role_ids,1) > 2 then raise exception 'Bir kullanıcıya en az 1, en fazla 2 rol atanabilir'; end if;
      select count(*) into v_valid_count from roles rl where rl.id = any(p_role_ids) and rl.restaurant_id = s.restaurant_id;
      if v_valid_count <> array_length(p_role_ids,1) then raise exception 'Geçersiz rol seçimi'; end if;
      if exists(select 1 from roles rl where rl.id = any(p_role_ids) and rl.is_system) then
        raise exception 'Yönetici rolü yalnızca işletme sahibine aittir; tam yetki için tüm izinleri içeren bir rol oluşturun';
      end if;
    end if;
  end if;
  update app_users set username = coalesce(p_username, username),
    password = case when p_password is not null then crypt(p_password, gen_salt('bf')) else password end,
    role_ids = coalesce(p_role_ids, role_ids)
  where id = p_user_id and restaurant_id = s.restaurant_id;
end; $$;


--
-- Name: update_table_positions(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_table_positions(p_token uuid, p_positions jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_entry jsonb;
begin
  s := _session_check(p_token, 'settings_zones');
  if not _restaurant_has_feature(s.restaurant_id, 'floorplan') then raise exception 'PAKET_OZELLIK_YOK'; end if;
  for v_entry in select * from jsonb_array_elements(p_positions)
  loop
    update restaurant_tables
      set pos_x = (v_entry->>'pos_x')::numeric, pos_y = (v_entry->>'pos_y')::numeric
      where id = (v_entry->>'id')::uuid and restaurant_id = s.restaurant_id;
  end loop;
end;
$$;


--
-- Name: update_ticket_design(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_ticket_design(p_token uuid, p_design jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'ticket_design');
  update restaurants set ticket_design = coalesce(p_design, '{}'::jsonb) where id = s.restaurant_id;
end;
$$;


--
-- Name: update_tip_pool_settings(uuid, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_tip_pool_settings(p_token uuid, p_enabled boolean, p_mode text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_is_manager boolean;
begin
  s := _session_check(p_token);
  select exists(select 1 from app_users au join roles rl on rl.id = any(au.role_ids) where au.id = s.user_id and (rl.is_system or 'tips' = any(rl.permissions))) into v_is_manager;
  if not v_is_manager then raise exception 'Bu işlem için yetkiniz yok'; end if;
  if p_mode not in ('equal', 'by_hours') then raise exception 'Geçersiz bahşiş havuzu modu'; end if;
  update restaurants set tip_pool_enabled = coalesce(p_enabled,false), tip_pool_mode = p_mode where id = s.restaurant_id;
end;
$$;


--
-- Name: upsert_customer(uuid, uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_customer(p_token uuid, p_id uuid, p_name text, p_phone text, p_email text, p_notes text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_id uuid;
begin
  s := _session_check(p_token, 'crm');
  if p_name is null or trim(p_name) = '' then raise exception 'Müşteri adı gerekli'; end if;
  if p_id is null then
    insert into customers (restaurant_id, name, phone, email, notes)
    values (s.restaurant_id, trim(p_name), nullif(trim(coalesce(p_phone,'')),''), nullif(trim(coalesce(p_email,'')),''), p_notes)
    returning id into v_id;
  else
    update customers set name = trim(p_name), phone = nullif(trim(coalesce(p_phone,'')),''), email = nullif(trim(coalesce(p_email,'')),''), notes = p_notes
    where id = p_id and restaurant_id = s.restaurant_id;
    v_id := p_id;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Bu telefon numarasıyla kayıtlı başka bir müşteri var';
end;
$$;


--
-- Name: upsert_customer(uuid, uuid, text, text, text, text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_customer(p_token uuid, p_id uuid, p_name text, p_phone text, p_email text, p_notes text, p_birthday date DEFAULT NULL::date) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_id uuid;
begin
  s := _session_check(p_token, 'crm');
  if p_name is null or trim(p_name) = '' then raise exception 'Müşteri adı gerekli'; end if;
  if p_id is null then
    insert into customers (restaurant_id, name, phone, email, notes, birthday)
    values (s.restaurant_id, trim(p_name), nullif(trim(coalesce(p_phone,'')),''), nullif(trim(coalesce(p_email,'')),''), p_notes, p_birthday)
    returning id into v_id;
  else
    update customers set name = trim(p_name), phone = nullif(trim(coalesce(p_phone,'')),''), email = nullif(trim(coalesce(p_email,'')),''), notes = p_notes, birthday = p_birthday
    where id = p_id and restaurant_id = s.restaurant_id;
    v_id := p_id;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Bu telefon numarasıyla kayıtlı başka bir müşteri var';
end;
$$;


--
-- Name: upsert_ingredient(uuid, uuid, text, text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_ingredient(p_token uuid, p_id uuid, p_name text, p_unit text, p_stock numeric) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_id uuid;
begin
  s := _session_check(p_token, 'settings_ingredients');
  if coalesce(p_stock,0) < 0 then
    raise exception 'Stok negatif olamaz';
  end if;
  if p_id is null then
    insert into ingredients (restaurant_id, name, unit, stock) values (s.restaurant_id, p_name, p_unit, p_stock) returning id into v_id;
  else
    update ingredients set name = p_name, unit = p_unit, stock = p_stock where id = p_id and restaurant_id = s.restaurant_id;
    v_id := p_id;
  end if;
  return v_id;
end;
$$;


--
-- Name: upsert_product(uuid, uuid, uuid, text, numeric, numeric, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_product(p_token uuid, p_id uuid, p_station_id uuid, p_name text, p_price numeric, p_cost numeric, p_stock integer, p_available boolean) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_id uuid;
begin
  s := _session_check(p_token, 'settings_products');
  if not exists(select 1 from stations where id = p_station_id and restaurant_id = s.restaurant_id) then
    raise exception 'İstasyon bulunamadı';
  end if;
  if p_price < 0 or p_cost < 0 or coalesce(p_stock,0) < 0 then
    raise exception 'Fiyat, maliyet ve stok negatif olamaz';
  end if;
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


--
-- Name: upsert_purchase_order(uuid, uuid, uuid, date, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_purchase_order(p_token uuid, p_id uuid, p_supplier_id uuid, p_expected_date date, p_notes text, p_items jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype;
  v_id uuid;
  v_item jsonb;
begin
  s := _session_check_any(p_token, array['purchasing_orders','purchasing_manage']);
  if p_supplier_id is not null and not exists(select 1 from suppliers sp where sp.id = p_supplier_id and sp.restaurant_id = s.restaurant_id) then
    raise exception 'Geçersiz tedarikçi';
  end if;

  if p_id is null then
    insert into purchase_orders (restaurant_id, supplier_id, expected_date, notes, created_by)
    values (s.restaurant_id, p_supplier_id, p_expected_date, p_notes, s.user_id) returning id into v_id;
  else
    update purchase_orders set supplier_id = p_supplier_id, expected_date = p_expected_date, notes = p_notes
    where id = p_id and restaurant_id = s.restaurant_id and status = 'draft'
      and (created_by = s.user_id or _user_has_perm(s.user_id, 'purchasing_manage'));
    if not found then raise exception 'Sadece taslak durumundaki siparişler düzenlenebilir'; end if;
    v_id := p_id;
    delete from purchase_order_items where purchase_order_id = v_id;
  end if;

  if p_items is not null then
    for v_item in select * from jsonb_array_elements(p_items) loop
      if not exists(select 1 from ingredients ig where ig.id = (v_item->>'ingredient_id')::uuid and ig.restaurant_id = s.restaurant_id) then
        continue;
      end if;
      insert into purchase_order_items (purchase_order_id, ingredient_id, quantity, unit_cost)
      values (v_id, (v_item->>'ingredient_id')::uuid, (v_item->>'quantity')::numeric, coalesce((v_item->>'unit_cost')::numeric,0));
    end loop;
  end if;
  return v_id;
end;
$$;


--
-- Name: upsert_reservation(uuid, uuid, text, text, integer, timestamp with time zone, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_reservation(p_token uuid, p_id uuid, p_customer_name text, p_phone text, p_party_size integer, p_reservation_time timestamp with time zone, p_table_id uuid, p_notes text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_id uuid;
begin
  s := _session_check(p_token, 'reservations');
  if p_customer_name is null or trim(p_customer_name) = '' then raise exception 'Müşteri adı gerekli'; end if;
  if p_reservation_time is null then raise exception 'Rezervasyon zamanı gerekli'; end if;
  if p_table_id is not null and not exists(select 1 from restaurant_tables rt where rt.id = p_table_id and rt.restaurant_id = s.restaurant_id) then
    raise exception 'Geçersiz masa';
  end if;
  if p_id is null then
    insert into reservations (restaurant_id, customer_name, phone, party_size, reservation_time, table_id, notes)
    values (s.restaurant_id, trim(p_customer_name), p_phone, coalesce(p_party_size,2), p_reservation_time, p_table_id, p_notes)
    returning id into v_id;
  else
    update reservations set customer_name = trim(p_customer_name), phone = p_phone, party_size = coalesce(p_party_size,2),
      reservation_time = p_reservation_time, table_id = p_table_id, notes = p_notes
    where id = p_id and restaurant_id = s.restaurant_id;
    v_id := p_id;
  end if;
  return v_id;
end;
$$;


--
-- Name: upsert_station(uuid, uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_station(p_token uuid, p_id uuid, p_name text, p_color text, p_icon text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_id uuid; v_icon text;
begin
  s := _session_check(p_token, 'settings_stations');
  v_icon := coalesce(nullif(p_icon, ''), '🍳');
  if p_id is null then
    insert into stations (restaurant_id, name, color, icon) values (s.restaurant_id, p_name, p_color, v_icon) returning id into v_id;
  else
    update stations set name = p_name, color = p_color, icon = v_icon where id = p_id and restaurant_id = s.restaurant_id;
    v_id := p_id;
  end if;
  return v_id;
end;
$$;


--
-- Name: upsert_supplier(uuid, uuid, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_supplier(p_token uuid, p_id uuid, p_name text, p_phone text, p_email text, p_address text, p_notes text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_id uuid;
begin
  s := _session_check(p_token, 'purchasing_suppliers');
  if p_name is null or trim(p_name)='' then raise exception 'Tedarikçi adı gerekli'; end if;
  if p_id is null then
    insert into suppliers (restaurant_id, name, phone, email, address, notes)
    values (s.restaurant_id, trim(p_name), p_phone, p_email, p_address, p_notes) returning id into v_id;
  else
    update suppliers set name=trim(p_name), phone=p_phone, email=p_email, address=p_address, notes=p_notes
    where id = p_id and restaurant_id = s.restaurant_id;
    v_id := p_id;
  end if;
  return v_id;
end;
$$;


--
-- Name: upsert_table(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_table(p_token uuid, p_id uuid, p_zone_id uuid, p_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_id uuid;
begin
  s := _session_check(p_token, 'settings_zones');
  if not exists(select 1 from zones where id = p_zone_id and restaurant_id = s.restaurant_id) then
    raise exception 'Bölge bulunamadı';
  end if;
  if p_id is null then
    insert into restaurant_tables (restaurant_id, zone_id, name) values (s.restaurant_id, p_zone_id, p_name) returning id into v_id;
  else
    update restaurant_tables set zone_id = p_zone_id, name = p_name where id = p_id and restaurant_id = s.restaurant_id;
    v_id := p_id;
  end if;
  return v_id;
end;
$$;


--
-- Name: upsert_zone(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_zone(p_token uuid, p_id uuid, p_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype; v_id uuid;
begin
  s := _session_check(p_token, 'settings_zones');
  if p_id is null then
    insert into zones (restaurant_id, name) values (s.restaurant_id, p_name) returning id into v_id;
  else
    update zones set name = p_name where id = p_id and restaurant_id = s.restaurant_id;
    v_id := p_id;
  end if;
  return v_id;
end;
$$;


--
-- Name: verify_password_reset(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_password_reset(p_code text, p_username text, p_otp text, p_new_password text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_restaurant restaurants%rowtype;
  v_user app_users%rowtype;
  v_row password_reset_otps%rowtype;
begin
  select r.* into v_restaurant from restaurants r where r.code = p_code;
  if v_restaurant.id is not null then
    select u.* into v_user from app_users u where u.restaurant_id = v_restaurant.id and u.username = p_username;
  end if;
  if v_user.id is null then
    raise exception 'İşletme kodu veya kullanıcı adı hatalı';
  end if;
  if p_new_password is null or length(p_new_password) < 4 then
    raise exception 'Şifre en az 4 karakter olmalı';
  end if;

  select * into v_row from password_reset_otps
    where user_id = v_user.id and verified = false and expires_at > now()
    order by created_at desc limit 1;

  if v_row.id is null then
    raise exception 'Kod isteği bulunamadı veya süresi doldu, tekrar kod isteyin';
  end if;
  if v_row.attempts >= 5 then
    raise exception 'Çok fazla hatalı deneme yaptınız, yeni bir kod isteyin';
  end if;
  if v_row.otp_code <> p_otp then
    update password_reset_otps set attempts = attempts + 1 where id = v_row.id;
    return false;
  end if;

  update password_reset_otps set verified = true where id = v_row.id;
  update app_users set password = crypt(p_new_password, gen_salt('bf')) where id = v_user.id;
  delete from staff_sessions where user_id = v_user.id;
  return true;
end;
$$;


--
-- Name: verify_registration_otp(text, text, text, text, text, text, text, text, text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_registration_otp(p_phone text, p_otp text, p_name text, p_code text, p_package_id text, p_email text, p_admin_username text, p_admin_password text, p_identity_number text DEFAULT NULL::text, p_addons text[] DEFAULT NULL::text[]) RETURNS TABLE(restaurant_id uuid, code text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_otp_row signup_otps%rowtype;
  v_restaurant_id uuid;
  v_max_users int;
  v_pkg_active boolean;
  v_pkg_features text[];
  v_manager_role_id uuid;
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
    return;
  end if;

  if not _valid_tc_kimlik_no(p_identity_number) then
    raise exception 'Geçerli bir T.C. Kimlik Numarası girin';
  end if;

  if lower(coalesce(v_otp_row.email,'')) <> lower(coalesce(p_email,'')) then
    raise exception 'E-posta doğrulama koduyla eşleşmiyor, tekrar kod isteyin';
  end if;
  if _registration_blocked(p_email, p_phone) is not null then
    raise exception '%', _registration_blocked(p_email, p_phone);
  end if;

  update signup_otps set verified = true where id = v_otp_row.id;

  select max_users, active, features into v_max_users, v_pkg_active, v_pkg_features from packages where id = p_package_id;
  if v_max_users is null or not coalesce(v_pkg_active, false) then
    raise exception 'Geçersiz paket';
  end if;

  if exists (select 1 from restaurants r where lower(r.code) = lower(p_code)) then
    raise exception 'Bu işletme kodu zaten kullanılıyor, başka bir kod deneyin';
  end if;

  insert into restaurants (name, code, package_id, max_users, is_active, expires_at, email, phone, billing_identity_number)
  values (p_name, p_code, p_package_id, v_max_users, true, now() + interval '7 days', p_email, p_phone, p_identity_number)
  returning id into v_restaurant_id;

  insert into roles (restaurant_id, name, permissions, is_system)
  values (v_restaurant_id, 'Yönetici',
    (select coalesce(array_agg(f), '{}') from unnest(v_pkg_features) f where f <> 'reports'),
    true)
  returning id into v_manager_role_id;

  insert into roles (restaurant_id, name, permissions, is_system)
  values (v_restaurant_id, 'Garson',
    (select coalesce(array_agg(f), '{}') from unnest(array['order','packages','settings_products','settings_ingredients']) f where f = any(v_pkg_features)),
    false);

  insert into roles (restaurant_id, name, permissions, is_system)
  values (v_restaurant_id, 'Mutfak',
    (select coalesce(array_agg(f), '{}') from unnest(array['kitchen','settings_products','settings_ingredients']) f where f = any(v_pkg_features)),
    false);

  insert into app_users (restaurant_id, username, password, role_ids)
  values (v_restaurant_id, p_admin_username, crypt(p_admin_password, gen_salt('bf')), array[v_manager_role_id]);

  insert into entitlements (restaurant_id, addon_id)
    select distinct v_restaurant_id, fc.id from feature_catalog fc
    where fc.is_addon and fc.active and fc.id = any(coalesce(p_addons, '{}'));

  return query select v_restaurant_id as restaurant_id, p_code as code;
end;
$$;


--
-- Name: verify_reports_password(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_reports_password(p_token uuid, p_password text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype;
  v_is_manager boolean;
  v_hash text;
  v_lock_key text;
  v_recent_failures int;
  v_ok boolean;
begin
  s := _session_check(p_token);
  select exists(
    select 1 from app_users au join roles rl on rl.id = any(au.role_ids)
    where au.id = s.user_id and (rl.is_system or 'reports' = any(rl.permissions))
  ) into v_is_manager;
  if not v_is_manager then
    raise exception 'Bu işlem için yetkiniz yok';
  end if;

  v_lock_key := s.restaurant_id::text;
  select count(*) into v_recent_failures from login_failures
    where restaurant_code = v_lock_key and username = '__reports__' and created_at > now() - interval '15 minutes';
  if v_recent_failures >= 10 then
    raise exception 'Çok fazla hatalı deneme yapıldı, lütfen 15 dakika sonra tekrar deneyin';
  end if;

  select r.reports_password_hash into v_hash from restaurants r where r.id = s.restaurant_id;
  if v_hash is null then
    raise exception 'Finansal analiz şifresi henüz belirlenmedi';
  end if;
  v_ok := (v_hash = crypt(p_password, v_hash));
  if v_ok then
    delete from login_failures where restaurant_code = v_lock_key and username = '__reports__';
  else
    insert into login_failures (restaurant_code, username) values (v_lock_key, '__reports__');
  end if;
  return v_ok;
end;
$$;


--
-- Name: verify_reports_password_reset(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_reports_password_reset(p_token uuid, p_otp text, p_new_password text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  s staff_sessions%rowtype;
  v_is_manager boolean;
  v_row reports_password_reset_otps%rowtype;
begin
  s := _session_check(p_token);
  select exists(
    select 1 from app_users au join roles rl on rl.id = any(au.role_ids)
    where au.id = s.user_id and (rl.is_system or 'reports' = any(rl.permissions))
  ) into v_is_manager;
  if not v_is_manager then
    raise exception 'Bu işlem için yetkiniz yok';
  end if;
  if p_new_password is null or length(p_new_password) < 4 then
    raise exception 'Şifre en az 4 karakter olmalı';
  end if;

  select * into v_row from reports_password_reset_otps
    where restaurant_id = s.restaurant_id and verified = false and expires_at > now()
    order by created_at desc limit 1;

  if v_row.id is null then
    raise exception 'Kod isteği bulunamadı veya süresi doldu, tekrar kod isteyin';
  end if;
  if v_row.attempts >= 5 then
    raise exception 'Çok fazla hatalı deneme yaptınız, yeni bir kod isteyin';
  end if;
  if v_row.otp_code <> p_otp then
    update reports_password_reset_otps set attempts = attempts + 1 where id = v_row.id;
    return false;
  end if;

  update reports_password_reset_otps set verified = true where id = v_row.id;
  update restaurants set reports_password_hash = crypt(p_new_password, gen_salt('bf')) where id = s.restaurant_id;
  return true;
end;
$$;


--
-- Name: verify_restaurant_credentials(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_restaurant_credentials(p_code text, p_username text, p_password text) RETURNS TABLE(restaurant_id uuid, package_id text, restaurant_name text, is_active boolean, expires_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_user app_users%rowtype;
  v_restaurant restaurants%rowtype;
  v_is_manager boolean;
  v_recent_failures int;
begin
  select count(*) into v_recent_failures from login_failures
    where restaurant_code = p_code and username = p_username and created_at > now() - interval '15 minutes';
  if v_recent_failures >= 10 then
    raise exception 'Çok fazla hatalı giriş denemesi yapıldı, lütfen 15 dakika sonra tekrar deneyin';
  end if;

  select r.* into v_restaurant from restaurants r where r.code = p_code;
  if v_restaurant.id is not null then
    select u.* into v_user from app_users u
      where u.restaurant_id = v_restaurant.id and u.username = p_username;
  end if;
  if v_user.id is null or v_user.password is distinct from crypt(p_password, v_user.password) then
    insert into login_failures (restaurant_code, username) values (p_code, p_username);
    return;
  end if;
  delete from login_failures where restaurant_code = p_code and username = p_username;

  select exists(
    select 1 from roles rl where rl.id = any(v_user.role_ids) and rl.is_system
  ) into v_is_manager;
  if not v_is_manager then
    return;
  end if;
  return query select v_restaurant.id, v_restaurant.package_id, v_restaurant.name, v_restaurant.is_active, v_restaurant.expires_at;
end;
$$;


--
-- Name: app_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    username text NOT NULL,
    password text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    role_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    is_company_owner boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT role_ids_len CHECK (((array_length(role_ids, 1) >= 1) AND (array_length(role_ids, 1) <= 2)))
);


--
-- Name: bank_transfer_notices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_transfer_notices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid,
    company_id uuid,
    target_package_id text NOT NULL,
    amount numeric NOT NULL,
    note text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    admin_note text,
    billing_cycle text DEFAULT 'monthly'::text NOT NULL,
    addon_id text,
    CONSTRAINT bank_transfer_notices_billing_cycle_check CHECK ((billing_cycle = ANY (ARRAY['monthly'::text, 'yearly'::text]))),
    CONSTRAINT bank_transfer_notices_check CHECK ((((restaurant_id IS NOT NULL) AND (company_id IS NULL)) OR ((restaurant_id IS NULL) AND (company_id IS NOT NULL)))),
    CONSTRAINT bank_transfer_notices_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: chat_group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_group_members (
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    restaurant_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    name text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_reactions (
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    restaurant_id uuid NOT NULL,
    emoji text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_reads (
    user_id uuid NOT NULL,
    conv text NOT NULL,
    last_read_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_view_once; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_view_once (
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    restaurant_id uuid NOT NULL,
    viewed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: client_errors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_errors (
    id bigint NOT NULL,
    fingerprint text NOT NULL,
    restaurant_id uuid,
    user_id uuid,
    kind text NOT NULL,
    message text NOT NULL,
    source text,
    view text,
    user_agent text,
    url text,
    count integer DEFAULT 1 NOT NULL,
    first_at timestamp with time zone DEFAULT now() NOT NULL,
    last_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved boolean DEFAULT false NOT NULL,
    notified_at timestamp with time zone
);


--
-- Name: client_errors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.client_errors_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: client_errors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.client_errors_id_seq OWNED BY public.client_errors.id;


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text,
    phone text,
    code text NOT NULL,
    password_hash text NOT NULL,
    package_id text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: customer_order_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_order_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    table_id uuid,
    customer_name text,
    items jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    push_notified_at timestamp with time zone,
    order_type text DEFAULT 'dine_in'::text NOT NULL,
    customer_phone text,
    delivery_address text
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    notes text,
    points_balance numeric DEFAULT 0 NOT NULL,
    total_visits integer DEFAULT 0 NOT NULL,
    total_spent numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_visit_at timestamp with time zone,
    birthday date,
    spend_per_point numeric,
    point_value numeric,
    birthday_discount_percent numeric
);


--
-- Name: data_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_versions (
    restaurant_id uuid NOT NULL,
    v bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: deleted_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deleted_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid,
    name text,
    code text,
    email text,
    phone text,
    package_id text,
    created_at timestamp with time zone,
    deleted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: entitlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entitlements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid,
    company_id uuid,
    addon_id text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entitlements_check CHECK ((((restaurant_id IS NOT NULL) AND (company_id IS NULL)) OR ((restaurant_id IS NULL) AND (company_id IS NOT NULL))))
);


--
-- Name: feature_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feature_catalog (
    id text NOT NULL,
    label text NOT NULL,
    description text,
    price numeric DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    category text DEFAULT 'Diğer'::text NOT NULL,
    is_addon boolean DEFAULT true NOT NULL,
    is_core boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT add_ons_id_check CHECK ((id ~ '^[a-z0-9_-]+$'::text))
);


--
-- Name: gift_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gift_cards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    code text NOT NULL,
    initial_balance numeric NOT NULL,
    balance numeric NOT NULL,
    customer_id uuid,
    note text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ingredients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingredients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    name text NOT NULL,
    unit text DEFAULT 'adet'::text NOT NULL,
    stock numeric DEFAULT 0 NOT NULL,
    CONSTRAINT ingredients_stock_nonneg CHECK (((stock IS NULL) OR (stock >= (0)::numeric)))
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    history_id uuid,
    number text NOT NULL,
    email text,
    buyer_name text,
    buyer_tax_number text,
    buyer_tax_office text,
    buyer_address text,
    subtotal numeric DEFAULT 0 NOT NULL,
    discount numeric DEFAULT 0 NOT NULL,
    total numeric DEFAULT 0 NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'emailed'::text NOT NULL,
    efatura_uuid text,
    efatura_error text,
    staff_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invoices_status_check CHECK ((status = ANY (ARRAY['emailed'::text, 'efatura_queued'::text, 'efatura_issued'::text, 'efatura_failed'::text])))
);


--
-- Name: login_failures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_failures (
    id bigint NOT NULL,
    restaurant_code text NOT NULL,
    username text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: login_failures_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.login_failures_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: login_failures_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.login_failures_id_seq OWNED BY public.login_failures.id;


--
-- Name: online_menu_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.online_menu_items (
    restaurant_id uuid NOT NULL,
    section_id uuid NOT NULL,
    product_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: online_menu_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.online_menu_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: order_flag_defs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_flag_defs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    label text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid,
    name text NOT NULL,
    price numeric NOT NULL,
    cost numeric NOT NULL,
    qty integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    note text,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    paid boolean DEFAULT false NOT NULL,
    paid_at timestamp with time zone,
    late_push_notified_at timestamp with time zone
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    table_id uuid,
    kind text DEFAULT 'dine_in'::text NOT NULL,
    label text,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    daily_number integer,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    customer_name text,
    customer_phone text,
    note text,
    created_by uuid,
    ready_sms_sent_at timestamp with time zone,
    reservation_id uuid,
    waitlist_id uuid
);


--
-- Name: packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.packages (
    id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    max_users integer DEFAULT 1 NOT NULL,
    price numeric DEFAULT 0 NOT NULL,
    is_popular boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    features text[] DEFAULT ARRAY['order'::text, 'packages'::text, 'kitchen'::text, 'payments'::text, 'settings_stations'::text, 'settings_zones'::text, 'settings_products'::text, 'settings_ingredients'::text, 'settings_users'::text, 'settings_flags'::text, 'crm'::text, 'reservations'::text, 'purchasing'::text, 'reports'::text] NOT NULL,
    max_branches integer DEFAULT 1 NOT NULL,
    price_yearly numeric,
    included_addons text[] DEFAULT '{}'::text[] NOT NULL
);


--
-- Name: password_reset_otps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_otps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    otp_code text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:10:00'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payment_debug_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_debug_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    context text NOT NULL,
    payload text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    package_id text NOT NULL,
    amount numeric NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    provider_ref text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    promo_code_id uuid,
    promo_code text,
    debug_response text,
    billing_cycle text DEFAULT 'monthly'::text NOT NULL,
    CONSTRAINT payments_billing_cycle_check CHECK ((billing_cycle = ANY (ARRAY['monthly'::text, 'yearly'::text])))
);


--
-- Name: platform_admin_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_admin_sessions (
    token uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '12:00:00'::interval) NOT NULL
);


--
-- Name: platform_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_admins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    password text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_settings (
    key text NOT NULL,
    value text
);


--
-- Name: product_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_images (
    product_id uuid NOT NULL,
    restaurant_id uuid NOT NULL,
    data text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_ingredients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_ingredients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    ingredient_id uuid NOT NULL,
    qty_per_unit numeric NOT NULL
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    station_id uuid,
    name text NOT NULL,
    price numeric DEFAULT 0 NOT NULL,
    cost numeric DEFAULT 0 NOT NULL,
    stock integer,
    available boolean DEFAULT true NOT NULL,
    name_translations jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT products_stock_nonneg CHECK (((stock IS NULL) OR (stock >= 0)))
);


--
-- Name: promo_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promo_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    discount_type text DEFAULT 'percent'::text NOT NULL,
    discount_value numeric NOT NULL,
    max_uses integer,
    used_count integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: public_cart_holds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.public_cart_holds (
    client_id text NOT NULL,
    product_id uuid NOT NULL,
    restaurant_id uuid NOT NULL,
    qty integer NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT public_cart_holds_qty_check CHECK ((qty > 0))
);


--
-- Name: purchase_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    purchase_order_id uuid NOT NULL,
    ingredient_id uuid NOT NULL,
    quantity numeric NOT NULL,
    unit_cost numeric DEFAULT 0 NOT NULL,
    received_quantity numeric DEFAULT 0 NOT NULL
);


--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    supplier_id uuid,
    status text DEFAULT 'draft'::text NOT NULL,
    order_date date DEFAULT CURRENT_DATE NOT NULL,
    expected_date date,
    received_date date,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    restaurant_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text,
    auth text,
    platform text DEFAULT 'web'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    android_channel text
);


--
-- Name: rate_limit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limit_events (
    id bigint NOT NULL,
    bucket text NOT NULL,
    subject text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rate_limit_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rate_limit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rate_limit_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rate_limit_events_id_seq OWNED BY public.rate_limit_events.id;


--
-- Name: reports_password_reset_otps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reports_password_reset_otps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    otp_code text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:10:00'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    customer_name text NOT NULL,
    phone text,
    party_size integer DEFAULT 2 NOT NULL,
    reservation_time timestamp with time zone NOT NULL,
    table_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reminder_sent_at timestamp with time zone,
    seated_at timestamp with time zone,
    closed_at timestamp with time zone
);


--
-- Name: restaurant_tables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.restaurant_tables (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    zone_id uuid NOT NULL,
    name text NOT NULL,
    qr_token uuid DEFAULT gen_random_uuid() NOT NULL,
    pos_x numeric DEFAULT 20 NOT NULL,
    pos_y numeric DEFAULT 20 NOT NULL
);


--
-- Name: restaurants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.restaurants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    package_id text DEFAULT 'paket1'::text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    code text,
    max_users integer DEFAULT 3 NOT NULL,
    email text,
    phone text,
    reports_password_hash text,
    loyalty_enabled boolean DEFAULT false NOT NULL,
    loyalty_spend_per_point numeric DEFAULT 10 NOT NULL,
    loyalty_point_value numeric DEFAULT 1 NOT NULL,
    efatura_provider text,
    efatura_api_key text,
    efatura_enabled boolean DEFAULT false NOT NULL,
    marketplace_yemeksepeti_key text,
    marketplace_trendyol_key text,
    marketplace_getir_key text,
    marketplace_enabled boolean DEFAULT false NOT NULL,
    birthday_discount_percent numeric DEFAULT 0 NOT NULL,
    tip_pool_enabled boolean DEFAULT false NOT NULL,
    tip_pool_mode text DEFAULT 'equal'::text NOT NULL,
    google_review_url text,
    online_ordering_enabled boolean DEFAULT false NOT NULL,
    accounting_provider text,
    accounting_api_key text,
    accounting_enabled boolean DEFAULT false NOT NULL,
    company_id uuid,
    ticket_design jsonb DEFAULT '{}'::jsonb NOT NULL,
    billing_identity_number text,
    invoice_title text,
    tax_number text,
    tax_office text,
    invoice_address text,
    sms_enabled boolean DEFAULT false NOT NULL,
    shift_approval_required boolean DEFAULT true NOT NULL,
    shift_required boolean DEFAULT false NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    name text NOT NULL,
    permissions text[] DEFAULT '{}'::text[] NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sales_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    order_id uuid,
    table_name text,
    subtotal numeric,
    discount_amount numeric DEFAULT 0,
    total numeric NOT NULL,
    cost numeric NOT NULL,
    payment_method text,
    cash_amount numeric DEFAULT 0,
    card_amount numeric DEFAULT 0,
    closed_at timestamp with time zone DEFAULT now() NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    kind text DEFAULT 'dine_in'::text NOT NULL,
    tip_amount numeric DEFAULT 0 NOT NULL,
    points_earned numeric DEFAULT 0 NOT NULL,
    points_redeemed numeric DEFAULT 0 NOT NULL,
    customer_id uuid,
    birthday_discount_amount numeric DEFAULT 0 NOT NULL,
    staff_user_id uuid,
    gift_card_id uuid,
    gift_card_amount numeric DEFAULT 0 NOT NULL
);


--
-- Name: signup_otps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signup_otps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone text NOT NULL,
    email text NOT NULL,
    otp_code text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:10:00'::interval) NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sms_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sms_outbox (
    id bigint NOT NULL,
    restaurant_id uuid,
    phone text NOT NULL,
    message text NOT NULL,
    purpose text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    provider text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    dispatched_at timestamp with time zone,
    CONSTRAINT sms_outbox_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'dispatched'::text, 'no_provider'::text, 'skipped'::text])))
);


--
-- Name: sms_outbox_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sms_outbox_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sms_outbox_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sms_outbox_id_seq OWNED BY public.sms_outbox.id;


--
-- Name: staff_shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_shifts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    clock_in timestamp with time zone DEFAULT now() NOT NULL,
    clock_out timestamp with time zone,
    status text DEFAULT 'approved'::text NOT NULL,
    approved_by uuid,
    ended_by uuid,
    end_requested_at timestamp with time zone
);


--
-- Name: stations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#8b93a3'::text,
    icon text DEFAULT '🍳'::text NOT NULL
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    address text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: waiter_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.waiter_calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    table_id uuid,
    kind text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    done_at timestamp with time zone,
    done_by uuid,
    CONSTRAINT waiter_calls_kind_check CHECK ((kind = ANY (ARRAY['order'::text, 'payment'::text])))
);


--
-- Name: waitlist_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.waitlist_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    customer_name text NOT NULL,
    phone text,
    party_size integer DEFAULT 2 NOT NULL,
    status text DEFAULT 'waiting'::text NOT NULL,
    quoted_wait_minutes integer,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    seated_at timestamp with time zone,
    table_id uuid,
    left_at timestamp with time zone
);


--
-- Name: waste_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.waste_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    order_id uuid,
    order_item_id uuid,
    product_id uuid,
    product_name text NOT NULL,
    qty numeric NOT NULL,
    unit_cost numeric DEFAULT 0 NOT NULL,
    total_cost numeric DEFAULT 0 NOT NULL,
    reason text,
    staff_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    name text NOT NULL
);


--
-- Name: client_errors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_errors ALTER COLUMN id SET DEFAULT nextval('public.client_errors_id_seq'::regclass);


--
-- Name: login_failures id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_failures ALTER COLUMN id SET DEFAULT nextval('public.login_failures_id_seq'::regclass);


--
-- Name: rate_limit_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limit_events ALTER COLUMN id SET DEFAULT nextval('public.rate_limit_events_id_seq'::regclass);


--
-- Name: sms_outbox id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_outbox ALTER COLUMN id SET DEFAULT nextval('public.sms_outbox_id_seq'::regclass);


--
-- Name: feature_catalog add_ons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_catalog
    ADD CONSTRAINT add_ons_pkey PRIMARY KEY (id);


--
-- Name: app_users app_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_pkey PRIMARY KEY (id);


--
-- Name: app_users app_users_restaurant_id_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_restaurant_id_username_key UNIQUE (restaurant_id, username);


--
-- Name: bank_transfer_notices bank_transfer_notices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transfer_notices
    ADD CONSTRAINT bank_transfer_notices_pkey PRIMARY KEY (id);


--
-- Name: bank_transfer_notices btn_amount_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.bank_transfer_notices
    ADD CONSTRAINT btn_amount_chk CHECK ((amount >= (0)::numeric)) NOT VALID;


--
-- Name: chat_group_members chat_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_group_members
    ADD CONSTRAINT chat_group_members_pkey PRIMARY KEY (group_id, user_id);


--
-- Name: chat_groups chat_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_groups
    ADD CONSTRAINT chat_groups_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: chat_reactions chat_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_reactions
    ADD CONSTRAINT chat_reactions_pkey PRIMARY KEY (message_id, user_id, emoji);


--
-- Name: chat_reads chat_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_reads
    ADD CONSTRAINT chat_reads_pkey PRIMARY KEY (user_id, conv);


--
-- Name: chat_view_once chat_view_once_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_view_once
    ADD CONSTRAINT chat_view_once_pkey PRIMARY KEY (message_id, user_id);


--
-- Name: client_errors client_errors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_errors
    ADD CONSTRAINT client_errors_pkey PRIMARY KEY (id);


--
-- Name: companies companies_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_code_key UNIQUE (code);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: company_sessions company_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_sessions
    ADD CONSTRAINT company_sessions_pkey PRIMARY KEY (token);


--
-- Name: customer_order_requests cor_status_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.customer_order_requests
    ADD CONSTRAINT cor_status_chk CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))) NOT VALID;


--
-- Name: customer_order_requests customer_order_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_order_requests
    ADD CONSTRAINT customer_order_requests_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: customers customers_restaurant_id_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_restaurant_id_phone_key UNIQUE (restaurant_id, phone);


--
-- Name: data_versions data_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_versions
    ADD CONSTRAINT data_versions_pkey PRIMARY KEY (restaurant_id);


--
-- Name: deleted_accounts deleted_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deleted_accounts
    ADD CONSTRAINT deleted_accounts_pkey PRIMARY KEY (id);


--
-- Name: entitlements entitlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entitlements
    ADD CONSTRAINT entitlements_pkey PRIMARY KEY (id);


--
-- Name: feature_catalog feature_price_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.feature_catalog
    ADD CONSTRAINT feature_price_chk CHECK ((COALESCE(price, (0)::numeric) >= (0)::numeric)) NOT VALID;


--
-- Name: gift_cards gift_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_cards
    ADD CONSTRAINT gift_cards_pkey PRIMARY KEY (id);


--
-- Name: ingredients ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredients
    ADD CONSTRAINT ingredients_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_restaurant_id_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_restaurant_id_number_key UNIQUE (restaurant_id, number);


--
-- Name: login_failures login_failures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_failures
    ADD CONSTRAINT login_failures_pkey PRIMARY KEY (id);


--
-- Name: online_menu_items online_menu_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_menu_items
    ADD CONSTRAINT online_menu_items_pkey PRIMARY KEY (section_id, product_id);


--
-- Name: online_menu_sections online_menu_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_menu_sections
    ADD CONSTRAINT online_menu_sections_pkey PRIMARY KEY (id);


--
-- Name: order_flag_defs order_flag_defs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_flag_defs
    ADD CONSTRAINT order_flag_defs_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_nonneg_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.order_items
    ADD CONSTRAINT order_items_nonneg_chk CHECK (((qty > 0) AND (price >= (0)::numeric) AND (COALESCE(cost, (0)::numeric) >= (0)::numeric))) NOT VALID;


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_status_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.order_items
    ADD CONSTRAINT order_items_status_chk CHECK ((status = ANY (ARRAY['pending'::text, 'ready'::text]))) NOT VALID;


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: orders orders_status_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.orders
    ADD CONSTRAINT orders_status_chk CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text, 'cancelled'::text]))) NOT VALID;


--
-- Name: packages packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packages
    ADD CONSTRAINT packages_pkey PRIMARY KEY (id);


--
-- Name: packages packages_price_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.packages
    ADD CONSTRAINT packages_price_chk CHECK (((price >= (0)::numeric) AND (COALESCE(price_yearly, (0)::numeric) >= (0)::numeric))) NOT VALID;


--
-- Name: password_reset_otps password_reset_otps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_otps
    ADD CONSTRAINT password_reset_otps_pkey PRIMARY KEY (id);


--
-- Name: payment_debug_log payment_debug_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_debug_log
    ADD CONSTRAINT payment_debug_log_pkey PRIMARY KEY (id);


--
-- Name: payments payments_amount_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.payments
    ADD CONSTRAINT payments_amount_chk CHECK ((amount >= (0)::numeric)) NOT VALID;


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: payments payments_status_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.payments
    ADD CONSTRAINT payments_status_chk CHECK ((status = ANY (ARRAY['pending'::text, 'success'::text, 'failed'::text]))) NOT VALID;


--
-- Name: product_ingredients pi_qty_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.product_ingredients
    ADD CONSTRAINT pi_qty_chk CHECK ((qty_per_unit > (0)::numeric)) NOT VALID;


--
-- Name: platform_admin_sessions platform_admin_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admin_sessions
    ADD CONSTRAINT platform_admin_sessions_pkey PRIMARY KEY (token);


--
-- Name: platform_admins platform_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (id);


--
-- Name: platform_admins platform_admins_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_username_key UNIQUE (username);


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (key);


--
-- Name: purchase_orders po_status_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.purchase_orders
    ADD CONSTRAINT po_status_chk CHECK ((status = ANY (ARRAY['draft'::text, 'ordered'::text, 'received'::text, 'cancelled'::text]))) NOT VALID;


--
-- Name: purchase_order_items poi_nonneg_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.purchase_order_items
    ADD CONSTRAINT poi_nonneg_chk CHECK (((quantity >= (0)::numeric) AND (unit_cost >= (0)::numeric) AND (received_quantity >= (0)::numeric))) NOT VALID;


--
-- Name: product_images product_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_pkey PRIMARY KEY (product_id);


--
-- Name: product_ingredients product_ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_ingredients
    ADD CONSTRAINT product_ingredients_pkey PRIMARY KEY (id);


--
-- Name: product_ingredients product_ingredients_product_id_ingredient_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_ingredients
    ADD CONSTRAINT product_ingredients_product_id_ingredient_id_key UNIQUE (product_id, ingredient_id);


--
-- Name: products products_nonneg_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.products
    ADD CONSTRAINT products_nonneg_chk CHECK (((price >= (0)::numeric) AND (COALESCE(cost, (0)::numeric) >= (0)::numeric))) NOT VALID;


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: promo_codes promo_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_code_key UNIQUE (code);


--
-- Name: promo_codes promo_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_pkey PRIMARY KEY (id);


--
-- Name: promo_codes promo_value_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.promo_codes
    ADD CONSTRAINT promo_value_chk CHECK ((discount_value >= (0)::numeric)) NOT VALID;


--
-- Name: public_cart_holds public_cart_holds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_cart_holds
    ADD CONSTRAINT public_cart_holds_pkey PRIMARY KEY (client_id, product_id);


--
-- Name: purchase_order_items purchase_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: rate_limit_events rate_limit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limit_events
    ADD CONSTRAINT rate_limit_events_pkey PRIMARY KEY (id);


--
-- Name: reports_password_reset_otps reports_password_reset_otps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports_password_reset_otps
    ADD CONSTRAINT reports_password_reset_otps_pkey PRIMARY KEY (id);


--
-- Name: reservations reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_pkey PRIMARY KEY (id);


--
-- Name: reservations reservations_status_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.reservations
    ADD CONSTRAINT reservations_status_chk CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'seated'::text, 'cancelled'::text, 'no_show'::text]))) NOT VALID;


--
-- Name: restaurant_tables restaurant_tables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurant_tables
    ADD CONSTRAINT restaurant_tables_pkey PRIMARY KEY (id);


--
-- Name: restaurants restaurants_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurants
    ADD CONSTRAINT restaurants_code_key UNIQUE (code);


--
-- Name: restaurants restaurants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurants
    ADD CONSTRAINT restaurants_pkey PRIMARY KEY (id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: roles roles_restaurant_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_restaurant_id_name_key UNIQUE (restaurant_id, name);


--
-- Name: sales_history sales_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_history
    ADD CONSTRAINT sales_history_pkey PRIMARY KEY (id);


--
-- Name: signup_otps signup_otps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signup_otps
    ADD CONSTRAINT signup_otps_pkey PRIMARY KEY (id);


--
-- Name: sms_outbox sms_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_outbox
    ADD CONSTRAINT sms_outbox_pkey PRIMARY KEY (id);


--
-- Name: staff_sessions staff_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_sessions
    ADD CONSTRAINT staff_sessions_pkey PRIMARY KEY (token);


--
-- Name: staff_shifts staff_shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_shifts
    ADD CONSTRAINT staff_shifts_pkey PRIMARY KEY (id);


--
-- Name: stations stations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stations
    ADD CONSTRAINT stations_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: waiter_calls waiter_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waiter_calls
    ADD CONSTRAINT waiter_calls_pkey PRIMARY KEY (id);


--
-- Name: waitlist_entries waitlist_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist_entries
    ADD CONSTRAINT waitlist_entries_pkey PRIMARY KEY (id);


--
-- Name: waitlist_entries waitlist_status_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.waitlist_entries
    ADD CONSTRAINT waitlist_status_chk CHECK ((status = ANY (ARRAY['waiting'::text, 'seated'::text, 'cancelled'::text]))) NOT VALID;


--
-- Name: waste_log waste_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waste_log
    ADD CONSTRAINT waste_log_pkey PRIMARY KEY (id);


--
-- Name: waste_log waste_nonneg_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.waste_log
    ADD CONSTRAINT waste_nonneg_chk CHECK (((qty > (0)::numeric) AND (unit_cost >= (0)::numeric) AND (total_cost >= (0)::numeric))) NOT VALID;


--
-- Name: zones zones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zones
    ADD CONSTRAINT zones_pkey PRIMARY KEY (id);


--
-- Name: app_users_restaurant_username_ci_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_users_restaurant_username_ci_key ON public.app_users USING btree (restaurant_id, lower(username));


--
-- Name: chat_messages_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_group ON public.chat_messages USING btree (group_id, created_at DESC) WHERE (group_id IS NOT NULL);


--
-- Name: chat_messages_rest_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_rest_time ON public.chat_messages USING btree (restaurant_id, created_at DESC);


--
-- Name: client_errors_fp; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX client_errors_fp ON public.client_errors USING btree (fingerprint) WHERE (NOT resolved);


--
-- Name: companies_code_ci_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX companies_code_ci_key ON public.companies USING btree (lower(code));


--
-- Name: company_sessions_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_sessions_company_idx ON public.company_sessions USING btree (company_id);


--
-- Name: deleted_accounts_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deleted_accounts_email_idx ON public.deleted_accounts USING btree (lower(email));


--
-- Name: deleted_accounts_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deleted_accounts_phone_idx ON public.deleted_accounts USING btree ("right"(regexp_replace(COALESCE(phone, ''::text), '\D'::text, ''::text, 'g'::text), 10));


--
-- Name: entitlements_unique_company; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX entitlements_unique_company ON public.entitlements USING btree (company_id, addon_id) WHERE (company_id IS NOT NULL);


--
-- Name: entitlements_unique_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX entitlements_unique_restaurant ON public.entitlements USING btree (restaurant_id, addon_id) WHERE (restaurant_id IS NOT NULL);


--
-- Name: gift_cards_restaurant_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX gift_cards_restaurant_code_idx ON public.gift_cards USING btree (restaurant_id, upper(code));


--
-- Name: idx_bank_transfer_notices_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_transfer_notices_company_id ON public.bank_transfer_notices USING btree (company_id);


--
-- Name: idx_bank_transfer_notices_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_transfer_notices_restaurant_id ON public.bank_transfer_notices USING btree (restaurant_id);


--
-- Name: idx_bank_transfer_notices_reviewed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_transfer_notices_reviewed_by ON public.bank_transfer_notices USING btree (reviewed_by);


--
-- Name: idx_companies_package_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_package_id ON public.companies USING btree (package_id);


--
-- Name: idx_customer_order_requests_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_order_requests_restaurant_id ON public.customer_order_requests USING btree (restaurant_id);


--
-- Name: idx_customer_order_requests_table_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_order_requests_table_id ON public.customer_order_requests USING btree (table_id);


--
-- Name: idx_entitlements_addon_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entitlements_addon_id ON public.entitlements USING btree (addon_id);


--
-- Name: idx_gift_cards_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gift_cards_created_by ON public.gift_cards USING btree (created_by);


--
-- Name: idx_gift_cards_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gift_cards_customer_id ON public.gift_cards USING btree (customer_id);


--
-- Name: idx_ingredients_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingredients_restaurant_id ON public.ingredients USING btree (restaurant_id);


--
-- Name: idx_order_flag_defs_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_flag_defs_restaurant_id ON public.order_flag_defs USING btree (restaurant_id);


--
-- Name: idx_order_items_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_order_id ON public.order_items USING btree (order_id);


--
-- Name: idx_order_items_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_product_id ON public.order_items USING btree (product_id);


--
-- Name: idx_orders_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_created_by ON public.orders USING btree (created_by);


--
-- Name: idx_orders_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_restaurant_id ON public.orders USING btree (restaurant_id);


--
-- Name: idx_orders_table_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_table_id ON public.orders USING btree (table_id);


--
-- Name: idx_password_reset_otps_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_otps_restaurant_id ON public.password_reset_otps USING btree (restaurant_id);


--
-- Name: idx_password_reset_otps_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_otps_user_id ON public.password_reset_otps USING btree (user_id);


--
-- Name: idx_payments_promo_code_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_promo_code_id ON public.payments USING btree (promo_code_id);


--
-- Name: idx_payments_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_restaurant_id ON public.payments USING btree (restaurant_id);


--
-- Name: idx_platform_admin_sessions_admin_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_admin_sessions_admin_id ON public.platform_admin_sessions USING btree (admin_id);


--
-- Name: idx_product_ingredients_ingredient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_ingredients_ingredient_id ON public.product_ingredients USING btree (ingredient_id);


--
-- Name: idx_products_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_restaurant_id ON public.products USING btree (restaurant_id);


--
-- Name: idx_products_station_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_station_id ON public.products USING btree (station_id);


--
-- Name: idx_purchase_order_items_ingredient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_order_items_ingredient_id ON public.purchase_order_items USING btree (ingredient_id);


--
-- Name: idx_purchase_order_items_purchase_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_order_items_purchase_order_id ON public.purchase_order_items USING btree (purchase_order_id);


--
-- Name: idx_purchase_orders_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_restaurant_id ON public.purchase_orders USING btree (restaurant_id);


--
-- Name: idx_purchase_orders_supplier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_supplier_id ON public.purchase_orders USING btree (supplier_id);


--
-- Name: idx_push_subscriptions_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_subscriptions_restaurant_id ON public.push_subscriptions USING btree (restaurant_id);


--
-- Name: idx_push_subscriptions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions USING btree (user_id);


--
-- Name: idx_reports_password_reset_otps_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_password_reset_otps_restaurant_id ON public.reports_password_reset_otps USING btree (restaurant_id);


--
-- Name: idx_reservations_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservations_restaurant_id ON public.reservations USING btree (restaurant_id);


--
-- Name: idx_reservations_table_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservations_table_id ON public.reservations USING btree (table_id);


--
-- Name: idx_restaurant_tables_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_restaurant_tables_restaurant_id ON public.restaurant_tables USING btree (restaurant_id);


--
-- Name: idx_restaurant_tables_zone_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_restaurant_tables_zone_id ON public.restaurant_tables USING btree (zone_id);


--
-- Name: idx_sales_history_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_history_customer_id ON public.sales_history USING btree (customer_id);


--
-- Name: idx_sales_history_gift_card_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_history_gift_card_id ON public.sales_history USING btree (gift_card_id);


--
-- Name: idx_sales_history_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_history_restaurant_id ON public.sales_history USING btree (restaurant_id);


--
-- Name: idx_sales_history_staff_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_history_staff_user_id ON public.sales_history USING btree (staff_user_id);


--
-- Name: idx_staff_sessions_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_sessions_restaurant_id ON public.staff_sessions USING btree (restaurant_id);


--
-- Name: idx_staff_sessions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_sessions_user_id ON public.staff_sessions USING btree (user_id);


--
-- Name: idx_stations_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stations_restaurant_id ON public.stations USING btree (restaurant_id);


--
-- Name: idx_suppliers_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_restaurant_id ON public.suppliers USING btree (restaurant_id);


--
-- Name: idx_waitlist_entries_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waitlist_entries_restaurant_id ON public.waitlist_entries USING btree (restaurant_id);


--
-- Name: idx_waste_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waste_log_created_at ON public.waste_log USING btree (created_at);


--
-- Name: idx_waste_log_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waste_log_order_id ON public.waste_log USING btree (order_id);


--
-- Name: idx_waste_log_order_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waste_log_order_item_id ON public.waste_log USING btree (order_item_id);


--
-- Name: idx_waste_log_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waste_log_product_id ON public.waste_log USING btree (product_id);


--
-- Name: idx_waste_log_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waste_log_restaurant_id ON public.waste_log USING btree (restaurant_id);


--
-- Name: idx_waste_log_staff_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waste_log_staff_user_id ON public.waste_log USING btree (staff_user_id);


--
-- Name: idx_zones_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zones_restaurant_id ON public.zones USING btree (restaurant_id);


--
-- Name: invoices_rest_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_rest_idx ON public.invoices USING btree (restaurant_id, created_at DESC);


--
-- Name: login_failures_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX login_failures_lookup_idx ON public.login_failures USING btree (restaurant_code, username, created_at);


--
-- Name: payments_provider_ref_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payments_provider_ref_unique ON public.payments USING btree (provider_ref) WHERE (provider_ref IS NOT NULL);


--
-- Name: public_cart_holds_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX public_cart_holds_product ON public.public_cart_holds USING btree (product_id, expires_at);


--
-- Name: rate_limit_events_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rate_limit_events_idx ON public.rate_limit_events USING btree (bucket, subject, created_at);


--
-- Name: restaurant_tables_qr_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX restaurant_tables_qr_token_idx ON public.restaurant_tables USING btree (qr_token);


--
-- Name: restaurants_code_ci_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX restaurants_code_ci_key ON public.restaurants USING btree (lower(code));


--
-- Name: restaurants_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX restaurants_company_idx ON public.restaurants USING btree (company_id);


--
-- Name: restaurants_email_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX restaurants_email_unique ON public.restaurants USING btree (lower(email)) WHERE (email IS NOT NULL);


--
-- Name: restaurants_phone_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX restaurants_phone_unique ON public.restaurants USING btree (phone) WHERE (phone IS NOT NULL);


--
-- Name: sms_outbox_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sms_outbox_created_idx ON public.sms_outbox USING btree (created_at DESC);


--
-- Name: staff_sessions_last_seen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_sessions_last_seen_idx ON public.staff_sessions USING btree (last_seen_at);


--
-- Name: staff_shifts_restaurant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_shifts_restaurant_idx ON public.staff_shifts USING btree (restaurant_id, clock_in);


--
-- Name: staff_shifts_user_open_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_shifts_user_open_idx ON public.staff_shifts USING btree (user_id) WHERE (clock_out IS NULL);


--
-- Name: waiter_calls_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX waiter_calls_pending ON public.waiter_calls USING btree (restaurant_id) WHERE (status = 'pending'::text);


--
-- Name: app_users trg_bump_dv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_dv AFTER INSERT OR DELETE OR UPDATE ON public.app_users FOR EACH ROW EXECUTE FUNCTION public._bump_data_version();


--
-- Name: chat_group_members trg_bump_dv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_dv AFTER INSERT OR DELETE OR UPDATE ON public.chat_group_members FOR EACH ROW EXECUTE FUNCTION public._bump_data_version();


--
-- Name: chat_groups trg_bump_dv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_dv AFTER INSERT OR DELETE OR UPDATE ON public.chat_groups FOR EACH ROW EXECUTE FUNCTION public._bump_data_version();


--
-- Name: chat_messages trg_bump_dv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_dv AFTER INSERT OR DELETE OR UPDATE ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public._bump_data_version();


--
-- Name: chat_reactions trg_bump_dv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_dv AFTER INSERT OR DELETE OR UPDATE ON public.chat_reactions FOR EACH ROW EXECUTE FUNCTION public._bump_data_version();


--
-- Name: chat_view_once trg_bump_dv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_dv AFTER INSERT OR DELETE OR UPDATE ON public.chat_view_once FOR EACH ROW EXECUTE FUNCTION public._bump_data_version();


--
-- Name: customer_order_requests trg_bump_dv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_dv AFTER INSERT OR DELETE OR UPDATE ON public.customer_order_requests FOR EACH ROW EXECUTE FUNCTION public._bump_data_version();


--
-- Name: customers trg_bump_dv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_dv AFTER INSERT OR DELETE OR UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public._bump_data_version();


--
-- Name: gift_cards trg_bump_dv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_dv AFTER INSERT OR DELETE OR UPDATE ON public.gift_cards FOR EACH ROW EXECUTE FUNCTION public._bump_data_version();


--
-- Name: ingredients trg_bump_dv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_dv AFTER INSERT OR DELETE OR UPDATE ON public.ingredients FOR EACH ROW EXECUTE FUNCTION public._bump_data_version();


--
-- Name: order_items trg_bump_dv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_dv AFTER INSERT OR DELETE OR UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public._bump_data_version();


--
-- Name: orders trg_bump_dv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_dv AFTER INSERT OR DELETE OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public._bump_data_version();


--
-- Name: products trg_bump_dv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_dv AFTER INSERT OR DELETE OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public._bump_data_version();


--
-- Name: purchase_order_items trg_bump_dv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_dv AFTER INSERT OR DELETE OR UPDATE ON public.purchase_order_items FOR EACH ROW EXECUTE FUNCTION public._bump_data_version();


--
-- Name: purchase_orders trg_bump_dv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_dv AFTER INSERT OR DELETE OR UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public._bump_data_version();


--
-- Name: reservations trg_bump_dv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_dv AFTER INSERT OR DELETE OR UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public._bump_data_version();


--
-- Name: restaurant_tables trg_bump_dv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_dv AFTER INSERT OR DELETE OR UPDATE ON public.restaurant_tables FOR EACH ROW EXECUTE FUNCTION public._bump_data_version();


--
-- Name: roles trg_bump_dv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_dv AFTER INSERT OR DELETE OR UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public._bump_data_version();


--
-- Name: sales_history trg_bump_dv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_dv AFTER INSERT OR DELETE OR UPDATE ON public.sales_history FOR EACH ROW EXECUTE FUNCTION public._bump_data_version();


--
-- Name: staff_shifts trg_bump_dv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_dv AFTER INSERT OR DELETE OR UPDATE ON public.staff_shifts FOR EACH ROW EXECUTE FUNCTION public._bump_data_version();


--
-- Name: stations trg_bump_dv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_dv AFTER INSERT OR DELETE OR UPDATE ON public.stations FOR EACH ROW EXECUTE FUNCTION public._bump_data_version();


--
-- Name: suppliers trg_bump_dv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_dv AFTER INSERT OR DELETE OR UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public._bump_data_version();


--
-- Name: waiter_calls trg_bump_dv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_dv AFTER INSERT OR DELETE OR UPDATE ON public.waiter_calls FOR EACH ROW EXECUTE FUNCTION public._bump_data_version();


--
-- Name: waitlist_entries trg_bump_dv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_dv AFTER INSERT OR DELETE OR UPDATE ON public.waitlist_entries FOR EACH ROW EXECUTE FUNCTION public._bump_data_version();


--
-- Name: waste_log trg_bump_dv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_dv AFTER INSERT OR DELETE OR UPDATE ON public.waste_log FOR EACH ROW EXECUTE FUNCTION public._bump_data_version();


--
-- Name: zones trg_bump_dv; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bump_dv AFTER INSERT OR DELETE OR UPDATE ON public.zones FOR EACH ROW EXECUTE FUNCTION public._bump_data_version();


--
-- Name: restaurants trg_record_deleted_restaurant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_record_deleted_restaurant BEFORE DELETE ON public.restaurants FOR EACH ROW EXECUTE FUNCTION public._record_deleted_restaurant();


--
-- Name: reservations trg_reservation_sms; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reservation_sms AFTER UPDATE OF status ON public.reservations FOR EACH ROW EXECUTE FUNCTION public._trg_reservation_sms();


--
-- Name: order_items trg_takeaway_ready_sms; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_takeaway_ready_sms AFTER UPDATE OF status ON public.order_items FOR EACH ROW EXECUTE FUNCTION public._trg_takeaway_ready_sms();


--
-- Name: app_users app_users_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: bank_transfer_notices bank_transfer_notices_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transfer_notices
    ADD CONSTRAINT bank_transfer_notices_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: bank_transfer_notices bank_transfer_notices_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transfer_notices
    ADD CONSTRAINT bank_transfer_notices_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: bank_transfer_notices bank_transfer_notices_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transfer_notices
    ADD CONSTRAINT bank_transfer_notices_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.platform_admins(id);


--
-- Name: chat_group_members chat_group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_group_members
    ADD CONSTRAINT chat_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.chat_groups(id) ON DELETE CASCADE;


--
-- Name: chat_group_members chat_group_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_group_members
    ADD CONSTRAINT chat_group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id);


--
-- Name: chat_groups chat_groups_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_groups
    ADD CONSTRAINT chat_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_users(id);


--
-- Name: chat_groups chat_groups_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_groups
    ADD CONSTRAINT chat_groups_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id);


--
-- Name: chat_messages chat_messages_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.chat_groups(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.app_users(id);


--
-- Name: chat_messages chat_messages_reply_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_reply_to_fkey FOREIGN KEY (reply_to) REFERENCES public.chat_messages(id) ON DELETE SET NULL;


--
-- Name: chat_messages chat_messages_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id);


--
-- Name: chat_messages chat_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.app_users(id);


--
-- Name: chat_reactions chat_reactions_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_reactions
    ADD CONSTRAINT chat_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE CASCADE;


--
-- Name: chat_reactions chat_reactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_reactions
    ADD CONSTRAINT chat_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id);


--
-- Name: chat_reads chat_reads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_reads
    ADD CONSTRAINT chat_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id);


--
-- Name: chat_view_once chat_view_once_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_view_once
    ADD CONSTRAINT chat_view_once_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE CASCADE;


--
-- Name: chat_view_once chat_view_once_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_view_once
    ADD CONSTRAINT chat_view_once_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id);


--
-- Name: companies companies_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id);


--
-- Name: company_sessions company_sessions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_sessions
    ADD CONSTRAINT company_sessions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: customer_order_requests customer_order_requests_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_order_requests
    ADD CONSTRAINT customer_order_requests_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: customer_order_requests customer_order_requests_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_order_requests
    ADD CONSTRAINT customer_order_requests_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.restaurant_tables(id) ON DELETE CASCADE;


--
-- Name: customers customers_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: entitlements entitlements_addon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entitlements
    ADD CONSTRAINT entitlements_addon_id_fkey FOREIGN KEY (addon_id) REFERENCES public.feature_catalog(id) ON DELETE CASCADE;


--
-- Name: entitlements entitlements_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entitlements
    ADD CONSTRAINT entitlements_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: entitlements entitlements_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entitlements
    ADD CONSTRAINT entitlements_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: gift_cards gift_cards_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_cards
    ADD CONSTRAINT gift_cards_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_users(id) ON DELETE SET NULL;


--
-- Name: gift_cards gift_cards_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_cards
    ADD CONSTRAINT gift_cards_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: gift_cards gift_cards_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_cards
    ADD CONSTRAINT gift_cards_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: ingredients ingredients_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingredients
    ADD CONSTRAINT ingredients_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_history_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_history_id_fkey FOREIGN KEY (history_id) REFERENCES public.sales_history(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: online_menu_items online_menu_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_menu_items
    ADD CONSTRAINT online_menu_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: online_menu_items online_menu_items_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_menu_items
    ADD CONSTRAINT online_menu_items_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id);


--
-- Name: online_menu_items online_menu_items_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_menu_items
    ADD CONSTRAINT online_menu_items_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.online_menu_sections(id) ON DELETE CASCADE;


--
-- Name: online_menu_sections online_menu_sections_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.online_menu_sections
    ADD CONSTRAINT online_menu_sections_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id);


--
-- Name: order_flag_defs order_flag_defs_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_flag_defs
    ADD CONSTRAINT order_flag_defs_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: orders orders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_users(id) ON DELETE SET NULL;


--
-- Name: orders orders_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: orders orders_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.restaurant_tables(id);


--
-- Name: password_reset_otps password_reset_otps_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_otps
    ADD CONSTRAINT password_reset_otps_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: password_reset_otps password_reset_otps_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_otps
    ADD CONSTRAINT password_reset_otps_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: payments payments_promo_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_promo_code_id_fkey FOREIGN KEY (promo_code_id) REFERENCES public.promo_codes(id);


--
-- Name: payments payments_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: platform_admin_sessions platform_admin_sessions_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admin_sessions
    ADD CONSTRAINT platform_admin_sessions_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.platform_admins(id) ON DELETE CASCADE;


--
-- Name: product_images product_images_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_images product_images_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id);


--
-- Name: product_ingredients product_ingredients_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_ingredients
    ADD CONSTRAINT product_ingredients_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id) ON DELETE CASCADE;


--
-- Name: product_ingredients product_ingredients_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_ingredients
    ADD CONSTRAINT product_ingredients_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: products products_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: products products_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id);


--
-- Name: public_cart_holds public_cart_holds_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_cart_holds
    ADD CONSTRAINT public_cart_holds_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: purchase_order_items purchase_order_items_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id) DEFERRABLE INITIALLY DEFERRED NOT VALID;


--
-- Name: purchase_order_items purchase_order_items_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;


--
-- Name: purchase_orders purchase_orders_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: purchase_orders purchase_orders_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: push_subscriptions push_subscriptions_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: reports_password_reset_otps reports_password_reset_otps_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports_password_reset_otps
    ADD CONSTRAINT reports_password_reset_otps_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: reservations reservations_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: reservations reservations_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.restaurant_tables(id) ON DELETE SET NULL;


--
-- Name: restaurant_tables restaurant_tables_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurant_tables
    ADD CONSTRAINT restaurant_tables_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: restaurant_tables restaurant_tables_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurant_tables
    ADD CONSTRAINT restaurant_tables_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.zones(id) ON DELETE CASCADE;


--
-- Name: restaurants restaurants_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurants
    ADD CONSTRAINT restaurants_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: roles roles_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: sales_history sales_history_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_history
    ADD CONSTRAINT sales_history_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: sales_history sales_history_gift_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_history
    ADD CONSTRAINT sales_history_gift_card_id_fkey FOREIGN KEY (gift_card_id) REFERENCES public.gift_cards(id) ON DELETE SET NULL;


--
-- Name: sales_history sales_history_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_history
    ADD CONSTRAINT sales_history_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: sales_history sales_history_staff_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_history
    ADD CONSTRAINT sales_history_staff_user_id_fkey FOREIGN KEY (staff_user_id) REFERENCES public.app_users(id) ON DELETE SET NULL;


--
-- Name: sms_outbox sms_outbox_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_outbox
    ADD CONSTRAINT sms_outbox_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: staff_sessions staff_sessions_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_sessions
    ADD CONSTRAINT staff_sessions_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: staff_sessions staff_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_sessions
    ADD CONSTRAINT staff_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: staff_shifts staff_shifts_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_shifts
    ADD CONSTRAINT staff_shifts_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: staff_shifts staff_shifts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_shifts
    ADD CONSTRAINT staff_shifts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: stations stations_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stations
    ADD CONSTRAINT stations_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: suppliers suppliers_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: waiter_calls waiter_calls_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waiter_calls
    ADD CONSTRAINT waiter_calls_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON UPDATE CASCADE;


--
-- Name: waiter_calls waiter_calls_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waiter_calls
    ADD CONSTRAINT waiter_calls_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.restaurant_tables(id);


--
-- Name: waitlist_entries waitlist_entries_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist_entries
    ADD CONSTRAINT waitlist_entries_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: waste_log waste_log_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waste_log
    ADD CONSTRAINT waste_log_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: waste_log waste_log_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waste_log
    ADD CONSTRAINT waste_log_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE SET NULL;


--
-- Name: waste_log waste_log_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waste_log
    ADD CONSTRAINT waste_log_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: waste_log waste_log_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waste_log
    ADD CONSTRAINT waste_log_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: waste_log waste_log_staff_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waste_log
    ADD CONSTRAINT waste_log_staff_user_id_fkey FOREIGN KEY (staff_user_id) REFERENCES public.app_users(id) ON DELETE SET NULL;


--
-- Name: zones zones_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zones
    ADD CONSTRAINT zones_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: app_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

--
-- Name: bank_transfer_notices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bank_transfer_notices ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_group_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_group_members ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_reactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_reads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_reads ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_view_once; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_view_once ENABLE ROW LEVEL SECURITY;

--
-- Name: client_errors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;

--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: company_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_order_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_order_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: data_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.data_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: deleted_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deleted_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: entitlements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;

--
-- Name: feature_catalog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feature_catalog ENABLE ROW LEVEL SECURITY;

--
-- Name: gift_cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY;

--
-- Name: ingredients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: login_failures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.login_failures ENABLE ROW LEVEL SECURITY;

--
-- Name: online_menu_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.online_menu_items ENABLE ROW LEVEL SECURITY;

--
-- Name: online_menu_sections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.online_menu_sections ENABLE ROW LEVEL SECURITY;

--
-- Name: order_flag_defs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_flag_defs ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: packages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;

--
-- Name: password_reset_otps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.password_reset_otps ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_debug_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_debug_log ENABLE ROW LEVEL SECURITY;

--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_admin_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_admin_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: product_images; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

--
-- Name: product_ingredients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_ingredients ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: promo_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: public_cart_holds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.public_cart_holds ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: rate_limit_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;

--
-- Name: reports_password_reset_otps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reports_password_reset_otps ENABLE ROW LEVEL SECURITY;

--
-- Name: reservations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

--
-- Name: restaurant_tables; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;

--
-- Name: restaurants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;

--
-- Name: roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_history ENABLE ROW LEVEL SECURITY;

--
-- Name: signup_otps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.signup_otps ENABLE ROW LEVEL SECURITY;

--
-- Name: sms_outbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sms_outbox ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_shifts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff_shifts ENABLE ROW LEVEL SECURITY;

--
-- Name: stations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: waiter_calls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.waiter_calls ENABLE ROW LEVEL SECURITY;

--
-- Name: waitlist_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: waste_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.waste_log ENABLE ROW LEVEL SECURITY;

--
-- Name: zones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


