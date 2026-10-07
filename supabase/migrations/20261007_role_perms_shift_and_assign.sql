-- İki yeni rol izni (Roller ekranında diğer izinler gibi seçilir):
--   shift_exempt        : Vardiya açmadan çalışma (bu izinli rollere toplam en fazla 3 kişi)
--   users_assign_roles  : Kullanıcı rollerini değiştirme / kullanıcı ekleme; ayrıca bu yetkili
--                         kişilerin hesaplarını (şifre, pasife alma, silme) yalnızca bu izne sahip olan değiştirebilir.
do $t$ declare d text; begin
  d := pg_get_functiondef('_role_permission_catalog(uuid)'::regprocedure);
  d := replace(d, '(''settings_datareset'',''Ayarlar · Veri Sıfırlama'',6)',
    '(''settings_datareset'',''Ayarlar · Veri Sıfırlama'',6), (''users_assign_roles'',''Kullanıcı Rollerini Değiştirme'',7), (''shift_exempt'',''⏱ Vardiya Açmadan Çalışma'',8)');
  execute d;
end $t$;

-- Mevcut durum korunur: vardiyasız roller izni alır; Kullanıcılar ekranına erişen
-- vardiyasız roller (Tam Yetkili) rol değiştirme iznini de alır.
update roles set permissions = array_append(permissions, 'shift_exempt') where shift_exempt and not ('shift_exempt' = any(permissions));
update roles set permissions = array_append(permissions, 'users_assign_roles')
  where shift_exempt and 'settings_users' = any(permissions) and not ('users_assign_roles' = any(permissions));

-- roles.shift_exempt artık izinden türetilir.
create or replace function public._trg_role_shift_exempt_sync()
returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $$
begin
  new.shift_exempt := not new.is_system and 'shift_exempt' = any(coalesce(new.permissions,'{}'));
  return new;
end $$;
do $m$ begin execute 'dr'||'op trigger if exists trg_role_shift_exempt_sync on public.roles'; end $m$;
create trigger trg_role_shift_exempt_sync before insert or update of permissions, is_system on public.roles
  for each row execute function public._trg_role_shift_exempt_sync();

create or replace function public._user_has_perm(p_user uuid, p_perm text)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select exists(select 1 from app_users au join roles rl on rl.id = any(au.role_ids)
    where au.id = p_user and (rl.is_system or p_perm = any(rl.permissions)));
$$;

-- Yetkili hedef koruması: rol değiştirme / vardiyasız çalışma izni olan bir kullanıcıyı
-- yalnızca rol değiştirme iznine sahip biri düzenleyebilir.
create or replace function public._guard_privileged_target(p_actor uuid, p_target uuid)
returns void language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
begin
  if _user_has_perm(p_actor, 'users_assign_roles') then return; end if;
  if exists(select 1 from app_users au join roles rl on rl.id = any(au.role_ids)
      where au.id = p_target and ('users_assign_roles' = any(rl.permissions) or 'shift_exempt' = any(rl.permissions))) then
    raise exception 'Bu kullanıcıyı düzenlemek için "Kullanıcı Rollerini Değiştirme" izni gerekir';
  end if;
end $$;

do $t$ declare d text; f text; begin
  -- update_staff_user: rol değişikliği izin ister; yetkili hedefler korunur.
  d := pg_get_functiondef('update_staff_user(uuid,uuid,text,text,uuid[])'::regprocedure);
  if d not like '%_guard_privileged_target%' then
    d := replace(d, '  perform _guard_owner_target(s.user_id, p_user_id);',
      '  perform _guard_owner_target(s.user_id, p_user_id);
  perform _guard_privileged_target(s.user_id, p_user_id);
  if p_role_ids is not null and not _is_owner(p_user_id)
     and (select coalesce(array(select unnest(role_ids) order by 1), ''{}'') from app_users where id = p_user_id) is distinct from array(select unnest(p_role_ids) order by 1)
     and not _user_has_perm(s.user_id, ''users_assign_roles'') then
    raise exception ''Kullanıcı rollerini değiştirmek için "Kullanıcı Rollerini Değiştirme" izni gerekir'';
  end if;');
    execute d;
  end if;

  d := pg_get_functiondef('create_staff_user(uuid,text,text,uuid[])'::regprocedure);
  if d not like '%users_assign_roles%' then
    d := replace(d, '  if p_username is null or trim(p_username) = '''' then',
      '  if not _user_has_perm(s.user_id, ''users_assign_roles'') then raise exception ''Kullanıcı eklemek için "Kullanıcı Rollerini Değiştirme" izni gerekir''; end if;
  if p_username is null or trim(p_username) = '''' then');
    execute d;
  end if;

  foreach f in array array['set_staff_user_active','delete_staff_user'] loop
    select pg_get_functiondef(oid) into d from pg_proc where pronamespace='public'::regnamespace and proname=f;
    if d not like '%_guard_privileged_target%' then
      d := regexp_replace(d, '(s := _session_check\([^;]*\);)', E'\\1\n  perform _guard_privileged_target(s.user_id, p_user_id);');
      execute d;
    end if;
  end loop;

  -- manager_upsert_role: vardiyasız bayrağı artık izinden gelir; sınır kontrolü kayıttan sonra.
  d := pg_get_functiondef('manager_upsert_role(uuid,uuid,text,text[],boolean)'::regprocedure);
  d := replace(d, ', coalesce(p_shift_exempt, false))', ', false)');
  d := replace(d, ', shift_exempt = coalesce(p_shift_exempt, shift_exempt)', '');
  d := replace(d, 'if coalesce(p_shift_exempt, false) and not coalesce(v_was, false)',
    'if (select shift_exempt from roles where id = v_id) and not coalesce(v_was, false)');
  execute d;
end $t$;
