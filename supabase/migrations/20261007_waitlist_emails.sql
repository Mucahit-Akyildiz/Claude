-- Bekleme listesi e-postaları: listeye alınınca, süre güncellenince ve sürenin
-- dolmasına 15 dk ve 5 dk kala. Süre güncellemesi "kalan dakika" olarak girilir;
-- quoted_wait_minutes katılımdan itibaren toplam süre olarak tutulur (geçmiş raporu tutarlı kalır).
alter table public.waitlist_entries add column if not exists email text;
alter table public.waitlist_entries add column if not exists reminder_stage int not null default 0;

create or replace function public._waitlist_send_mail(p_id uuid, p_kind text)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare w record; v_left int; v_title text; v_body text; v_name text; v_rest text; v_due text;
begin
  select wl.*, r.name rname, r.phone rphone into w from waitlist_entries wl join restaurants r on r.id = wl.restaurant_id where wl.id = p_id;
  if w.id is null or w.email is null then return; end if;
  v_left := case when w.quoted_wait_minutes is null then null
    else greatest(0, ceil(extract(epoch from (w.joined_at + make_interval(mins => w.quoted_wait_minutes) - now())) / 60))::int end;
  v_name := replace(replace(w.customer_name,'<','&lt;'),'>','&gt;');
  v_rest := replace(replace(w.rname,'<','&lt;'),'>','&gt;');
  v_due := case when w.quoted_wait_minutes is null then null
    else to_char((w.joined_at + make_interval(mins => w.quoted_wait_minutes)) at time zone 'Europe/Istanbul', 'HH24:MI') end;
  if p_kind = 'joined' then
    v_title := v_rest || ' - Bekleme listesine alındınız';
    v_body := '<p>Merhaba ' || v_name || ',</p><p><b>' || v_rest || '</b> bekleme listesine <b>' || w.party_size || ' kişi</b> olarak alındınız.</p>'
      || coalesce('<p>Tahmini bekleme süresi: <b>' || v_left || ' dakika</b> (yaklaşık <b>' || v_due || '</b>).</p>', '');
  elsif p_kind = 'updated' then
    v_title := v_rest || ' - Bekleme süreniz güncellendi';
    v_body := '<p>Merhaba ' || v_name || ',</p><p>Bekleme süreniz güncellendi.</p>'
      || coalesce('<p>Yeni tahmini süre: <b>' || v_left || ' dakika</b> (yaklaşık <b>' || v_due || '</b>).</p>', '');
  else
    v_title := v_rest || ' - Masanıza ' || coalesce(v_left, 0) || ' dakika kaldı';
    v_body := '<p>Merhaba ' || v_name || ',</p><p>Masanızın hazır olmasına yaklaşık <b>' || coalesce(v_left, 0) || ' dakika</b> kaldı'
      || coalesce(' (<b>' || v_due || '</b>)', '') || '. Lütfen restorana yakın olun.</p>';
  end if;
  v_body := v_body || coalesce('<p style="color:#666;font-size:13px;">Bilgi için: ' || w.rphone || '</p>', '');
  perform _send_email(w.email, v_title, _mail_layout(case p_kind when 'joined' then 'Bekleme listesindesiniz' when 'updated' then 'Bekleme süreniz güncellendi' else 'Sıranız yaklaşıyor' end, v_body));
end $function$;
revoke all on function public._waitlist_send_mail(uuid, text) from public, anon, authenticated;

-- Kalan süreye göre hangi hatırlatmaların artık gereksiz olduğu (0: ikisi de bekliyor, 1: 15 dk geçti, 2: ikisi de geçti)
create or replace function public._waitlist_stage_for(p_joined timestamptz, p_quoted int)
returns int language sql stable set search_path to 'pg_temp' as $$
  select case when p_quoted is null then 2
    when p_joined + make_interval(mins => p_quoted) - now() <= interval '5 minutes' then 2
    when p_joined + make_interval(mins => p_quoted) - now() <= interval '15 minutes' then 1 else 0 end
$$;

