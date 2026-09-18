// Vercel serverless function: payment-initialize
// Bir isletme icin iyzico odeme formunu baslatir, odeme sayfasi adresini JSON olarak doner.
// Supabase Edge Function'daki orijinal payment-initialize'in birebir Vercel/Node portu
// (Supabase'in bulut IP aralığından iyzico sandbox'ına ulaşılamadığı için taşındı).
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const IYZICO_BASE_URL = process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com';
const IYZICO_API_KEY = process.env.IYZICO_API_KEY;
const IYZICO_SECRET_KEY = process.env.IYZICO_SECRET_KEY;
const CALLBACK_URL = process.env.CALLBACK_URL; // https://<vercel-domaininiz>/api/payment-callback

const PACKAGE_PRICES = {
  paket1: 499,
  paket2: 999,
  paket3: 2499,
};

function randomKey() {
  return Date.now().toString() + Math.floor(Math.random() * 1000000).toString();
}

function hmacHex(key, message) {
  return crypto.createHmac('sha256', key).update(message).digest('hex');
}

// iyzico IYZWSv2: imza randomKey + uriPath + gövde (JSON) üzerinden hesaplanır.
// uriPath, tam adresin yol kısmıdır (ör. "/payment/iyzipos/checkoutform/initialize/auth/ecom") -
// bu eksik olursa iyzico "Geçersiz imza" (invalid signature) hatası döner.
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
  try {
    const restaurantId = req.method === 'GET' ? req.query.restaurant_id : (req.body || {}).restaurant_id;
    const promoCodeRaw = req.method === 'GET' ? req.query.promo : (req.body || {}).promo;
    const promoCode = promoCodeRaw ? String(promoCodeRaw).trim() : null;

    if (!restaurantId) {
      res.status(400).json({ errorMessage: 'restaurant_id gerekli' });
      return;
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: restaurant, error } = await supabase
      .from('restaurants')
      .select('id, name, email, phone, package_id, code')
      .eq('id', restaurantId)
      .single();

    if (error || !restaurant) {
      res.status(404).json({ errorMessage: 'Isletme bulunamadi' });
      return;
    }

    let price = PACKAGE_PRICES[restaurant.package_id] || 0;
    if (price <= 0) {
      res.status(400).json({ errorMessage: 'Gecersiz paket fiyati' });
      return;
    }

    let appliedPromo = null;
    if (promoCode) {
      const { data: promo } = await supabase
        .from('promo_codes')
        .select('id, code, discount_type, discount_value, max_uses, used_count, active, expires_at')
        .ilike('code', promoCode)
        .maybeSingle();

      if (
        promo &&
        promo.active &&
        (promo.expires_at === null || new Date(promo.expires_at) > new Date()) &&
        (promo.max_uses === null || promo.used_count < promo.max_uses)
      ) {
        const discount =
          promo.discount_type === 'percent'
            ? price * (Number(promo.discount_value) / 100)
            : Number(promo.discount_value);
        price = Math.max(1, price - discount);
        appliedPromo = { id: promo.id, code: promo.code };
      }
    }

    const priceStr = price.toFixed(2);
    const basketId = 'pkg_' + restaurant.package_id + '_' + Date.now();

    const body = {
      locale: 'tr',
      conversationId: restaurantId,
      price: priceStr,
      paidPrice: priceStr,
      currency: 'TRY',
      basketId,
      paymentGroup: 'PRODUCT',
      callbackUrl: CALLBACK_URL,
      enabledInstallments: [1],
      buyer: {
        id: restaurant.id,
        name: restaurant.name,
        surname: '-',
        gsmNumber: restaurant.phone,
        email: restaurant.email,
        identityNumber: '11111111111',
        registrationAddress: '-',
        city: 'Istanbul',
        country: 'Turkey',
        ip: (req.headers['x-forwarded-for'] || '85.34.78.112').toString().split(',')[0].trim(),
      },
      shippingAddress: {
        contactName: restaurant.name,
        city: 'Istanbul',
        country: 'Turkey',
        address: '-',
      },
      billingAddress: {
        contactName: restaurant.name,
        city: 'Istanbul',
        country: 'Turkey',
        address: '-',
      },
      basketItems: [
        {
          id: restaurant.package_id,
          name: 'Restoran Yonetim Sistemi - ' + restaurant.package_id,
          category1: 'Yazilim',
          itemType: 'VIRTUAL',
          price: priceStr,
        },
      ],
    };

    const uriPath = '/payment/iyzipos/checkoutform/initialize/auth/ecom';
    const headers = iyzicoAuthHeaders(uriPath, body);
    const iyzicoUrl = `${IYZICO_BASE_URL}${uriPath}`;

    let response = null;
    let lastErr = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        response = await fetch(iyzicoUrl, { method: 'POST', headers, body: JSON.stringify(body) });
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    if (!response) {
      // Teshis icin gercek network hatasini (DNS/timeout/reset vb.) veritabanina kaydediyoruz.
      const errDetail = lastErr
        ? { message: lastErr.message, code: lastErr.code, cause: lastErr.cause ? String(lastErr.cause) : null }
        : { message: 'bilinmeyen hata' };
      await supabase.from('payments').insert({
        restaurant_id: restaurant.id,
        package_id: restaurant.package_id,
        amount: price,
        status: 'init_failed',
        provider_ref: null,
        promo_code_id: appliedPromo ? appliedPromo.id : null,
        promo_code: appliedPromo ? appliedPromo.code : null,
        debug_response: JSON.stringify(errDetail),
      });
      res.status(502).json({
        errorMessage: "iyzico'ya birden fazla denemede ulaşılamadı: " + (lastErr ? lastErr.message : 'bilinmeyen hata'),
      });
      return;
    }

    const result = await response.json();

    if (result.status !== 'success' || !result.paymentPageUrl) {
      res.status(400).json({ errorMessage: 'Odeme baslatilamadi: ' + (result.errorMessage || JSON.stringify(result)) });
      return;
    }

    await supabase.from('payments').insert({
      restaurant_id: restaurant.id,
      package_id: restaurant.package_id,
      amount: price,
      status: 'pending',
      provider_ref: result.token,
      promo_code_id: appliedPromo ? appliedPromo.id : null,
      promo_code: appliedPromo ? appliedPromo.code : null,
    });

    res.status(200).json({ paymentPageUrl: result.paymentPageUrl });
  } catch (e) {
    res.status(500).json({ errorMessage: 'Hata: ' + e.message });
  }
};
