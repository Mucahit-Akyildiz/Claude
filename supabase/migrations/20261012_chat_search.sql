-- Mesajlarda arama: kullanıcının görebildiği mesajlarda (Genel, üyesi olduğu gruplar,
-- kendi birebir sohbetleri) metin araması; en yeni 40 sonuç.
create or replace function public.search_chat_messages(p_token uuid, p_q text)
returns json language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare s staff_sessions%rowtype; v_q text;
begin
  s := _session_check(p_token, 'messages');
  v_q := trim(coalesce(p_q, ''));
  if length(v_q) < 2 then return '[]'::json; end if;
  v_q := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return (select coalesce(json_agg(t), '[]'::json) from (
    select m.id, m.created_at, au.username sender_name, left(m.body, 160) body,
      case when m.group_id is not null then 'g:' || m.group_id
           when m.recipient_id is null then 'all'
           when m.sender_id = s.user_id then m.recipient_id::text
           else m.sender_id::text end conv
    from chat_messages m join app_users au on au.id = m.sender_id
    where m.restaurant_id = s.restaurant_id and m.deleted_at is null and m.body ilike v_q
      and ( (m.group_id is null and m.recipient_id is null)
         or (m.group_id is not null and exists (select 1 from chat_group_members gm where gm.group_id = m.group_id and gm.user_id = s.user_id))
         or (m.group_id is null and (m.sender_id = s.user_id or m.recipient_id = s.user_id)) )
    order by m.created_at desc limit 40) t);
end $$;
revoke all on function public.search_chat_messages(uuid, text) from public;
grant execute on function public.search_chat_messages(uuid, text) to anon, authenticated;
