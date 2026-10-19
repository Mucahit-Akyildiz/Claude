-- Müşteri değerlendirmesi: ödeme sonrası /degerlendirme/?t=TOKEN linki (QR veya SMS).
-- 1-5 yıldız + yorum; 3 ve altı yöneticiye rozet olarak düşer, 4-5 Google yoruma yönlendirilir.
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  sales_history_id uuid unique,
  token uuid not null unique default gen_random_uuid(),
  customer_id uuid,
  table_name text,
  staff_user_id uuid,
  rating int check (rating between 1 and 5),
  comment text,
  seen boolean not null default false,
  created_at timestamptz not null default now(),
  rated_at timestamptz
);
create index if not exists reviews_rest on public.reviews(restaurant_id, rated_at desc);
alter table public.reviews enable row level security;

create or replace function public.create_review_link(p_token uuid, p_history_id uuid, p_send_sms boolean default false)
 returns json language plpgsql security definer set search_path to 'public','extensions','pg_temp'
as $f$ declare s staff_sessions%rowtype; h sales_history%rowtype; v_tok uuid; v_phone text; v_name text; v_sent boolean := false;
begin
  s := _session_check(p_token, 'payments');
  select * into h from sales_history where id = p_history_id and restaurant_id = s.restaurant_id;
  if h.id is null then raise exception 'Hesap bulunamadı'; end if;
  insert into reviews(restaurant_id, sales_history_id, customer_id, table_name, staff_user_id)
    values (s.restaurant_id, h.id, h.customer_id, h.table_name, h.staff_user_id)
    on conflict (sales_history_id) do nothing;
  select token into v_tok from reviews where sales_history_id = h.id;
  if p_send_sms then
    select phone into v_phone from customers where id = h.customer_id;
    if v_phone is null then raise exception 'Müşterinin telefonu kayıtlı değil'; end if;
    if not coalesce((select sms_enabled from restaurants where id = s.restaurant_id), false) then raise exception 'SMS bildirimleri kapalı (Ayarlar > Entegrasyonlar)'; end if;
    select name into v_name from restaurants where id = s.restaurant_id;
    perform _send_sms(s.restaurant_id, v_phone, v_name || ': Bizi degerlendirir misiniz? https://www.peyktan.com/degerlendirme/?t=' || v_tok, 'review_request');
    v_sent := true;
  end if;
  return json_build_object('token', v_tok, 'sms_sent', v_sent);
end $f$;

create or replace function public.get_public_review(p_review_token uuid)
 returns json language plpgsql security definer set search_path to 'public','extensions','pg_temp'
as $f$ declare rv reviews%rowtype; r restaurants%rowtype;
begin
  select * into rv from reviews where token = p_review_token;
  if rv.id is null then return null; end if;
  select * into r from restaurants where id = rv.restaurant_id;
  return json_build_object('name', r.name, 'rated', rv.rating is not null, 'rating', rv.rating,
    'google_url', case when rv.rating >= 4 then r.google_review_url end);
end $f$;

create or replace function public.submit_public_review(p_review_token uuid, p_rating int, p_comment text)
 returns json language plpgsql security definer set search_path to 'public','extensions','pg_temp'
as $f$ declare rv reviews%rowtype; g text;
begin
  select * into rv from reviews where token = p_review_token for update;
  if rv.id is null then raise exception 'Geçersiz bağlantı'; end if;
  if rv.rating is not null then raise exception 'Bu hesap için zaten değerlendirme yapılmış'; end if;
  if rv.created_at < now() - interval '14 days' then raise exception 'Bu değerlendirme linkinin süresi dolmuş'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'Lütfen 1-5 arası puan verin'; end if;
  update reviews set rating = p_rating, comment = nullif(left(trim(coalesce(p_comment,'')), 1000), ''), rated_at = now(), seen = (p_rating >= 4) where id = rv.id;
  select google_review_url into g from restaurants where id = rv.restaurant_id;
  return json_build_object('google_url', case when p_rating >= 4 then g end);
end $f$;

create or replace function public.list_reviews(p_token uuid, p_days int default 30)
 returns json language plpgsql security definer set search_path to 'public','extensions','pg_temp'
as $f$ declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'crm');
  return json_build_object(
    'stats', (select json_build_object('n', count(*), 'avg', round(avg(rating)::numeric, 2),
        'dist', json_build_array(count(*) filter (where rating=1), count(*) filter (where rating=2), count(*) filter (where rating=3), count(*) filter (where rating=4), count(*) filter (where rating=5)),
        'sent', (select count(*) from reviews x where x.restaurant_id = s.restaurant_id and x.created_at > now() - make_interval(days => p_days)))
      from reviews where restaurant_id = s.restaurant_id and rating is not null and rated_at > now() - make_interval(days => p_days)),
    'rows', coalesce((select json_agg(x order by x.rated_at desc) from (
      select rv.id, rv.rating, rv.comment, rv.rated_at, rv.table_name, rv.seen, c.name as customer_name, c.phone as customer_phone, au.username as staff
        from reviews rv left join customers c on c.id = rv.customer_id left join app_users au on au.id = rv.staff_user_id
       where rv.restaurant_id = s.restaurant_id and rv.rating is not null and rv.rated_at > now() - make_interval(days => p_days)
       limit 200) x), '[]'::json));
end $f$;

create or replace function public.mark_reviews_seen(p_token uuid)
 returns void language plpgsql security definer set search_path to 'public','extensions','pg_temp'
as $f$ declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'crm');
  update reviews set seen = true where restaurant_id = s.restaurant_id and not seen and rating is not null;
end $f$;

do $$ declare f text; begin
  foreach f in array array['create_review_link(uuid,uuid,boolean)','get_public_review(uuid)','submit_public_review(uuid,int,text)','list_reviews(uuid,int)','mark_reviews_seen(uuid)'] loop
    execute 'revoke all on function public.' || f || ' from public';
    execute 'grant execute on function public.' || f || ' to anon, authenticated';
  end loop;
end $$;
-- _nav_badges: 'crm' anahtarı altında görülmemiş düşük puanlı (<=3) değerlendirmeler (kind: review).
-- Güncelleme: değerlendirmeler Finansal Analiz'e taşındı → list_reviews / mark_reviews_seen 'reports' izni;
-- _nav_badges düşük puan rozeti 'reports' anahtarı altında (Finansal Analiz menüsü).
