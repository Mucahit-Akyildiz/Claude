// Vercel serverless function: payment-callback
// iyzico odeme sonucunu bu adrese POST eder (token). Sonucu iyzico'dan tekrar sorup
// dogrulayip, basariliysa isletmeyi aktif eder ve payments/promo_codes kayitlarini gunceller.
//
// NOT: payment-initialize.js gercek Supabase Edge Function kaynagindan birebir tasindi,
// ama bu dosyanin karsiligi olan orijinal payment-callback kaynagini gormedim - asagidaki
// akis, notlardaki "restaurants.is_active = true ve expires_at set edilir" aciklamasina ve
// payment-initialize'in olusturdugu payments satirina dayanan en iyi tahminimdir. Orijinal
// payment-callback kodunuz varsa paylasin, birebir esitleyeyim.
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const IYZICO_BASE_URL = process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com';
const IYZICO_API_KEY = process.env.IYZICO_API_KEY;
const IYZICO_SECRET_KEY = process.env.IYZICO_SECRET_KEY;

// payment-initialize.js'teki PACKAGE_PRICES ile senkron olmali (gun cinsinden sure).
const PACKAGE_DURATIONS = { paket1: 14, paket2: 60, paket3: 180 };

function randomKey() {
  return Date.now().toString() + Math.floor(Math.random() * 1000000).toString();
}
function hmacHex(key, message) {
  return crypto.createHmac('sha256', key).update(message).digest('hex');
}
// iyzico IYZWSv2: imza randomKey + uriPath + gövde (JSON) üzerinden hesaplanır.
function iyzicoAuthHeaders(uriPath, body) {
  const bodyStr = JSON.stringify(body);
  const rk = randomKey();
  const signature = hmacHex(IYZICO_SECRET_KEY, rk + uriPath + bodyStr);
  const authParams = `apiKey:${IYZICO_API_KEY}&randomKey:${rk}&signature:${signature}`;
  const b64 = Buffer.from(authParams).toString('base64');
  return {
    Authorization: `IYZWSv2 ${b64}`,
    'x-iyzi-rnd': rk,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': 'Mozilla/5.0 (compatible; RestoranYonetim/1.0)',
  };
}

module.exports = async function handler(req, res) {
  const loginUrl = process.env.APP_LOGIN_URL || '/';
  const token = req.method === 'POST' ? (req.body || {}).token : req.query.token;

  if (!token) {
    res.redirect(302, loginUrl + '?odeme=eksik');
    return;
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const uriPath = '/payment/iyzipos/checkoutform/auth/detail';
    const body = { locale: 'tr', token };
    const headers = iyzicoAuthHeaders(uriPath, body);
    const response = await fetch(`${IYZICO_BASE_URL}${uriPath}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const result = await response.json();

    if (result.status !== 'success' || result.paymentStatus !== 'SUCCESS') {
      await supabase.from('payments').update({ status: 'failed' }).eq('provider_ref', token);
      res.redirect(302, loginUrl + '?odeme=basarisiz');
      return;
    }

    const restaurantId = result.conversationId;
    const packageId = result.basketItems && result.basketItems[0] ? result.basketItems[0].id : null;
    const durationDays = PACKAGE_DURATIONS[packageId] || 14;
    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

    await supabase.from('restaurants').update({ is_active: true, expires_at: expiresAt }).eq('id', restaurantId);

    const { data: paymentRow } = await supabase
      .from('payments')
      .update({ status: 'success' })
      .eq('provider_ref', token)
      .select('promo_code_id')
      .maybeSingle();

    if (paymentRow && paymentRow.promo_code_id) {
      const { data: promoRow } = await supabase
        .from('promo_codes')
        .select('used_count')
        .eq('id', paymentRow.promo_code_id)
        .single();
      if (promoRow) {
        await supabase
          .from('promo_codes')
          .update({ used_count: promoRow.used_count + 1 })
          .eq('id', paymentRow.promo_code_id);
      }
    }

    res.redirect(302, loginUrl + '?odeme=basarili');
  } catch (e) {
    console.error(e);
    res.redirect(302, loginUrl + '?odeme=hata');
  }
};
