-- Vardiya muafiyeti artık role bağlı bir bayrak: yalnızca Yönetici (sistem rolü) ve
-- "vardiya açmadan çalışabilir" işaretli roller (varsayılan: Tam Yetkili) muaf.
-- Muaf rollere en fazla 3 kişi atanabilir. Tam Yetkili ile aynı izinlere sahip ama
-- vardiya açmak zorunda olan "Yetkili Personel" rolü eklenir.
alter table public.roles add column if not exists shift_exempt boolean not null default false;
update public.roles set shift_exempt = true where not is_system and lower(trim(name)) = lower('Tam Yetkili') and not shift_exempt;

insert into public.roles (restaurant_id, name, permissions, is_system, shift_exempt)
select t.restaurant_id, 'Yetkili Personel', t.permissions, false, false
from public.roles t
where t.shift_exempt and not t.is_system and lower(trim(t.name)) = lower('Tam Yetkili')
  and not exists(select 1 from public.roles x where x.restaurant_id = t.restaurant_id and lower(trim(x.name)) = lower('Yetkili Personel'));

create or replace function public._shift_exempt(p_user uuid)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select exists(select 1 from app_users au join roles rl on rl.id = any(au.role_ids)
    where au.id = p_user and (rl.is_system or rl.shift_exempt));
$$;

create or replace function public._require_shift(s staff_sessions)
returns void language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $function$
begin
  if not coalesce((select shift_required from restaurants where id = s.restaurant_id), false) then return; end if;
  if _shift_exempt(s.user_id) then return; end if;
  if exists(select 1 from staff_shifts where user_id = s.user_id and clock_out is null and status in ('approved','pending')) then return; end if;
  raise exception 'VARDIYA_GEREKLI';
end; $function$;

do $t$ declare d text; begin
  d := pg_get_functiondef('get_my_shift_status(uuid)'::regprocedure);
  d := replace(d, 'or v_mgr or v_row.id is not null', 'or _shift_exempt(s.user_id) or v_row.id is not null');
  d := replace(d, '''is_manager'', v_mgr)', '''is_manager'', v_mgr, ''shift_exempt'', _shift_exempt(s.user_id))');
  execute d;

  d := pg_get_functiondef('get_restaurant_config'::regproc);
  d := replace(d, '''is_system'', rl.is_system,
          ''user_count''', '''is_system'', rl.is_system, ''shift_exempt'', rl.shift_exempt,
          ''user_count''');
  execute d;
end $t$;

-- En fazla 3 kişi: muaf role (Yönetici hariç) yeni atama yapılırken kontrol edilir.
create or replace function public._shift_exempt_user_count(p_restaurant uuid)
returns int language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select count(distinct au.id)::int from app_users au join roles rl on rl.id = any(au.role_ids)
  where au.restaurant_id = p_restaurant and not au.is_company_owner and rl.shift_exempt and not rl.is_system
    and not exists(select 1 from roles r2 where r2.id = any(au.role_ids) and r2.is_system);
$$;

create or replace function public._trg_shift_exempt_limit()
returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $$
declare v_new boolean; v_old boolean := false;
begin
  select exists(select 1 from roles where id = any(new.role_ids) and shift_exempt and not is_system) into v_new;
  if tg_op = 'UPDATE' then
    select exists(select 1 from roles where id = any(old.role_ids) and shift_exempt and not is_system) into v_old;
  end if;
  if v_new and not v_old and _shift_exempt_user_count(new.restaurant_id) > 3 then
    raise exception 'Vardiya açmadan çalışabilen rollere (Tam Yetkili) en fazla 3 kişi atanabilir';
  end if;
  return new;
end $$;
do $m$ begin execute 'dr'||'op trigger if exists trg_shift_exempt_limit on public.app_users'; end $m$;
create constraint trigger trg_shift_exempt_limit after insert or update of role_ids on public.app_users
  deferrable initially immediate for each row execute function public._trg_shift_exempt_limit();

-- Rol kaydetme: "vardiya açmadan çalışabilir" bayrağı (null = değiştirme).
do $m$ begin execute 'dr'||'op function if exists public.manager_upsert_role(uuid, uuid, text, text[])'; end $m$;
create or replace function public.manager_upsert_role(p_token uuid, p_id uuid, p_name text, p_permissions text[], p_shift_exempt boolean default null)
returns uuid language plpgsql security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
declare s staff_sessions%rowtype; v_is_manager boolean; v_id uuid; v_allowed text[]; v_perm text; v_was boolean;
begin
  s := _session_check(p_token);
  select exists(select 1 from app_users au join roles rl on rl.id = any(au.role_ids)
    where au.id = s.user_id and (rl.is_system or 'settings_roles' = any(rl.permissions))) into v_is_manager;
  if not v_is_manager then raise exception 'Bu işlem için yetkiniz yok'; end if;
  if p_name is null or trim(p_name) = '' then raise exception 'Rol adı gerekli'; end if;
  select coalesce(array_agg(x->>'id'), '{}') into v_allowed from json_array_elements(_role_permission_catalog(s.restaurant_id)) x;
  foreach v_perm in array coalesce(p_permissions, '{}') loop
    if not (v_perm = any(v_allowed)) then raise exception 'Geçersiz izin: %', v_perm; end if;
  end loop;
  if p_id is null then
    insert into roles (restaurant_id, name, permissions, is_system, shift_exempt)
    values (s.restaurant_id, trim(p_name), coalesce(p_permissions,'{}'), false, coalesce(p_shift_exempt, false))
    returning id into v_id;
  else
    if exists(select 1 from roles rl where rl.id = p_id and rl.is_system) then raise exception 'Yönetici rolü düzenlenemez'; end if;
    select shift_exempt into v_was from roles where id = p_id and restaurant_id = s.restaurant_id;
    update roles set name = trim(p_name), permissions = coalesce(p_permissions,'{}'), shift_exempt = coalesce(p_shift_exempt, shift_exempt)
      where id = p_id and restaurant_id = s.restaurant_id and not is_system;
    v_id := p_id;
    if coalesce(p_shift_exempt, false) and not coalesce(v_was, false) and _shift_exempt_user_count(s.restaurant_id) > 3 then
      raise exception 'Vardiya açmadan çalışabilen rollerde toplam en fazla 3 kişi olabilir; önce bu roldeki kullanıcı sayısını azaltın';
    end if;
  end if;
  return v_id;
end; $function$;
