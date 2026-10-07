-- 1) Rezervasyon hatırlatma e-postası  2) Abonelik bitiyor e-postası
-- 3) destek@peyktan.com gelen kutusu (Cloudflare Email Worker -> ingest_support_email)

-- Ortak e-posta şablonu
create or replace function public._mail_layout(p_title text, p_body text)
returns text language sql immutable set search_path to 'public', 'pg_temp' as $$
  select '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#222;">'
    || '<h2 style="color:#0e8fa3;margin:0 0 16px;">' || p_title || '</h2>' || p_body
    || '<p style="color:#888;font-size:12px;margin-top:28px;border-top:1px solid #eee;padding-top:12px;">Peyktan · <a href="https://www.peyktan.com" style="color:#0e8fa3;">peyktan.com</a></p></div>'
$$;

-- ---------- 1) Rezervasyon ----------
alter table public.reservations add column if not exists email text;

do $m$
begin
  execute 'dr'||'op function if exists public.upsert_reservation(uuid, uuid, text, text, integer, timestamptz, uuid, text)';
end $m$;

create or replace function public.upsert_reservation(p_token uuid, p_id uuid, p_customer_name text, p_phone text, p_party_size integer, p_reservation_time timestamptz, p_table_id uuid, p_notes text, p_email text default null)
returns uuid language plpgsql security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
declare s staff_sessions%rowtype; v_id uuid; v_email text := nullif(lower(trim(coalesce(p_email,''))),'');
begin
  s := _session_check(p_token, 'reservations');
  if p_customer_name is null or trim(p_customer_name) = '' then raise exception 'Müşteri adı gerekli'; end if;
  if p_reservation_time is null then raise exception 'Rezervasyon zamanı gerekli'; end if;
  if v_email is not null and (length(v_email) > 120 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'Geçersiz e-posta'; end if;
  if p_table_id is not null and not exists(select 1 from restaurant_tables rt where rt.id = p_table_id and rt.restaurant_id = s.restaurant_id) then
    raise exception 'Geçersiz masa';
  end if;
  if p_id is null then
    insert into reservations (restaurant_id, customer_name, phone, email, party_size, reservation_time, table_id, notes)
    values (s.restaurant_id, trim(p_customer_name), p_phone, v_email, coalesce(p_party_size,2), p_reservation_time, p_table_id, p_notes)
    returning id into v_id;
  else
    update reservations set customer_name = trim(p_customer_name), phone = p_phone, email = v_email, party_size = coalesce(p_party_size,2),
      reservation_time = p_reservation_time, table_id = p_table_id, notes = p_notes,
      reminder_sent_at = case when reservation_time is distinct from p_reservation_time then null else reminder_sent_at end
    where id = p_id and restaurant_id = s.restaurant_id;
    v_id := p_id;
  end if;
  return v_id;
end; $function$;

create or replace function public.list_reservations(p_token uuid, p_date date default null)
returns json language plpgsql security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'reservations');
  return (
    select coalesce(json_agg(row_to_json(r) order by r.reservation_time), '[]'::json)
    from (
      select rv.id, rv.customer_name, rv.phone, rv.email, rv.party_size, rv.reservation_time, rv.table_id, rv.status, rv.notes,
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
end; $function$;

-- Rezervasyondan 2 saat önce: SMS (işletmede açıksa) + e-posta (adres varsa)
create or replace function public._send_reservation_reminders()
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare rv record; v_when text;
begin
  for rv in select r.*, rs.name rname, rs.sms_enabled, rs.phone rphone from reservations r join restaurants rs on rs.id = r.restaurant_id
    where r.status = 'confirmed' and r.reminder_sent_at is null
      and ((rs.sms_enabled and r.phone is not null) or r.email is not null)
      and r.reservation_time between now() and now() + interval '2 hours' loop
    update reservations set reminder_sent_at = now() where id = rv.id;
    v_when := to_char(rv.reservation_time at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI');
    if rv.sms_enabled and rv.phone is not null then
      perform _send_sms(rv.restaurant_id, rv.phone, rv.rname || ': Hatirlatma - bugun saat ' ||
        to_char(rv.reservation_time at time zone 'Europe/Istanbul', 'HH24:MI') || ' icin rezervasyonunuz var. Sizi bekliyoruz!', 'reservation_reminder');
    end if;
    if rv.email is not null then
      perform _send_email(rv.email, rv.rname || ' - Rezervasyon hatırlatması',
        _mail_layout('Rezervasyonunuzu hatırlatırız',
          '<p>Merhaba ' || replace(replace(rv.customer_name,'<','&lt;'),'>','&gt;') || ',</p>'
          || '<p><b>' || replace(replace(rv.rname,'<','&lt;'),'>','&gt;') || '</b> için rezervasyonunuz yaklaşıyor:</p>'
          || '<table style="border-collapse:collapse;margin:12px 0;font-size:15px;">'
          || '<tr><td style="padding:4px 14px 4px 0;color:#666;">Tarih / Saat</td><td><b>' || v_when || '</b></td></tr>'
          || '<tr><td style="padding:4px 14px 4px 0;color:#666;">Kişi</td><td><b>' || rv.party_size || '</b></td></tr></table>'
          || coalesce('<p>Değişiklik için bizi arayabilirsiniz: <b>' || rv.rphone || '</b></p>', '')
          || '<p>Sizi bekliyoruz!</p>'));
    end if;
  end loop;
end $function$;

-- ---------- 2) Abonelik bitiyor ----------
alter table public.restaurants add column if not exists expiry_reminder_stage int;

-- Süre uzatılınca hatırlatma sayacı sıfırlanır.
create or replace function public._trg_reset_expiry_reminder()
returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $$
begin
  if new.expires_at is distinct from old.expires_at and (old.expires_at is null or new.expires_at > old.expires_at) then
    new.expiry_reminder_stage := null;
  end if;
  return new;
end $$;
do $m$ begin
  execute 'dr'||'op trigger if exists trg_reset_expiry_reminder on public.restaurants';
end $m$;
create trigger trg_reset_expiry_reminder before update of expires_at on public.restaurants
  for each row execute function public._trg_reset_expiry_reminder();

-- Aşamalar: 1 = 7 gün kala, 2 = 3 gün kala, 3 = 1 gün kala, 4 = süre doldu (son 3 gün içinde)
create or replace function public._send_expiry_reminders()
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare r record; v_left numeric; v_stage int; v_title text; v_msg text; v_name text;
begin
  for r in select id, name, email, expires_at, coalesce(expiry_reminder_stage,0) stage from restaurants
    where email is not null and expires_at is not null
      and expires_at between now() - interval '3 days' and now() + interval '7 days' loop
    v_left := extract(epoch from (r.expires_at - now())) / 86400.0;
    v_stage := case when v_left <= 0 then 4 when v_left <= 1 then 3 when v_left <= 3 then 2 else 1 end;
    if v_stage <= r.stage then continue; end if;
    update restaurants set expiry_reminder_stage = v_stage where id = r.id;
    v_name := replace(replace(r.name,'<','&lt;'),'>','&gt;');
    if v_stage = 4 then
      v_title := 'Peyktan aboneliğiniz sona erdi';
      v_msg := '<p><b>' || v_name || '</b> için Peyktan kullanım süreniz <b>' || to_char(r.expires_at at time zone 'Europe/Istanbul','DD.MM.YYYY') || '</b> tarihinde sona erdi.</p>'
        || '<p>Kaldığınız yerden devam etmek için uygulamaya giriş yapıp <b>Ayarlar → Abonelik</b> bölümünden paketinizi yenileyebilirsiniz. Verileriniz korunmaktadır.</p>';
    else
      v_title := 'Peyktan aboneliğiniz ' || greatest(1, ceil(v_left))::int || ' gün içinde bitiyor';
      v_msg := '<p><b>' || v_name || '</b> için Peyktan kullanım süreniz <b>' || to_char(r.expires_at at time zone 'Europe/Istanbul','DD.MM.YYYY HH24:MI') || '</b> tarihinde sona erecek.</p>'
        || '<p>Kesintisiz kullanım için uygulamada <b>Ayarlar → Abonelik</b> bölümünden paketinizi yenileyebilirsiniz.</p>';
    end if;
    perform _send_email(r.email, v_title, _mail_layout(v_title, v_msg
      || '<p><a href="https://www.peyktan.com/app/" style="display:inline-block;background:#0e8fa3;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Uygulamaya Git</a></p>'
      || '<p style="color:#666;font-size:13px;">Sorularınız için: destek@peyktan.com</p>'));
  end loop;
end $function$;

-- Zaten süresi geçmiş / yakında bitecek işletmelere ilk çalıştırmada eski aşamalar için
-- toplu mail gitmesin: mevcut durum "gönderildi" kabul edilir.
update restaurants set expiry_reminder_stage =
  case when expires_at <= now() then 4 when expires_at <= now() + interval '1 day' then 3
       when expires_at <= now() + interval '3 days' then 2 when expires_at <= now() + interval '7 days' then 1 end
where expires_at is not null and expires_at <= now() + interval '7 days' and expiry_reminder_stage is null;

select cron.schedule('subscription_expiry_reminders', '7 * * * *', 'select public._send_expiry_reminders()');

-- ---------- 3) Destek gelen kutusu ----------
create table if not exists public.support_emails (
  id bigserial primary key,
  from_addr text not null,
  from_name text,
  to_addr text,
  subject text,
  body text,
  received_at timestamptz not null default now(),
  is_read boolean not null default false
);
alter table public.support_emails enable row level security;

insert into platform_settings(key, value)
  select 'support_inbound_secret', encode(extensions.gen_random_bytes(24), 'hex')
  where not exists(select 1 from platform_settings where key = 'support_inbound_secret');

-- Cloudflare Email Worker buraya anon anahtarla çağırır; gizli anahtar platform_settings'te.
create or replace function public.ingest_support_email(p_secret text, p_from text, p_from_name text, p_to text, p_subject text, p_body text)
returns boolean language plpgsql security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
declare v_secret text;
begin
  select value into v_secret from platform_settings where key = 'support_inbound_secret';
  if v_secret is null or p_secret is distinct from v_secret then raise exception 'Yetkisiz'; end if;
  insert into support_emails(from_addr, from_name, to_addr, subject, body)
  values (left(coalesce(p_from,''),200), left(p_from_name,200), left(p_to,200), left(p_subject,500), left(p_body,20000));
  return true;
end; $function$;

create or replace function public.admin_list_support_emails(p_token uuid)
returns json language plpgsql security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
begin
  perform _platform_admin_check(p_token);
  return json_build_object(
    'unread', (select count(*) from support_emails where not is_read),
    'secret', (select value from platform_settings where key = 'support_inbound_secret'),
    'items', (select coalesce(json_agg(t order by t.received_at desc), '[]'::json) from (
      select id, from_addr, from_name, to_addr, subject, body, received_at, is_read from support_emails order by received_at desc limit 200) t));
end; $function$;

create or replace function public.admin_mark_support_email(p_token uuid, p_id bigint, p_read boolean default true)
returns void language plpgsql security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
begin
  perform _platform_admin_check(p_token);
  update support_emails set is_read = coalesce(p_read, true) where id = p_id;
end; $function$;

create or replace function public.admin_support_unread_count(p_token uuid)
returns int language plpgsql security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
begin
  perform _platform_admin_check(p_token);
  return (select count(*) from support_emails where not is_read);
end; $function$;

revoke all on function public._send_expiry_reminders() from public, anon, authenticated;
revoke all on function public._mail_layout(text, text) from public, anon, authenticated;
