const CACHE_STATIC = 'reino-rosa-static-v21';
const CACHE_ASSETS = 'reino-rosa-assets-v21';

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
  './js/main.js',
  './js/core/AudioManager.js',
  './js/core/CoopExploreMode.js',
  './js/core/Engine.js',
  './js/core/InputManager.js',
  './js/core/LumenArtPipeline.js',
  './js/core/PwaManager.js',
  './js/core/SpringValue.js',
  './js/core/TextureFactory.js',
  './js/world/ArenaBuilder.js',
  './js/world/BotanicalFlora.js',
  './js/world/CasinoDomeBuilder.js',
  './js/world/CasinoGames.js',
  './js/world/CastleBuilder.js',
  './js/world/CastleRooms.js',
  './js/world/CoinSystem.js',
  './js/world/CollisionSystem.js',
  './js/world/FaunaSystem.js',
  './js/world/FoliageSystem.js',
  './js/world/FountainSystem.js',
  './js/world/HorseAnatomy.js',
  './js/world/HorseSystem.js',
  './js/world/Minigames.js',
  './js/world/Quests.js',
  './js/world/StarrySkySystem.js',
  './js/world/WaterSystem.js',
  './js/world/WorldDecor.js',
  './js/world/WorldThemes.js',
  './js/characters/CharacterAnatomy.js',
  './js/characters/CharacterAnimator.js',
  './js/characters/CharacterCouture.js',
  './js/characters/CharacterFaceHair.js',
  './js/characters/CharacterMotion.js',
  './js/characters/CharacterRig.js',
  './js/characters/CharacterShader.js',
  './js/characters/NPCManager.js',
  './js/characters/PlayerController.js',
  './js/characters/RemotePlayer.js',
  './js/characters/RidingDrape.js',
  './js/characters/SpeechBubble.js',
  './js/characters/catalog/CatalogData.js',
  './js/characters/catalog/FaceBuilder.js',
  './js/characters/catalog/HairBuilder.js',
  './js/characters/catalog/OutfitBuilder.js',
  './js/characters/catalog/PrinceRigBuilder.js',
  './js/wardrobe/WardrobeCamera.js',
  './js/wardrobe/WardrobeFX.js',
  './js/wardrobe/WardrobeUI.js',
  './js/net/PeerManager.js',
  './js/net/StateSync.js',
  './js/ui/CasinoUI.js',
  './js/ui/DialogueUI.js',
  './js/ui/HudUI.js',
  './js/ui/MenuUI.js',
  './js/ui/MultiplayerUI.js'
];

const THREE_CDN_HOSTS = ['esm.sh', 'cdn.jsdelivr.net', 'unpkg.com'];

/**
 * Tráfico multijugador que el Service Worker NUNCA intercepta ni cachea:
 *  - Servidor de señalización de PeerJS (peerjs.com, 0.peerjs.com…).
 *  - La librería PeerJS (y sus dependencias) servida desde esm.sh / unpkg.
 * Three.js sí se sigue cacheando para que la PWA funcione sin conexión.
 */
const NETWORK_ONLY_HOSTS = ['peerjs.com'];
const NETWORK_ONLY_CDN_PATH = /peerjs|webrtc-adapter|\/sdp@|eventemitter3/i;

function isNetworkOnly(url) {
  if (NETWORK_ONLY_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    return true;
  }
  return isCdnAsset(url) && NETWORK_ONLY_CDN_PATH.test(url.pathname + url.search);
}
const ASSET_EXTENSIONS = /\.(png|jpe?g|webp|svg|woff2?|ttf|otf)$/i;
const SHELL_EXTENSIONS = /\.(js|css|html|webmanifest)$/i;

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
    if (response && (response.ok || response.type === 'opaque')) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return Response.error();
  }
}

/**
 * Red primero para el código propio (HTML/JS/CSS): tras cada despliegue se carga
 * siempre la versión nueva y nunca se mezclan módulos viejos con nuevos.
 * La caché solo se usa como respaldo sin conexión (PWA offline).
 */
async function networkFirstStrategy(request) {
  const cache = await caches.open(CACHE_STATIC);
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (response && response.ok) {
      await cache.put(request, response.clone());
      return response;
    }
    const cachedOnError = await cache.match(request);
    return cachedOnError || response;
  } catch {
    // Sin conexión: se usa la copia cacheada más abajo
  }

  const cached = await cache.match(request);
  if (cached) return cached;

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
  // Sin respondWith: el navegador gestiona la petición directamente (señalización intacta)
  if (isNetworkOnly(url)) return;

  if (isCacheFirstRequest(url)) {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }

  if (isSameOriginShell(request, url)) {
    event.respondWith(networkFirstStrategy(request));
  }
});
