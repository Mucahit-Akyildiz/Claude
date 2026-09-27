// Firebase Cloud Messaging (HTTP v1) gonderici - native Android uygulamasindaki
// push_subscriptions.platform='android-fcm' satirlari icin kullanilir (web
// push_subscriptions'lardan ayri, bkz. dispatch-ready-pushes.js). Firebase'in
// agir 'firebase-admin' paketini eklemek yerine, servis hesabi JSON'undan
// (FIREBASE_SERVICE_ACCOUNT_JSON ortam degiskeni) Node'un yerlesik 'crypto'
// modulüyle bir JWT imzalayip Google'in token endpoint'inden kisa omurlu bir
// erisim tokeni aliyoruz - projede zaten Resend/iyzico gibi entegrasyonlar da
// SDK'siz, dogrudan fetch ile yapiliyor, ayni sadelik burada da korunuyor.
const crypto = require('crypto');

const SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
let _serviceAccount = null;
function getServiceAccount() {
  if (!SERVICE_ACCOUNT_JSON) return null;
  if (_serviceAccount) return _serviceAccount;
  try {
    _serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON);
  } catch (e) {
    // Vercel ortam değişkeni tek satır bekler, ama Firebase'in indirilen
    // servis hesabı JSON'undaki private_key alanı gerçek (kaçışsız) satır
    // sonlarıyla geliyor - bu da JSON içinde ham kontrol karakteri olduğu
    // için parse hatası veriyor. O satır sonlarını \n kaçış dizisine
    // çevirip tekrar deniyoruz.
    try {
      _serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON.replace(/\r?\n/g, '\\n'));
    } catch (e2) {
      return null;
    }
  }
  return _serviceAccount;
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Erisim tokenini bellekte, suresi dolana kadar (1 dk pay birakarak) yeniden
// kullanir - ayni serverless container'in art arda gelen cagrilarinda her
// seferinde Google'a JWT-bearer degisimi yapmamak icin.
let _cachedToken = null;
let _cachedTokenExpiresAt = 0;
async function getAccessToken() {
  const sa = getServiceAccount();
  if (!sa) return null;
  if (_cachedToken && Date.now() < _cachedTokenExpiresAt - 60000) return _cachedToken;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(claims));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const signature = signer.sign(sa.private_key).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = unsigned + '.' + signature;

  const resp = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + jwt,
  });
  const json = await resp.json();
  if (!resp.ok || !json.access_token) {
    throw new Error('FCM erişim token alınamadı: ' + (json.error_description || json.error || resp.status));
  }
  _cachedToken = json.access_token;
  _cachedTokenExpiresAt = Date.now() + (json.expires_in || 3600) * 1000;
  return _cachedToken;
}

// payload: { title, body, url, view, tag } - hem bildirim (uygulama
// kapaliyken/arka plandayken OS'un kendisi gosterir) hem data (uygulama acikken
// dinleyicilerin okuyabilmesi, dokununca yonlendirme icin) olarak gonderilir.
// Basarisiz gonderimde, token artik gecersizse (UNREGISTERED/NOT_FOUND) true
// doner ki cagiran tarafta abonelik satiri silinebilsin (web-push'taki
// 404/410 davranisiyla aynı amac).
async function sendFcmNotification(fcmToken, payload) {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error('FCM yapılandırılmamış (FIREBASE_SERVICE_ACCOUNT_JSON eksik)');
  const sa = getServiceAccount();
  const resp = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        notification: { title: payload.title, body: payload.body },
        data: {
          url: payload.url || '/app/',
          view: payload.view || '',
          tag: payload.tag || '',
        },
        // channel_id VERİLMİYOR: 'default' diye bir bildirim kanalı cihazda hiç
        // oluşturulmamıştı (uygulama tarafında hiçbir yerde
        // NotificationChannel/createChannel çağrısı yok) - Android 8+'ta FCM'in
        // bilmediği bir kanal adı verilirse bildirim SESSİZCE hiç gösterilmez
        // (uygulamayı açınca değil, hiçbir zaman). channel_id boş bırakılınca
        // Firebase Messaging SDK'nın kendi otomatik oluşturduğu varsayılan
        // kanalı kullanılıyor, bu yüzden bildirim artık gerçekten görünür.
        android: { priority: 'high' },
      },
    }),
  });
  if (resp.ok) return { ok: true };
  const errJson = await resp.json().catch(() => ({}));
  const status = errJson && errJson.error && errJson.error.status;
  const invalid = status === 'UNREGISTERED' || status === 'NOT_FOUND' || status === 'INVALID_ARGUMENT';
  const err = new Error('FCM gönderim hatası: ' + (status || resp.status));
  err.invalidToken = invalid;
  throw err;
}

module.exports = { sendFcmNotification, getServiceAccount };
