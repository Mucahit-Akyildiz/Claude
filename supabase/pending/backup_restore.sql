-- 1) Veri sıfırlamaya eksik kalan işlem verileri
do $$ declare d text; add text; begin
select pg_get_functiondef('public.reset_restaurant_data_ts(uuid,text,timestamp,timestamp,text[])'::regprocedure) into d;
if position('cash_counts' in d) > 0 then return; end if;
d := replace(d, $r$    delete from sms_outbox where restaurant_id = s.restaurant_id and created_at >= v_start and created_at < v_end;$r$,
$r$    delete from sms_outbox where restaurant_id = s.restaurant_id and created_at >= v_start and created_at < v_end;
    delete from kitchen_cancellations where restaurant_id = s.restaurant_id and created_at >= v_start and created_at < v_end;
    delete from promotion_uses where restaurant_id = s.restaurant_id and created_at >= v_start and created_at < v_end;
    delete from online_payments where restaurant_id = s.restaurant_id and coalesce(status,'') <> 'pending' and created_at >= v_start and created_at < v_end;$r$);
add := $a$
  if 'cash_counts' = any(p_categories) then
    delete from cash_counts where restaurant_id = s.restaurant_id and created_at >= v_start and created_at < v_end;
    get diagnostics v_n = row_count; v_res := v_res || jsonb_build_object('cash_counts', v_n);
  end if;
  if 'reviews' = any(p_categories) then
    delete from reviews where restaurant_id = s.restaurant_id and created_at >= v_start and created_at < v_end;
    get diagnostics v_n = row_count; v_res := v_res || jsonb_build_object('reviews', v_n);
  end if;
  if 'notifications' = any(p_categories) then
    delete from notification_log where restaurant_id = s.restaurant_id and created_at >= v_start and created_at < v_end;
    get diagnostics v_n = row_count; v_res := v_res || jsonb_build_object('notifications', v_n);
    delete from client_errors where restaurant_id = s.restaurant_id and last_at >= v_start and last_at < v_end;
  end if;
  return json_build_object('ok', true, 'removed', v_res);$a$;
d := replace(d, $r$  return json_build_object('ok', true, 'removed', v_res);$r$, add);
if position('kitchen_cancellations' in d) = 0 or position('notification_log' in d) = 0 then raise exception 'anchor'; end if;
execute d; end $$;

-- 2) Yedekten geri yükleme: tek işlem, tetikleyiciler/FK kapalı (SMS vb. tekrar gitmez),
--    restaurant_id her satırda oturumun işletmesine zorlanır; şifreler korunur.
create or replace function public.import_restaurant_backup(p_token uuid, p_password text, p_backup jsonb)
returns jsonb language plpgsql security definer set search_path to 'public','extensions','pg_temp' as $$
declare s staff_sessions%rowtype; v_user app_users%rowtype; v_code text; v_fail int; t text; v_rows jsonb;
  v_cols text; v_upd text; v_n int; v_res jsonb := '{}'::jsonb;
  v_tables text[] := array['menus','stations','products','product_images','ingredients','zones','restaurant_tables','roles','app_users',
    'order_flag_defs','customers','suppliers','purchase_orders','orders','sales_history','invoices','open_accounts','open_account_entries',
    'gift_cards','promotions','promotion_uses','reservations','waitlist_entries','staff_shifts','cash_counts','waste_log','kitchen_cancellations',
    'allowances','reviews','online_menu_sections','online_menu_items','customer_order_requests','waiter_calls','audit_log'];
begin
  s := _session_check(p_token);
  if not exists(select 1 from app_users au join roles rl on rl.id = any(au.role_ids) where au.id = s.user_id and (rl.is_system or 'settings_datareset' = any(rl.permissions))) then
    raise exception 'Yedeği yalnızca Yönetici yükleyebilir'; end if;
  select * into v_user from app_users where id = s.user_id;
  select code into v_code from restaurants where id = s.restaurant_id;
  select count(*) into v_fail from login_failures where restaurant_code = v_code and username = v_user.username and created_at > now() - interval '15 minutes';
  if v_fail >= 10 then raise exception 'Çok fazla hatalı deneme yapıldı, lütfen 15 dakika sonra tekrar deneyin'; end if;
  if v_user.password is distinct from crypt(coalesce(p_password,''), v_user.password) then
    insert into login_failures (restaurant_code, username) values (v_code, v_user.username);
    raise exception 'Şifre hatalı'; end if;
  if p_backup->>'format' is distinct from 'peyktan-backup' then raise exception 'Bu dosya bir Peyktan yedeği değil'; end if;
  if (p_backup->'restaurant'->>'id') is distinct from s.restaurant_id::text then raise exception 'Bu yedek başka bir işletmeye ait'; end if;

  perform set_config('session_replication_role', 'replica', true);
  foreach t in array v_tables loop
    v_rows := p_backup->'tables'->t;
    continue when v_rows is null or jsonb_typeof(v_rows) <> 'array' or jsonb_array_length(v_rows) = 0;
    -- yalnızca hem yedekte hem tabloda olan sütunlar (şifre vb. yedekte yok → dokunulmaz)
    select string_agg(quote_ident(c.column_name), ',' order by c.ordinal_position),
           string_agg(format('%1$I = excluded.%1$I', c.column_name), ',' order by c.ordinal_position) filter (where c.column_name not in ('id','restaurant_id'))
      into v_cols, v_upd
      from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = t and c.is_generated = 'NEVER'
       and exists(select 1 from jsonb_object_keys(v_rows->0) k where k = c.column_name);
    continue when v_cols is null;
    if t = 'app_users' then
      execute format($q$insert into app_users (%1$s, password)
        select %1$s, crypt(gen_random_uuid()::text, gen_salt('bf')) from jsonb_populate_recordset(null::app_users, $1) x where x.restaurant_id = $2
        on conflict (id) do update set %2$s$q$, v_cols, v_upd)
        using v_rows, s.restaurant_id;
    else
      execute format($q$insert into %1$I (%2$s) select %2$s from jsonb_populate_recordset(null::%1$I, $1) x where x.restaurant_id = $2
        on conflict (id) do %3$s$q$, t, v_cols, case when v_upd is null then 'nothing' else 'update set ' || v_upd end)
        using v_rows, s.restaurant_id;
    end if;
    get diagnostics v_n = row_count; v_res := v_res || jsonb_build_object(t, v_n);
  end loop;
  perform set_config('session_replication_role', 'origin', true);
  insert into audit_log(restaurant_id, user_id, entity, action, label) values (s.restaurant_id, s.user_id, 'backup', 'restore', 'Yedek geri yüklendi');
  return jsonb_build_object('ok', true, 'restored', v_res);
end $$;
revoke all on function public.import_restaurant_backup(uuid,text,jsonb) from public;
grant execute on function public.import_restaurant_backup(uuid,text,jsonb) to anon, authenticated;
