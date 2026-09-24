// Vercel serverless function: payment-initialize (ABONELIK YENILEME)
// 7 gunluk ucretsiz denemeden sonra ya da suresi yaklasan/dolan bir isletme icin
// AYLIK yenileme odemesini iyzico uzerinden baslatir. Kayit sirasinda cagrilmiyor
// artik (kayit olunca hesap direkt 7 gun aktif aciliyor, bkz. verify_registration_otp).
//
// Guvenlik: restaurant_id client'tan dogrudan alinmiyor, iki yoldan biriyle
// dogrulanip sunucu tarafinda bulunuyor:
//  1) p_token: hala gecerli bir staff_sessions oturumu var (Ayarlar > Ode/Yenile).
//  2) p_code + p_username + p_password: oturum artik yok (abonelik suresi
//     dolunca login_staff girisi zaten engelliyor) - bu durumda
//     verify_restaurant_credentials RPC'si ile sahiplik (sadece manager,
//     dogru sifre) dogrulanir; aktif/suresi-dolmus olmasi onemli degil,
//     zaten amac tam da kilitli kalan bir hesabi odemeyle acmak.
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const IYZICO_BASE_URL = process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com';
const IYZICO_API_KEY = process.env.IYZICO_API_KEY;
const IYZICO_SECRET_KEY = process.env.IYZICO_SECRET_KEY;
const CALLBACK_URL = process.env.CALLBACK_URL; // https://<vercel-domaininiz>/api/payment-callback

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
  try {
    const params = req.method === 'GET' ? req.query : (req.body || {});
    const { p_token: token, p_code: code, p_username: username, p_password: password } = params;

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    let restaurantId = null;

    if (token) {
      const { data: session } = await supabase
        .from('staff_sessions')
        .select('restaurant_id, user_id')
        .eq('token', token)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (!session) {
        res.status(401).json({ errorMessage: 'Oturum geçersiz veya süresi dolmuş, tekrar giriş yapın' });
        return;
      }
      // 'role' sütunu dinamik rol/izin sistemine geçilirken kaldırıldı -
      // yöneticilik artık app_users.role_ids üzerinden roles.is_system'a
      // bakılarak doğrulanıyor (bkz. Supabase'deki is_system kontrol deseni).
      const { data: userRow } = await supabase
        .from('app_users')
        .select('role_ids')
        .eq('id', session.user_id)
        .maybeSingle();
      let isManager = false;
      if (userRow && userRow.role_ids && userRow.role_ids.length) {
        const { data: roleRows } = await supabase
          .from('roles')
          .select('is_system')
          .in('id', userRow.role_ids)
          .eq('is_system', true)
          .limit(1);
        isManager = !!(roleRows && roleRows.length);
      }
      if (!isManager) {
        res.status(403).json({ errorMessage: 'Bu işlem için yetkiniz yok' });
        return;
      }
      restaurantId = session.restaurant_id;
    } else if (code && username && password) {
      // Oturum yok (abonelik süresi dolunca login_staff girişi zaten
      // engelliyor) - sahiplik kod+kullanıcı adı+şifre ile doğrulanır.
      const { data: rows, error: verifyErr } = await supabase.rpc('verify_restaurant_credentials', {
        p_code: code, p_username: username, p_password: password,
      });
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (verifyErr || !row) {
        res.status(401).json({ errorMessage: 'İşletme kodu, kullanıcı adı veya şifre hatalı' });
        return;
      }
      restaurantId = row.restaurant_id;
    } else {
      res.status(400).json({ errorMessage: 'Oturum token veya işletme kimlik bilgileri gerekli' });
      return;
    }

    const { data: restaurant, error } = await supabase
      .from('restaurants')
      .select('id, name, email, phone, package_id')
      .eq('id', restaurantId)
      .single();

    if (error || !restaurant) {
      res.status(404).json({ errorMessage: 'Isletme bulunamadi' });
      return;
    }

    const { data: pkgRow } = await supabase
      .from('packages')
      .select('price')
      .eq('id', restaurant.package_id)
      .maybeSingle();
    const price = Number(pkgRow && pkgRow.price) || 0;
    if (price <= 0) {
      res.status(400).json({ errorMessage: 'Gecersiz paket fiyati' });
      return;
    }
    const priceStr = price.toFixed(2);
    const basketId = 'renew_' + restaurant.package_id + '_' + Date.now();

    const phoneDigits = String(restaurant.phone || '').replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '');
    const gsmNumber = '+90' + phoneDigits;

    const body = {
      locale: 'tr',
      conversationId: restaurant.id,
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
        surname: 'Yetkilisi',
        gsmNumber: gsmNumber,
        email: restaurant.email,
        identityNumber: '74300864791',
        registrationAddress: 'Belirtilmedi Mah. Belirtilmedi Sk. No:1',
        city: 'Istanbul',
        country: 'Turkey',
        ip: (req.headers['x-forwarded-for'] || '85.34.78.112').toString().split(',')[0].trim(),
      },
      shippingAddress: {
        contactName: restaurant.name,
        city: 'Istanbul',
        country: 'Turkey',
        address: 'Belirtilmedi Mah. Belirtilmedi Sk. No:1',
      },
      billingAddress: {
        contactName: restaurant.name,
        city: 'Istanbul',
        country: 'Turkey',
        address: 'Belirtilmedi Mah. Belirtilmedi Sk. No:1',
      },
      basketItems: [
        {
          id: restaurant.package_id,
          name: 'Restoran Yonetim Sistemi - Aylik Yenileme - ' + restaurant.package_id,
          category1: 'Yazilim Aboneligi',
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
      const errDetail = lastErr
        ? { message: lastErr.message, code: lastErr.code, cause: lastErr.cause ? String(lastErr.cause) : null }
        : { message: 'bilinmeyen hata' };
      await supabase.from('payment_debug_log').insert({
        context: 'payment-initialize:fetch_failed',
        payload: JSON.stringify({ restaurant_id: restaurant.id, ...errDetail }),
      });
      res.status(502).json({
        errorMessage: "iyzico'ya birden fazla denemede ulaşılamadı: " + (lastErr ? lastErr.message : 'bilinmeyen hata'),
      });
      return;
    }

    const result = await response.json();

    if (result.status !== 'success' || !result.paymentPageUrl) {
      await supabase.from('payment_debug_log').insert({
        context: 'payment-initialize:iyzico_rejected',
        payload: JSON.stringify({ restaurant_id: restaurant.id, result }),
      });
      res.status(400).json({ errorMessage: 'Odeme baslatilamadi: ' + (result.errorMessage || JSON.stringify(result)) });
      return;
    }

    // Not: burada restaurant zaten var olan, canli/aktif bir hesap - basarisiz olsa da
    // ASLA silinmiyor (eski kayit-oncesi-odeme akisindaki rollback burada yok kasitli).
    await supabase.from('payments').insert({
      restaurant_id: restaurant.id,
      package_id: restaurant.package_id,
      amount: price,
      status: 'pending',
      provider_ref: result.token,
    });

    res.status(200).json({ paymentPageUrl: result.paymentPageUrl });
  } catch (e) {
    res.status(500).json({ errorMessage: 'Hata: ' + e.message });
  }
};
