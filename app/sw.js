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
    data: { url: data.url || '/app/' },
    tag: data.tag || undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/app/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.indexOf('/app/') !== -1 && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
