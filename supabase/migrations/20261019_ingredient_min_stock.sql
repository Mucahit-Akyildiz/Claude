-- Kritik stok: hammaddeye minimum seviye; altına inince Satınalma Siparişleri rozetinde uyarı.
alter table public.ingredients add column if not exists min_stock numeric;
create or replace function public.set_ingredient_min(p_token uuid, p_id uuid, p_min numeric)
 returns void language plpgsql security definer set search_path to 'public','extensions','pg_temp'
as $f$ declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token, 'settings_ingredients');
  if p_min is not null and p_min < 0 then raise exception 'Minimum stok negatif olamaz'; end if;
  update ingredients set min_stock = nullif(p_min, 0) where id = p_id and restaurant_id = s.restaurant_id;
end $f$;
revoke all on function public.set_ingredient_min(uuid,uuid,numeric) from public;
grant execute on function public.set_ingredient_min(uuid,uuid,numeric) to anon, authenticated;
-- get_restaurant_config: ingredients JSON'una 'min_stock' eklendi.
-- _nav_badges: 'purchasing' anahtarı altında min_stock'un altındaki hammaddeler (kind: low_stock).
