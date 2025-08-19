// Simple service worker for offline caching
// Dev SW: luôn lấy mạng trước, không lưu cache để mô phỏng hard reload mỗi lần mở trang
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(clients.claim()); });
self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).catch(()=> caches.match(e.request)));
});
