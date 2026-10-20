// Vercel serverless function: order-pay (ONLINE SIPARIS KARTLA ODEME)
// Musteri online siparis sayfasinda "Online kartla ode" secince:
//  1) Sayfa start_public_order_payment RPC'si ile odeme kaydini acar (tutar sunucuda hesaplanir).
//  2) POST /api/order-pay { payment_id } -> isletmenin KENDI iyzico anahtarlariyla (tenant_integrations)
//     odeme formu baslatilir, musteri iyzico odeme sayfasina yonlendirilir.
//  3) iyzico odeme sonrasi bu adrese (?cb=1&p=...) token POST eder -> sonuc iyzico'dan dogrulanir,
//     basariliysa _finalize_online_payment ile siparis "odendi" olarak isletmeye duser.
// Para dogrudan isletmenin iyzico hesabina gecer; Peyktan araya girmez.
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SITE = process.env.PUBLIC_SITE_URL || 'https://www.peyktan.com';

function iyzicoHeaders(apiKey, secret, uriPath, body) {
  const rk = Date.now().toString() + Math.floor(Math.random() * 1000000).toString();
  const signature = crypto.createHmac('sha256', secret).update(rk + uriPath + JSON.stringify(body)).digest('hex');
  const auth = Buffer.from(`apiKey:${apiKey}&randomKey:${rk}&signature:${signature}`).toString('base64');
  return { Authorization: `IYZWSv2 ${auth}`, 'x-iyzi-rnd': rk, 'Content-Type': 'application/json', Accept: 'application/json' };
}
async function iyzicoCall(t, uriPath, body) {
  const base = t.pay_sandbox === false ? 'https://api.iyzipay.com' : 'https://sandbox-api.iyzipay.com';
  const r = await fetch(base + uriPath, { method: 'POST', headers: iyzicoHeaders(t.pay_api_key, t.pay_secret, uriPath, body), body: JSON.stringify(body) });
  return r.json();
}
const price = (n) => (Math.round(Number(n) * 100) / 100).toFixed(2);

module.exports = async function handler(req, res) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const q = req.query || {};
  // ---- iyzico geri donusu ----
  if (q.cb) {
    const pid = String(q.p || '');
    const token = (req.body && req.body.token) || q.token;
    const { data: op } = await supabase.from('online_payments').select('*').eq('id', pid).maybeSingle();
    const { data: rest } = op ? await supabase.from('restaurants').select('code').eq('id', op.restaurant_id).maybeSingle() : { data: null };
    const back = (ok) => { res.writeHead(302, { Location: `${SITE}/siparis/?r=${encodeURIComponent((rest && rest.code) || '')}&${ok ? 'paid=1' : 'payfail=1'}` }); res.end(); };
    try {
      if (!op || !token) return back(false);
      const { data: t } = await supabase.from('tenant_integrations').select('*').eq('restaurant_id', op.restaurant_id).maybeSingle();
      if (!t || !t.pay_api_key || !t.pay_secret) return back(false);
      const result = await iyzicoCall(t, '/payment/iyzipos/checkoutform/auth/ecom/detail', { locale: 'tr', conversationId: op.id, token });
      if (result.status !== 'success' || result.paymentStatus !== 'SUCCESS' || result.basketId !== op.id) {
        await supabase.from('online_payments').update({ status: 'failed', error: String(result.errorMessage || result.paymentStatus || 'hata').slice(0, 300), finished_at: new Date().toISOString() }).eq('id', op.id);
        return back(false);
      }
      const { error } = await supabase.rpc('_finalize_online_payment', { p_id: op.id, p_ref: String(result.paymentId || ''), p_paid: Number(result.paidPrice || result.price || 0) });
      return back(!error);
    } catch (e) {
      console.error('order-pay callback', e);
      return back(false);
    }
  }
  // ---- odeme baslat ----
  try {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const pid = String((req.body && req.body.payment_id) || '');
    const { data: op } = await supabase.from('online_payments').select('*').eq('id', pid).maybeSingle();
    if (!op || op.status !== 'pending') { res.status(400).json({ error: 'Ödeme kaydı bulunamadı' }); return; }
    if (Date.now() - new Date(op.created_at).getTime() > 30 * 60 * 1000) { res.status(400).json({ error: 'Ödeme süresi doldu, lütfen tekrar deneyin' }); return; }
    const { data: t } = await supabase.from('tenant_integrations').select('*').eq('restaurant_id', op.restaurant_id).maybeSingle();
    if (!t || t.pay_provider !== 'iyzico' || !t.pay_api_key || !t.pay_secret || !['optional', 'required'].includes(t.pay_mode)) { res.status(400).json({ error: 'Bu işletmede online ödeme kapalı' }); return; }
    const { data: rest } = await supabase.from('restaurants').select('name, billing_city').eq('id', op.restaurant_id).maybeSingle();
    const p = op.payload || {};
    const parts = String(p.name || 'Müşteri').trim().split(/\s+/);
    const surname = parts.length > 1 ? parts.pop() : '-';
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || '85.34.78.112';
    const city = (rest && rest.billing_city) || 'Istanbul';
    const addr = String(p.address || (rest && rest.name) || 'Gel-al').slice(0, 250);
    const phone = String(p.phone || '').replace(/\D/g, '');
    const body = {
      locale: 'tr', conversationId: op.id, price: price(op.amount), paidPrice: price(op.amount), currency: 'TRY', basketId: op.id,
      paymentGroup: 'PRODUCT', callbackUrl: `${SITE}/api/order-pay?cb=1&p=${op.id}`, enabledInstallments: [1],
      buyer: { id: phone || op.id, name: parts.join(' ') || 'Müşteri', surname, gsmNumber: phone ? '+90' + phone.slice(-10) : undefined,
        email: `siparis+${op.id.slice(0, 8)}@peyktan.com`, identityNumber: '11111111111', registrationAddress: addr, ip, city, country: 'Turkey' },
      shippingAddress: { contactName: p.name || 'Müşteri', city, country: 'Turkey', address: addr },
      billingAddress: { contactName: p.name || 'Müşteri', city, country: 'Turkey', address: addr },
      basketItems: [{ id: 'order', name: `${(rest && rest.name) || 'Restoran'} online sipariş`, category1: 'Yemek', itemType: 'PHYSICAL', price: price(op.amount) }],
    };
    const r = await iyzicoCall(t, '/payment/iyzipos/checkoutform/initialize/auth/ecom', body);
    if (r.status !== 'success' || !r.paymentPageUrl) {
      await supabase.from('online_payments').update({ status: 'failed', error: String(r.errorMessage || 'başlatılamadı').slice(0, 300) }).eq('id', op.id);
      res.status(400).json({ error: 'Ödeme başlatılamadı: ' + (r.errorMessage || 'iyzico hatası') }); return;
    }
    await supabase.from('online_payments').update({ provider_token: r.token }).eq('id', op.id);
    res.status(200).json({ url: r.paymentPageUrl });
  } catch (e) {
    console.error('order-pay', e);
    res.status(500).json({ error: 'Ödeme başlatılamadı' });
  }
};
