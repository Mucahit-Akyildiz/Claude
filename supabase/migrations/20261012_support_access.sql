-- Peyktan destek erişimi (işletme izni ile, süreli, kayıtlı).
-- Canlıda uygulandı. Ayrıca: save_push_subscription / save_fcm_token destek oturumunda
-- (s.is_support) hiçbir şey kaydetmez; login_staff yöneticinin girişiyle destek oturumunu düşürmez
-- (update staff_sessions ... and not ss.is_support).
alter table public.restaurants add column if not exists support_access_until timestamptz;
alter table public.staff_sessions add column if not exists is_support boolean not null default false;
create table if not exists public.support_access_log(
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  admin_name text, started_at timestamptz not null default now(), expires_at timestamptz, session_token uuid);
alter table public.support_access_log enable row level security;
revoke all on public.support_access_log from anon, authenticated;

create or replace function public._is_manager(p_user uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(bool_or(rl.is_system), false) from app_users u join roles rl on rl.id = any(u.role_ids) where u.id = p_user;
$$;
revoke all on function public._is_manager(uuid) from public, anon, authenticated;

create or replace function public.set_support_access(p_token uuid, p_hours int)
returns timestamptz language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff_sessions%rowtype; v_until timestamptz;
begin
  s := _session_check(p_token, null);
  if s.is_support or not _is_manager(s.user_id) then raise exception 'Bu işlemi yalnızca işletme yöneticisi yapabilir'; end if;
  if coalesce(p_hours, 0) <= 0 then
    update restaurants set support_access_until = null where id = s.restaurant_id;
    update staff_sessions set expires_at = now() where restaurant_id = s.restaurant_id and is_support and expires_at > now();
    return null;
  end if;
  v_until := now() + make_interval(hours => least(p_hours, 72));
  update restaurants set support_access_until = v_until where id = s.restaurant_id;
  return v_until;
end $$;

create or replace function public.get_support_access(p_token uuid)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, null);
  return json_build_object(
    'until', (select case when support_access_until > now() then support_access_until end from restaurants where id = s.restaurant_id),
    'log', coalesce((select json_agg(json_build_object('admin', admin_name, 'at', started_at, 'until', expires_at) order by started_at desc)
                     from (select * from support_access_log where restaurant_id = s.restaurant_id order by started_at desc limit 20) l), '[]'::json));
end $$;

create or replace function public.admin_support_allowed(p_token uuid)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform _platform_admin_check(p_token);
  return coalesce((select json_object_agg(id, support_access_until) from restaurants where support_access_until > now()), '{}'::json);
end $$;

create or replace function public.admin_start_support_session(p_token uuid, p_restaurant_id uuid)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_admin uuid; v_admin_name text; r restaurants%rowtype; v_user app_users%rowtype; v_token uuid; v_exp timestamptz;
  v_roles text[]; v_perms text[];
begin
  v_admin := _platform_admin_check(p_token);
  select coalesce(to_jsonb(pa)->>'username', to_jsonb(pa)->>'email', 'Platform yöneticisi') into v_admin_name from platform_admins pa where pa.id = v_admin;
  select * into r from restaurants where id = p_restaurant_id;
  if r.id is null then raise exception 'İşletme bulunamadı'; end if;
  if r.support_access_until is null or r.support_access_until <= now() then
    raise exception 'Bu işletme destek erişimine izin vermemiş. İşletme sahibi Ayarlar > Destek Erişimi bölümünden izin vermeli.';
  end if;
  select u.* into v_user from app_users u where u.restaurant_id = r.id and coalesce(u.is_active, true) and _is_manager(u.id) order by u.created_at limit 1;
  if v_user.id is null then raise exception 'İşletmede aktif yönetici kullanıcı yok'; end if;
  select coalesce(array_agg(distinct rl.name), '{}') into v_roles from roles rl where rl.id = any(v_user.role_ids);
  select coalesce(array_agg(distinct p), '{}') into v_perms from roles rl left join lateral unnest(rl.permissions) p on true where rl.id = any(v_user.role_ids) and p is not null;
  v_exp := least(now() + interval '1 hour', r.support_access_until);
  insert into staff_sessions(user_id, restaurant_id, username, expires_at, is_support)
    values (v_user.id, r.id, 'Peyktan Destek', v_exp, true) returning token into v_token;
  insert into support_access_log(restaurant_id, admin_name, expires_at, session_token) values (r.id, v_admin_name, v_exp, v_token);
  return json_build_object('session_token', v_token, 'user_id', v_user.id, 'restaurant_id', r.id, 'role_names', v_roles,
    'permissions', v_perms, 'is_manager', true, 'restaurant_name', r.name, 'expires_at', v_exp);
end $$;
revoke all on function public.set_support_access(uuid,int), public.get_support_access(uuid), public.admin_support_allowed(uuid), public.admin_start_support_session(uuid,uuid) from public;
grant execute on function public.set_support_access(uuid,int), public.get_support_access(uuid), public.admin_support_allowed(uuid), public.admin_start_support_session(uuid,uuid) to anon, authenticated;
