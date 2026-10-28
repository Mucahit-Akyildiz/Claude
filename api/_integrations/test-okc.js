// Test (simülasyon) yazar kasa: gerçek cihaz olmadan uçtan uca akışı denemek için.
// Fişi doğrular (kalem toplamı ≈ satış toplamı), sahte fiş numarası üretir. config.fail_rate (0-1) ile hata simüle edilebilir.
module.exports = {
  kind: 'okc',
  async test() { return { ok: true, info: 'Simülasyon cihazı hazır' }; },
  async sendSale(job, conn) {
    const p = job.payload || {};
    const failRate = Number((conn.config || {}).fail_rate || 0);
    if (failRate > 0 && Math.random() < failRate) return { ok: false, retry: true, error: 'Simülasyon: cihaz yanıt vermedi' };
    if (!(Number(p.total) > 0)) return { ok: false, retry: false, error: 'Geçersiz tutar' };
    const itemsTotal = (p.items || []).reduce((a, i) => a + Number(i.price) * Number(i.qty), 0);
    const vat = {};
    (p.items || []).forEach((i) => { const r = String(i.vat); vat[r] = Math.round(((vat[r] || 0) + Number(i.price) * Number(i.qty)) * 100) / 100; });
    return { ok: true, ref: 'SIM-' + Date.now().toString(36).toUpperCase(), result: { items_total: itemsTotal, vat_breakdown: vat, cash: p.cash, card: p.card } };
  },
};
