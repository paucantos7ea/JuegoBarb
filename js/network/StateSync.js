import { RemotePlayer } from '../entities/RemotePlayer.js';

export class StateSync {
  #scene;
  #peerManager;
  #textures;
  #remotePlayers = new Map();
  #sendTimer = 0;
  #unsubs = [];
  #callbacks = {};
  #getLocalState = null;

  constructor(scene, peerManager, callbacks = {}, textureFactory = null) {
    this.#scene = scene;
    this.#peerManager = peerManager;
    this.#callbacks = callbacks;
    this.#textures = textureFactory;
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
    const local = this.#getLocalState?.();
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
        const rp = this.#ensureRemotePlayer(from, { name: packet.name, appearance: packet.appearance });
        rp?.setProfile(packet.name, packet.appearance);
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

  broadcastAppearance(name, appearance) {
    this.#peerManager.broadcast({ type: 'appearance', name, appearance });
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

  getRemoteList() {
    const list = [];
    for (const [id, rp] of this.#remotePlayers.entries()) {
      list.push({ id, name: rp.getName(), pos: rp.getPosition() });
    }
    return list;
  }

  update(dt) {
    for (const rp of this.#remotePlayers.values()) {
      rp.update(dt);
    }

    if (!this.#peerManager.isMultiplayerActive() || !this.#getLocalState) return;
    this.#sendTimer += dt;
    if (this.#sendTimer >= 0.066) {
      this.#sendTimer = 0;
      const local = this.#getLocalState();
      if (!local) return;
      this.#peerManager.broadcast({
        type: 'state',
        name: local.name,
        pos: [
          Number(local.pos.x.toFixed(2)),
          Number(local.pos.y.toFixed(2)),
          Number(local.pos.z.toFixed(2))
        ],
        yaw: Number(local.yaw.toFixed(2)),
        anim: local.anim,
        // Emote activo {id, seq}: los compañeros lo reproducen al ver un seq nuevo
        emote: local.emote ? { id: local.emote.id, seq: local.emote.seq } : null,
        appearance: local.appearance
      });
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
