/**
 * Motor de red del Reino Rosa basado en PeerJS (señalización automática con Trickle ICE).
 *
 * Topología en estrella: el Host de la sala acepta varias DataConnection y reenvía
 * cada mensaje al resto de jugadores (sin reenviarlo al remitente). Cada jugador tiene
 * un id estable por pestaña (`playerId`) independiente del id de PeerJS, de modo que
 * en un relevo de Host los compañeros no "parpadean" en la escena.
 *
 * Salas:
 *  - Pública: id fijo `reino-rosa-imperial-pub-v1`. Quien lo consigue es el Host; si está
 *    ocupado (`unavailable-id`) se entra como cliente. Si el Host cae, los clientes
 *    reintentan tras 400–1200 ms (relevo ligero de Host).
 *  - Privada: código corto `ROSA-4821` → id `reino-rosa-priv-ROSA4821`.
 */

const PEERJS_ESM_URL = 'https://esm.sh/peerjs@1.5.4?bundle';
const PEERJS_UMD_URL = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';

const PUBLIC_ROOM_ID = 'reino-rosa-imperial-pub-v1';
const PRIVATE_PREFIX = 'reino-rosa-priv-';
const CLIENT_PREFIX = 'reino-rosa-c-';
const PROTOCOL_VERSION = 1;

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' }
];

const PING_INTERVAL_MS = 4000;
const PEER_TIMEOUT_MS = 20000;
const CONNECT_TIMEOUT_MS = 9000;
const MIGRATION_PURGE_MS = 7000;
const MAX_PLAYERS = 12;
const MAX_PACKET_CHARS = 32000;
const MAX_REJOIN_ATTEMPTS = 25;

let peerCtorPromise = null;

/** Carga PeerJS sin build: ESM desde esm.sh y, si falla, el UMD de unpkg. */
function loadPeerJs() {
  if (peerCtorPromise) return peerCtorPromise;
  peerCtorPromise = (async () => {
    try {
      const mod = await import(PEERJS_ESM_URL);
      const Ctor = mod.Peer || mod.default?.Peer || mod.default;
      if (typeof Ctor === 'function') return Ctor;
    } catch (err) {
      console.warn('[PeerManager] esm.sh no disponible, probando unpkg…', err);
    }
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = PEERJS_UMD_URL;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.onload = resolve;
      script.onerror = () => reject(new Error('No se pudo descargar PeerJS. Revisa la conexión a internet.'));
      document.head.appendChild(script);
    });
    const Ctor = window.peerjs?.Peer || window.Peer;
    if (typeof Ctor !== 'function') throw new Error('PeerJS no se ha cargado correctamente.');
    return Ctor;
  })();
  peerCtorPromise.catch(() => { peerCtorPromise = null; });
  return peerCtorPromise;
}

function randomToken(len) {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function cleanName(name) {
  return String(name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 18);
}

/** Normaliza `rosa 4821`, `ROSA-4821` o `4821` → `ROSA4821`. Devuelve '' si no es válido. */
export function normalizeRoomCode(code) {
  let c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^\d{4}$/.test(c)) c = `ROSA${c}`;
  return /^[A-Z0-9]{4,12}$/.test(c) ? c : '';
}

/** `ROSA4821` → `ROSA-4821` (solo para mostrar). */
export function formatRoomCode(normalized) {
  const m = /^([A-Z]+)(\d+)$/.exec(normalized || '');
  return m ? `${m[1]}-${m[2]}` : (normalized || '');
}

export class PeerManager {
  #PeerCtor = null;
  #peer = null;
  #playerId = `p_${randomToken(8)}`;
  #localName = 'Princesa';

  // Estado de sala
  #status = 'offline'; // 'offline' | 'connecting' | 'online' | 'reconnecting' | 'error'
  #statusMessage = '';
  #roomType = null; // null | 'public' | 'private'
  #roomCode = ''; // normalizado, p. ej. ROSA4821
  #isHost = false;
  #hostPlayerId = null;
  #sessionToken = 0; // invalida callbacks de intentos anteriores

  // Host: conexiones por playerId. Cliente: una sola conexión al Host.
  #conns = new Map(); // playerId -> { conn, lastSeen, rtt }
  #hostConn = null;
  #hostLastSeen = 0;

