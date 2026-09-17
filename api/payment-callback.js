const Iyzipay = require('iyzipay');

/* payment-initialize.js'teki PACKAGES ile senkron olmalı (gün cinsinden süre). */
const PACKAGE_DURATIONS = { paket1: 14, paket2: 60, paket3: 180 };

module.exports = async function handler(req, res) {
  const token = req.method === 'POST' ? (req.body || {}).token : req.query.token;
  const loginUrl = process.env.APP_LOGIN_URL || '/';

  if (!token) {
    res.redirect(302, loginUrl + '?odeme=eksik');
    return;
  }

  const iyzipay = new Iyzipay({
    apiKey: process.env.IYZICO_API_KEY,
    secretKey: process.env.IYZICO_SECRET_KEY,
    uri: process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com',
  });

  iyzipay.checkoutForm.retrieve({ locale: Iyzipay.LOCALE.TR, token: token }, async function (err, result) {
    if (err || !result || result.paymentStatus !== 'SUCCESS') {
      res.redirect(302, loginUrl + '?odeme=basarisiz');
      return;
    }

    const restaurantId = result.conversationId;
    const packageId = result.basketItems && result.basketItems[0] ? result.basketItems[0].id : null;
    const durationDays = PACKAGE_DURATIONS[packageId] || 14;
    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

    try {
      const resp = await fetch(process.env.SUPABASE_URL + '/rest/v1/restaurants?id=eq.' + restaurantId, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ is_active: true, expires_at: expiresAt }),
      });
      if (!resp.ok) {
        console.error('Supabase restoran aktivasyon hatası:', await resp.text());
        res.redirect(302, loginUrl + '?odeme=aktivasyon_hatasi');
        return;
      }
    } catch (e) {
      console.error(e);
      res.redirect(302, loginUrl + '?odeme=aktivasyon_hatasi');
      return;
    }

    res.redirect(302, loginUrl + '?odeme=basarili');
  });
};
