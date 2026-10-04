// Mesaj eki indirme/görüntüleme: erişim kontrolü veritabanında yapılır
// (get_chat_attachment / open_view_once). Depodaki dosya için kısa süreli
// imzalı adrese yönlendirir; eski (veritabanında tutulan) ekleri doğrudan
// döner. Tek görüntülemelik fotoğraf proxy'lenir ve özel mesajda açıldıktan
// sonra depodan silinir.
const { createClient } = require('@supabase/supabase-js');

function sendDataUrl(res, dataUrl, name, noStore) {
  const m = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.*)$/.exec(dataUrl || '');
  if (!m) { res.status(404).end(); return; }
  res.setHeader('Content-Type', m[1] || 'application/octet-stream');
  res.setHeader('Cache-Control', noStore ? 'no-store' : 'private, max-age=3600');
  if (name) res.setHeader('Content-Disposition', 'inline; filename*=UTF-8\'\'' + encodeURIComponent(name));
  res.status(200).send(Buffer.from(m[2], 'base64'));
}

module.exports = async function handler(req, res) {
  try {
    const { id, t, once } = req.query || {};
    if (!id || !t) { res.status(400).end(); return; }
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    if (once === '1') {
      const { data, error } = await supabase.rpc('open_view_once', { p_token: t, p_message_id: id });
      if (error || !data) { res.status(403).json({ error: (error && error.message) || 'Açılamadı' }); return; }
      if (String(data.data || '').startsWith('storage:')) {
        const path = data.data.slice(8);
        const { data: blob, error: dErr } = await supabase.storage.from('chat-media').download(path);
        if (dErr || !blob) { res.status(404).end(); return; }
        if (data.remove) await supabase.storage.from('chat-media').remove([path]);
        res.setHeader('Content-Type', blob.type || 'image/jpeg');
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).send(Buffer.from(await blob.arrayBuffer()));
        return;
      }
      sendDataUrl(res, data.data, null, true); return;
    }
    const { data, error } = await supabase.rpc('get_chat_attachment', { p_token: t, p_message_id: id });
    if (error || !data || !data.data) { res.status(403).json({ error: (error && error.message) || 'Bulunamadı' }); return; }
    if (String(data.data).startsWith('storage:')) {
      const { data: signed, error: sErr } = await supabase.storage.from('chat-media')
        .createSignedUrl(data.data.slice(8), 3600, req.query.dl ? { download: data.name || true } : undefined);
      if (sErr || !signed) { res.status(404).end(); return; }
      res.setHeader('Cache-Control', 'private, max-age=3000');
      res.redirect(302, signed.signedUrl); return;
    }
    sendDataUrl(res, data.data, data.name, false);
  } catch (e) {
    res.status(500).end();
  }
};
