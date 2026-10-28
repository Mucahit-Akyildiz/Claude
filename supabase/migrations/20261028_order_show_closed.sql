-- Sipariş Al: satışa kapalı ürünler ürün listesinde görünsün mü (Ayarlar > Ürünler'deki açma/kapama düğmesi).
-- * restaurants.order_show_closed (varsayılan true = eski davranış: kapalı ürünler soluk görünür)
-- * set_order_show_closed(p_token, p_on): 'settings_products' izni
-- * get_restaurant_config: order_show_closed alanı eklendi (gövdenin geri kalanı değişmedi)
alter table public.restaurants add column if not exists order_show_closed boolean not null default true;

create or replace function public.set_order_show_closed(p_token uuid, p_on boolean) returns void
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare s staff_sessions%rowtype;
begin s := _session_check(p_token, 'settings_products'); update restaurants set order_show_closed = coalesce(p_on, true) where id = s.restaurant_id; end $$;
revoke all on function public.set_order_show_closed(uuid, boolean) from public;
grant execute on function public.set_order_show_closed(uuid, boolean) to anon, authenticated;

create or replace function public.get_restaurant_config(p_token uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare s staff_sessions%rowtype;
begin
  s := _session_check(p_token);
  return (
    select json_build_object(
      'close_no_cost', (select close_no_cost from restaurants where id = s.restaurant_id),
      'order_show_closed', (select order_show_closed from restaurants where id = s.restaurant_id),
      'zones', (
        select coalesce(json_agg(json_build_object(
          'id', z.id, 'name', z.name,
          'tables', (select coalesce(json_agg(json_build_object('id', t.id, 'name', t.name, 'qr_token', t.qr_token, 'pos_x', t.pos_x, 'pos_y', t.pos_y)), '[]'::json) from restaurant_tables t where t.zone_id = z.id)
        )), '[]'::json)
        from zones z where z.restaurant_id = s.restaurant_id
      ),
      'menus', (select coalesce(json_agg(json_build_object('id', id, 'name', name, 'station_id', station_id, 'sort', sort) order by sort, created_at), '[]'::json) from menus where restaurant_id = s.restaurant_id),
      'stations', (select coalesce(json_agg(json_build_object('id', id, 'name', name, 'color', color, 'icon', icon, 'categories', categories)), '[]'::json) from stations where restaurant_id = s.restaurant_id),
      'order_flags', (select coalesce(json_agg(json_build_object('id', id, 'label', label) order by sort_order), '[]'::json) from order_flag_defs where restaurant_id = s.restaurant_id),
      'default_vat_rate', (select default_vat_rate from restaurants where id = s.restaurant_id),
      'products', (
        select coalesce(json_agg(json_build_object(
          'id', p.id, 'name', p.name, 'price', p.price, 'cost', p.cost,
          'stock', p.stock, 'available', p.available, 'station_id', p.station_id,
          'name_translations', p.name_translations, 'vat_rate', p.vat_rate, 'category', p.category, 'print_ticket', p.print_ticket, 'kitchen_skip', p.kitchen_skip, 'parent_id', p.parent_id, 'menu_id', p.menu_id,
          'recipe', (
            select coalesce(json_agg(json_build_object(
              'ingredient_id', pi.ingredient_id, 'qty_per_unit', round(pi.qty_per_unit * (1 - i.waste_pct/100), 6), 'gross_qty', pi.qty_per_unit, 'waste_pct', i.waste_pct,
              'ingredient_name', i.name, 'ingredient_unit', i.unit
            )), '[]'::json)
            from product_ingredients pi join ingredients i on i.id = pi.ingredient_id
            where pi.product_id = p.id
          ),
          'available_qty', (
            select case when count(*) = 0 then null else floor(min(i.stock / pi.qty_per_unit)) end
            from product_ingredients pi join ingredients i on i.id = pi.ingredient_id
            where pi.product_id = p.id and pi.qty_per_unit > 0
          )
        )), '[]'::json)
        from products p where p.restaurant_id = s.restaurant_id
      ),
      'ingredients', (select coalesce(json_agg(json_build_object('id', id, 'name', name, 'unit', unit, 'stock', stock, 'waste_pct', waste_pct, 'min_stock', min_stock, 'unit_cost', unit_cost)), '[]'::json) from ingredients where restaurant_id = s.restaurant_id),
      'users', (
        select coalesce(json_agg(json_build_object(
          'id', au.id, 'username', au.username, 'role_ids', au.role_ids, 'is_active', au.is_active, 'phone', au.phone,
          'role_names', (select coalesce(array_agg(rl.name), '{}') from roles rl where rl.id = any(au.role_ids))
        )), '[]'::json)
        from app_users au where au.restaurant_id = s.restaurant_id and not au.is_company_owner
      ),
      'roles', (
        select coalesce(json_agg(json_build_object(
          'id', rl.id, 'name', rl.name, 'permissions', rl.permissions, 'is_system', rl.is_system, 'shift_exempt', rl.shift_exempt,
          'user_count', (select count(*) from app_users au where rl.id = any(au.role_ids) and not au.is_company_owner)
        ) order by rl.is_system desc, rl.name), '[]'::json)
        from roles rl where rl.restaurant_id = s.restaurant_id
      ),
      'loyalty', (select json_build_object('enabled', loyalty_enabled, 'spend_per_point', loyalty_spend_per_point, 'point_value', loyalty_point_value, 'birthday_discount_percent', birthday_discount_percent, 'tiers', loyalty_tiers) from restaurants where id = s.restaurant_id),
      'tip_pool', (select json_build_object('enabled', tip_pool_enabled, 'mode', tip_pool_mode) from restaurants where id = s.restaurant_id),
      'google_review_url', (select case when 'google_reviews' = any(_restaurant_features(s.restaurant_id)) then google_review_url end from restaurants where id = s.restaurant_id),
      'online_ordering', (select json_build_object('enabled', online_ordering_enabled, 'code', code) from restaurants where id = s.restaurant_id),
      'ticket_design', (select ticket_design from restaurants where id = s.restaurant_id),
      'company', (
        select case when r.company_id is null then null
          else json_build_object('id', c.id, 'name', c.name) end
        from restaurants r left join companies c on c.id = r.company_id
        where r.id = s.restaurant_id
      ),
      'features', to_json(_restaurant_features(s.restaurant_id)),
      'role_permissions', _role_permission_catalog(s.restaurant_id),
      'license', (select json_build_object('package_id', package_id, 'max_users', max_users, 'expires_at', expires_at, 'name', name, 'reports_password_set', reports_password_hash is not null, 'billing_identity_set', billing_identity_number is not null, 'billing_address', billing_address, 'billing_city', billing_city) from restaurants where id = s.restaurant_id)
    )
  );
end;
$$;
