import { RemotePlayer } from '../characters/RemotePlayer.js';

const SEND_INTERVAL = 0.058;

function getAppearanceKey(ap) {
  if (!ap) return '';
  const acc = Array.isArray(ap.accessories) ? ap.accessories.join(',') : '';
  return `${ap.avatarId || ''}|${ap.outfitId || ''}|${ap.hairId || ''}|${ap.hairColorId || ''}|${ap.skinId || ''}|${ap.eyeColorId || ''}|${acc}`;
}

export class StateSync {
  #scene;
  #peerManager;
  #textures;
  #wardrobeFX;
  #remotePlayers = new Map();
  #sendTimer = 0;
  #keepaliveTimer = 0;
  #appearanceSyncTimer = 0;
  #lastAppearanceKey = '';
  #lastSentX = NaN;
  #lastSentY = NaN;
  #lastSentZ = NaN;
  #lastSentYaw = NaN;
  #lastSentAnim = '';
  #lastSentEmoteSeq = -1;
  #lastSentCasino = null;
  #lastSentName = '';
  #unsubs = [];
  #callbacks = {};
  #getLocalState = null;

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
      this.#peerManager.on('peerConnected', ({ id, name }) => {
        this.#ensureRemotePlayer(id, { name });
        this.#callbacks.onPartyChange?.();
        this.#callbacks.onToast?.(`♛ ${name} se ha unido al grupo real.`);
        // Enviar nuestro estado completo + misiones al recién conectado
        const profile = this.#buildProfilePacket(false);
        if (profile) this.#peerManager.sendTo(id, profile);
      }),

      this.#peerManager.on('peerFailed', ({ name }) => {
        this.#callbacks.onToast?.(`No se pudo conectar con ${name}. Generad un código nuevo.`);
      }),

      this.#peerManager.on('peerDisconnected', ({ id, name }) => {
        this.#removeRemotePlayer(id);
        this.#callbacks.onPartyChange?.();
        this.#callbacks.onToast?.(`${name} ha salido del reino.`);
      }),

      this.#peerManager.on('message', ({ from, packet }) => {
        this.#handlePacket(from, packet);
      })
    );

    // Compañeros que ya se conectaron en el lobby (su 'peerConnected' ocurrió antes de entrar
    // en partida): los creamos ya y pedimos su perfil + misiones, enviando el nuestro.
    for (const peer of this.#peerManager.getConnectedPeers()) {
      this.#ensureRemotePlayer(peer.id, { name: peer.name });
    }
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

  #ensureRemotePlayer(peerId, profile = {}) {
    if (peerId === this.#peerManager.getLocalId()) return null;
    let rp = this.#remotePlayers.get(peerId);
    if (!rp) {
      rp = new RemotePlayer(this.#scene, peerId, profile, this.#textures);
      rp.init();
      this.#remotePlayers.set(peerId, rp);
      this.#callbacks.onPartyChange?.();
    }
    return rp;
  }

  #removeRemotePlayer(peerId) {
    const rp = this.#remotePlayers.get(peerId);
    if (!rp) return;
    rp.dispose();
    this.#remotePlayers.delete(peerId);
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
        const rp = this.#ensureRemotePlayer(from, { name: packet.name, appearance: packet.appearance });
        rp?.setProfile(packet.name, packet.appearance);
        if (packet.quests) {
          this.#callbacks.onRemoteQuestSync?.(packet.quests);
        }
        this.#callbacks.onPartyChange?.();
        // Un compañero acaba de entrar en partida y pide nuestro perfil
        if (packet.req) {
          const reply = this.#buildProfilePacket(false);
          if (reply) this.#peerManager.broadcast(reply);
        }
        break;
      }
      case 'appearance': {
        const rp = this.#ensureRemotePlayer(from, { name: packet.name });
        if (packet.fx) {
          rp?.applyWardrobeChange(packet.name, packet.appearance, this.#wardrobeFX, packet.emote || 'spin');
        } else {
          rp?.setProfile(packet.name, packet.appearance);
        }
        break;
      }
      case 'chat': {
        const rp = this.#remotePlayers.get(from);
        rp?.showChatBubble(packet.text);
        this.#callbacks.onChatReceived?.(packet.name || rp?.getName() || 'Compañero', packet.text);
        break;
      }
      case 'quest': {
        this.#callbacks.onRemoteQuestSync?.(packet.quests, packet.notice);
        break;
      }
      case 'world': {
        this.#callbacks.onRemoteWorldChange?.(packet.worldId);
        break;
      }
      case 'start_game': {
        this.#callbacks.onRemoteStartGame?.(packet.worldId);
        break;
      }
      case 'casino_fireworks': {
        this.#callbacks.onRemoteCasinoFireworks?.(packet.name || 'Compañero Real');
        break;
      }
      case 'peer_left': {
        if (packet.peerId) {
          this.#removeRemotePlayer(packet.peerId);
          this.#callbacks.onPartyChange?.();
        }
        break;
      }
      default:
        break;
    }
  }

  broadcastAppearance(name, appearance, { fx = true, emote = 'spin' } = {}) {
    this.#peerManager.broadcast({ type: 'appearance', name, appearance, fx, emote });
  }

  broadcastChat(name, text) {
    this.#peerManager.broadcast({ type: 'chat', name, text });
  }

  broadcastQuests(questsSnapshot, notice = null) {
    this.#peerManager.broadcast({ type: 'quest', quests: questsSnapshot, notice });
  }

  broadcastWorld(worldId) {
    this.#peerManager.broadcast({ type: 'world', worldId });
  }

  broadcastStartGame(worldId) {
    this.#peerManager.broadcast({ type: 'start_game', worldId });
  }

  broadcastCasinoFireworks(name) {
    this.#peerManager.broadcast({ type: 'casino_fireworks', name });
  }

  getRemoteList() {
    const list = [];
    for (const [id, rp] of this.#remotePlayers.entries()) {
      list.push({ id, name: rp.getName(), pos: rp.getPosition() });
    }
    return list;
  }

  update(dt) {
    const local = this.#getLocalState ? this.#getLocalState(false) : null;
    const localPos = local?.pos || null;
    for (const rp of this.#remotePlayers.values()) {
      rp.update(dt, localPos);
    }

    if (!this.#peerManager.isMultiplayerActive() || !local) return;
    this.#sendTimer += dt;
    this.#keepaliveTimer += dt;
    this.#appearanceSyncTimer += dt;

    if (this.#sendTimer >= SEND_INTERVAL) {
      this.#sendTimer = Math.min(this.#sendTimer - SEND_INTERVAL, SEND_INTERVAL);

      const apKey = getAppearanceKey(local.appearance);
      const apChanged = apKey !== this.#lastAppearanceKey;
      const needsAppearanceSync = apChanged || this.#appearanceSyncTimer >= 3.0;
      const emoteSeq = local.emote ? local.emote.seq : -1;
      const casino = local.casinoStation || null;

      const changed =
        Number.isNaN(this.#lastSentX) ||
        Math.abs(local.pos.x - this.#lastSentX) >= 0.004 ||
        Math.abs(local.pos.y - this.#lastSentY) >= 0.004 ||
        Math.abs(local.pos.z - this.#lastSentZ) >= 0.004 ||
        Math.abs(local.yaw - this.#lastSentYaw) >= 0.004 ||
        local.anim !== this.#lastSentAnim ||
        emoteSeq !== this.#lastSentEmoteSeq ||
        casino !== this.#lastSentCasino ||
        local.name !== this.#lastSentName ||
        apChanged;

      if (!changed && this.#keepaliveTimer < 0.5 && !needsAppearanceSync) return;

      const packet = {
        type: 'state',
        name: local.name,
        pos: [
          Math.round(local.pos.x * 100) / 100,
          Math.round(local.pos.y * 100) / 100,
          Math.round(local.pos.z * 100) / 100
        ],
        yaw: Math.round(local.yaw * 100) / 100,
        anim: local.anim,
        // Emote activo {id, seq}: los compañeros lo reproducen al ver un seq nuevo
        emote: local.emote ? { id: local.emote.id, seq: local.emote.seq } : null,
        casinoStation: casino
      };
      if (needsAppearanceSync) {
        packet.appearance = local.appearance;
        this.#lastAppearanceKey = apKey;
        this.#appearanceSyncTimer = 0;
      }

      this.#peerManager.broadcast(packet);
      this.#lastSentX = local.pos.x;
      this.#lastSentY = local.pos.y;
      this.#lastSentZ = local.pos.z;
      this.#lastSentYaw = local.yaw;
      this.#lastSentAnim = local.anim;
      this.#lastSentEmoteSeq = emoteSeq;
      this.#lastSentCasino = casino;
      this.#lastSentName = local.name;
      this.#keepaliveTimer = 0;
    }
  }

  dispose() {
    for (const unsub of this.#unsubs) unsub();
    this.#unsubs.length = 0;
    for (const rp of this.#remotePlayers.values()) {
      rp.dispose();
    }
    this.#remotePlayers.clear();
  }
}
