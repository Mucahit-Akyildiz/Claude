const Iyzipay = require('iyzipay');

/* Paket fiyatları (TL) — placeholder, gerçek fiyatlarınıza göre güncelleyin.
   Paket süreleri (gün) — payment-callback.js'teki PACKAGE_DURATIONS ile senkron olmalı. */
const PACKAGES = {
  paket1: { price: 499, name: 'Paket 1 - Başlangıç' },
  paket2: { price: 999, name: 'Paket 2 - Standart' },
  paket3: { price: 2499, name: 'Paket 3 - Profesyonel' },
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ errorMessage: 'Sadece POST istekleri kabul edilir.' });
    return;
  }

  const { restaurant_id, package_id, buyer } = req.body || {};
  if (!restaurant_id || !package_id || !buyer || !buyer.name || !buyer.email || !buyer.phone) {
    res.status(400).json({ errorMessage: 'Eksik bilgi: restaurant_id, package_id ve müşteri bilgileri gerekli.' });
    return;
  }

  const pkg = PACKAGES[package_id];
  if (!pkg) {
    res.status(400).json({ errorMessage: 'Geçersiz paket: ' + package_id });
    return;
  }

  /* NOT: İndirim kodu (promo) burada henüz uygulanmıyor — promo_codes tablosunu
     doğrulayan RPC bağlanınca fiyat buradan düşülecek şekilde eklenmeli. */
  const price = pkg.price.toFixed(2);

  const iyzipay = new Iyzipay({
    apiKey: process.env.IYZICO_API_KEY,
    secretKey: process.env.IYZICO_SECRET_KEY,
    uri: process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com',
  });

  const nameParts = buyer.name.trim().split(/\s+/);
  const surname = nameParts.length > 1 ? nameParts.pop() : nameParts[0];
  const name = nameParts.join(' ') || surname;
  const phoneDigits = buyer.phone.replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '');
  const gsmNumber = '+90' + phoneDigits;
  const ip = (req.headers['x-forwarded-for'] || '85.34.78.112').toString().split(',')[0].trim();

  const request = {
    locale: Iyzipay.LOCALE.TR,
    conversationId: restaurant_id,
    price: price,
    paidPrice: price,
    currency: Iyzipay.CURRENCY.TRY,
    basketId: 'kayit-' + restaurant_id,
    paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
    callbackUrl: process.env.CALLBACK_URL,
    buyer: {
      id: restaurant_id,
      name: name,
      surname: surname,
      gsmNumber: gsmNumber,
      email: buyer.email,
      /* Sandbox test kimlik no — gerçek ödemeye geçişte müşteriden TC kimlik no
         alınıp buraya yazılmalı (iyzico bunu zorunlu tutuyor). */
      identityNumber: '74300864791',
      registrationAddress: 'Belirtilmedi',
      ip: ip,
      city: 'Istanbul',
      country: 'Turkey',
    },
    shippingAddress: {
      contactName: buyer.name,
      city: 'Istanbul',
      country: 'Turkey',
      address: 'Belirtilmedi',
    },
    billingAddress: {
      contactName: buyer.name,
      city: 'Istanbul',
      country: 'Turkey',
      address: 'Belirtilmedi',
    },
    basketItems: [
      {
        id: package_id,
        name: pkg.name,
        category1: 'Yazılım Aboneliği',
        itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
        price: price,
      },
    ],
  };

  iyzipay.checkoutFormInitialize.create(request, function (err, result) {
    if (err) {
      res.status(500).json({ errorMessage: 'iyzico bağlantı hatası: ' + err.message });
      return;
    }
    if (result.status !== 'success') {
      res.status(400).json({ errorMessage: result.errorMessage || 'Ödeme başlatılamadı.' });
      return;
    }
    res.status(200).json({ paymentPageUrl: result.paymentPageUrl, token: result.token });
  });
};
