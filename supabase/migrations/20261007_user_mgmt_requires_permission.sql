-- Kullanıcı silme / pasife alma da "Kullanıcı Yönetimi" (users_assign_roles) iznine bağlı
-- (önceden yalnızca yetkili hedefler korunuyordu; Yetkili Personel normal personeli silebiliyordu).
do $t$ declare d text; f text; begin
  foreach f in array array['set_staff_user_active','delete_staff_user'] loop
    select pg_get_functiondef(oid) into d from pg_proc where pronamespace='public'::regnamespace and proname=f;
    d := replace(d, 'perform _guard_privileged_target(s.user_id, p_user_id);',
      'if not _user_has_perm(s.user_id, ''users_assign_roles'') then raise exception ''Kullanıcı silmek / pasife almak için "Kullanıcı Yönetimi" izni gerekir''; end if;');
    execute d;
  end loop;
  d := pg_get_functiondef('_role_permission_catalog(uuid)'::regprocedure);
  d := replace(d, '''Kullanıcı Rollerini Değiştirme''', '''Kullanıcı Yönetimi (ekleme, rol, pasife alma, silme)''');
  execute d;
  foreach f in array array['update_staff_user','create_staff_user','_guard_privileged_target'] loop
    select pg_get_functiondef(oid) into d from pg_proc where pronamespace='public'::regnamespace and proname=f;
    d := replace(d, '"Kullanıcı Rollerini Değiştirme" izni', '"Kullanıcı Yönetimi" izni');
    execute d;
  end loop;
end $t$;
