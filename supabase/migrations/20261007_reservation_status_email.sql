-- Rezervasyon durumu değişince (Onaylandı / Beklemede / İptal / Gelmedi) müşteriye e-posta.
-- Oturdu için gönderilmez (müşteri zaten restoranda).
do $t$ declare d text; begin
  d := pg_get_functiondef('_reservation_send_mail(uuid,text)'::regprocedure);
  if d not like '%Rezervasyonunuz onaylandı%' then
    d := replace(d, '  else
    v_title := r.rname || '' - Rezervasyon hatırlatması'';',
    '  elsif p_kind in (''confirmed'',''pending'',''cancelled'',''no_show'') then
    v_head := case p_kind when ''confirmed'' then ''Rezervasyonunuz onaylandı'' when ''pending'' then ''Rezervasyonunuz onay bekliyor''
      when ''cancelled'' then ''Rezervasyonunuz iptal edildi'' else ''Rezervasyonunuza gelinmedi'' end;
    v_title := r.rname || '' - '' || v_head;
    v_intro := case p_kind when ''confirmed'' then ''rezervasyonunuz onaylandı:'' when ''pending'' then ''rezervasyonunuz onay bekliyor; onaylanınca size haber vereceğiz:''
      when ''cancelled'' then ''aşağıdaki rezervasyonunuz iptal edildi. Yeni rezervasyon için bizi arayabilirsiniz:'' else ''aşağıdaki rezervasyonunuza gelmediğiniz kaydedildi:'' end;
  else
    v_title := r.rname || '' - Rezervasyon hatırlatması'';');
    d := replace(d, '|| ''<p>Sizi bekliyoruz!</p>''', '|| case when p_kind in (''cancelled'',''no_show'') then '''' else ''<p>Sizi bekliyoruz!</p>'' end');
    execute d;
  end if;
  d := pg_get_functiondef('set_reservation_status(uuid,uuid,text)'::regprocedure);
  if d not like '%_reservation_send_mail%' then
    d := replace(d, '    where id = p_id and restaurant_id = s.restaurant_id;
  -- "Oturdu"', '    where id = p_id and restaurant_id = s.restaurant_id;
  -- Durum değişince müşteriye e-posta (Oturdu hariç - müşteri zaten restoranda).
  if v_old is distinct from p_status and p_status <> ''seated'' then
    perform _reservation_send_mail(p_id, p_status);
  end if;
  -- "Oturdu"');
    execute d;
  end if;
end $t$;
