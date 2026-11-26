// Dr Shlkamy — ClinicFlow Service Worker
const BUILD_ID = '__CLINICFLOW_BUILD_ID__';
const CACHE_NAME = `clinicflow-pwa-${BUILD_ID}`;
const STATIC_ASSETS = [
  '/manifest.webmanifest',
  '/manifest.json',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/icon.svg',
  '/favicon.ico'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Cache addAll warning:', err);
      });
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(async () => {
      await self.clients.claim();
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });
      windowClients.forEach(client => {
        try {
          client.postMessage({ type: 'SW_ACTIVATED', buildId: BUILD_ID });
        } catch {}
      });
    })
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;

  // Skip non-GET requests or non-HTTP schemes
  if (request.method !== 'GET' || !request.url.startsWith('http')) {
    return;
  }

  const url = new URL(request.url);

  // Never cache API endpoints, version checks, SW script, Vite dev modules, HMR endpoints, or source files
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname === '/version.json' ||
    url.pathname === '/sw.js' ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.startsWith('/@') ||
    url.searchParams.has('t') ||
    url.searchParams.has('v')
  ) {
    return;
  }

  // Always network-first (bypassing HTTP cache) for HTML navigation so newly published versions load immediately
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put('/index.html', copy);
            });
          }
          return networkResponse;
        })
        .catch(() =>
          caches.match('/index.html').then(res => res || caches.match('/'))
        )
    );
    return;
  }

  // Only cache static icons/manifest/built hashed assets
  if (
    url.pathname.startsWith('/assets/') ||
    STATIC_ASSETS.includes(url.pathname)
  ) {
    event.respondWith(
      caches.match(request).then(cachedResponse => {
        const fetchPromise = fetch(request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
  }
});

// Handle incoming Web Push notifications even when the site/PWA is completely closed
self.addEventListener('push', event => {
  let payload = {
    title: 'تنبيه جديد — Dr Shlkamy',
    body: 'لديك تنبيه جديد في نظام العيادة',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: 'clinicflow_push_' + Date.now(),
    url: '/?view=staff_alerts',
    view: 'staff_alerts',
    requireInteraction: true,
    renotify: true,
    vibrate: [300, 120, 300, 120, 450],
    timestamp: Date.now()
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        payload = { ...payload, ...parsed };
      }
    }
  } catch {
    try {
      if (event.data) {
        const txt = event.data.text();
        if (txt) payload.body = txt;
      }
    } catch {}
  }

  const vibrationPattern = Array.isArray(payload.vibrate)
    ? payload.vibrate
    : [300, 120, 300, 120, 450];

  const alertType = payload.alertType || 'general';
  let actions = [{ action: 'open', title: 'عرض التنبيه' }];
  if (Array.isArray(payload.actions) && payload.actions.length > 0) {
    actions = payload.actions;
  } else if (alertType === 'appointment' || alertType === 'test') {
    actions = [
      { action: 'completed', title: '🟢 تمت الزيارة' },
      { action: 'no_show', title: '🔴 لم تتم الزيارة' }
    ];
  } else if (alertType === 'shift_start') {
    actions = [{ action: 'shift_start', title: '🟢 بدأ الشفت' }];
  } else if (alertType === 'shift_end') {
    actions = [{ action: 'shift_end', title: '🔴 إنهاء الشفت' }];
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || '/pwa-192x192.png',
      badge: payload.badge || '/pwa-192x192.png',
      tag: payload.tag || 'clinicflow_push',
      renotify: payload.renotify !== false,
      requireInteraction: payload.requireInteraction !== false,
      silent: false,
      vibrate: vibrationPattern,
      timestamp: typeof payload.timestamp === 'number' ? payload.timestamp : Date.now(),
      actions,
      data: {
        url: payload.url || '/?view=staff_alerts',
        view: payload.view || 'staff_alerts',
        appointmentId: payload.appointmentId || null,
        alertType
      }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification?.data || {};
  const action = event.action || '';
  const targetView = data.view || 'staff_alerts';
  const targetUrl = data.url || `/?view=${encodeURIComponent(targetView)}`;
  const appointmentId = data.appointmentId || null;
  const alertType = data.alertType || 'general';

  if (action === 'shift_start' || action === 'shift_end') {
    event.waitUntil(
      (async () => {
        const clientList = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true
        });

        for (const client of clientList) {
          if ('focus' in client) {
            try {
              client.postMessage({
                type: 'SHIFT_ACTION',
                action
              });
            } catch {}
            return client.focus();
          }
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(
            `/?shiftAction=${encodeURIComponent(action)}`
          );
        }
      })()
    );
    return;
  }

  if (action === 'completed' || action === 'no_show') {
    event.waitUntil(
      (async () => {
        if (appointmentId) {
          try {
            await fetch('/api/push/resolve-alert', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ appointmentId })
            });
          } catch {}
        }

        const clientList = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true
        });

        for (const client of clientList) {
          if ('focus' in client) {
            try {
              if (appointmentId) {
                client.postMessage({
                  type: 'APPOINTMENT_ACTION',
                  appointmentId,
                  status: action
                });
              } else if (alertType === 'test') {
                client.postMessage({
                  type: 'TEST_NOTIFICATION_ACTION',
                  action
                });
              }
            } catch {}
            return client.focus();
          }
        }

        if (self.clients.openWindow) {
          if (appointmentId) {
            return self.clients.openWindow(
              `/?view=staff_alerts&apptAction=${encodeURIComponent(action)}&appointmentId=${encodeURIComponent(appointmentId)}`
            );
          }
          if (alertType === 'test') {
            return self.clients.openWindow(
              `/?view=staff_alerts&testAction=${encodeURIComponent(action)}`
            );
          }
          return self.clients.openWindow(targetUrl);
        }
      })()
    );
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) {
          try {
            client.postMessage({ type: 'NAVIGATE_VIEW', view: targetView });
          } catch {}
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch('/api/push/vapid-public-key');
        if (!res.ok) return;
        const { publicKey } = await res.json();
        if (!publicKey) return;

        const padding = '='.repeat((4 - (publicKey.length % 4)) % 4);
        const base64 = (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
          outputArray[i] = rawData.charCodeAt(i);
        }

        const newSub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: outputArray
        });

        // Notify any open client to re-sync with its deviceId
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        clients.forEach(c => {
          try {
            c.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED', subscription: newSub.toJSON() });
          } catch {}
        });
      } catch (err) {
        console.warn('[SW] pushsubscriptionchange failed:', err);
      }
    })()
  );
});
