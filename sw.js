// Cambia VERSION en cada publicación (y también APP_VERSION en index.html y version.json)
const VERSION='40';
const C='biblioteca-v'+VERSION;
const FILES=['./','./index.html','./app.js','./analytics.js','./errores.js','./privacidad.html','./condiciones.html','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(FILES.map(f=>new Request(f,{cache:'reload'})))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('message',e=>{if(e.data==='skipWaiting')self.skipWaiting()});
self.addEventListener('fetch',e=>{
  const req=e.request,u=new URL(req.url);
  if(req.method!=='GET'||u.origin!==location.origin) return;
  if(u.pathname.endsWith('/version.json')||u.pathname.endsWith('/sw.js')) return; // siempre de la red
  // Red primero, saltándose la caché HTTP del navegador; si no hay conexión, la copia guardada
  e.respondWith(fetch(req,{cache:'no-store'}).then(r=>{if(r.ok){const cp=r.clone();caches.open(C).then(c=>c.put(req.mode==='navigate'?'./index.html':req,cp))}return r})
    .catch(()=>caches.match(req,{ignoreSearch:true}).then(r=>r||caches.match('./index.html'))));
});
