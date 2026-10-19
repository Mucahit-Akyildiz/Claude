-- Gün sonu kasa sayımı: sayılan nakit ile sistemdeki nakit farkı kaydedilir.
create table if not exists public.cash_counts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  business_date date not null,
  expected numeric not null default 0,
  counted numeric not null,
  note text,
  user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists cash_counts_rest_date on public.cash_counts(restaurant_id, business_date);
alter table public.cash_counts enable row level security;

create or replace function public.save_cash_count(p_token uuid, p_date date, p_expected numeric, p_counted numeric, p_note text)
 returns uuid language plpgsql security definer set search_path to 'public','extensions','pg_temp'
as $f$ declare s staff_sessions%rowtype; v uuid;
begin
  s := _session_check(p_token, 'reports');
  if p_counted is null or p_counted < 0 then raise exception 'Sayılan nakit geçersiz'; end if;
  insert into cash_counts(restaurant_id, business_date, expected, counted, note, user_id)
    values (s.restaurant_id, coalesce(p_date, (now() at time zone 'Europe/Istanbul')::date), coalesce(p_expected,0), p_counted, nullif(trim(p_note),''), s.user_id)
    returning id into v;
  return v;
end $f$;

create or replace function public.list_cash_counts(p_token uuid, p_date date, p_date_to date default null)
 returns json language plpgsql security definer set search_path to 'public','extensions','pg_temp'
as $f$ declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'reports');
  return coalesce((select json_agg(x order by x.created_at desc) from (
    select c.id, c.business_date, c.expected, c.counted, c.counted - c.expected as diff, c.note, c.created_at, au.username
      from cash_counts c left join app_users au on au.id = c.user_id
     where c.restaurant_id = s.restaurant_id and c.business_date between p_date and coalesce(p_date_to, p_date)) x), '[]'::json);
end $f$;

revoke all on function public.save_cash_count(uuid,date,numeric,numeric,text) from public;
revoke all on function public.list_cash_counts(uuid,date,date) from public;
grant execute on function public.save_cash_count(uuid,date,numeric,numeric,text) to anon, authenticated;
grant execute on function public.list_cash_counts(uuid,date,date) to anon, authenticated;
-- get_analytics_bundle kpi: 'points' (puanla ödeme toplamı) eklendi.
