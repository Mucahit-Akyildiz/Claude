-- Rezervasyon, bekleme listesi ve QR/online siparişlerde telefonu olan kişi müşterilerde yoksa otomatik kaydedilir.
create or replace function _contact_auto_customer_trg() returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare j jsonb := to_jsonb(new); o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_phone text := coalesce(j->>'phone', j->>'customer_phone');
begin
  if v_phone is not null and (tg_op = 'INSERT' or v_phone is distinct from coalesce(o->>'phone', o->>'customer_phone') or (j->>'customer_name') is distinct from (o->>'customer_name')) then
    perform _auto_customer(new.restaurant_id, j->>'customer_name', v_phone, j->>'email');
  end if;
  return null;
end $$;
revoke all on function _contact_auto_customer_trg() from public, anon, authenticated;
create trigger trg_contact_auto_customer after insert or update on reservations for each row execute function _contact_auto_customer_trg();
create trigger trg_contact_auto_customer after insert or update on waitlist_entries for each row execute function _contact_auto_customer_trg();
create trigger trg_contact_auto_customer after insert or update on customer_order_requests for each row execute function _contact_auto_customer_trg();
