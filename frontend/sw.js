self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'logtwo.';
  const url = payload.url || '/dashboard.html#timeline';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || 'Tem novidade no diário de vocês.',
      icon: payload.icon || '/assets/img/icon-192.png',
      badge: payload.badge || '/assets/img/icon-192.png',
      data: { url, movieId: payload.movieId ?? null },
      vibrate: [80, 40, 80],
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = new URL(
    event.notification.data?.url || '/dashboard.html#timeline',
    self.location.origin,
  ).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

      for (const client of windows) {
        if (client.url.startsWith(self.location.origin)) {
          await client.focus();
          client.postMessage({ type: 'notification-click' });
          return;
        }
      }

      await self.clients.openWindow(target);
    })(),
  );
});
