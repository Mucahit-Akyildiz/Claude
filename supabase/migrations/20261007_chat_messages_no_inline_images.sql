-- Sohbet mesaj listesi gömülü (data:) görsel içeriğini taşımaz; görseller /api/chat-file ile
-- ayrı indirilip istemcide önbelleğe alınır. (Eski 3 gömülü fotoğraf yüzünden bir sohbet
-- her yenilemede ~138 KB iniyordu, şimdi ~26 KB.) İstemci bu değişiklikten ÖNCE yayınlanmalı.
do $t$ declare d text; begin
  d := pg_get_functiondef('get_chat_messages(uuid,text)'::regprocedure);
  if d like '%null::text attachment%' then return; end if;
  d := replace(d, 'case when m.deleted_at is null and m.attachment_kind = ''image'' and not m.view_once then m.attachment end attachment,',
    'null::text attachment, -- görsel içeriği ayrı indirilir (/api/chat-file), listede taşınmaz');
  execute d;
end $t$;
