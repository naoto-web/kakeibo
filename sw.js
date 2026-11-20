// sw.js — ホーム画面アプリ用。いつもネットの最新を先に取り、つながらないときだけ前回の写しを出す。
// 写しを取るのは画面の外枠（HTML・CSS・JS・アイコン）だけ。家計簿の数字はGASから毎回取り、ここには残さない。
var CACHE = 'kakeibo-v1';

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () { return caches.match(req, { ignoreSearch: true }); })
  );
});
