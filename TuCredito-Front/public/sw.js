// Service worker de CobraYA — notificaciones push + caché del shell de la app para que
// cargue rápido incluso con red lenta (pedido de "acceso directo/instalable" de un
// cliente). Deliberadamente NO usa vite-plugin-pwa/Workbox: este archivo ya maneja Web
// Push con VAPID y se registra desde src/services/pushService.ts — generar OTRO service
// worker con su propio manifest hubiera competido por el mismo scope ('/'). Este archivo
// es estático (no lo genera el build), así que NO puede saber los nombres hasheados de
// los assets de cada build — por eso cachea solo el shell fijo (index.html, manifest,
// íconos) + cualquier archivo bajo /assets/ la primera vez que se pide (esos SÍ están
// hasheados por Vite, son seguros de cachear "para siempre").
//
// Sin modo offline de datos (decisión de producto ya tomada): todo lo que no sea el
// shell de la app o /assets/ (Supabase, Edge Functions, cualquier otro origen) pasa
// directo a la red, sin tocar la caché.

const CACHE_VERSION = 'cobraya-shell-v1'; // bump esto si cambia el set de SHELL_URLS

const SHELL_URLS = [
  '/',
  '/index.html',
  '/site.webmanifest',
  '/favicon.svg',
  '/favicon-32.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => {
        // Si algún ícono no existe todavía en un entorno (ej. preview sin build completo),
        // no debe tumbar la instalación del SW — push sigue siendo la función crítica.
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // nunca intercepta Supabase/Edge Functions/otros orígenes

  // Navegación (cargar/recargar la app): network-first — prioriza siempre la versión
  // más nueva del index.html para no servir una app vieja después de un deploy; solo
  // cae a la caché del shell si de verdad no hay red.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Assets del build (JS/CSS con hash en el nombre, Vite los sirve bajo /assets/):
  // cache-first + revalidación en segundo plano. Como el nombre cambia con el
  // contenido, un asset cacheado nunca queda desactualizado bajo la misma URL.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return response;
        });
        return cached || fetchPromise;
      })
    );
  }
});

self.addEventListener('push', (event) => {
  let data = { title: 'CobraYA', body: 'Tienes novedades en tu cartera.', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // payload no era JSON válido, se usa el texto plano como body
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
