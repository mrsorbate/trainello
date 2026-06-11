self.addEventListener('push', (event) => {
  let payload = {
    title: 'teamvote+',
    body: 'Neue Benachrichtigung',
    url: '/',
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = {
        title: String(parsed?.title || payload.title),
        body: String(parsed?.body || payload.body),
        url: String(parsed?.url || payload.url),
      };
    }
  } catch (_error) {
    // Keep fallback payload
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/pwa-192x192-v2.png',
      badge: '/pwa-192x192-v2.png',
      data: {
        url: payload.url,
      },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client && client.url.includes(self.location.origin)) {
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});
