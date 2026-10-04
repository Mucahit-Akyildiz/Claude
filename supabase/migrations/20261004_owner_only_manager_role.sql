-- İşletme sahibi: Yönetici (sistem) rolü yalnızca kayıt olan kullanıcıda olur.
create or replace function public._is_owner(p_user uuid) returns boolean language sql stable security definer set search_path to 'public','pg_temp' as $f$
  select exists(select 1 from app_users au join roles rl on rl.id = any(au.role_ids) where au.id = p_user and rl.is_system);
$f$;
-- Sahibe ait hesap üzerinde yalnızca sahibin kendisi işlem yapabilir.
create or replace function public._guard_owner_target(p_caller uuid, p_target uuid) returns void language plpgsql stable security definer set search_path to 'public','pg_temp' as $f$
begin
  if _is_owner(p_target) and p_caller <> p_target then raise exception 'İşletme sahibinin hesabında değişiklik yapılamaz'; end if;
end; $f$;

create or replace function public.create_staff_user(p_token uuid, p_username text, p_password text, p_role_ids uuid[]) returns uuid language plpgsql security definer set search_path to 'public','extensions','pg_temp' as $f$
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
end; $f$;

create or replace function public.update_staff_user(p_token uuid, p_user_id uuid, p_username text default null, p_password text default null, p_role_ids uuid[] default null) returns void language plpgsql security definer set search_path to 'public','extensions','pg_temp' as $f$
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
end; $f$;

create or replace function public.delete_staff_user(p_token uuid, p_user_id uuid) returns void language plpgsql security definer set search_path to 'public','extensions','pg_temp' as $f$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'settings_users');
  if _is_owner(p_user_id) then raise exception 'İşletme sahibinin hesabı silinemez'; end if;
  delete from app_users where id = p_user_id and restaurant_id = s.restaurant_id;
end; $f$;

create or replace function public.set_staff_user_active(p_token uuid, p_user_id uuid, p_active boolean) returns void language plpgsql security definer set search_path to 'public','extensions','pg_temp' as $f$
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
end; $f$;
-- Her işletmede Yönetici rolü yalnızca en eski (kayıt olan) kullanıcıda kalır; diğerleri "Tam Yetkili" role taşınır.
do $m$
declare r record; v_role uuid; v_sys uuid; v_owner uuid;
begin
  for r in select distinct au.restaurant_id from app_users au join roles rl on rl.id = any(au.role_ids) and rl.is_system
           group by au.restaurant_id having count(distinct au.id) > 1 loop
    select id into v_sys from roles where restaurant_id = r.restaurant_id and is_system limit 1;
    select au.id into v_owner from app_users au where au.restaurant_id = r.restaurant_id and v_sys = any(au.role_ids)
      order by au.is_company_owner desc, au.created_at limit 1;
    select id into v_role from roles where restaurant_id = r.restaurant_id and name = 'Tam Yetkili' and not is_system;
    if v_role is null then
      insert into roles (restaurant_id, name, is_system, permissions)
        values (r.restaurant_id, 'Tam Yetkili', false, (select array_agg(x->>'id') from json_array_elements(_role_permission_catalog(r.restaurant_id)) x))
        returning id into v_role;
    end if;
    update app_users set role_ids = array_replace(role_ids, v_sys, v_role)
      where restaurant_id = r.restaurant_id and v_sys = any(role_ids) and id <> v_owner;
    update app_users set role_ids = array(select distinct unnest(role_ids)) where restaurant_id = r.restaurant_id;
  end loop;
end $m$;
