const SHELL_CACHE = "whtbb-shell-v11";
const GAME_CACHE = "whtbb-game-v11";
const SHELL = ["/", "/index.html", "/manifest.json", "/score-hook.js", "/category-leaderboard.js", "/icons/icon-180.png", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)));
});

self.addEventListener("activate", event => {
  event.waitUntil((async()=>{
    const keep = new Set([SHELL_CACHE, GAME_CACHE]);
    for(const key of await caches.keys()) if(!keep.has(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function gameAssets(){
  const response = await fetch("/precache-assets.json", {cache:"no-store"});
  if(!response.ok) throw new Error(`precache manifest ${response.status}`);
  return response.json();
}

async function cacheGame(){
  const cache = await caches.open(GAME_CACHE);
  const assets = await gameAssets();
  for(const asset of assets){
    try{ await cache.add(asset); }catch(err){ console.warn("Cache miss",asset,err); }
  }
}

self.addEventListener("message", event => {
  if(event.data?.type === "CACHE_GAME") event.waitUntil(cacheGame());
});

self.addEventListener("fetch", event => {
  if(event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if(url.origin !== self.location.origin) return;

  const isGameAsset = url.pathname.startsWith("/games/") || url.pathname.startsWith("/vendor/ruffle/");
  if(isGameAsset){
    event.respondWith((async()=>{
      const cache = await caches.open(GAME_CACHE);
      const hit = await cache.match(event.request);
      if(hit) return hit;
      const fresh = await fetch(event.request);
      if(fresh.ok) cache.put(event.request, fresh.clone());
      return fresh;
    })());
    return;
  }

  event.respondWith((async()=>{
    try{
      const fresh = await fetch(event.request, {cache:"no-store"});
      if(fresh.ok){ const cache=await caches.open(SHELL_CACHE); cache.put(event.request,fresh.clone()); }
      return fresh;
    }catch(_){
      return (await caches.match(event.request)) || (await caches.match("/index.html"));
    }
  })());
});
