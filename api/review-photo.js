// Müşteri değerlendirme fotoğrafları (özel "review-media" deposu).
//  POST (müşteri): ham görsel baytları, başlıkta x-review-token + x-mime. Değerlendirme gönderildikten sonraki
//       30 dk içinde en fazla 3 fotoğraf (_review_upload_target / _review_add_photo).
//  GET  (personel): ?id=<değerlendirme>&i=<sıra>, başlıkta x-session-token; 'reports' yetkisi ve aynı işletme (_review_photo_path).
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const MAX = 1.5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readRaw(req) {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > MAX + 1024) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  try {
    if (req.method === 'GET') {
      const { id, i } = req.query || {};
      const token = req.headers['x-session-token'];
      if (!UUID.test(String(id || '')) || !UUID.test(String(token || ''))) { res.status(400).end(); return; }
      const { data: path, error } = await supabase.rpc('_review_photo_path', { p_token: token, p_review: id, p_idx: Number(i) || 0 });
      if (error || !path) { res.status(404).end(); return; }
      const { data: blob, error: dErr } = await supabase.storage.from('review-media').download(path);
      if (dErr || !blob) { res.status(404).end(); return; }
      const type = TYPES.includes(blob.type) ? blob.type : 'application/octet-stream';
      res.setHeader('Content-Type', type);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Cache-Control', 'private, max-age=600');
      res.status(200).send(Buffer.from(await blob.arrayBuffer()));
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }
    const token = String(req.headers['x-review-token'] || ''), mime = String(req.headers['x-mime'] || '').toLowerCase();
    if (!UUID.test(token) || !TYPES.includes(mime)) { res.status(400).json({ error: 'Geçersiz istek' }); return; }
    const { data: restaurantId } = await supabase.rpc('_review_upload_target', { p_review_token: token });
    if (!restaurantId) { res.status(403).json({ error: 'Fotoğraf eklenemiyor (süre doldu ya da en fazla 3 fotoğraf)' }); return; }
    const body = await readRaw(req);
    if (!body.length) { res.status(400).json({ error: 'Dosya boş' }); return; }
    if (body.length > MAX) { res.status(413).json({ error: 'Fotoğraf çok büyük' }); return; }
    if (sniffImage(body) !== mime) { res.status(400).json({ error: 'Dosya geçerli bir JPEG/PNG/WEBP görseli değil' }); return; }
    const path = `${restaurantId}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${mime.split('/')[1]}`;
    const { error: upErr } = await supabase.storage.from('review-media').upload(path, body, { contentType: mime, upsert: false });
    if (upErr) { res.status(500).json({ error: 'Yüklenemedi' }); return; }
    const { data: ok } = await supabase.rpc('_review_add_photo', { p_review_token: token, p_path: path });
    if (!ok) { await supabase.storage.from('review-media').remove([path]); res.status(403).json({ error: 'Fotoğraf eklenemedi' }); return; }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(e && e.message === 'too large' ? 413 : 500).json({ error: e && e.message === 'too large' ? 'Fotoğraf çok büyük' : 'Sunucu hatası' });
  }
};

// Dosyanın gerçekten görsel olduğunu ilk baytlarından (imza) doğrular; x-mime başlığına güvenilmez.
function sniffImage(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
