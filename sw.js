/* 撲克工具箱 service worker — app shell 快取 */
'use strict';
var CACHE = 'poker-v36';
var ASSETS = [
  './index.html',
  './privacy.html',
  './support.html',
  './css/style.css?v=36',
  './js/i18n-dict.js?v=36',
  './js/chip.js?v=36',
  './js/i18n.js?v=36',
  './js/theme.js?v=36',
  './js/fontsize.js?v=36',
  './js/pro.js?v=36',
  './js/evaluator.js?v=36',
  './js/equity.js?v=36',
  './js/icm.js?v=36',
  './js/tracker-stats.js?v=36',
  './js/preflop-table.js?v=36',
  './js/pushfold.js?v=36',
  './js/ranges.js?v=36',
  './js/postflop.js?v=36',
  './js/hands.js?v=36',
  './js/nash.js?v=36',
  './js/app.js?v=36',
  './js/sync.js?v=36',
  './js/training.js?v=36',
  './js/native.js?v=36',
  './manifest.json?v=36',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* network-first：有網路拿最新版並更新快取，離線時退回快取 */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(function (res) {
      if (res.ok && new URL(e.request.url).origin === self.location.origin) {
        var clone = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, clone); });
      }
      return res;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});
