// Mesaj ekleri (fotoğraf, ses, dosya) veritabanına değil Supabase Storage'daki
// özel "chat-media" deposuna yüklenir; veritabanında yalnızca yol tutulur
// ("storage:<işletme>/<dosya>"). İstemci dosyanın ham baytlarını gönderir;
// oturum/izin/sohbet erişimi chat_upload_target ile, mesaj kaydı
// send_chat_message ile (aynı kurallarla) yapılır.
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const LIMITS = { image: 1.5 * 1024 * 1024, audio: 3 * 1024 * 1024, file: 4 * 1024 * 1024 };

function readRaw(req) {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 4.4 * 1024 * 1024) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
const hdr = (req, k) => { const v = req.headers[k]; return v ? decodeURIComponent(String(v)) : null; };

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }
  try {
    const token = hdr(req, 'x-session-token'), conv = hdr(req, 'x-conv'), kind = hdr(req, 'x-kind') || 'file';
    const mime = (hdr(req, 'x-mime') || 'application/octet-stream').slice(0, 100);
    if (!token || !conv || !LIMITS[kind]) { res.status(400).json({ error: 'Eksik bilgi' }); return; }
    if (kind === 'image' && !/^image\/(jpeg|png|webp|gif)$/.test(mime)) { res.status(400).json({ error: 'Geçersiz görsel' }); return; }
    const body = await readRaw(req);
    if (!body.length) { res.status(400).json({ error: 'Dosya boş' }); return; }
    if (body.length > LIMITS[kind]) { res.status(413).json({ error: 'Dosya çok büyük (fotoğraf 1,5 MB, ses 3 MB, dosya 4 MB)' }); return; }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: restaurantId, error: tErr } = await supabase.rpc('chat_upload_target', { p_token: token, p_conv: conv });
    if (tErr || !restaurantId) { res.status(403).json({ error: (tErr && tErr.message) || 'Yetkisiz' }); return; }

    const ext = (mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
    const path = `${restaurantId}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('chat-media').upload(path, body, { contentType: mime, upsert: false });
    if (upErr) { res.status(500).json({ error: 'Yüklenemedi: ' + upErr.message }); return; }

    const { data: id, error: sErr } = await supabase.rpc('send_chat_message', {
      p_token: token, p_conv: conv, p_body: hdr(req, 'x-body') || '', p_attachment: 'storage:' + path,
      p_kind: kind, p_name: hdr(req, 'x-name'), p_reply_to: hdr(req, 'x-reply-to') || null,
      p_view_once: hdr(req, 'x-view-once') === '1', p_size: body.length,
    });
    if (sErr) {
      await supabase.storage.from('chat-media').remove([path]);
      res.status(400).json({ error: sErr.message }); return;
    }
    res.status(200).json({ id });
  } catch (e) {
    res.status(e && e.message === 'too large' ? 413 : 500).json({ error: e && e.message === 'too large' ? 'Dosya çok büyük' : 'Sunucu hatası' });
  }
};
