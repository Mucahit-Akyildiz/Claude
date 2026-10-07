-- Rezervasyon oluşturulunca (ve zamanı / e-postası değişince) hemen onay e-postası;
-- 2 saat kala hatırlatma aynı şablonu kullanır.
create or replace function public._reservation_send_mail(p_id uuid, p_kind text)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare r record; v_when text; v_title text; v_head text; v_intro text;
begin
  select rv.*, rs.name rname, rs.phone rphone into r from reservations rv join restaurants rs on rs.id = rv.restaurant_id where rv.id = p_id;
  if r.id is null or r.email is null then return; end if;
  v_when := to_char(r.reservation_time at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI');
  if p_kind = 'created' then
    v_title := r.rname || ' - Rezervasyonunuz alındı'; v_head := 'Rezervasyonunuz alındı';
    v_intro := 'rezervasyonunuz oluşturuldu:';
  elsif p_kind = 'updated' then
    v_title := r.rname || ' - Rezervasyonunuz güncellendi'; v_head := 'Rezervasyonunuz güncellendi';
    v_intro := 'rezervasyon bilgileriniz güncellendi:';
  else
    v_title := r.rname || ' - Rezervasyon hatırlatması'; v_head := 'Rezervasyonunuzu hatırlatırız';
    v_intro := 'rezervasyonunuz yaklaşıyor:';
  end if;
  perform _send_email(r.email, v_title, _mail_layout(v_head,
    '<p>Merhaba ' || replace(replace(r.customer_name,'<','&lt;'),'>','&gt;') || ',</p>'
    || '<p><b>' || replace(replace(r.rname,'<','&lt;'),'>','&gt;') || '</b> için ' || v_intro || '</p>'
    || '<table style="border-collapse:collapse;margin:12px 0;font-size:15px;">'
    || '<tr><td style="padding:4px 14px 4px 0;color:#666;">Tarih / Saat</td><td><b>' || v_when || '</b></td></tr>'
    || '<tr><td style="padding:4px 14px 4px 0;color:#666;">Kişi</td><td><b>' || r.party_size || '</b></td></tr></table>'
    || coalesce('<p>Değişiklik için bizi arayabilirsiniz: <b>' || r.rphone || '</b></p>', '')
    || '<p>Sizi bekliyoruz!</p>'));
end $function$;
revoke all on function public._reservation_send_mail(uuid, text) from public, anon, authenticated;

create or replace function public._send_reservation_reminders()
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare rv record;
begin
  for rv in select r.*, rs.name rname, rs.sms_enabled from reservations r join restaurants rs on rs.id = r.restaurant_id
    where r.status = 'confirmed' and r.reminder_sent_at is null
      and ((rs.sms_enabled and r.phone is not null) or r.email is not null)
      and r.reservation_time between now() and now() + interval '2 hours' loop
    update reservations set reminder_sent_at = now() where id = rv.id;
    if rv.sms_enabled and rv.phone is not null then
      perform _send_sms(rv.restaurant_id, rv.phone, rv.rname || ': Hatirlatma - bugun saat ' ||
        to_char(rv.reservation_time at time zone 'Europe/Istanbul', 'HH24:MI') || ' icin rezervasyonunuz var. Sizi bekliyoruz!', 'reservation_reminder');
    end if;
    perform _reservation_send_mail(rv.id, 'reminder');
  end loop;
end $function$;

do $t$ declare d text; begin
  d := pg_get_functiondef('upsert_reservation(uuid,uuid,text,text,integer,timestamptz,uuid,text,text)'::regprocedure);
  if d not like '%_reservation_send_mail%' then
    d := replace(d, '    returning id into v_id;
  else',
      '    returning id into v_id;
    perform _reservation_send_mail(v_id, ''created'');
  else
    if exists(select 1 from reservations where id = p_id and restaurant_id = s.restaurant_id
        and (reservation_time is distinct from p_reservation_time or email is distinct from v_email or party_size is distinct from coalesce(p_party_size,2))) then
      v_changed := true;
    end if;');
    d := replace(d, '    v_id := p_id;
  end if;', '    v_id := p_id;
    if v_changed then perform _reservation_send_mail(v_id, ''updated''); end if;
  end if;');
    d := replace(d, 'declare s staff_sessions%rowtype; v_id uuid;', 'declare s staff_sessions%rowtype; v_id uuid; v_changed boolean := false;');
    execute d;
  end if;
end $t$;
