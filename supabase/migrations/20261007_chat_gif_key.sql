-- Mesajlarda GIF / meme: GIPHY anahtarı platform ayarında; mesajlaşma izni olan personel alır
-- (GIPHY anahtarları istemci tarafında kullanılmak üzere tasarlanmıştır), platform yöneticisi değiştirir.
create or replace function public.get_gif_key(p_token uuid)
returns text language plpgsql security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'messages');
  return (select nullif(value,'') from platform_settings where key = 'giphy_api_key');
end; $function$;

create or replace function public.admin_get_gif_key_set(p_token uuid)
returns boolean language plpgsql security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
begin
  perform _platform_admin_check(p_token);
  return exists(select 1 from platform_settings where key = 'giphy_api_key' and coalesce(value,'') <> '');
end; $function$;

create or replace function public.admin_set_gif_key(p_token uuid, p_key text)
returns void language plpgsql security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
begin
  perform _platform_admin_check(p_token);
  if p_key is not null and length(trim(p_key)) > 200 then raise exception 'Geçersiz anahtar'; end if;
  insert into platform_settings(key, value) values ('giphy_api_key', nullif(trim(coalesce(p_key,'')),''))
    on conflict (key) do update set value = excluded.value;
end; $function$;
