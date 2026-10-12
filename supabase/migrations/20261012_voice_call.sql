-- Sesli arama: karşı tarafın uygulaması kapalıyken "X sizi arıyor" push bildirimi.
-- Aynı kişiye 20 sn içinde tekrar bildirim gönderilmez (call_notifications).
create table if not exists public.call_notifications(from_id uuid not null, to_id uuid not null, at timestamptz not null default now(), primary key(from_id, to_id));
alter table public.call_notifications enable row level security;
revoke all on public.call_notifications from anon, authenticated;
create or replace function public.notify_call(p_token uuid, p_to uuid)
returns void language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare s staff_sessions%rowtype; v_url text; v_secret text; v_last timestamptz;
begin
  s := _session_check(p_token, 'messages');
  if p_to = s.user_id or not exists(select 1 from app_users where id = p_to and restaurant_id = s.restaurant_id and is_active is not false) then
    raise exception 'Kullanıcı bulunamadı';
  end if;
  select at into v_last from call_notifications where from_id = s.user_id and to_id = p_to;
  if v_last is not null and v_last > now() - interval '20 seconds' then return; end if;
  insert into call_notifications(from_id, to_id, at) values (s.user_id, p_to, now())
    on conflict (from_id, to_id) do update set at = now();
  begin
    select value into v_url from _psv where key = 'push_dispatch_url';
    select value into v_secret from _psv where key = 'push_dispatch_secret';
    if coalesce(v_url,'') <> '' then
      perform net.http_post(url := v_url, headers := jsonb_build_object('Content-Type','application/json','x-push-secret', coalesce(v_secret,'')),
        body := jsonb_build_object('mode','call','to', p_to, 'by', s.username, 'from_id', s.user_id));
    end if;
  exception when others then null;
  end;
end $$;
revoke all on function public.notify_call(uuid, uuid) from public;
grant execute on function public.notify_call(uuid, uuid) to anon, authenticated;

-- 2. sürüm: Android'de telefon araması gibi çalan bildirim için arama sonu sinyali (p_end)
-- ve grup araması adı (p_group_name). Eski iki parametreli sürüm kaldırıldı.
drop function if exists public.notify_call(uuid, uuid);
create or replace function public.notify_call(p_token uuid, p_to uuid, p_end boolean default false, p_group_name text default null)
returns void language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare s staff_sessions%rowtype; v_url text; v_secret text; v_last timestamptz;
begin
  s := _session_check(p_token, 'messages');
  if p_to = s.user_id or not exists(select 1 from app_users where id = p_to and restaurant_id = s.restaurant_id and is_active is not false) then
    raise exception 'Kullanıcı bulunamadı';
  end if;
  if not coalesce(p_end, false) then
    select at into v_last from call_notifications where from_id = s.user_id and to_id = p_to;
    if v_last is not null and v_last > now() - interval '20 seconds' then return; end if;
    insert into call_notifications(from_id, to_id, at) values (s.user_id, p_to, now())
      on conflict (from_id, to_id) do update set at = now();
  else
    if not exists(select 1 from call_notifications where from_id = s.user_id and to_id = p_to and at > now() - interval '60 seconds') then return; end if;
  end if;
  begin
    select value into v_url from _psv where key = 'push_dispatch_url';
    select value into v_secret from _psv where key = 'push_dispatch_secret';
    if coalesce(v_url,'') <> '' then
      perform net.http_post(url := v_url, headers := jsonb_build_object('Content-Type','application/json','x-push-secret', coalesce(v_secret,'')),
        body := jsonb_build_object('mode','call','to', p_to, 'by', s.username, 'from_id', s.user_id, 'end', coalesce(p_end,false), 'group_name', p_group_name));
    end if;
  exception when others then null;
  end;
end $$;
revoke all on function public.notify_call(uuid, uuid, boolean, text) from public;
grant execute on function public.notify_call(uuid, uuid, boolean, text) to anon, authenticated;
