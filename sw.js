const ASSETS=['./','./index.html','./app.js','./style.css','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open('app-v6_0_8').then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>{e.waitUntil(self.clients.claim())});
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(url.pathname.includes('/blob/')){
    e.respondWith(caches.open('blobs').then(c=>c.match(e.request).then(r=>r||fetch(e.request))));
  }else{
    e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
  }
});