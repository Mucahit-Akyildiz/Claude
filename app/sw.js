// Peyktan service worker - sadece Web Push bildirimlerini karşılamak için var,
// offline önbellekleme yapmıyor (bilinçli olarak - POS verisi hep canlı olmalı).
self.addEventListener('install', (event) => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
  };
  event.waitUntil(self.registration.showNotification(title, options));
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
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.indexOf('/app/') !== -1 && 'focus' in client) {
          if (view) client.postMessage({ type: 'peyktan-navigate', view: view });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
