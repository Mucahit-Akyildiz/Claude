// Vercel serverless function: travel-time
// Adrese teslim paketlerde restorandan adrese sürüş süresini Google Maps ile hesaplar.
//  POST (sunucu, x-push-secret): { order_id } — orders tetikleyicisi (_trg_order_travel) adres girilince çağırır;
//       süre + işletmenin hazırlık payı orders.travel_min'e yazılır.
//  POST (uygulama, x-session-token): { address } — Ayarlar'da işletme adresini koordinata çevirir (yalnızca yönetici).
// GOOGLE_MAPS_API_KEY tanımlı değilse { fallback: true } döner; sistem işletmenin varsayılan süresiyle çalışır.
const { createClient } = require('@supabase/supabase-js');

const KEY = () => process.env.GOOGLE_MAPS_API_KEY || '';

async function geocode(address, near) {
  const q = new URLSearchParams({ address, region: 'tr', language: 'tr', components: 'country:TR', key: KEY() });
  // İşletme çevresine öncelik ver (aynı isimli sokaklar başka şehirlerde de olabilir).
  if (near && near.lat != null) q.set('bounds', `${near.lat - 0.25},${near.lng - 0.25}|${near.lat + 0.25},${near.lng + 0.25}`);
  const r = await fetch('https://maps.googleapis.com/maps/api/geocode/json?' + q);
  const j = await r.json();
  const hit = j && j.status === 'OK' && j.results && j.results[0];
  if (!hit) return { error: (j && j.status) || 'NO_RESULT' };
  return { lat: hit.geometry.location.lat, lng: hit.geometry.location.lng, formatted: hit.formatted_address, partial: !!hit.partial_match };
}

async function driveMinutes(from, to) {
  const q = new URLSearchParams({ origins: `${from.lat},${from.lng}`, destinations: `${to.lat},${to.lng}`, mode: 'driving', departure_time: 'now', language: 'tr', key: KEY() });
  const r = await fetch('https://maps.googleapis.com/maps/api/distancematrix/json?' + q);
  const j = await r.json();
  const el = j && j.rows && j.rows[0] && j.rows[0].elements && j.rows[0].elements[0];
  if (!el || el.status !== 'OK') return null;
  const sec = (el.duration_in_traffic || el.duration || {}).value;
  return sec ? Math.ceil(sec / 60) : null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const secret = process.env.PUSH_DISPATCH_SECRET;

  // Sunucudan: sipariş için süre hesapla
  if (body.order_id) {
    if (!secret || !safeEqual(req.headers['x-push-secret'], secret)) { res.status(401).json({ error: 'unauthorized' }); return; }
    if (!KEY()) { res.status(200).json({ fallback: true }); return; }
    const { data: t } = await supabase.rpc('_order_travel_target', { p_order: body.order_id });
    if (!t || t.lat == null || !t.address) { res.status(200).json({ skipped: true }); return; }
    try {
      const to = await geocode(t.address, t);
      if (to.error) { res.status(200).json({ fallback: true, reason: to.error }); return; }
      const mins = await driveMinutes(t, to);
      if (!mins) { res.status(200).json({ fallback: true, reason: 'NO_ROUTE' }); return; }
      const total = mins + (Number(t.buffer) || 0);
      await supabase.rpc('_set_order_travel', { p_order: body.order_id, p_min: total, p_src: 'google' });
      res.status(200).json({ ok: true, drive: mins, total });
    } catch (e) { res.status(200).json({ fallback: true, reason: 'ERROR' }); }
    return;
  }

  // Uygulamadan: işletme adresini koordinata çevir (yönetici)
  const token = String(req.headers['x-session-token'] || '');
  if (!/^[0-9a-f-]{36}$/i.test(token) || !body.address) { res.status(400).json({ error: 'Geçersiz istek' }); return; }
  const { data: cfg, error } = await supabase.rpc('get_restaurant_config', { p_token: token });
  if (error || !cfg) { res.status(401).json({ error: 'Oturum geçersiz' }); return; }
  if (!KEY()) { res.status(200).json({ fallback: true, error: 'Harita servisi henüz bağlı değil (GOOGLE_MAPS_API_KEY). Varsayılan süre kullanılacak.' }); return; }
  try {
    const g = await geocode(String(body.address).slice(0, 300));
    if (g.error) { res.status(200).json({ error: 'Adres bulunamadı, daha ayrıntılı yazın (mahalle, ilçe, il).' }); return; }
    res.status(200).json(g);
  } catch (e) { res.status(200).json({ error: 'Harita servisine ulaşılamadı' }); }
};

// Gizli anahtar karşılaştırması sabit sürede yapılır (zamanlama saldırısı).
function safeEqual(a, b) {
  const crypto = require('crypto');
  const ha = crypto.createHash('sha256').update(String(a || '')).digest();
  const hb = crypto.createHash('sha256').update(String(b || '')).digest();
  return crypto.timingSafeEqual(ha, hb);
}
