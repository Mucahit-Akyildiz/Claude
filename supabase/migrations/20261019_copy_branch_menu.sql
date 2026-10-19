-- Çoklu şube: bir şubenin menüsünü (istasyon, menü, hammadde, ürün, reçete) aynı şirketteki
-- ürünü olmayan başka bir şubeye kopyalar. Stoklar kopyalanmaz (hammadde 0, ürün stoğu takipsiz).
create or replace function public.copy_branch_menu(p_company_token uuid, p_from uuid, p_to uuid)
 returns json language plpgsql security definer set search_path to 'public','extensions','pg_temp'
as $f$ declare cs company_sessions%rowtype; m_st jsonb := '{}'; m_mn jsonb := '{}'; m_ig jsonb := '{}'; m_pr jsonb := '{}';
  r record; v uuid; n_pr int := 0; n_ig int := 0;
begin
  cs := _company_session_check(p_company_token);
  if p_from = p_to then raise exception 'Kaynak ve hedef şube aynı olamaz'; end if;
  if not exists(select 1 from restaurants where id = p_from and company_id = cs.company_id)
     or not exists(select 1 from restaurants where id = p_to and company_id = cs.company_id) then raise exception 'Şube bulunamadı'; end if;
  if exists(select 1 from products where restaurant_id = p_to) then raise exception 'Hedef şubede zaten ürün var; menü kopyalama yalnızca boş şubeye yapılabilir'; end if;
  for r in select * from stations where restaurant_id = p_from loop
    insert into stations(restaurant_id, name, color, icon, categories) values (p_to, r.name, r.color, r.icon, r.categories) returning id into v;
    m_st := m_st || jsonb_build_object(r.id::text, v);
  end loop;
  for r in select * from menus where restaurant_id = p_from order by sort loop
    insert into menus(restaurant_id, name, sort, station_id) values (p_to, r.name, r.sort, (m_st->>r.station_id::text)::uuid) returning id into v;
    m_mn := m_mn || jsonb_build_object(r.id::text, v);
  end loop;
  for r in select * from ingredients where restaurant_id = p_from loop
    insert into ingredients(restaurant_id, name, unit, stock, waste_pct, min_stock) values (p_to, r.name, r.unit, 0, r.waste_pct, r.min_stock) returning id into v;
    m_ig := m_ig || jsonb_build_object(r.id::text, v); n_ig := n_ig + 1;
  end loop;
  -- Önce ana ürünler, sonra varyantlar (parent_id eşlemesi için).
  for r in select * from products where restaurant_id = p_from order by (parent_id is not null), name loop
    insert into products(restaurant_id, station_id, name, price, cost, stock, available, name_translations, vat_rate, category, print_ticket, menu_id, description, station_override, kitchen_skip, parent_id)
      values (p_to, (m_st->>r.station_id::text)::uuid, r.name, r.price, r.cost, null, r.available, r.name_translations, r.vat_rate, r.category, r.print_ticket,
              (m_mn->>r.menu_id::text)::uuid, r.description, r.station_override, r.kitchen_skip, (m_pr->>r.parent_id::text)::uuid)
      returning id into v;
    m_pr := m_pr || jsonb_build_object(r.id::text, v); n_pr := n_pr + 1;
  end loop;
  insert into product_ingredients(product_id, ingredient_id, qty_per_unit)
    select (m_pr->>pi.product_id::text)::uuid, (m_ig->>pi.ingredient_id::text)::uuid, pi.qty_per_unit
      from product_ingredients pi join products p on p.id = pi.product_id
     where p.restaurant_id = p_from and m_pr ? pi.product_id::text and m_ig ? pi.ingredient_id::text;
  return json_build_object('products', n_pr, 'ingredients', n_ig, 'stations', (select count(*) from jsonb_object_keys(m_st)), 'menus', (select count(*) from jsonb_object_keys(m_mn)));
end $f$;
revoke all on function public.copy_branch_menu(uuid,uuid,uuid) from public;
grant execute on function public.copy_branch_menu(uuid,uuid,uuid) to anon, authenticated;
