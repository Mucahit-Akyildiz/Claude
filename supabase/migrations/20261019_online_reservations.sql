-- Online rezervasyon: müşteri /rezervasyon/?r=KOD sayfasından istek gönderir, "onay bekliyor" olarak düşer.
alter table public.restaurants add column if not exists online_reservations_enabled boolean not null default false;
alter table public.reservations add column if not exists source text;

create or replace function public.get_online_reservation_settings(p_token uuid)
 returns json language plpgsql security definer set search_path to 'public','extensions','pg_temp'
as $f$ declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'reservations');
  return (select json_build_object('enabled', online_reservations_enabled, 'code', code) from restaurants where id = s.restaurant_id);
end $f$;

create or replace function public.set_online_reservations(p_token uuid, p_enabled boolean)
 returns void language plpgsql security definer set search_path to 'public','extensions','pg_temp'
as $f$ declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'reservations');
  update restaurants set online_reservations_enabled = coalesce(p_enabled, false) where id = s.restaurant_id;
end $f$;

create or replace function public.get_public_reservation_info(p_restaurant_code text)
 returns json language plpgsql security definer set search_path to 'public','extensions','pg_temp'
as $f$ declare r restaurants%rowtype;
begin
  select * into r from restaurants where code = p_restaurant_code;
  if r.id is null or not coalesce(r.is_active, false) then return null; end if;
  return json_build_object('name', r.name, 'enabled', r.online_reservations_enabled);
end $f$;

create or replace function public.submit_public_reservation(p_restaurant_code text, p_name text, p_phone text, p_email text, p_party int, p_time timestamptz, p_notes text)
 returns uuid language plpgsql security definer set search_path to 'public','extensions','pg_temp'
as $f$ declare r restaurants%rowtype; v uuid; n int;
begin
  select * into r from restaurants where code = p_restaurant_code;
  if r.id is null or not coalesce(r.is_active, false) then raise exception 'İşletme bulunamadı'; end if;
  if not r.online_reservations_enabled then raise exception 'Bu işletme şu anda online rezervasyon almıyor'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Adınızı girin'; end if;
  if length(regexp_replace(coalesce(p_phone,''), '\D', '', 'g')) < 10 then raise exception 'Geçerli bir telefon numarası girin'; end if;
  if p_party is null or p_party < 1 or p_party > 30 then raise exception 'Kişi sayısı 1-30 arasında olmalı'; end if;
  if p_time is null or p_time < now() + interval '30 minutes' then raise exception 'Rezervasyon en az 30 dakika sonrası için olmalı'; end if;
  if p_time > now() + interval '60 days' then raise exception 'En fazla 60 gün sonrası için rezervasyon yapılabilir'; end if;
  -- Kimlik doğrulamasız uç: aynı telefonla art arda istek gönderilmesini sınırla.
  select count(*) into n from reservations where restaurant_id = r.id and phone = trim(p_phone) and created_at > now() - interval '10 minutes';
  if n >= 3 then raise exception 'Çok sık istek gönderildi, lütfen biraz bekleyin'; end if;
  insert into reservations(restaurant_id, customer_name, phone, email, party_size, reservation_time, status, notes, source)
    values (r.id, left(trim(p_name), 80), left(trim(p_phone), 30), nullif(left(trim(coalesce(p_email,'')), 120), ''), p_party, p_time, 'pending', nullif(left(trim(coalesce(p_notes,'')), 300), ''), 'online')
    returning id into v;
  return v;
end $f$;

revoke all on function public.get_online_reservation_settings(uuid) from public;
revoke all on function public.set_online_reservations(uuid,boolean) from public;
revoke all on function public.get_public_reservation_info(text) from public;
revoke all on function public.submit_public_reservation(text,text,text,text,int,timestamptz,text) from public;
grant execute on function public.get_online_reservation_settings(uuid) to anon, authenticated;
grant execute on function public.set_online_reservations(uuid,boolean) to anon, authenticated;
grant execute on function public.get_public_reservation_info(text) to anon, authenticated;
grant execute on function public.submit_public_reservation(text,text,text,text,int,timestamptz,text) to anon, authenticated;
-- _nav_badges: onay bekleyen online rezervasyonlar tarihten bağımsız rozette (kind: reservation).