  // Lista de jugadores de la sala (sin incluirnos) con último estado conocido.
  #players = new Map(); // playerId -> { id, name, appearance, state, inGame }
  #selfEntry = { id: '', name: '', appearance: null, state: null, inGame: false };

  #rtt = 0;
  #rejoinAttempts = 0;
  #pingTimer = null;
  #connectTimer = null;
  #rejoinTimer = null;
  #purgeTimer = null;
  #listeners = new Map();
  #boundUnload = null;

  init() {
    this.#selfEntry.id = this.#playerId;
    this.#boundUnload = () => this.leaveRoom({ silent: true });
    window.addEventListener('pagehide', this.#boundUnload);
    window.addEventListener('beforeunload', this.#boundUnload);
  }

  // ───────────────────────── API pública ─────────────────────────

  getLocalId() { return this.#playerId; }
  getLocalName() { return this.#localName; }
  isHost() { return this.#isHost; }
  getRoomType() { return this.#roomType; }
  getRoomCode() { return formatRoomCode(this.#roomCode); }
  getPing() { return this.#rtt; }

  /** Compatibilidad con la UI antigua: 'solo' | 'host' | 'guest'. */
  getRole() {
    if (!this.#roomType) return 'solo';
    return this.#isHost ? 'host' : 'guest';
  }

  setLocalName(name) {
    this.#localName = cleanName(name) || 'Princesa';
    this.#selfEntry.name = this.#localName;
    if (this.#status === 'online') {
      this.broadcast({ type: '_name', name: this.#localName });
    }
  }

  on(event, handler) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(handler);
    return () => this.#listeners.get(event)?.delete(handler);
  }

  getStatus() {
    return {
      state: this.#status,
      message: this.#statusMessage,
      roomType: this.#roomType,
      roomCode: formatRoomCode(this.#roomCode),
      isHost: this.#isHost,
      playerCount: this.#players.size + (this.#roomType ? 1 : 0),
      ping: this.#rtt
    };
  }

  getConnectedPeers() {
    const list = [];
    for (const p of this.#players.values()) list.push({ id: p.id, name: p.name });
    return list;
  }

  /** Último estado conocido de un jugador (nombre, traje, estado/caballo, si está en partida). */
  getPlayerSnapshot(playerId) {
    return this.#players.get(playerId) || null;
  }

  isMultiplayerActive() {
    return this.#status === 'online' && this.#players.size > 0;
  }

  isInRoom() {
    return this.#roomType !== null;
  }

  // ───────────────────────── Salas ─────────────────────────

  /** Entra en la sala pública: Host si el id fijo está libre; cliente si ya existe. */
  async joinPublicRoom() {
    const token = this.#beginSession('public', '');
    this.#setStatus('connecting', 'Buscando la Sala Pública…');
    try {
      const Peer = await this.#ensurePeerJs();
      if (token !== this.#sessionToken) return;
      const peer = await this.#openPeer(Peer, PUBLIC_ROOM_ID, token, { allowTaken: true });
      if (token !== this.#sessionToken) return;
      if (peer) {
        this.#becomeHost(peer);
        return;
      }
      // El id público está ocupado → entramos como cliente con un id aleatorio
      const clientPeer = await this.#openPeer(Peer, `${CLIENT_PREFIX}${randomToken(10)}`, token);
      if (token !== this.#sessionToken || !clientPeer) return;
      this.#peer = clientPeer;
      this.#connectToHost(PUBLIC_ROOM_ID, token);
    } catch (err) {
      if (token !== this.#sessionToken) return;
      this.#failSession(err);
    }
  }

  /** Crea una sala privada con código corto legible. Devuelve el código (`ROSA-4821`). */
  async createPrivateRoom() {
    const token = this.#beginSession('private', '');
    this.#setStatus('connecting', 'Creando tu Sala Privada…');
    try {
      const Peer = await this.#ensurePeerJs();
      for (let attempt = 0; attempt < 4; attempt++) {
        if (token !== this.#sessionToken) return null;
        const code = `ROSA${1000 + Math.floor(Math.random() * 9000)}`;
        const peer = await this.#openPeer(Peer, `${PRIVATE_PREFIX}${code}`, token, { allowTaken: true });
        if (token !== this.#sessionToken) return null;
        if (peer) {
          this.#roomCode = code;
          this.#becomeHost(peer);
          return formatRoomCode(code);
        }
      }
      throw new Error('No se pudo reservar un código libre. Inténtalo de nuevo.');
    } catch (err) {
      if (token === this.#sessionToken) this.#failSession(err);
      return null;
    }
  }

  /** Se une a una sala privada existente a partir de su código. */
  async joinPrivateRoom(code) {
    const normalized = normalizeRoomCode(code);
    if (!normalized) {
      this.#setStatus('error', 'Código no válido. Ejemplo: ROSA-4821');
      return false;
    }
    const token = this.#beginSession('private', normalized);
    this.#setStatus('connecting', `Conectando con la sala ${formatRoomCode(normalized)}…`);
    try {
      const Peer = await this.#ensurePeerJs();
      if (token !== this.#sessionToken) return false;
      const peer = await this.#openPeer(Peer, `${CLIENT_PREFIX}${randomToken(10)}`, token);
      if (token !== this.#sessionToken || !peer) return false;
      this.#peer = peer;
      this.#connectToHost(`${PRIVATE_PREFIX}${normalized}`, token);
      return true;
    } catch (err) {
      if (token === this.#sessionToken) this.#failSession(err);
      return false;
    }
  }

  /** Sale de la sala y vuelve al modo solitario. */
  leaveRoom({ silent = false } = {}) {
    if (!this.#roomType && !this.#peer) return;
    this.#sendRaw(JSON.stringify({ type: '_bye', from: this.#playerId }));
    this.#teardown();
    for (const p of [...this.#players.values()]) this.#removePlayer(p.id);
    this.#roomType = null;
    this.#roomCode = '';
    this.#rtt = 0;
    if (!silent) this.#setStatus('offline', '');
    else { this.#status = 'offline'; this.#statusMessage = ''; }
  }

  /** Alias usado por el menú antiguo. */
  resetConnections() {
    this.leaveRoom();
  }

  // ───────────────────────── Envío ─────────────────────────

  /**
   * Envía un paquete a toda la sala. Si somos Host va directo a cada cliente; si somos
   * cliente va al Host, que lo reenvía al resto. El objeto se marca con `from` (se muta
   * a propósito para no clonar en cada envío a 16 Hz).
   */
  broadcast(packet) {
    if (!packet || this.#status !== 'online') return;
    packet.from = this.#playerId;
    this.#ingest(this.#selfEntry, packet);
    const raw = JSON.stringify(packet);
    if (this.#isHost) {
      for (const entry of this.#conns.values()) this.#sendOn(entry.conn, raw);
    } else {
      this.#sendOn(this.#hostConn, raw);
    }
  }

  /** Envía un paquete solo a un jugador (el Host lo enruta si somos cliente). */
  sendTo(playerId, packet) {
    if (!packet || this.#status !== 'online') return;
    packet.from = this.#playerId;
    if (this.#isHost) {
      const entry = this.#conns.get(playerId);
      if (entry) this.#sendOn(entry.conn, JSON.stringify(packet));
    } else {
      this.#sendOn(this.#hostConn, JSON.stringify({ type: '_to', to: playerId, from: this.#playerId, p: packet }));
    }
  }

  // ───────────────────────── Internos: sesión ─────────────────────────

  #emit(event, payload) {
    const set = this.#listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try { fn(payload); } catch (err) { console.error(`[PeerManager] Error en listener '${event}':`, err); }
    }
  }

  #setStatus(state, message = '') {
    this.#status = state;
    this.#statusMessage = message;
    this.#emit('status', this.getStatus());
  }

  async #ensurePeerJs() {
    if (!this.#PeerCtor) this.#PeerCtor = await loadPeerJs();
    return this.#PeerCtor;
  }

  #beginSession(roomType, code) {
    // Cambiar de sala: salimos limpiamente de la anterior
    if (this.#roomType || this.#peer) this.leaveRoom({ silent: true });
    this.#sessionToken++;
    this.#rejoinAttempts = 0;
    this.#roomType = roomType;
    this.#roomCode = code;
    this.#isHost = false;
    this.#hostPlayerId = null;
    this.#selfEntry.name = this.#localName;
    return this.#sessionToken;
  }

  #failSession(err) {
    const message = err?.message || 'No se pudo conectar.';
    this.#teardown();
    for (const p of [...this.#players.values()]) this.#removePlayer(p.id);
    this.#roomType = null;
    this.#roomCode = '';
    this.#setStatus('error', message);
  }

  /**
   * Abre un Peer con el id indicado. Con `allowTaken`, devuelve null si el id está ocupado
   * en lugar de lanzar error (así decidimos Host/cliente en la sala pública).
   */
  #openPeer(Peer, id, token, { allowTaken = false } = {}) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const peer = new Peer(id, { debug: 0, config: { iceServers: ICE_SERVERS } });
      const timer = setTimeout(() => finish(new Error('El servidor de señalización no responde. Revisa tu conexión.')), 12000);
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        peer.off('open', onOpen);
        peer.off('error', onError);
        if (error || value === null) {
          try { peer.destroy(); } catch {}
        }
        if (error) reject(error);
        else resolve(value);
      };
      const onOpen = () => {
        if (token !== this.#sessionToken) { finish(null, null); return; }
        finish(null, peer);
      };
      const onError = (err) => {
        if (allowTaken && err?.type === 'unavailable-id') { finish(null, null); return; }
        finish(new Error(this.#describePeerError(err)));
      };
      peer.on('open', onOpen);
      peer.on('error', onError);
    });
  }

  #describePeerError(err) {
    switch (err?.type) {
      case 'browser-incompatible': return 'Tu navegador no soporta WebRTC. Usa Chrome, Edge o Firefox actualizados.';
      case 'network':
      case 'server-error':
      case 'socket-error':
      case 'socket-closed': return 'No hay conexión con el servidor de salas. Revisa tu internet.';
      case 'unavailable-id': return 'Ese código de sala ya está en uso.';
      case 'peer-unavailable': return 'La sala no existe o ya se ha cerrado. Revisa el código.';
      case 'ssl-unavailable': return 'Se necesita HTTPS para conectar.';
      default: return err?.message || 'Error de conexión desconocido.';
    }
  }

  #attachPeerHandlers(peer, token) {
    peer.on('error', (err) => {
      if (token !== this.#sessionToken) return;
      if (err?.type === 'peer-unavailable') {
        // El Host no existe (sala privada cerrada o Host público caído)
        this.#handleHostUnreachable(token, this.#describePeerError(err));
        return;
      }
      if (err?.type === 'network' || err?.type === 'socket-closed' || err?.type === 'disconnected') {
        // Se perdió la señalización; las DataConnection ya abiertas siguen funcionando.
        if (!peer.destroyed && peer.disconnected) {
          try { peer.reconnect(); } catch {}
        }
        return;
      }
      console.warn('[PeerManager]', err?.type, err);
    });
    peer.on('disconnected', () => {
      if (token !== this.#sessionToken || peer.destroyed) return;
      // Reengancha la señalización para seguir aceptando jugadores nuevos
      setTimeout(() => {
        if (token === this.#sessionToken && !peer.destroyed && peer.disconnected) {
          try { peer.reconnect(); } catch {}
        }
      }, 1500);
    });
  }

  #teardown() {
    this.#sessionToken++;
    clearInterval(this.#pingTimer);
    clearTimeout(this.#connectTimer);
    clearTimeout(this.#rejoinTimer);
    clearTimeout(this.#purgeTimer);
    this.#pingTimer = this.#connectTimer = this.#rejoinTimer = this.#purgeTimer = null;
    for (const entry of this.#conns.values()) {
      try { entry.conn.close(); } catch {}
    }
    this.#conns.clear();
    if (this.#hostConn) {
      try { this.#hostConn.close(); } catch {}
      this.#hostConn = null;
    }
    if (this.#peer) {
      try { this.#peer.destroy(); } catch {}
      this.#peer = null;
    }
    this.#isHost = false;
    this.#hostPlayerId = null;
  }

  // ───────────────────────── Host ─────────────────────────

  #becomeHost(peer) {
    const token = this.#sessionToken;
    this.#peer = peer;
    this.#isHost = true;
    this.#hostPlayerId = this.#playerId;
    this.#rejoinAttempts = 0;
    this.#attachPeerHandlers(peer, token);
    peer.on('connection', (conn) => this.#acceptClient(conn, token));
    this.#startPing();

    // Tras un relevo puede que conservemos jugadores de la sala anterior: si no vuelven
    // a conectarse con nosotros en unos segundos, se retiran de la escena.
    if (this.#players.size > 0) {
      clearTimeout(this.#purgeTimer);
      this.#purgeTimer = setTimeout(() => {
        if (token !== this.#sessionToken) return;
        for (const p of [...this.#players.values()]) {
          if (!this.#conns.has(p.id)) this.#removePlayer(p.id);
        }
        this.#emit('status', this.getStatus());
      }, MIGRATION_PURGE_MS);
    }

    const label = this.#roomType === 'public' ? 'Sala Pública' : `Sala ${formatRoomCode(this.#roomCode)}`;
    this.#setStatus('online', `${label} lista. Eres el anfitrión.`);
  }

  #acceptClient(conn, token) {
    let playerId = null;

    conn.on('data', (data) => {
      if (token !== this.#sessionToken || typeof data !== 'string' || data.length > MAX_PACKET_CHARS) return;
      let packet;
      try { packet = JSON.parse(data); } catch { return; }
      if (!packet || typeof packet.type !== 'string') return;

      if (!playerId) {
        if (packet.type !== '_hello' || typeof packet.from !== 'string') return;
        const helloId = packet.from.slice(0, 32);
        if (helloId === this.#playerId) { try { conn.close(); } catch {} return; }
        if (!this.#conns.has(helloId) && this.#conns.size >= MAX_PLAYERS - 1) {
          this.#sendOn(conn, JSON.stringify({ type: '_full' }));
          setTimeout(() => { try { conn.close(); } catch {} }, 300);
          return;
        }
        playerId = helloId;
        // Si el mismo jugador vuelve a conectar (relevo o recarga de red), sustituimos la conexión
        const old = this.#conns.get(playerId);
        if (old && old.conn !== conn) { try { old.conn.close(); } catch {} }
        this.#conns.set(playerId, { conn, lastSeen: performance.now(), rtt: 0 });

        const isNew = !this.#players.has(playerId);
        const entry = this.#players.get(playerId) || { id: playerId, name: '', appearance: null, state: null, inGame: false };
        entry.name = cleanName(packet.name) || 'Invitada Real';
        this.#players.set(playerId, entry);

        // Bienvenida con la lista completa de la sala (nombres, trajes, caballo y estado)
        this.#sendOn(conn, JSON.stringify({
          type: '_welcome',
          v: PROTOCOL_VERSION,
          host: this.#playerId,
          room: this.#roomType,
          code: this.#roomCode,
          roster: this.#buildRoster(playerId)
        }));
        // Aviso al resto
        this.#relay(playerId, JSON.stringify({ type: '_join', player: this.#rosterEntry(entry) }));
        if (isNew) this.#emit('peerConnected', { id: playerId, name: entry.name, snapshot: entry });
        this.#emit('status', this.getStatus());
        return;
      }

      const link = this.#conns.get(playerId);
      if (!link || link.conn !== conn) return;
      link.lastSeen = performance.now();

      switch (packet.type) {
        case '_ping':
          this.#sendOn(conn, JSON.stringify({ type: '_pong', t: packet.t }));
          return;
        case '_pong':
          if (Number.isFinite(packet.t)) link.rtt = Math.max(0, Math.round(performance.now() - packet.t));
          return;
        case '_bye':
          this.#dropClient(playerId, conn);
          return;
        case '_to': {
          const inner = packet.p;
          if (!inner || typeof inner.type !== 'string') return;
          inner.from = playerId;
          if (packet.to === this.#playerId) {
            this.#handleGamePacket(playerId, inner);
          } else {
            const target = this.#conns.get(packet.to);
            if (target) this.#sendOn(target.conn, JSON.stringify(inner));
          }
          return;
        }
        default:
          break;
      }
      if (packet.type.charCodeAt(0) === 95 && packet.type !== '_name') return; // '_' = control desconocido

      // Paquete de juego: aseguramos el remitente y lo reenviamos tal cual (sin re-serializar)
      let raw = data;
      if (packet.from !== playerId) {
        packet.from = playerId;
        raw = JSON.stringify(packet);
      }
      this.#relay(playerId, raw);
      this.#handleGamePacket(playerId, packet);
    });

    conn.on('close', () => {
      if (token !== this.#sessionToken || !playerId) return;
      this.#dropClient(playerId, conn);
    });
    conn.on('error', () => {
      if (token !== this.#sessionToken || !playerId) return;
      this.#dropClient(playerId, conn);
    });
  }

  #dropClient(playerId, conn) {
    const link = this.#conns.get(playerId);
    if (!link || (conn && link.conn !== conn)) return;
    this.#conns.delete(playerId);
    try { link.conn.close(); } catch {}
    this.#relay(playerId, JSON.stringify({ type: '_leave', id: playerId }));
    this.#removePlayer(playerId);
    this.#emit('status', this.getStatus());
  }

  #relay(excludeId, raw) {
    for (const [id, entry] of this.#conns) {
      if (id !== excludeId) this.#sendOn(entry.conn, raw);
    }
  }

  #rosterEntry(p) {
    return { id: p.id, name: p.name, appearance: p.appearance, state: p.state, inGame: p.inGame };
  }

  #buildRoster(excludeId) {
    const list = [this.#rosterEntry(this.#selfEntry)];
    for (const p of this.#players.values()) {
      if (p.id !== excludeId) list.push(this.#rosterEntry(p));
    }
    return list;
  }

  // ───────────────────────── Cliente ─────────────────────────

  #connectToHost(hostPeerId, token) {
    const peer = this.#peer;
    this.#attachPeerHandlers(peer, token);
    // Si alguien intenta conectarse a un cliente, lo rechazamos
    peer.on('connection', (c) => { try { c.close(); } catch {} });

    const conn = peer.connect(hostPeerId, {
      reliable: false, // PeerJS: canal no ordenado (sin bloqueo de cabecera) y con entrega garantizada
      serialization: 'raw',
      metadata: { pid: this.#playerId, v: PROTOCOL_VERSION }
    });
    this.#hostConn = conn;
    let welcomed = false;

    clearTimeout(this.#connectTimer);
    this.#connectTimer = setTimeout(() => {
      if (token !== this.#sessionToken || welcomed) return;
      this.#handleHostUnreachable(token, 'El anfitrión no responde (puede que la red bloquee la conexión).');
    }, CONNECT_TIMEOUT_MS);

    conn.on('open', () => {
      if (token !== this.#sessionToken) return;
      this.#sendOn(conn, JSON.stringify({ type: '_hello', from: this.#playerId, name: this.#localName, v: PROTOCOL_VERSION }));
    });

    conn.on('data', (data) => {
      if (token !== this.#sessionToken || typeof data !== 'string' || data.length > MAX_PACKET_CHARS) return;
      let packet;
      try { packet = JSON.parse(data); } catch { return; }
      if (!packet || typeof packet.type !== 'string') return;
      this.#hostLastSeen = performance.now();

      switch (packet.type) {
        case '_welcome':
          welcomed = true;
          clearTimeout(this.#connectTimer);
          this.#applyWelcome(packet);
          return;
        case '_join':
          if (packet.player?.id && packet.player.id !== this.#playerId) this.#upsertPlayer(packet.player);
          this.#emit('status', this.getStatus());
          return;
        case '_leave':
          if (packet.id) this.#removePlayer(packet.id);
          this.#emit('status', this.getStatus());
          return;
        case '_ping':
          this.#sendOn(conn, JSON.stringify({ type: '_pong', t: packet.t }));
          return;
        case '_pong':
          if (Number.isFinite(packet.t)) {
            this.#rtt = Math.max(0, Math.round(performance.now() - packet.t));
            this.#emit('status', this.getStatus());
          }
          return;
        case '_full':
          this.#failSession(new Error('La sala está llena (máximo 12 jugadores).'));
          return;
        case '_bye':
          this.#handleHostLost(token);
          return;
        default:
          break;
      }
      if (packet.type.charCodeAt(0) === 95 && packet.type !== '_name') return;
      if (typeof packet.from !== 'string' || packet.from === this.#playerId) return;
      this.#handleGamePacket(packet.from, packet);
    });

    conn.on('close', () => {
      if (token !== this.#sessionToken) return;
      if (welcomed) this.#handleHostLost(token);
      else this.#handleHostUnreachable(token, 'No se pudo abrir la conexión con el anfitrión.');
    });
    conn.on('error', () => {
      if (token !== this.#sessionToken) return;
      if (welcomed) this.#handleHostLost(token);
    });
  }

  #applyWelcome(packet) {
    this.#hostPlayerId = typeof packet.host === 'string' ? packet.host : null;
    this.#hostLastSeen = performance.now();
    const seen = new Set();
    if (Array.isArray(packet.roster)) {
      for (const p of packet.roster) {
        if (!p || typeof p.id !== 'string' || p.id === this.#playerId) continue;
        seen.add(p.id);
        this.#upsertPlayer(p);
      }
    }
    // Tras un relevo: quien ya no está en la sala desaparece de la escena
    for (const p of [...this.#players.values()]) {
      if (!seen.has(p.id)) this.#removePlayer(p.id);
    }
    this.#startPing();
    this.#rejoinAttempts = 0;
    const label = this.#roomType === 'public' ? 'Sala Pública' : `Sala ${formatRoomCode(this.#roomCode)}`;
    this.#setStatus('online', `¡Conectada a la ${label}!`);
  }

  /** El Host no existe o no responde. */
  #handleHostUnreachable(token, message) {
    if (token !== this.#sessionToken) return;
    if (this.#roomType === 'public') {
      // Puede que el id público esté "fantasma" unos segundos: reintentamos
      this.#scheduleRejoin(message);
      return;
    }
    this.#failSession(new Error(message));
  }

  /** El Host se ha ido con la sala ya en marcha. */
  #handleHostLost(token) {
    if (token !== this.#sessionToken) return;
    if (this.#hostPlayerId) this.#removePlayer(this.#hostPlayerId);
    if (this.#roomType === 'public') {
      this.#scheduleRejoin('El anfitrión se ha ido. Buscando nuevo anfitrión…');
      return;
    }
    this.#teardown();
    for (const p of [...this.#players.values()]) this.#removePlayer(p.id);
    this.#roomType = null;
    this.#roomCode = '';
    this.#setStatus('error', 'El anfitrión ha cerrado la sala privada.');
  }

  /** Relevo ligero de Host para la sala pública: espera aleatoria y vuelve a entrar. */
  #scheduleRejoin(message) {
    this.#teardown(); // conserva #players para que nadie desaparezca durante el relevo
    this.#rejoinAttempts++;
    if (this.#rejoinAttempts > MAX_REJOIN_ATTEMPTS) {
      this.#rejoinAttempts = 0;
      this.#failSession(new Error('No se pudo reconectar con la Sala Pública. Vuelve a intentarlo.'));
      return;
    }
    this.#roomType = 'public';
    this.#setStatus('reconnecting', message);
    const token = this.#sessionToken;
    const delay = 400 + Math.random() * 800;
    this.#rejoinTimer = setTimeout(() => {
      if (token !== this.#sessionToken) return;
      this.#rejoinPublic();
    }, delay);
  }

  async #rejoinPublic() {
    // Igual que joinPublicRoom, pero sin vaciar la lista de jugadores
    this.#sessionToken++;
    const token = this.#sessionToken;
    this.#roomType = 'public';
    this.#roomCode = '';
    this.#isHost = false;
    try {
      const Peer = await this.#ensurePeerJs();
      const peer = await this.#openPeer(Peer, PUBLIC_ROOM_ID, token, { allowTaken: true });
      if (token !== this.#sessionToken) return;
      if (peer) {
        this.#becomeHost(peer);
        return;
      }
      const clientPeer = await this.#openPeer(Peer, `${CLIENT_PREFIX}${randomToken(10)}`, token);
      if (token !== this.#sessionToken || !clientPeer) return;
      this.#peer = clientPeer;
      this.#connectToHost(PUBLIC_ROOM_ID, token);
    } catch (err) {
      if (token !== this.#sessionToken) return;
      this.#scheduleRejoin(err?.message || 'Reintentando…');
    }
  }

  // ───────────────────────── Jugadores y paquetes ─────────────────────────

  #upsertPlayer(p) {
    const isNew = !this.#players.has(p.id);
    const entry = this.#players.get(p.id) || { id: p.id, name: '', appearance: null, state: null, inGame: false };
    entry.name = cleanName(p.name) || entry.name || 'Invitada Real';
    if (p.appearance) entry.appearance = p.appearance;
    entry.state = p.state || entry.state;
    entry.inGame = Boolean(p.inGame);
    this.#players.set(p.id, entry);
    if (isNew) this.#emit('peerConnected', { id: p.id, name: entry.name, snapshot: entry });
  }

  #removePlayer(playerId) {
    const entry = this.#players.get(playerId);
    if (!entry) return;
    this.#players.delete(playerId);
    this.#emit('peerDisconnected', { id: playerId, name: entry.name });
  }

  /** Guarda el último estado conocido (para el roster de los que entren después). */
  #ingest(entry, packet) {
    switch (packet.type) {
      case 'state':
        entry.state = packet;
        entry.inGame = true;
        if (packet.appearance) entry.appearance = packet.appearance;
        break;
      case 'profile':
        entry.inGame = true;
        if (packet.appearance) entry.appearance = packet.appearance;
        break;
      case 'appearance':
        if (packet.appearance) entry.appearance = packet.appearance;
        break;
      case 'left_game':
        entry.inGame = false;
        entry.state = null;
        break;
      default:
        break;
    }
    if (typeof packet.name === 'string' && packet.name) entry.name = cleanName(packet.name) || entry.name;
  }

  #handleGamePacket(fromId, packet) {
    let entry = this.#players.get(fromId);
    if (!entry) {
      // Paquete de alguien aún no anunciado (orden no garantizado): lo damos de alta
      this.#upsertPlayer({ id: fromId, name: packet.name, inGame: false });
      entry = this.#players.get(fromId);
    }
    this.#ingest(entry, packet);
    if (packet.type === '_name') {
      this.#emit('status', this.getStatus());
      return;
    }
    this.#emit('message', { from: fromId, packet });
  }

  // ───────────────────────── Ping / latido ─────────────────────────

  #startPing() {
    clearInterval(this.#pingTimer);
    const token = this.#sessionToken;
    this.#pingTimer = setInterval(() => {
      if (token !== this.#sessionToken) return;
      const now = performance.now();
      const raw = JSON.stringify({ type: '_ping', t: now });
      if (this.#isHost) {
        let sum = 0;
        let count = 0;
        for (const [id, entry] of [...this.#conns]) {
          if (now - entry.lastSeen > PEER_TIMEOUT_MS) {
            this.#dropClient(id, entry.conn);
            continue;
          }
          this.#sendOn(entry.conn, raw);
          if (entry.rtt > 0) { sum += entry.rtt; count++; }
        }
        this.#rtt = count ? Math.round(sum / count) : 0;
        this.#emit('status', this.getStatus());
      } else if (this.#hostConn) {
        if (now - this.#hostLastSeen > PEER_TIMEOUT_MS) {
          this.#handleHostLost(token);
          return;
        }
        this.#sendOn(this.#hostConn, raw);
      }
    }, PING_INTERVAL_MS);
  }

  #sendOn(conn, raw) {
    if (!conn || !conn.open) return;
    try { conn.send(raw); } catch {}
  }

  #sendRaw(raw) {
    if (this.#isHost) {
      for (const entry of this.#conns.values()) this.#sendOn(entry.conn, raw);
    } else {
      this.#sendOn(this.#hostConn, raw);
    }
  }

  update() {}

  dispose() {
    this.leaveRoom({ silent: true });
    if (this.#boundUnload) {
      window.removeEventListener('pagehide', this.#boundUnload);
      window.removeEventListener('beforeunload', this.#boundUnload);
    }
    this.#listeners.clear();
  }
}
