// Vercel serverless function: marketplace-in
// Pazaryerinin sipariş bildirimi (webhook) adresi: POST /api/marketplace-in?k=<bağlantının gelen istek anahtarı>
// Anahtar bağlantıyı (işletme + sağlayıcı) bulur; sağlayıcının adaptörü isteği doğrular ve siparişleri normalize eder;
// her sipariş onay bekleyen müşteri siparişi olarak düşer (aynı dış sipariş bir kez).
const { createClient } = require('@supabase/supabase-js');
const { getAdapter } = require('./_integrations');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// İmza doğrulaması için gövde ham haliyle okunur (req.body'ye dokunmadan önce akıştan).
async function readRaw(req) {
  const chunks = []; for await (const c of req) chunks.push(c);
  if (chunks.length) return Buffer.concat(chunks).toString('utf8');
  return typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const key = String((req.query || {}).k || '');
  if (!UUID.test(key)) { res.status(404).json({ error: 'not found' }); return; }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: conn } = await supabase.rpc('_connector_by_inbound', { p_key: key });
  if (!conn || conn.kind !== 'marketplace' || !conn.enabled) { res.status(404).json({ error: 'not found' }); return; }
  const ad = getAdapter('marketplace', conn.provider);
  if (!ad || !ad.parseInbound) { res.status(501).json({ error: 'Bu sağlayıcı için modül henüz yok' }); return; }
  let orders;
  try { orders = await ad.parseInbound(req, conn, await readRaw(req)); }
  catch (e) { res.status(400).json({ error: String((e && e.message) || e).slice(0, 200) }); return; }
  let created = 0;
  for (const o of orders || []) {
    const { data, error } = await supabase.rpc('_ingest_marketplace_order', { p_connector: conn.id, p_order: o });
    if (error) { console.error('ingest', error); res.status(500).json({ error: 'Sipariş kaydedilemedi' }); return; }
    if (data) created++;
  }
  res.status(200).json({ received: (orders || []).length, created });
};
