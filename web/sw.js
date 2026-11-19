/* Remote Camera v4.5.1 PWA shell cache. No Push API or external notification service. */
"use strict";
const CACHE_NAME="remote-camera-v451-shell-v1";
const CORE_ASSETS=["./","./index.html","./app.css","./app.js","./config.json","./manifest.webmanifest","./icon-192.svg","./icon-512.svg"];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(CORE_ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(
    keys.filter(key=>key.startsWith("remote-camera-v451-")&&key!==CACHE_NAME).map(key=>caches.delete(key))
  )).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(request.mode==="navigate"){
    event.respondWith(fetch(request).then(response=>{
      if(response&&response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put("./index.html",copy)).catch(()=>{});}
      return response;
    }).catch(async()=> (await caches.match("./index.html"))||Response.error()));
    return;
  }
  if(!/\/(index\.html|app\.js|app\.css|config\.json|manifest\.webmanifest|icon-(192|512)\.svg)$/.test(url.pathname)&&!url.pathname.endsWith("/"))return;
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
    if(response&&response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy)).catch(()=>{});}
    return response;
  })));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(clients=>{
    const existing=clients.find(client=>"focus" in client);
    if(existing)return existing.focus();
    return self.clients.openWindow("./index.html");
  }));
});