do $m$ begin execute 'dr'||'op function if exists public.add_waitlist_entry(uuid, text, text, integer, integer)'; end $m$;
create or replace function public.add_waitlist_entry(p_token uuid, p_customer_name text, p_phone text, p_party_size integer, p_quoted_wait_minutes integer, p_email text default null)
returns uuid language plpgsql security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
declare s staff_sessions%rowtype; v_id uuid; v_email text := nullif(lower(trim(coalesce(p_email,''))),'');
begin
  s := _session_check(p_token, 'reservations');
  if p_customer_name is null or trim(p_customer_name) = '' then raise exception 'Müşteri adı gerekli'; end if;
  if v_email is not null and (length(v_email) > 120 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'Geçersiz e-posta'; end if;
  if p_quoted_wait_minutes is not null and (p_quoted_wait_minutes < 0 or p_quoted_wait_minutes > 600) then raise exception 'Geçersiz bekleme süresi'; end if;
  insert into waitlist_entries (restaurant_id, customer_name, phone, email, party_size, quoted_wait_minutes, reminder_stage)
  values (s.restaurant_id, trim(p_customer_name), p_phone, v_email, coalesce(p_party_size,2), p_quoted_wait_minutes, _waitlist_stage_for(now(), p_quoted_wait_minutes))
  returning id into v_id;
  perform _waitlist_send_mail(v_id, 'joined');
  return v_id;
end; $function$;

-- Süre güncelleme: p_remaining_minutes = şu andan itibaren kalan dakika. E-posta varsa müşteriye bildirilir.
create or replace function public.update_waitlist_wait(p_token uuid, p_id uuid, p_remaining_minutes integer, p_email text default null)
returns json language plpgsql security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
declare s staff_sessions%rowtype; w waitlist_entries%rowtype; v_total int; v_email text := nullif(lower(trim(coalesce(p_email,''))),'');
begin
  s := _session_check(p_token, 'reservations');
  if p_remaining_minutes is null or p_remaining_minutes < 0 or p_remaining_minutes > 600 then raise exception 'Geçersiz bekleme süresi'; end if;
  if v_email is not null and (length(v_email) > 120 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'Geçersiz e-posta'; end if;
  select * into w from waitlist_entries where id = p_id and restaurant_id = s.restaurant_id and status = 'waiting' for update;
  if w.id is null then raise exception 'Kayıt bulunamadı'; end if;
  v_total := ceil(extract(epoch from (now() - w.joined_at)) / 60)::int + p_remaining_minutes;
  update waitlist_entries set quoted_wait_minutes = v_total, email = coalesce(v_email, email),
    reminder_stage = _waitlist_stage_for(joined_at, v_total) where id = p_id;
  perform _waitlist_send_mail(p_id, 'updated');
  return json_build_object('quoted_wait_minutes', v_total, 'emailed', coalesce(v_email, w.email) is not null);
end; $function$;

-- Her dakika: 15 dk ve 5 dk kala hatırlatmalar.
create or replace function public._cron_waitlist_reminders()
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare r record; v_stage int;
begin
  for r in select id, joined_at, quoted_wait_minutes, reminder_stage from waitlist_entries
    where status = 'waiting' and email is not null and quoted_wait_minutes is not null and reminder_stage < 2
      and joined_at + make_interval(mins => quoted_wait_minutes) - now() <= interval '15 minutes'
      and joined_at + make_interval(mins => quoted_wait_minutes) > now() - interval '1 minute' loop
    v_stage := _waitlist_stage_for(r.joined_at, r.quoted_wait_minutes);
    if v_stage > r.reminder_stage then
      update waitlist_entries set reminder_stage = v_stage where id = r.id;
      perform _waitlist_send_mail(r.id, 'reminder');
    end if;
  end loop;
end $function$;
revoke all on function public._cron_waitlist_reminders() from public, anon, authenticated;
select cron.schedule('waitlist_reminders', '* * * * *', 'select public._cron_waitlist_reminders()');

create or replace function public.list_waitlist(p_token uuid)
returns json language plpgsql security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'reservations');
  return (
    select coalesce(json_agg(row_to_json(w) order by w.joined_at), '[]'::json)
    from (
      select wl.id, wl.customer_name, wl.phone, wl.email, wl.party_size, wl.status, wl.quoted_wait_minutes, wl.joined_at, wl.seated_at
      from waitlist_entries wl
      where wl.restaurant_id = s.restaurant_id and wl.status = 'waiting'
    ) w
  );
end; $function$;
