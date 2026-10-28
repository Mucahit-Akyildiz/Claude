// Test (simülasyon) pazaryeri: Peyktan'ın normalize sipariş biçimini doğrudan kabul eder.
// İstek gövdesi: { orders: [{ external_id, customer_name, customer_phone, address, total, paid, items: [{ name, qty, price, product_id? }] }] }
// secrets.webhook_secret girilmişse x-peyk-signature başlığı = HMAC-SHA256(gövde, secret) olmalı.
const crypto = require('crypto');
module.exports = {
  kind: 'marketplace',
  async test() { return { ok: true, info: 'Simülasyon pazaryeri hazır' }; },
  async parseInbound(req, conn, raw) {
    const secret = (conn.secrets || {}).webhook_secret;
    if (secret) {
      const sig = crypto.createHmac('sha256', secret).update(raw).digest('hex');
      const got = String(req.headers['x-peyk-signature'] || '');
      if (got.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(sig))) throw new Error('İmza geçersiz');
    }
    const body = JSON.parse(raw || '{}');
    return (body.orders || []).map((o) => ({
      external_id: String(o.external_id || ''), customer_name: o.customer_name, customer_phone: o.customer_phone, address: o.address,
      total: o.total, paid: !!o.paid, order_type: o.order_type || 'delivery',
      items: (o.items || []).map((i) => ({ name: String(i.name || ''), qty: Number(i.qty) || 1, price: Number(i.price) || 0, product_id: i.product_id || null })),
    })).filter((o) => o.external_id && o.items.length);
  },
};
