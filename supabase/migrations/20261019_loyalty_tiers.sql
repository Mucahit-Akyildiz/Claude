-- Sadakat seviyeleri: yaşam boyu puana göre seviye; seviye başına puan çarpanı ve otomatik indirim.
alter table public.restaurants add column if not exists loyalty_tiers jsonb not null default '[{"key":"silver","name":"Gümüş","icon":"🥈","min":50,"mult":1,"disc":0},{"key":"gold","name":"Altın","icon":"🥇","min":200,"mult":1,"disc":0},{"key":"diamond","name":"Elmas","icon":"💎","min":500,"mult":1,"disc":0}]'::jsonb;
alter table public.customers add column if not exists lifetime_points numeric not null default 0;
update public.customers c set lifetime_points = greatest(c.points_balance, coalesce((select sum(points_earned) from sales_history h where h.customer_id = c.id), 0)) where c.lifetime_points = 0;
create or replace function public._customer_tier(p_rest uuid, p_lifetime numeric)
 returns jsonb language sql stable set search_path to 'public','pg_temp'
as $f$
  select t from restaurants r, jsonb_array_elements(r.loyalty_tiers) t
   where r.id = p_rest and coalesce(p_lifetime,0) >= (t->>'min')::numeric
   order by (t->>'min')::numeric desc limit 1
$f$;
revoke all on function public._customer_tier(uuid,numeric) from public, anon, authenticated;
-- update_loyalty_tiers(p_token, p_tiers jsonb): 'crm' izni, en fazla 6 seviye, çarpan 1-5, indirim %0-50.
-- pay_order_items: points_earned *= seviye çarpanı; customers.lifetime_points += points_earned.
-- get_restaurant_config: loyalty.tiers; list_customers: lifetime_points; get_customer_by_phone/by_id: lifetime_points + tier.
