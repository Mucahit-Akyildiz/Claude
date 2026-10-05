// Mesaj eki indirme/görüntüleme: erişim kontrolü veritabanında yapılır
// (get_chat_attachment / open_view_once). Dosya bu fonksiyon üzerinden
// aktarılır (imzalı adrese yönlendirme yok): oturum anahtarı başlıkta gelir,
// URL'ye yazılmaz. Güvenlik için içerik türü izinli listeden seçilir; görsel ve
// ses dışındaki her şey indirme olarak (attachment) ve kod çalıştırılamaz
// şekilde (CSP sandbox) gönderilir - HTML/SVG "dosya" peyktan.com'da açılamaz.
// Tek görüntülemelik fotoğraf açıldıktan sonra (gerekirse) depodan silinir.
const { createClient } = require('@supabase/supabase-js');

const INLINE_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  audio: ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/amr', 'audio/3gpp'],
};

function send(res, buf, rawType, kind, name, opts) {
  const type = String(rawType || '').split(';')[0].trim().toLowerCase();
  const allowed = (INLINE_TYPES[kind] || []).includes(type);
  res.setHeader('Content-Type', allowed ? type : 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cache-Control', opts.noStore ? 'no-store' : 'private, max-age=600');
  const disp = allowed && !opts.download ? 'inline' : 'attachment';
  res.setHeader('Content-Disposition', disp + "; filename*=UTF-8''" + encodeURIComponent(name || 'dosya'));
  res.status(200).send(buf);
}

function fromDataUrl(dataUrl) {
  const m = /^data:([^;,]+)?(?:;[^,]*)?;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  return m ? { type: m[1], buf: Buffer.from(m[2], 'base64') } : null;
}

module.exports = async function handler(req, res) {
  try {
    const { id, once, dl } = req.query || {};
    const token = req.headers['x-session-token'] || (req.query || {}).t;
    if (!id || !token) { res.status(400).end(); return; }
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const rpc = once === '1' ? 'open_view_once' : 'get_chat_attachment';
    const { data, error } = await supabase.rpc(rpc, { p_token: token, p_message_id: id });
    if (error || !data || !data.data) { res.status(403).json({ error: (error && error.message) || 'Bulunamadı' }); return; }
    const kind = once === '1' ? 'image' : data.kind;
    const opts = { noStore: once === '1', download: dl === '1' || kind === 'file' };
    if (String(data.data).startsWith('storage:')) {
      const path = data.data.slice(8);
      const { data: blob, error: dErr } = await supabase.storage.from('chat-media').download(path);
      if (dErr || !blob) { res.status(404).end(); return; }
      if (once === '1' && data.remove) await supabase.storage.from('chat-media').remove([path]);
      send(res, Buffer.from(await blob.arrayBuffer()), blob.type, kind, data.name, opts);
      return;
    }
    const d = fromDataUrl(data.data);
    if (!d) { res.status(404).end(); return; }
    send(res, d.buf, d.type, kind, data.name, opts);
  } catch (e) {
    res.status(500).end();
  }
};
