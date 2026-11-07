/* Dinlipi service worker: offline shell + runtime caching */
var CORE_CACHE = 'dinlipi-core-v2';
var RUNTIME_CACHE = 'dinlipi-runtime-v2';
var CORE = ['./', 'index.html', 'favicon.ico', 'favicon-48.png', 'favicon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'site.webmanifest'];
var CACHE_FIRST_HOSTS = ['fonts.gstatic.com', 'upload.wikimedia.org', 'images.unsplash.com', 'images.pexels.com'];
var SWR_HOSTS = ['fonts.googleapis.com'];
var MAX_RUNTIME = 90;

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CORE_CACHE).then(function(c){ return c.addAll(CORE); }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CORE_CACHE && k !== RUNTIME_CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

function trim(cache){
  return cache.keys().then(function(keys){
    if (keys.length <= MAX_RUNTIME) return;
    return cache.delete(keys[0]).then(function(){ return trim(cache); });
  });
}
function okToStore(res){ return res && (res.ok || res.type === 'opaque'); }

function swr(req, name){
  return caches.open(name).then(function(cache){
    return cache.match(req).then(function(hit){
      var net = fetch(req).then(function(res){
        if (okToStore(res)) cache.put(req, res.clone()).then(function(){ return trim(cache); });
        return res;
      }).catch(function(){ return hit; });
      return hit || net;
    });
  });
}

function cacheFirst(req){
  return caches.open(RUNTIME_CACHE).then(function(cache){
    return cache.match(req).then(function(hit){
      if (hit) return hit;
      return fetch(req).then(function(res){
        if (okToStore(res)) cache.put(req, res.clone()).then(function(){ return trim(cache); });
        return res;
      });
    });
  });
}

function navigate(req){
  var home = new Request(new URL('./', self.registration.scope).href);
  return fetch(req).then(function(res){
    if (res && res.ok){ var copy = res.clone(); caches.open(CORE_CACHE).then(function(c){ return c.put(home, copy); }); }
    return res;
  }).catch(function(){
    return caches.match(home, { ignoreSearch: true }).then(function(hit){
      return hit || caches.match('index.html', { ignoreSearch: true });
    });
  });
}

self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin === self.location.origin){
    if (req.mode === 'navigate') e.respondWith(navigate(req));
    else e.respondWith(swr(req, CORE_CACHE));
    return;
  }
  if (CACHE_FIRST_HOSTS.indexOf(url.hostname) !== -1) e.respondWith(cacheFirst(req));
  else if (SWR_HOSTS.indexOf(url.hostname) !== -1) e.respondWith(swr(req, RUNTIME_CACHE));
  /* everything else (weather API, analytics) goes straight to the network */
});
