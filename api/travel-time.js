// Vercel serverless function: travel-time
// Adrese teslim paketlerde restorandan adrese sürüş süresini Google Maps ile hesaplar (Geocoding API + Routes API).
// Anahtar işletmeye özeldir (Ayarlar → Konum & Teslimat, tenant_integrations.maps_api_key, şifreli);
// girilmemişse platform anahtarı (GOOGLE_MAPS_API_KEY) kullanılır, o da yoksa varsayılan süreye düşülür.
//  POST (sunucu, x-push-secret): { order_id }     — adres girilince: adres → koordinat (bir kez), planlanan yola çıkış saatinin trafiğiyle süre.
//  POST (sunucu, x-push-secret): { recheck_ids }  — _cron_travel_recheck: yola çıkışa 30 ve 15 dk kala anlık trafikle yeniden hesap;
//       süre işletmenin eşiği kadar (varsayılan 3 dk) değişirse güncellenir, uzadıysa paket yetkililerine bildirim gider.
//  POST (uygulama, x-session-token): { address }  — Ayarlar'da işletme adresini koordinata çevirir.
const { createClient } = require('@supabase/supabase-js');

const PLATFORM_KEY = () => process.env.GOOGLE_MAPS_API_KEY || '';

async function geocode(key, address, near) {
  const q = new URLSearchParams({ address, region: 'tr', language: 'tr', components: 'country:TR', key });
  // İşletme çevresine öncelik ver (aynı isimli sokaklar başka şehirlerde de olabilir).
  if (near && near.lat != null) q.set('bounds', `${near.lat - 0.25},${near.lng - 0.25}|${near.lat + 0.25},${near.lng + 0.25}`);
  const r = await fetch('https://maps.googleapis.com/maps/api/geocode/json?' + q);
  const j = await r.json();
  const hit = j && j.status === 'OK' && j.results && j.results[0];
  if (!hit) return { error: (j && j.status) || 'NO_RESULT' };
  return { lat: hit.geometry.location.lat, lng: hit.geometry.location.lng, formatted: hit.formatted_address, partial: !!hit.partial_match };
}

// Sürüş süresi: Google Routes API (computeRoutes), trafik dahil. departAt verilirse o saatin (tahmini) trafiğiyle.
async function driveMinutes(key, from, to, departAt) {
  const body = {
    origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
    destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
    travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE', computeAlternativeRoutes: true, languageCode: 'tr', regionCode: 'TR',
  };
  if (departAt && departAt.getTime() > Date.now() + 2 * 60000) body.departureTime = departAt.toISOString();
  const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'routes.duration' }, body: JSON.stringify(body),
  });
  const j = await r.json();
  // Google Haritalar gibi: alternatifler arasından en hızlısı, dakikaya yuvarlanmış ("754s" → 13 dk).
  const secs = ((j && j.routes) || []).map(r => parseInt(String(r.duration || ''), 10)).filter(n => n > 0);
  return secs.length ? Math.max(1, Math.round(Math.min(...secs) / 60)) : null;
}

