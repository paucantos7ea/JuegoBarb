const CACHE_STATIC = 'reino-rosa-static-v3';
const CACHE_ASSETS = 'reino-rosa-assets-v3';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/base.css',
  './css/menu.css',
  './css/hud.css',
  './css/pwa.css',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/models/models.json',
  './js/main.js',
  './js/core/AudioSynthesizer.js',
  './js/core/Engine.js',
  './js/core/InputManager.js',
  './js/core/PwaManager.js',
  './js/core/TextureFactory.js',
  './js/entities/CharacterPresets.js',
  './js/entities/CharacterRig.js',
  './js/entities/GlbAvatarController.js',
  './js/entities/ModelLoader.js',
  './js/entities/NPCManager.js',
  './js/entities/PlayerController.js',
  './js/entities/QuestSystem.js',
  './js/entities/RemotePlayer.js',
  './js/minigames/FashionRunwayGame.js',
  './js/minigames/GardenRaceGame.js',
  './js/minigames/MinigameManager.js',
  './js/minigames/RoyalBallRhythmGame.js',
  './js/modes/BaseGameMode.js',
  './js/modes/CoopExploreMode.js',
  './js/modes/GameModeManager.js',
  './js/network/PeerManager.js',
  './js/network/StateSync.js',
  './js/ui/HudUI.js',
  './js/ui/MenuUI.js',
  './js/ui/WardrobeUI.js',
  './js/world/CastleBuilder.js',
  './js/world/CollisionSystem.js',
  './js/world/GardensBuilder.js',
  './js/world/WorldThemes.js'
];

const THREE_CDN_HOSTS = ['threejs.org', 'esm.sh', 'cdn.jsdelivr.net', 'unpkg.com', 'raw.githubusercontent.com'];
const ASSET_EXTENSIONS = /\.(glb|gltf|png|jpe?g|webp|svg|ktx2|hdr|woff2?|ttf|otf)$/i;
const SHELL_EXTENSIONS = /\.(js|css|html|webmanifest)$/i;
// Índice y modelos propios (.glb/.gltf/models.json): red primero para detectar modelos nuevos o
// reemplazados sin cambiar la versión de caché; la copia cacheada solo se usa sin conexión.
const LOCAL_MODELS_RE = /\/assets\/models\/[^/]+\.(glb|gltf|json)$/i;

function isCdnAsset(url) {
  return THREE_CDN_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

function isCacheFirstRequest(url) {
  return isCdnAsset(url) || ASSET_EXTENSIONS.test(url.pathname);
}

function isSameOriginShell(request, url) {
  if (url.origin !== self.location.origin) return false;
  return request.mode === 'navigate' || url.pathname.endsWith('/') || SHELL_EXTENSIONS.test(url.pathname);
}

async function precacheAppShell() {
  const cache = await caches.open(CACHE_STATIC);
  await Promise.allSettled(
    PRECACHE_URLS.map(async (url) => {
      const response = await fetch(url, { cache: 'no-cache' });
      if (response.ok) {
        await cache.put(url, response);
      }
    })
  );
}

async function cacheFirstStrategy(request) {
  const cache = await caches.open(CACHE_ASSETS);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    // Solo almacenar respuestas válidas u opacas; nunca cachear 404 de modelos .glb ausentes
    if (response && (response.ok || response.type === 'opaque')) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return Response.error();
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(CACHE_STATIC);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then(async (response) => {
      if (response && response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(networkPromise);
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) return networkResponse;

  if (request.mode === 'navigate') {
    const fallback = await cache.match('./index.html');
    if (fallback) return fallback;
  }

  return Response.error();
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    precacheAppShell().then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_STATIC && key !== CACHE_ASSETS)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (url.origin === self.location.origin && LOCAL_MODELS_RE.test(url.pathname)) {
    const cacheName = url.pathname.endsWith('.json') ? CACHE_STATIC : CACHE_ASSETS;
    event.respondWith(networkFirst(request, cacheName));
    return;
  }

  if (isCacheFirstRequest(url)) {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }

  if (isSameOriginShell(request, url)) {
    event.respondWith(staleWhileRevalidate(event, request));
  }
});
