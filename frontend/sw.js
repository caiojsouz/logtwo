self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function (event) {
  if (!event.data) return;

  try {
    const data = event.data.json();

    event.waitUntil(
      self.registration.showNotification(data.title || 'logtwo', {
        body: data.body || 'Nova atualização no diário!',
        icon: data.icon || '/assets/img/icon-192.png',
        badge: data.badge || '/assets/img/icon-192.png',
        data: { url: data.url || '/dashboard.html#timeline', movieId: data.movieId ?? null },
        vibrate: [80, 40, 80],
      }),
    );
  } catch (e) {
    console.error('Erro no push:', e);
  }
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
