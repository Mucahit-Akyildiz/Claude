// Android uygulaması (Capacitor WebView) tarayıcıda üretilen dosyaları (blob: PDF/Excel) kaydedemez.
// Uygulama dosyayı buraya gönderir; özel "exports" deposuna yüklenir ve 10 dakikalık, indirmeye
// zorlayan imzalı bağlantı döner. Uygulama bu bağlantıyı telefonun tarayıcısında açar, indirme orada olur.
// Bir saatten eski dosyalar her istekte o işletmenin klasöründen silinir.
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const LIMIT = 4.4 * 1024 * 1024;
function readRaw(req) {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > LIMIT) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
const hdr = (req, k) => { const v = req.headers[k]; return v ? decodeURIComponent(String(v)) : null; };
const MIME = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', png: 'image/png', jpg: 'image/jpeg', txt: 'text/plain' };

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }
  try {
    const token = hdr(req, 'x-session-token');
    let name = (hdr(req, 'x-name') || 'dosya').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').slice(0, 120);
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (!token || !/^[0-9a-f-]{36}$/i.test(token)) { res.status(400).json({ error: 'Eksik bilgi' }); return; }
    if (!MIME[ext]) { res.status(400).json({ error: 'Bu dosya türü indirilemez' }); return; }
    let body;
    try { body = await readRaw(req); } catch (e) { res.status(413).json({ error: 'Dosya çok büyük (en fazla 4 MB)' }); return; }
    if (!body.length) { res.status(400).json({ error: 'Dosya boş' }); return; }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: sess } = await supabase.from('staff_sessions').select('restaurant_id, expires_at, logged_out_at').eq('token', token).maybeSingle();
    if (!sess || sess.logged_out_at || new Date(sess.expires_at) < new Date()) { res.status(403).json({ error: 'Oturum geçersiz, tekrar giriş yapın' }); return; }

    const dir = sess.restaurant_id;
    try {
      const { data: old } = await supabase.storage.from('exports').list(dir, { limit: 100 });
      const stale = (old || []).filter((f) => f.created_at && Date.now() - new Date(f.created_at).getTime() > 3600 * 1000).map((f) => dir + '/' + f.name);
      if (stale.length) await supabase.storage.from('exports').remove(stale);
    } catch (e) { /* temizlik indirmeyi engellemesin */ }

    const path = `${dir}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('exports').upload(path, body, { contentType: MIME[ext], upsert: false });
    if (upErr) { res.status(500).json({ error: 'Dosya hazırlanamadı' }); return; }
    const { data: signed, error: sErr } = await supabase.storage.from('exports').createSignedUrl(path, 600, { download: name });
    if (sErr || !signed) { res.status(500).json({ error: 'Bağlantı oluşturulamadı' }); return; }
    res.status(200).json({ url: signed.signedUrl });
  } catch (e) {
    res.status(500).json({ error: 'Beklenmeyen hata' });
  }
};
