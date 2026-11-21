export class PeerManager {
  #localId = `p_${Math.random().toString(36).slice(2, 8)}`;
  #localName = 'Estrella Real';
  #role = 'solo'; // 'solo' | 'host' | 'guest'
  #peers = new Map(); // peerId -> { pc, dc, name, connected }
  #pendingSlot = null; // { tempId, pc, dc }
  #listeners = new Map();

  init() {}

  getLocalId() {
    return this.#localId;
  }

  getRole() {
    return this.#role;
  }

  setLocalName(name) {
    this.#localName = (name || 'Estrella Real').trim().slice(0, 18);
  }

  getLocalName() {
    return this.#localName;
  }

  on(event, handler) {
    if (!this.#listeners.has(event)) {
      this.#listeners.set(event, new Set());
    }
    this.#listeners.get(event).add(handler);
    return () => this.#listeners.get(event)?.delete(handler);
  }

  #emit(event, payload) {
    const set = this.#listeners.get(event);
    if (!set) return;
    for (const fn of set) fn(payload);
  }

  getConnectedPeers() {
    const list = [];
    for (const [id, entry] of this.#peers.entries()) {
      if (entry.connected) {
        list.push({ id, name: entry.name });
      }
    }
    return list;
  }

  isMultiplayerActive() {
    return this.#role !== 'solo' && this.getConnectedPeers().length > 0;
  }

  #createConnection() {
    return new RTCPeerConnection({ iceServers: [] });
  }

  #waitForIceGathering(pc) {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        pc.removeEventListener('icegatheringstatechange', onState);
        pc.removeEventListener('icecandidate', onCand);
        clearTimeout(timer);
        resolve();
      };
      const onState = () => {
        if (pc.iceGatheringState === 'complete') done();
      };
      const onCand = (ev) => {
        if (!ev.candidate) done();
      };
      const timer = setTimeout(done, 1500);
      pc.addEventListener('icegatheringstatechange', onState);
      pc.addEventListener('icecandidate', onCand);
    });
  }

  async #encodePayload(obj) {
    const json = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(json);
    if (typeof CompressionStream !== 'undefined') {
      try {
        const cs = new CompressionStream('deflate-raw');
        const writer = cs.writable.getWriter();
        writer.write(bytes);
        writer.close();
        const compressed = new Uint8Array(await new Response(cs.readable).arrayBuffer());
        return `RR1.${this.#toBase64Url(compressed)}`;
      } catch {
        // Fallback sin compresión si el navegador falla
      }
    }
    return `RR0.${this.#toBase64Url(bytes)}`;
  }

  async #decodePayload(code) {
    const cleaned = (code || '').trim().replace(/\s+/g, '');
    if (!cleaned.startsWith('RR1.') && !cleaned.startsWith('RR0.')) {
      throw new Error('Código inválido. Asegúrate de copiarlo completo.');
    }
    const rawBytes = this.#fromBase64Url(cleaned.slice(4));
    let text = '';
    if (cleaned.startsWith('RR1.')) {
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('Este navegador no soporta DecompressionStream.');
      }
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(rawBytes);
      writer.close();
      const inflated = new Uint8Array(await new Response(ds.readable).arrayBuffer());
      text = new TextDecoder().decode(inflated);
    } else {
      text = new TextDecoder().decode(rawBytes);
    }
    return JSON.parse(text);
  }

  #toBase64Url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) {
      bin += String.fromCharCode(bytes[i]);
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  #fromBase64Url(str) {
    const pad = '='.repeat((4 - (str.length % 4)) % 4);
    const b64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  }

  async createHostInvite(worldId) {
    this.#role = 'host';
    if (this.#pendingSlot) {
      this.#pendingSlot.pc.close();
      this.#pendingSlot = null;
    }

    const pc = this.#createConnection();
    const dc = pc.createDataChannel('reino-rosa', { ordered: true });
    const tempId = `slot_${Date.now()}`;
    this.#pendingSlot = { tempId, pc, dc };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await this.#waitForIceGathering(pc);

    return this.#encodePayload({
      t: 'offer',
      s: pc.localDescription.sdp,
      p: this.#localId,
      n: this.#localName,
      w: worldId
    });
  }

  async acceptGuestAnswer(answerCode) {
    if (!this.#pendingSlot) {
      throw new Error('Primero genera un código de invitación.');
    }
    const data = await this.#decodePayload(answerCode);
    if (data.t !== 'answer' || !data.s) {
      throw new Error('El código pegado no es una respuesta de invitado.');
    }

    const { pc, dc } = this.#pendingSlot;
    const remoteId = data.p || `guest_${Math.random().toString(36).slice(2, 6)}`;
    const remoteName = data.n || 'Invitado Real';
    this.#pendingSlot = null;

    this.#registerPeer(remoteId, remoteName, pc, dc);
    try {
      await pc.setRemoteDescription({ type: 'answer', sdp: data.s });
    } catch {
      this.#peers.delete(remoteId);
      try { pc.close(); } catch {}
      throw new Error('Esta respuesta no corresponde al código de invitación actual. Genera un código nuevo y repite el proceso.');
    }

    // Si en 25 s no se abre el canal, avisamos (p. ej. red de clase que bloquea el tráfico entre PCs)
    setTimeout(() => {
      const entry = this.#peers.get(remoteId);
      if (entry && !entry.connected && entry.pc === pc) {
        this.#handleDisconnect(remoteId);
      }
    }, 25000);
    return { id: remoteId, name: remoteName };
  }

  async acceptHostInvite(offerCode) {
    this.resetConnections();
    this.#role = 'guest';

    const data = await this.#decodePayload(offerCode);
    if (data.t !== 'offer' || !data.s) {
      throw new Error('El código pegado no es una invitación de Host.');
    }

    const pc = this.#createConnection();
    const hostId = data.p || 'host_main';
    const hostName = data.n || 'Anfitrión Real';

    pc.ondatachannel = (ev) => {
      this.#registerPeer(hostId, hostName, pc, ev.channel);
    };
    // Hasta que llega el canal de datos, vigilamos fallos de conexión en el lado invitado
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' && !this.#peers.has(hostId)) {
        this.#emit('peerFailed', { id: hostId, name: hostName });
      }
    };

    await pc.setRemoteDescription({ type: 'offer', sdp: data.s });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await this.#waitForIceGathering(pc);

    const answerCode = await this.#encodePayload({
      t: 'answer',
      s: pc.localDescription.sdp,
      p: this.#localId,
      n: this.#localName
    });

    return {
      answerCode,
      hostId,
      hostName,
      worldId: data.w || 'palacio_cristal'
    };
  }

  #registerPeer(peerId, peerName, pc, dc) {
    const entry = { pc, dc, name: peerName, connected: false };
    this.#peers.set(peerId, entry);

    dc.onopen = () => {
      entry.connected = true;
      this.#emit('peerConnected', { id: peerId, name: entry.name });
    };

    dc.onclose = () => {
      this.#handleDisconnect(peerId);
    };

    dc.onerror = () => {
      this.#handleDisconnect(peerId);
    };

    dc.onmessage = (ev) => {
      try {
        const packet = JSON.parse(ev.data);
        const senderId = packet.from || peerId;
        if (packet.name && senderId === peerId) {
          entry.name = packet.name;
        }
        // Si somos Host, reenviamos a los demás invitados (topología estrella)
        if (this.#role === 'host') {
          this.#relayFromHost(peerId, { ...packet, from: senderId });
        }
        this.#emit('message', { from: senderId, packet });
      } catch {
        // Ignorar paquetes malformados
      }
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
        this.#handleDisconnect(peerId);
      }
    };
  }

  #handleDisconnect(peerId) {
    const entry = this.#peers.get(peerId);
    if (!entry) return;
    const wasConnected = entry.connected;
    entry.connected = false;
    this.#peers.delete(peerId);
    try { entry.pc.close(); } catch {}
    if (wasConnected) {
      this.#emit('peerDisconnected', { id: peerId, name: entry.name });
      if (this.#role === 'host') {
        this.broadcast({ type: 'peer_left', peerId });
      }
    } else {
      this.#emit('peerFailed', { id: peerId, name: entry.name });
    }
  }

  #relayFromHost(excludePeerId, packet) {
    const raw = JSON.stringify(packet);
    for (const [id, entry] of this.#peers.entries()) {
      if (id === excludePeerId || !entry.connected || entry.dc.readyState !== 'open') continue;
      entry.dc.send(raw);
    }
  }

  broadcast(packet) {
    const payload = JSON.stringify({ ...packet, from: this.#localId });
    for (const entry of this.#peers.values()) {
      if (entry.connected && entry.dc.readyState === 'open') {
        entry.dc.send(payload);
      }
    }
  }

  sendTo(peerId, packet) {
    const entry = this.#peers.get(peerId);
    if (entry?.connected && entry.dc.readyState === 'open') {
      entry.dc.send(JSON.stringify({ ...packet, from: this.#localId }));
    }
  }

  resetConnections() {
    if (this.#pendingSlot) {
      try { this.#pendingSlot.pc.close(); } catch {}
      this.#pendingSlot = null;
    }
    for (const entry of this.#peers.values()) {
      try { entry.dc?.close(); } catch {}
      try { entry.pc?.close(); } catch {}
    }
    this.#peers.clear();
    this.#role = 'solo';
  }

  update() {}

  dispose() {
    this.resetConnections();
    this.#listeners.clear();
  }
}
