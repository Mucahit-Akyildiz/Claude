-- QR masa hesabı cihaza bağlanır: masa kapandıktan sonra (12 saat içinde) önceki hesaba bağlı cihaz yeni hesabı göremez/ödeyemez.
-- get_table_bill_v2 / start_table_payment_v2 (p_device) eklendi; eski tek parametreli sürümler boş hesap / "sayfayı yenileyin" döner.
-- Canlıya uygulandı (tam tanımlar DO bloklarıyla mevcut fonksiyonlardan türetildi).
create table if not exists public.qr_bill_devices(device text not null, table_id uuid not null, order_id uuid not null, created_at timestamptz not null default now(), primary key(device, order_id));
create index if not exists qr_bill_devices_tbl_idx on public.qr_bill_devices(device, table_id, created_at);
alter table public.qr_bill_devices enable row level security;
revoke all on public.qr_bill_devices from anon, authenticated;
create or replace function public._qr_bill_allowed(p_device text, p_table uuid, p_order uuid) returns boolean
language plpgsql security definer set search_path to 'public','pg_temp' as $f$
begin
  if coalesce(length(p_device),0) < 16 then return false; end if;
  if exists(select 1 from qr_bill_devices where device = p_device and order_id = p_order) then return true; end if;
  if exists(select 1 from qr_bill_devices d join orders o on o.id = d.order_id
            where d.device = p_device and d.table_id = p_table and d.order_id <> p_order and o.status <> 'open'
              and d.created_at > now() - interval '12 hours') then return false; end if;
  insert into qr_bill_devices(device, table_id, order_id) values (p_device, p_table, p_order) on conflict do nothing;
  return true;
end $f$;
revoke all on function public._qr_bill_allowed(text, uuid, uuid) from public, anon, authenticated;
