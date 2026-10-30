// Vercel serverless function: integration-worker
// pg_cron (_cron_integration_worker) her dakika, bekleyen iş varsa x-push-secret ile çağırır.
// İşleri _claim_integration_jobs ile kilitler, ilgili adaptöre (api/_integrations) verir, sonucu _finish_integration_job ile yazar.
// Başarısız işler 5 denemeye kadar üstel beklemeyle yeniden denenir; sırlar yalnızca burada, bellekte çözülür.
const { createClient } = require('@supabase/supabase-js');
const { getAdapter } = require('./_integrations');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const secret = process.env.PUSH_DISPATCH_SECRET;
  if (!secret || !safeEqual(req.headers['x-push-secret'], secret)) { res.status(401).json({ error: 'unauthorized' }); return; }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: jobs, error } = await supabase.rpc('_claim_integration_jobs', { p_limit: 20 });
  if (error) { console.error('claim', error); res.status(500).json({ error: 'claim failed' }); return; }
  const out = [];
  for (const job of jobs || []) {
    const conn = job.connector || {};
    const ad = getAdapter(conn.kind, conn.provider);
    let r;
    try {
      if (!ad) r = { ok: false, retry: false, error: 'Bu sağlayıcı için modül henüz yok: ' + conn.provider };
      else if (job.event === 'test') r = ad.test ? await ad.test(conn) : { ok: false, retry: false, error: 'Test desteklenmiyor' };
      else if (job.event === 'sale') r = ad.sendSale ? await ad.sendSale(job, conn) : { ok: false, retry: false, error: 'Fiş gönderimi desteklenmiyor' };
      else if (job.event === 'order_status') r = ad.orderStatus ? await ad.orderStatus(job, conn) : { ok: true, result: { skipped: true } };
      else r = { ok: false, retry: false, error: 'Bilinmeyen iş: ' + job.event };
    } catch (e) {
      r = { ok: false, retry: true, error: String((e && e.message) || e).slice(0, 300) };
    }
    const result = Object.assign({}, r.result || {}, r.ref ? { ref: r.ref } : {}, r.info ? { info: r.info } : {});
    await supabase.rpc('_finish_integration_job', { p_id: job.id, p_ok: !!r.ok, p_result: result, p_error: r.ok ? null : (r.error || 'hata'), p_retry: r.retry !== false });
    out.push({ id: job.id, ok: !!r.ok });
  }
  res.status(200).json({ processed: out.length });
};

// Gizli anahtar karşılaştırması sabit sürede yapılır (zamanlama saldırısı).
function safeEqual(a, b) {
  const crypto = require('crypto');
  const ha = crypto.createHash('sha256').update(String(a || '')).digest();
  const hb = crypto.createHash('sha256').update(String(b || '')).digest();
  return crypto.timingSafeEqual(ha, hb);
}
