/**
 * The service worker (esbuild -> static/sw.js, served at the site root so it
 * covers every page). Two jobs:
 *
 * - It makes the app installable. Browsers only offer to install a site that
 *   has a manifest and a worker handling `fetch`.
 * - It keeps the app working without a network. Everything the player needs
 *   is static, so a practice session can run on a plane or a patchy phone
 *   connection once the page has been visited.
 *
 * Pages come from the network first, so a deploy is picked up on the next
 * load. Everything else is served from the cache and refreshed in the
 * background, which also makes a repeat visit start without waiting on the
 * sounds and images. `__BUILD__` is the git revision at build time, so each
 * deploy fills a fresh cache and the old one is deleted.
 */

declare const __BUILD__: string;
/** The URLs to precache, worked out from the build (scripts/shell.mjs). */
declare const __SHELL__: string[];

// `self` is typed as a plain worker scope; this is what it really is.
const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `thambura-${__BUILD__}`;

// Enough to open the app offline, and every view in it (the Lab and Raagini
// load on first use, from chunks). Sounds and images arrive as they're used.
const SHELL = __SHELL__;

sw.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== sw.location.origin) return;
  e.respondWith(req.mode === "navigate" ? page(req) : asset(req));
});

/** A page: the network, falling back to the cached copy when offline. */
async function page(req: Request): Promise<Response> {
  try {
    const fresh = await fetch(req);
    void store(req, fresh.clone());
    return fresh;
  } catch {
    return (await caches.match(req)) ?? (await caches.match("/")) ?? Response.error();
  }
}

/** An asset: the cache, refreshed in the background for the next visit. */
async function asset(req: Request): Promise<Response> {
  const hit = await caches.match(req);
  const fetching = fetch(req)
    .then((res) => {
      void store(req, res.clone());
      return res;
    })
    .catch(() => hit ?? Response.error());
  return hit ?? fetching;
}

async function store(req: Request, res: Response): Promise<void> {
  // Opaque and error responses would poison the cache.
  if (!res.ok || res.type === "opaque") return;
  const cache = await caches.open(CACHE);
  await cache.put(req, res);
}
