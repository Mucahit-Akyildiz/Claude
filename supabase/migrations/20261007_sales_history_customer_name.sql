-- Kapatılan Hesaplar listesinde müşteri adı: kayıtlı müşteri (sadakat) varsa onun adı,
-- yoksa masaya / paket siparişe yazılan isim.
do $t$ declare d text; begin
  d := pg_get_functiondef('get_sales_history(uuid,date,date)'::regprocedure);
  if d like '%left join customers cu%' then return; end if;
  d := replace(d, '(o.waitlist_id is not null) as from_waitlist', '(o.waitlist_id is not null) as from_waitlist, coalesce(cu.name, o.customer_name) as customer_name, coalesce(cu.phone, o.customer_phone) as customer_phone');
  d := replace(d, 'left join app_users au2 on au2.id = o.created_by', 'left join app_users au2 on au2.id = o.created_by
      left join customers cu on cu.id = sh.customer_id');
  execute d;
end $t$;
