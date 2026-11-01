// Peyktan service worker: Web Push bildirimleri + çevrimdışı açılış.
// Önbellek stratejisi "önce ağ": internet varken her zaman sunucudaki güncel dosya
// kullanılır (POS hep canlı kalır), önbellek yalnızca bağlantı yokken devreye girer.
// Veri (Supabase API) önbelleğe ALINMAZ; çevrimdışı veri offline.js'te yönetilir.
const SHELL_CACHE = 'peyktan-shell-v254';
const SHELL = [
  '/app/',
  '/app/manifest.webmanifest',
  '/app/css/app.css',
  '/assets/images/logo.webp',
  '/app/js/theme-init.js',
  '/assets/vendor/supabase.js',
  '/assets/js/act.js',
  '/app/js/api.js',
  '/app/js/state.js',
  '/app/js/utils.js',
  '/app/js/financial.js',
  '/app/js/financial-period.js',
  '/app/js/financial-accounts.js',
  '/app/js/analytics.js',
  '/app/js/reservations.js',
  '/app/js/crm.js',
  '/app/js/supplier.js',
  '/app/js/admin-panel.js',
  '/app/js/settings.js',
  '/app/js/settings-menu.js',
  '/app/js/settings-users.js',
  '/app/js/settings-billing.js',
  '/app/js/settings-comm.js',
  '/app/js/integration-hub.js',
  '/app/js/pos-kitchen.js',
  '/app/js/pos-payments.js',
  '/app/js/pos-extras.js',
  '/app/js/pos-table.js',
  '/app/js/allowances.js',
  '/app/js/excel-io.js',
  '/app/js/birthdays.js',
  '/app/js/pos-packages.js',
  '/app/js/pos-printer.js',
  '/app/js/voice-notify.js',
  '/app/js/pos-push.js',
  '/app/js/pos-escpos.js',
  '/app/js/messages.js',
  '/app/js/calls.js',
  '/app/js/radio.js',
  '/app/js/radio-worklet.js',
  '/app/js/help.js',
  '/app/js/auth-screens.js',
  '/app/js/offline.js',
  '/app/js/shortcuts.js',
  '/app/js/main.js',
  '/app/js/tick-worker.js'
];
self.addEventListener('install', (event) => {
  // Biri başarısız olsa da diğerleri önbelleğe girsin (tek dosya kurulumu engellemesin).
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('peyktan-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k)))),
    self.clients.claim(),
  ]));
});
function _shellRequest(url) {
  if (url.origin === self.location.origin) return url.pathname.startsWith('/app/') || url.pathname.startsWith('/assets/');
  return false;
}
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!_shellRequest(url) || url.pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) {
        const copy = res.clone();
        caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(async () => {
      const hit = await caches.match(req, { ignoreSearch: url.origin === self.location.origin });
      if (hit) return hit;
      if (req.mode === 'navigate') { const page = await caches.match('/app/'); if (page) return page; }
      return Response.error();
    })
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Peyktan', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Peyktan';
  const options = {
    body: data.body || '',
    icon: '/assets/images/logo.webp',
    badge: '/assets/images/logo.webp',
    data: { url: data.url || '/app/', view: data.view || null },
    tag: data.tag || undefined,
    // renotify:true olmadan, ayni 'tag' ile gelen bir sonraki bildirim
    // (orn. onaylanmamis siparis icin her 20 saniyede bir tekrarlanan
    // hatirlatma) isletim sistemi tarafindan SESSIZCE oncekinin uzerine
    // yaziliyor - yeni bir uyari/ses/titresim olmadan. Tekrar tekrar
    // gonderilen bildirimlerin gercekten fark edilmesi icin bu sart.
    renotify: !!data.tag,
  };
  // Kurulu uygulamada (PWA) simgedeki sayı - destekleyen tarayıcılarda.
  const badgeP = (typeof data.badge === 'number' && self.navigator && self.navigator.setAppBadge)
    ? (data.badge > 0 ? self.navigator.setAppBadge(data.badge) : self.navigator.clearAppBadge()).catch(() => {})
    : Promise.resolve();
  // Açık bir Peyktan sekmesi varsa bildirim sessiz gösterilir ve sesi sekme
  // çalar (Peyktan'ın kendi sesi - bkz. playPeyktanSound). Hiç açık sekme
  // yoksa tarayıcılar özel sese izin vermediği için sistem sesi kalır.
  const show = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const appClients = list.filter((c) => c.url.indexOf('/app/') !== -1);
    if (appClients.length) {
      options.silent = true;
      appClients.forEach((c) => c.postMessage({ type: 'peyktan-sound' }));
    }
    return self.registration.showNotification(title, options);
  });
  event.waitUntil(Promise.all([show, badgeP]));
});

// Bildirime tıklanınca ilgili ekrana gidilsin diye (örn. "Sipariş Al").
// Zaten açık bir sekme varsa sayfayı yeniden yüklemeden postMessage ile
// SPA içinde yönlendirme yapılır (bkz. app/index.html'deki 'message'
// dinleyicisi); açık sekme yoksa yeni pencere ?view= parametresiyle açılır
// (oturum varsa doLogin sonrası, yoksa girişten sonra oraya gider).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const view = event.notification.data && event.notification.data.view;
  let url = (event.notification.data && event.notification.data.url) || '/app/';
  if (view) url += (url.indexOf('?') === -1 ? '?' : '&') + 'view=' + encodeURIComponent(view);
  // Uygulama dışı sayfa (ör. kurye konum sayfası /kurye/?t=…) doğrudan açılır.
  if (url.indexOf('/app/') !== 0) { event.waitUntil(self.clients.openWindow ? self.clients.openWindow(url) : Promise.resolve()); return; }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.indexOf('/app/') !== -1 && 'focus' in client) {
          if (view) client.postMessage({ type: 'peyktan-navigate', view: view, tag: event.notification.data && event.notification.data.tag });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
