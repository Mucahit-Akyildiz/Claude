// Vercel serverless function: payment-callback (ABONELIK YENILEME sonucu)
// iyzico odeme sonucunu bu adrese POST eder (token). Sonucu iyzico'dan tekrar sorup
// dogrulayip, basariliysa isletmenin suresini (expires_at) 30 gun uzatir.
//
// ONEMLI: Burasi artik CANLI, kullanimda olan bir isletmenin yenileme odemesini
// isliyor - odeme basarisiz olsa da isletme/kullanicilar ASLA silinmiyor (eski
// kayit-oncesi-odeme akisindaki rollback davranisi kasitli olarak kaldirildi).
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const IYZICO_BASE_URL = process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com';
const IYZICO_API_KEY = process.env.IYZICO_API_KEY;
const IYZICO_SECRET_KEY = process.env.IYZICO_SECRET_KEY;

const RENEWAL_DAYS = 30;

function randomKey() {
  return Date.now().toString() + Math.floor(Math.random() * 1000000).toString();
}
function hmacHex(key, message) {
  return crypto.createHmac('sha256', key).update(message).digest('hex');
}
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
    const { data: paymentLookup } = await supabase
      .from('payments')
      .select('restaurant_id, package_id, status')
      .eq('provider_ref', token)
      .maybeSingle();

    if (!paymentLookup) {
      res.redirect(302, loginUrl + '?odeme=bulunamadi');
      return;
    }

    // iyzico callback'i (yeniden deneme, kullanıcının linki iki kez açması,
    // ya da iki isteğin tam eşzamanlı gelmesi gibi nedenlerle) aynı token
    // için birden fazla gelebilir. Basit bir "if status==success" kontrolü
    // iki eşzamanlı isteğin ikisini de geçirebilir (ikisi de aynı anda eski
    // durumu okur); bunun yerine aşağıda iyzico onayından SONRA atomik bir
    // "claim" (status='success' WHERE status<>'success') yapılıyor - sadece
    // claim'i kazanan istek expires_at'i uzatabiliyor.
    if (paymentLookup.status === 'success') {
      res.redirect(302, loginUrl + '?odeme=basarili');
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
      await supabase.from('payment_debug_log').insert({
        context: 'payment-callback:detail_failed',
        payload: JSON.stringify({ token, restaurant_id: paymentLookup.restaurant_id, result }),
      });
      await supabase.from('payments').update({ status: 'failed' }).eq('provider_ref', token);
      res.redirect(302, loginUrl + '?odeme=basarisiz');
      return;
    }

    const restaurantId = paymentLookup.restaurant_id;

    // Atomik claim: yalnızca bu isteğin bulduğu satır henüz 'success'
    // değilse status'u değiştirebiliyor. Eşzamanlı ikinci istek 0 satır
    // döner ve expires_at'i ikinci kez uzatmadan çıkar - böylece iyzico'nun
    // aynı token için gönderebileceği tekrar eden/paralel callback'ler
    // aboneliği yalnızca bir kez uzatır.
    const { data: claimedRows } = await supabase
      .from('payments')
      .update({ status: 'success' })
      .eq('provider_ref', token)
      .neq('status', 'success')
      .select('id');

    if (!claimedRows || claimedRows.length === 0) {
      res.redirect(302, loginUrl + '?odeme=basarili');
      return;
    }

    // Onceden "once OKU sonra YAZ" (iki ayri sorgu) ile yapiliyordu - bu,
    // ayni anda onaylanan bir havale bildirimiyle (bkz.
    // admin_review_bank_transfer_notice) yarisip ya kayip bir guncellemeye
    // ya da (nadiren) cifte uzatmaya yol acabiliyordu. Artik TEK atomik bir
    // Postgres fonksiyonu (satiri kilitleyip ayni statement icinde okuyup
    // yazan) kullaniliyor.
    await supabase.rpc('extend_restaurant_subscription', {
      p_restaurant_id: restaurantId,
      p_days: RENEWAL_DAYS,
    });

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
