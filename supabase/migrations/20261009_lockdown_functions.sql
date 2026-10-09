-- Güvenlik: abonelik uzatma yalnızca sunucudaki ödeme geri dönüşünden (service_role) çağrılabilir;
-- iç yardımcılar (_*) ve istemcinin çağırmadığı fonksiyonlar herkese açık anahtara (anon) kapatılır;
-- yeni fonksiyonlar varsayılan olarak kapalı oluşturulur (istemciye açılacaklar açıkça GRANT edilir).
revoke execute on function public.extend_restaurant_subscription(uuid,integer,text) from public, anon, authenticated;
grant execute on function public.extend_restaurant_subscription(uuid,integer,text) to service_role;

do $$ declare f record; begin
  for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and (p.proname like '\_%' or p.proname in ('update_promo_code','admin_link_restaurant_to_company','delete_waitlist_entry',
           'get_push_subscription_status','admin_list_active_users','verify_restaurant_credentials','chat_upload_target','open_view_once'))
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public grant execute on functions to service_role;

-- Ödeme onayı + abonelik uzatma tek işlemde (api/payment-callback.js), yalnızca service_role.
create or replace function public.complete_subscription_payment(p_token text, p_paid_price numeric, p_days int)
returns text language plpgsql security definer set search_path to 'public','extensions','pg_temp' as $$
declare pay payments%rowtype;
begin
  select * into pay from payments where provider_ref = p_token for update;
  if not found then return 'not_found'; end if;
  if pay.status = 'success' then return 'already'; end if;
  if p_paid_price is null or pay.amount is null or abs(p_paid_price - pay.amount) > 0.01 then
    update payments set status = 'amount_mismatch', debug_response = left(coalesce(debug_response,'') || ' paid=' || coalesce(p_paid_price::text,'null'), 2000) where id = pay.id;
    return 'amount_mismatch';
  end if;
  update payments set status = 'success' where id = pay.id;
  perform extend_restaurant_subscription(pay.restaurant_id, p_days, pay.package_id);
  return 'ok';
end $$;
revoke execute on function public.complete_subscription_payment(text,numeric,int) from public, anon, authenticated;
grant execute on function public.complete_subscription_payment(text,numeric,int) to service_role;

-- search_path eksik fonksiyonlar ve indekssiz yabancı anahtarlar
alter function public._h(text) set search_path to 'public','pg_temp';
alter function public._chat_conv_of(chat_messages,uuid) set search_path to 'public','pg_temp';
alter function public._chat_preview(chat_messages) set search_path to 'public','pg_temp';
alter function public._order_item_ready_at() set search_path to 'public','pg_temp';
alter function public._normalize_tr_phone(text) set search_path to 'public','pg_temp';
create index if not exists chat_messages_reply_to_idx on chat_messages(reply_to);
create index if not exists invoices_history_id_idx on invoices(history_id);
create index if not exists sms_outbox_restaurant_id_idx on sms_outbox(restaurant_id);
create index if not exists waiter_calls_table_id_idx on waiter_calls(table_id);
create index if not exists online_menu_sections_restaurant_id_idx on online_menu_sections(restaurant_id);
create index if not exists online_menu_items_restaurant_id_idx on online_menu_items(restaurant_id);
create index if not exists online_menu_items_product_id_idx on online_menu_items(product_id);
create index if not exists product_images_restaurant_id_idx on product_images(restaurant_id);
create index if not exists chat_groups_restaurant_id_idx on chat_groups(restaurant_id);
create index if not exists chat_group_members_user_id_idx on chat_group_members(user_id);
create index if not exists chat_messages_sender_id_idx on chat_messages(sender_id);
create index if not exists chat_messages_recipient_id_idx on chat_messages(recipient_id);
create index if not exists chat_reactions_user_id_idx on chat_reactions(user_id);
create index if not exists chat_groups_created_by_idx on chat_groups(created_by);
create index if not exists chat_view_once_user_id_idx on chat_view_once(user_id);
create index if not exists open_accounts_restaurant_id_idx on open_accounts(restaurant_id);
create index if not exists open_accounts_created_by_idx on open_accounts(created_by);
create index if not exists open_account_entries_created_by_idx on open_account_entries(created_by);
create index if not exists radio_channels_created_by_idx on radio_channels(created_by);

-- e-Fatura / pazaryeri / muhasebe entegrasyonları henüz gerçek servise bağlı değil: satıştan kaldırıldı,
-- müşteri e-postasındaki "resmi e-Arşiv ayrıca gönderilecek" ifadesi kaldırıldı (email_invoice canlıda güncellendi).
update feature_catalog set active = false where id in ('efatura','marketplace','accounting');
