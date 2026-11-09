// Watch List offline cache. The app opens from here instantly; files are refreshed in the
// background on every open, and the app reloads itself when version.txt says there's a newer one.
const SHELL = "wl-shell";
const FONTS = "wl-fonts-v1";
const FILES = ["./", "index.html", "app.js", "fb.js", "config.js", "manifest.webmanifest", "icon-180.png", "favicon-32.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => Promise.all(FILES.map(u =>
    fetch(u, {cache: "no-cache"}).then(r => r.ok ? c.put(u, r) : null).catch(() => null)))));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keep = [SHELL, FONTS];
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // App files: answer from cache at once, refresh it in the background.
  if (url.origin === location.origin) {
    if (url.pathname.endsWith("/version.txt") || url.pathname.endsWith("/sw.js")) return;
    const nav = req.mode === "navigate";
    const key = nav ? "./" : url.origin + url.pathname;
    e.respondWith((async () => {
      const c = await caches.open(SHELL);
      const hit = await c.match(key);
      const net = fetch(url.origin + url.pathname, {cache: "no-cache"}).then(r => {
        if (r.ok) c.put(key, r.clone());
        return r;
      });
      if (hit) { e.waitUntil(net.catch(() => null)); return hit; }
      return net.catch(async () => (await c.match("./")) || Response.error());
    })());
    return;
  }

  // Fonts never change: cache them for good.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith((async () => {
      const c = await caches.open(FONTS);
      const hit = await c.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok || r.type === "opaque") c.put(req, r.clone());
      return r;
    })());
  }
});
