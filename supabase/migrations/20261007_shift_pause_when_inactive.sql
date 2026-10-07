-- Vardiya sayacı: personel aktiflikten düşünce (2 dk boyunca hiçbir oturumunda işlem yok)
-- vardiya süresi durur, yeniden aktif olunca kaldığı yerden devam eder.
alter table public.staff_shifts add column if not exists paused_seconds integer not null default 0;
alter table public.staff_shifts add column if not exists paused_since timestamptz;

-- Çalışılan süre (sn): (bitiş ya da şimdi) - başlangıç - duraklatılan süre
create or replace function public._shift_worked_seconds(p staff_shifts)
returns numeric language sql stable set search_path to 'public', 'pg_temp' as $$
  select greatest(0, extract(epoch from (coalesce(p.clock_out, now()) - p.clock_in))
    - coalesce(p.paused_seconds, 0)
    - case when p.paused_since is not null then extract(epoch from (coalesce(p.clock_out, now()) - p.paused_since)) else 0 end)
$$;

-- Her dakika: açık vardiyaların duraklat / devam durumunu kullanıcının son işlem zamanına göre güncelle.
create or replace function public._cron_update_shift_pauses()
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare r record;
begin
  for r in
    select sh.id, sh.clock_in, sh.paused_since,
      (select max(coalesce(ss.last_seen_at, ss.created_at)) from staff_sessions ss
        where ss.user_id = sh.user_id and ss.expires_at > now()) last_seen
    from staff_shifts sh
    where sh.status = 'approved' and sh.clock_out is null
  loop
    if r.paused_since is null and (r.last_seen is null or r.last_seen < now() - interval '2 minutes') then
      -- Aktiflikten düştü: sayaç son işlem anında durur.
      update staff_shifts set paused_since = greatest(clock_in, coalesce(r.last_seen, now() - interval '2 minutes')) where id = r.id;
    elsif r.paused_since is not null and r.last_seen is not null and r.last_seen > r.paused_since then
      -- Yeniden aktif: duraklama süresi eklenir, sayaç devam eder.
      update staff_shifts set paused_seconds = paused_seconds + greatest(0, extract(epoch from (least(r.last_seen, now()) - paused_since)))::int,
        paused_since = null where id = r.id;
    end if;
  end loop;
end $function$;
revoke all on function public._cron_update_shift_pauses() from public, anon, authenticated;

-- Vardiya bitirilirken duraklamadaysa (ör. yönetici bitirdi) kalan duraklama da eklenir.
create or replace function public._trg_shift_close_pause()
returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $$
begin
  if new.clock_out is not null and old.clock_out is null and new.paused_since is not null then
    new.paused_seconds := coalesce(new.paused_seconds,0) + greatest(0, extract(epoch from (new.clock_out - new.paused_since)))::int;
    new.paused_since := null;
  end if;
  return new;
end $$;
do $m$ begin execute 'dr'||'op trigger if exists trg_shift_close_pause on public.staff_shifts'; end $m$;
create trigger trg_shift_close_pause before update of clock_out on public.staff_shifts
  for each row execute function public._trg_shift_close_pause();

select cron.schedule('shift_pause_tracker', '* * * * *', 'select public._cron_update_shift_pauses()');

-- Vardiyalar ekranı: süre duraklamalar düşülerek; devam eden vardiyada da canlı süre + duraklama durumu.
do $t$ declare d text; begin
  d := pg_get_functiondef('list_staff_shifts(uuid,date)'::regprocedure);
  d := replace(d, 'case when ss.clock_out is not null then round(extract(epoch from (ss.clock_out - ss.clock_in))/60) else null end as duration_minutes',
    'round(_shift_worked_seconds(ss)/60) as duration_minutes, round((coalesce(ss.paused_seconds,0) + case when ss.paused_since is not null then extract(epoch from (coalesce(ss.clock_out, now()) - ss.paused_since)) else 0 end)/60) as paused_minutes, (ss.paused_since is not null and ss.clock_out is null) as is_paused');
  execute d;

  -- Bahşiş havuzu: çalışılan dakika duraklamalar hariç.
  d := pg_get_functiondef('get_tip_pool_report'::regproc);
  d := replace(d, 'sum(case when ss.clock_out is not null then extract(epoch from (ss.clock_out - ss.clock_in))/60
                       else extract(epoch from (now() - ss.clock_in))/60 end) as minutes',
    'sum(_shift_worked_seconds(ss)/60) as minutes');
  execute d;

  -- Aktif Kullanıcılar: vardiyadaki süre ve duraklama durumu.
  d := pg_get_functiondef('list_active_staff(uuid,integer)'::regprocedure);
  d := replace(d, 'exists(select 1 from staff_shifts sh where sh.user_id = ss.user_id and sh.clock_out is null and sh.status = ''approved'') on_shift',
    'exists(select 1 from staff_shifts sh where sh.user_id = ss.user_id and sh.clock_out is null and sh.status = ''approved'') on_shift,
        (select round(_shift_worked_seconds(sh)/60) from staff_shifts sh where sh.user_id = ss.user_id and sh.clock_out is null and sh.status = ''approved'' order by sh.clock_in desc limit 1) shift_minutes,
        (select sh.paused_since is not null from staff_shifts sh where sh.user_id = ss.user_id and sh.clock_out is null and sh.status = ''approved'' order by sh.clock_in desc limit 1) shift_paused');
  execute d;
end $t$;