const hm = (d) => new Date(d).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const secret = process.env.PUSH_DISPATCH_SECRET;
  const fromServer = () => secret && safeEqual(req.headers['x-push-secret'], secret);

  // Sunucudan: yeni adres → koordinat + planlanan yola çıkış saatinin trafiğiyle süre
  if (body.order_id) {
    if (!fromServer()) { res.status(401).json({ error: 'unauthorized' }); return; }
    const { data: t } = await supabase.rpc('_order_travel_target', { p_order: body.order_id });
    const key = (t && t.key) || PLATFORM_KEY();
    if (!t || t.lat == null || !t.address || !key) { res.status(200).json({ fallback: true }); return; }
    try {
      const to = await geocode(key, t.address, t);
      if (to.error) { res.status(200).json({ fallback: true, reason: to.error }); return; }
      const buf = Number(t.buffer) || 0;
      // Önce varsayılan süreyle tahmini yola çıkış; o saatin trafiğiyle hesapla.
      const departGuess = t.pickup_at ? new Date(new Date(t.pickup_at).getTime() - (Number(t.default) || 10) * 60000) : null;
      const mins = await driveMinutes(key, t, to, departGuess);
      if (!mins) { res.status(200).json({ fallback: true, reason: 'NO_ROUTE' }); return; }
      await supabase.rpc('_set_order_travel2', { p_order: body.order_id, p_min: mins + buf, p_src: 'google', p_lat: to.lat, p_lng: to.lng });
      res.status(200).json({ ok: true, drive: mins, total: mins + buf });
    } catch (e) { res.status(200).json({ fallback: true, reason: 'ERROR' }); }
    return;
  }

  // Sunucudan: yola çıkışa yaklaşınca anlık trafikle yeniden kontrol
  if (Array.isArray(body.recheck_ids)) {
    if (!fromServer()) { res.status(401).json({ error: 'unauthorized' }); return; }
    const out = [];
    for (const id of body.recheck_ids.slice(0, 50)) {
      try {
        const { data: t } = await supabase.rpc('_order_travel_target', { p_order: id });
        const key = (t && t.key) || PLATFORM_KEY();
        if (!t || t.dest_lat == null || t.dispatched || t.status !== 'open' || !key) continue;
        const mins = await driveMinutes(key, t, { lat: t.dest_lat, lng: t.dest_lng }, null);
        if (!mins) continue;
        const total = mins + (Number(t.buffer) || 0), prev = Number(t.travel_min) || total, diff = total - prev;
        if (diff === 0 || (t.pickup_at && Math.abs(diff) < (Number(t.recheck) || 3))) { await supabase.rpc('_set_order_travel2', { p_order: id, p_min: prev, p_src: 'google', p_lat: null, p_lng: null }); continue; }
        await supabase.rpc('_set_order_travel2', { p_order: id, p_min: total, p_src: 'google', p_lat: null, p_lng: null });
        out.push({ id, prev, total });
        if (diff > 0 && t.pickup_at) {
          const oldOut = new Date(new Date(t.pickup_at).getTime() - prev * 60000), newOut = new Date(new Date(t.pickup_at).getTime() - total * 60000);
          await notify(supabase, t.rid, id, '🚦 ' + t.name + ': trafik yoğunlaştı', 'Yola çıkış ' + hm(oldOut) + ' → ' + hm(newOut) + ' (' + diff + ' dk öne alındı). Yol ' + total + ' dk.');
        }
      } catch (e) { /* tek siparişin hatası diğerlerini durdurmasın */ }
    }
    res.status(200).json({ ok: true, changed: out });
    return;
  }

  // Uygulamadan: işletme adresini koordinata çevir
  const token = String(req.headers['x-session-token'] || '');
  if (!/^[0-9a-f-]{36}$/i.test(token) || !body.address) { res.status(400).json({ error: 'Geçersiz istek' }); return; }
  const { data: ses, error } = await supabase.rpc('_maps_session', { p_token: token });
  if (error || !ses) { res.status(401).json({ error: 'Oturum geçersiz' }); return; }
  const key = ses.key || PLATFORM_KEY();
  if (!key) { res.status(200).json({ fallback: true, error: 'Google Maps API anahtarı girilmemiş. Anahtarı bu ekrana girip kaydedin; o zamana kadar varsayılan süre kullanılır.' }); return; }
  try {
    const g = await geocode(key, String(body.address).slice(0, 300));
    if (g.error) {
      const why = { REQUEST_DENIED: 'Google isteği reddetti: anahtar hatalı, Geocoding API etkin değil, anahtar kısıtlaması yanlış ya da faturalandırma tamamlanmamış.',
        OVER_QUERY_LIMIT: 'Google kota sınırı aşıldı.', ZERO_RESULTS: 'Adres bulunamadı, daha ayrıntılı yazın (mahalle, sokak, ilçe, il).' }[g.error];
      res.status(200).json({ error: why || ('Adres bulunamadı (' + g.error + ').'), status: g.error }); return;
    }
    res.status(200).json(Object.assign(g, { own_key: !!ses.key }));
  } catch (e) { res.status(200).json({ error: 'Harita servisine ulaşılamadı' }); }
};

// Trafik bildirimi: dispatch-ready-pushes (paket yetkilileri + siparişi alan) üzerinden.
async function notify(supabase, rid, orderId, title, bodyText) {
  try {
    const { data } = await supabase.from('_psv').select('value').eq('key', 'push_dispatch_url').maybeSingle();
    if (!data || !data.value) return;
    await fetch(data.value, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-push-secret': process.env.PUSH_DISPATCH_SECRET || '' },
      body: JSON.stringify({ mode: 'travel_alert', order_id: orderId, title, body: bodyText }) });
  } catch (e) { /* bildirim hatası süre güncellemesini engellemesin */ }
}

// Gizli anahtar karşılaştırması sabit sürede yapılır (zamanlama saldırısı).
function safeEqual(a, b) {
  const crypto = require('crypto');
  const ha = crypto.createHash('sha256').update(String(a || '')).digest();
  const hb = crypto.createHash('sha256').update(String(b || '')).digest();
  return crypto.timingSafeEqual(ha, hb);
}
