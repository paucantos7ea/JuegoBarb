import { RemotePlayer } from '../characters/RemotePlayer.js';

// ~16 Hz (cada 60 ms) y solo cuando hay movimiento o cambio de estado
const SEND_INTERVAL = 0.06;
const KEEPALIVE_INTERVAL = 2.0;
const POS_EPSILON = 0.004;
const CHAT_MAX = 60;

function getAppearanceKey(ap) {
  if (!ap) return '';
  const acc = Array.isArray(ap.accessories) ? ap.accessories.join(',') : '';
  return `${ap.avatarId || ''}|${ap.outfitId || ''}|${ap.hairId || ''}|${ap.hairColorId || ''}|${ap.skinId || ''}|${ap.eyeColorId || ''}|${acc}`;
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

/**
 * Sincroniza la partida con la sala: crea/actualiza los RemotePlayer, envía el estado
 * local (posición, animación, emote, caballo, ropa) y reparte chat, misiones y eventos.
 */
export class StateSync {
  #scene;
  #peerManager;
  #textures;
  #wardrobeFX;
  #remotePlayers = new Map();
  #remoteList = [];
  #remoteListDirty = true;
  #sendTimer = 0;
  #keepaliveTimer = 0;
  #seq = 0;
  #lastAppearanceKey = '';
  #lastSentX = NaN;
  #lastSentY = NaN;
  #lastSentZ = NaN;
  #lastSentYaw = NaN;
  #lastSentAnim = '';
  #lastSentEmoteSeq = -1;
  #lastSentCasino = null;
  #lastSentName = '';
  #lastSentMountKey = '';
  #unsubs = [];
  #callbacks = {};
  #getLocalState = null;
  #wasOnline = false;

  // Paquete de estado reutilizado (sin crear objetos nuevos en cada envío)
  #statePacket = {
    type: 'state',
    s: 0,
    name: '',
    pos: [0, 0, 0],
    yaw: 0,
    anim: 'idle',
    emote: null,
    casinoStation: null,
    mount: null,
    appearance: undefined
  };
  #emotePayload = { id: '', seq: 0 };
  #mountPayload = { v: '', a: '' };

  constructor(scene, peerManager, callbacks = {}, textureFactory = null, wardrobeFX = null) {
    this.#scene = scene;
    this.#peerManager = peerManager;
    this.#callbacks = callbacks;
    this.#textures = textureFactory;
    this.#wardrobeFX = wardrobeFX;
  }

  init(getLocalStateFn) {
    this.#getLocalState = getLocalStateFn;

    this.#unsubs.push(
      this.#peerManager.on('peerConnected', ({ id, name, snapshot }) => {
        if (snapshot?.inGame) this.#spawnFromSnapshot(id, snapshot);
        this.#callbacks.onPartyChange?.();
        this.#callbacks.onToast?.(`♛ ${name} ha entrado en la sala.`);
        this.#lastSentX = NaN; // el recién llegado recibe ya nuestra posición
        // Le mandamos nuestro perfil completo (ropa + misiones) directamente
        const profile = this.#buildProfilePacket(false);
        if (profile) this.#peerManager.sendTo(id, profile);
      }),

      this.#peerManager.on('peerDisconnected', ({ id, name }) => {
        const had = this.#remotePlayers.has(id);
        this.#removeRemotePlayer(id);
        this.#callbacks.onPartyChange?.();
        if (had) this.#callbacks.onToast?.(`${name} ha salido del reino.`);
      }),

      this.#peerManager.on('message', ({ from, packet }) => {
        this.#handlePacket(from, packet);
      }),

      this.#peerManager.on('status', (status) => {
        // Al (re)conectar tras un relevo de Host anunciamos de nuevo que estamos en partida
        const wasOnline = this.#wasOnline;
        this.#wasOnline = status.state === 'online';
        if (this.#wasOnline && !wasOnline) this.#announce();
      })
    );

    // Jugadores de la sala que ya estaban en partida antes de que entrásemos
    for (const peer of this.#peerManager.getConnectedPeers()) {
      const snap = this.#peerManager.getPlayerSnapshot(peer.id);
      if (snap?.inGame) this.#spawnFromSnapshot(peer.id, snap);
    }
    this.#wasOnline = this.#peerManager.getStatus().state === 'online';
    this.#announce();
  }

  #announce() {
    this.#lastSentX = NaN; // fuerza el envío del estado completo en el siguiente tick
    this.#lastAppearanceKey = '';
    const hello = this.#buildProfilePacket(true);
    if (hello) this.#peerManager.broadcast(hello);
  }

  #buildProfilePacket(requestReply) {
    const local = this.#getLocalState?.(true);
    if (!local) return null;
    return {
      type: 'profile',
      name: local.name,
      appearance: local.appearance,
      worldId: local.worldId,
      quests: local.quests,
      req: requestReply
    };
  }

  #spawnFromSnapshot(peerId, snap) {
    const rp = this.#ensureRemotePlayer(peerId, { name: snap.name, appearance: snap.appearance });
    if (rp && snap.state) rp.applyNetworkState(snap.state, { initial: true });
  }

  #ensureRemotePlayer(peerId, profile = {}) {
    if (peerId === this.#peerManager.getLocalId()) return null;
    let rp = this.#remotePlayers.get(peerId);
    if (!rp) {
      rp = new RemotePlayer(this.#scene, peerId, profile, this.#textures);
      rp.init();
      this.#remotePlayers.set(peerId, rp);
      this.#remoteListDirty = true;
      this.#callbacks.onPartyChange?.();
    }
    return rp;
  }

  #removeRemotePlayer(peerId) {
    const rp = this.#remotePlayers.get(peerId);
    if (!rp) return;
    rp.dispose();
    this.#remotePlayers.delete(peerId);
    this.#remoteListDirty = true;
  }

  #handlePacket(from, packet) {
    if (!packet || from === this.#peerManager.getLocalId()) return;

    switch (packet.type) {
      case 'state': {
        const rp = this.#ensureRemotePlayer(from, { name: packet.name, appearance: packet.appearance });
        rp?.applyNetworkState(packet);
        break;
      }
      case 'profile': {
        const isNew = !this.#remotePlayers.has(from);
        const rp = this.#ensureRemotePlayer(from, { name: packet.name, appearance: packet.appearance });
        if (!isNew) rp?.resetSequence();
        rp?.setProfile(packet.name, packet.appearance);
        if (packet.name) this.#remoteListDirty = true;
        if (packet.quests) this.#callbacks.onRemoteQuestSync?.(packet.quests);
        this.#callbacks.onPartyChange?.();
        // Un compañero acaba de entrar en partida y pide nuestro perfil
        if (packet.req) {
          const reply = this.#buildProfilePacket(false);
          if (reply) this.#peerManager.sendTo(from, reply);
        }
        break;
      }
      case 'left_game': {
        if (this.#remotePlayers.has(from)) {
          this.#removeRemotePlayer(from);
          this.#callbacks.onPartyChange?.();
        }
        break;
      }
      case 'appearance': {
        const rp = this.#remotePlayers.get(from);
        if (!rp) break;
        if (packet.fx) {
          rp.applyWardrobeChange(packet.name, packet.appearance, this.#wardrobeFX, packet.emote || 'spin');
        } else {
          rp.setProfile(packet.name, packet.appearance);
        }
        break;
      }
      case 'chat': {
        const text = typeof packet.text === 'string' ? packet.text.slice(0, CHAT_MAX) : '';
        if (!text) break;
        const rp = this.#remotePlayers.get(from);
        rp?.showChatBubble(text);
        const sender = (typeof packet.name === 'string' && packet.name.slice(0, 18))
          || rp?.getName()
          || this.#peerManager.getPlayerSnapshot(from)?.name
          || 'Compañera';
        this.#callbacks.onChatReceived?.(sender, text);
        break;
      }
      case 'quest':
        this.#callbacks.onRemoteQuestSync?.(packet.quests, packet.notice);
        break;
      case 'world':
        this.#callbacks.onRemoteWorldChange?.(packet.worldId);
        break;
      case 'casino_fireworks':
        this.#callbacks.onRemoteCasinoFireworks?.(packet.name || 'Compañera Real');
        break;
      default:
        break;
    }
  }

  broadcastAppearance(name, appearance, { fx = true, emote = 'spin' } = {}) {
    this.#lastAppearanceKey = getAppearanceKey(appearance);
    this.#peerManager.broadcast({ type: 'appearance', name, appearance, fx, emote });
  }

  broadcastChat(name, text) {
    const clean = String(text || '').trim().slice(0, CHAT_MAX);
    if (!clean) return;
    this.#peerManager.broadcast({ type: 'chat', name, text: clean });
  }

  broadcastQuests(questsSnapshot, notice = null) {
    this.#peerManager.broadcast({ type: 'quest', quests: questsSnapshot, notice });
  }

  broadcastWorld(worldId) {
    this.#peerManager.broadcast({ type: 'world', worldId });
  }

  broadcastCasinoFireworks(name) {
    this.#peerManager.broadcast({ type: 'casino_fireworks', name });
  }

  /** Lista reutilizada para el HUD/minimapa: solo se reconstruye si cambia el grupo. */
  getRemoteList() {
    if (this.#remoteListDirty) {
      this.#remoteListDirty = false;
      this.#remoteList.length = 0;
      for (const [id, rp] of this.#remotePlayers) {
        this.#remoteList.push({ id, name: rp.getName(), pos: rp.getPosition() });
      }
    }
    return this.#remoteList;
  }

  getRemoteCount() {
    return this.#remotePlayers.size;
  }

  update(dt) {
    const local = this.#getLocalState ? this.#getLocalState(false) : null;
    const localPos = local?.pos || null;
    for (const rp of this.#remotePlayers.values()) {
      rp.update(dt, localPos);
    }

    if (!local || !this.#peerManager.isMultiplayerActive()) return;
    this.#sendTimer += dt;
    this.#keepaliveTimer += dt;

    const emoteSeq = local.emote ? local.emote.seq : -1;
    const emoteChanged = emoteSeq !== this.#lastSentEmoteSeq;
    // Los emotes salen al instante; el resto respeta los ~16 Hz
    if (this.#sendTimer < SEND_INTERVAL && !emoteChanged) return;
    this.#sendTimer = Math.min(Math.max(0, this.#sendTimer - SEND_INTERVAL), SEND_INTERVAL);

    const apKey = getAppearanceKey(local.appearance);
    const apChanged = apKey !== this.#lastAppearanceKey;
    const casino = local.casinoStation || null;
    const mount = local.mount || null;
    const mountKey = mount ? `${mount.v}|${mount.a}` : '';
    const pos = local.pos;

    const changed =
      Number.isNaN(this.#lastSentX) ||
      Math.abs(pos.x - this.#lastSentX) >= POS_EPSILON ||
      Math.abs(pos.y - this.#lastSentY) >= POS_EPSILON ||
      Math.abs(pos.z - this.#lastSentZ) >= POS_EPSILON ||
      Math.abs(local.yaw - this.#lastSentYaw) >= POS_EPSILON ||
      local.anim !== this.#lastSentAnim ||
      emoteChanged ||
      casino !== this.#lastSentCasino ||
      mountKey !== this.#lastSentMountKey ||
      local.name !== this.#lastSentName ||
      apChanged;

    if (!changed && this.#keepaliveTimer < KEEPALIVE_INTERVAL) return;

    const packet = this.#statePacket;
    packet.s = ++this.#seq;
    packet.name = local.name;
    packet.pos[0] = round2(pos.x);
    packet.pos[1] = round2(pos.y);
    packet.pos[2] = round2(pos.z);
    packet.yaw = round2(local.yaw);
    packet.anim = local.anim;
    if (local.emote) {
      this.#emotePayload.id = local.emote.id;
      this.#emotePayload.seq = local.emote.seq;
      packet.emote = this.#emotePayload;
    } else {
      packet.emote = null;
    }
    packet.casinoStation = casino;
    if (mount) {
      this.#mountPayload.v = mount.v;
      this.#mountPayload.a = mount.a;
      packet.mount = this.#mountPayload;
    } else {
      packet.mount = null;
    }
    packet.appearance = apChanged ? local.appearance : undefined;

    this.#peerManager.broadcast(packet);
    packet.appearance = undefined;

    this.#lastAppearanceKey = apKey;
    this.#lastSentX = pos.x;
    this.#lastSentY = pos.y;
    this.#lastSentZ = pos.z;
    this.#lastSentYaw = local.yaw;
    this.#lastSentAnim = local.anim;
    this.#lastSentEmoteSeq = emoteSeq;
    this.#lastSentCasino = casino;
    this.#lastSentMountKey = mountKey;
    this.#lastSentName = local.name;
    this.#keepaliveTimer = 0;
  }

  dispose() {
    // Avisamos a la sala de que volvemos al menú (seguimos en la sala, pero sin avatar)
    this.#peerManager.broadcast({ type: 'left_game' });
    for (const unsub of this.#unsubs) unsub();
    this.#unsubs.length = 0;
    for (const rp of this.#remotePlayers.values()) {
      rp.dispose();
    }
    this.#remotePlayers.clear();
    this.#remoteList.length = 0;
  }
}
