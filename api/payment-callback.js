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

// payment-initialize.js'teki ile ayni: odeme basarisiz olursa, odemeden ONCE olusturulan
// pasif isletme kaydini geri alir (cascade ile payments/app_users da silinir), boylece
// kullanici ayni isletme koduyla hemen tekrar deneyebilir.
async function rollbackRegistration(supabase, restaurantId) {
  try {
    await supabase.from('app_users').delete().eq('restaurant_id', restaurantId);
    await supabase.from('restaurants').delete().eq('id', restaurantId);
  } catch (e) {
    console.error('rollbackRegistration basarisiz:', e);
  }
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
    // iyzico'nun checkoutform/auth/detail uc noktasi conversationId alanini da bekliyor -
    // eksik olunca "Geçersiz istek" (errorCode 11) donuyordu. Bunu kendi kaydimizdan (token
    // ile eslesen payments satirindan) aliyoruz, iyzico'nun cevabina guvenmeden once.
    const { data: paymentLookup } = await supabase
      .from('payments')
      .select('restaurant_id, package_id')
      .eq('provider_ref', token)
      .maybeSingle();

    if (!paymentLookup) {
      res.redirect(302, loginUrl + '?odeme=bulunamadi');
      return;
    }

    const uriPath = '/payment/iyzipos/checkoutform/auth/ecom/detail';
    const body = { locale: 'tr', conversationId: paymentLookup.restaurant_id, token };
    const headers = iyzicoAuthHeaders(uriPath, body);
    const response = await fetch(`${IYZICO_BASE_URL}${uriPath}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const result = await response.json();

    if (result.status !== 'success' || result.paymentStatus !== 'SUCCESS') {
      // restaurants -> payments CASCADE ile bagli, rollback bu satiri da silecegi icin
      // teshis bilgisini rollback'ten etkilenmeyen ayri bir tabloya yaziyoruz.
      await supabase.from('payment_debug_log').insert({
        context: 'payment-callback:detail_failed',
        payload: JSON.stringify({ token, restaurant_id: paymentLookup.restaurant_id, result }),
      });
      await rollbackRegistration(supabase, paymentLookup.restaurant_id);
      res.redirect(302, loginUrl + '?odeme=basarisiz');
      return;
    }

    const restaurantId = paymentLookup.restaurant_id;
    const packageId = paymentLookup.package_id;
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
    try {
      await supabase.from('payment_debug_log').insert({
        context: 'payment-callback:exception',
        payload: JSON.stringify({ token, message: e.message, stack: e.stack }),
      });
    } catch (logErr) {
      console.error('payment_debug_log yazilamadi:', logErr);
    }
    console.error(e);
    res.redirect(302, loginUrl + '?odeme=hata');
  }
};
