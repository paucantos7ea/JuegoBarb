/**
 * Menú de salas multijugador (PeerJS): Sala Pública con 1 clic, Sala Privada con código
 * corto y control de sesión. Se monta dentro de cualquier contenedor (menú principal o
 * modal en partida) y se mantiene sincronizado con el PeerManager.
 */

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    ta.remove();
    return ok;
  }
}

export class MultiplayerUI {
  #container;
  #peerManager;
  #audio;
  #getName;
  #onEnterGame;
  #enterLabel;
  #root = null;
  #refs = {};
  #unsubs = [];
  #cleanups = [];
  #feedbackTimer = null;

  constructor({ container, peerManager, audio = null, getName = null, onEnterGame = null, enterLabel = '✨ Entrar al Reino con la Sala' }) {
    this.#container = container;
    this.#peerManager = peerManager;
    this.#audio = audio;
    this.#getName = getName;
    this.#onEnterGame = onEnterGame;
    this.#enterLabel = enterLabel;
  }

  init() {
    if (!this.#container) return;
    const root = document.createElement('div');
    root.className = 'mp-ui';
    root.innerHTML = `
      <div class="mp-status" data-ref="status">
        <span class="mp-dot" data-ref="dot"></span>
        <span class="mp-status-text" data-ref="statusText">Modo solitario</span>
      </div>

      <div class="mp-view" data-ref="lobby">
        <button class="btn-primary btn-large mp-public-btn" type="button" data-action="public">
          🌍 Entrar a Sala Pública
        </button>
        <p class="mp-hint">Un clic y conectas con cualquiera que pulse lo mismo.</p>

        <div class="mp-divider"><span>o con tus amigas</span></div>

        <div class="mp-private">
          <button class="btn-secondary mp-create-btn" type="button" data-action="create">👑 Crear Sala Privada</button>
          <form class="mp-join-row" data-ref="joinForm" autocomplete="off">
            <input class="text-input mp-code-input" data-ref="codeInput" type="text" maxlength="12"
              placeholder="ROSA-4821" aria-label="Código de sala privada" spellcheck="false" />
            <button class="btn-primary btn-sm" type="submit" data-ref="joinBtn">🔑 Unirse</button>
          </form>
        </div>
        <button class="btn-link mp-cancel hidden" type="button" data-action="leave" data-ref="cancelBtn">Cancelar</button>
      </div>

      <div class="mp-view hidden" data-ref="room">
        <div class="mp-room-card">
          <div class="mp-room-head">
            <span class="mp-room-kind" data-ref="roomKind">Sala Pública</span>
            <span class="mp-room-ping" data-ref="roomPing"></span>
          </div>
          <div class="mp-code-block hidden" data-ref="codeBlock">
            <span class="mp-code-label">Código de la sala</span>
            <div class="mp-code-row">
              <strong class="mp-code" data-ref="code">ROSA-0000</strong>
              <button class="btn-secondary btn-sm" type="button" data-action="copy">📋 Copiar Código</button>
            </div>
          </div>
          <div class="mp-players-head">Jugadores (<span data-ref="count">1</span>)</div>
          <ul class="mp-players" data-ref="players"></ul>
        </div>
        <button class="btn-primary btn-large hidden" type="button" data-action="enter" data-ref="enterBtn"></button>
        <button class="btn-secondary mp-leave-btn" type="button" data-action="leave">Salir de la Sala (Modo Solitario)</button>
      </div>

      <p class="mp-feedback" data-ref="feedback" aria-live="polite"></p>
    `;
    this.#container.appendChild(root);
    this.#root = root;
    root.querySelectorAll('[data-ref]').forEach((el) => { this.#refs[el.dataset.ref] = el; });
    this.#refs.enterBtn.textContent = this.#enterLabel;

    const onClick = (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn || !root.contains(btn) || btn.disabled) return;
      btn.blur();
      this.#handleAction(btn.dataset.action);
    };
    const onSubmit = (e) => {
      e.preventDefault();
      this.#handleAction('join');
    };
    root.addEventListener('click', onClick);
    this.#refs.joinForm.addEventListener('submit', onSubmit);
    this.#cleanups.push(
      () => root.removeEventListener('click', onClick),
      () => this.#refs.joinForm.removeEventListener('submit', onSubmit)
    );

    const rerender = () => this.render();
    this.#unsubs.push(
      this.#peerManager.on('status', rerender),
      this.#peerManager.on('peerConnected', rerender),
      this.#peerManager.on('peerDisconnected', rerender)
    );
    this.render();
  }

  #syncName() {
    const name = this.#getName?.();
    if (name) this.#peerManager.setLocalName(name);
  }

  async #handleAction(action) {
    switch (action) {
      case 'public':
        this.#audio?.playClick?.();
        this.#syncName();
        this.#setFeedback('');
        await this.#peerManager.joinPublicRoom();
        break;
      case 'create':
        this.#audio?.playClick?.();
        this.#syncName();
        this.#setFeedback('');
        await this.#peerManager.createPrivateRoom();
        break;
      case 'join': {
        const code = this.#refs.codeInput.value;
        if (!code.trim()) {
          this.#setFeedback('Escribe el código que te han pasado (ej. ROSA-4821).', true);
          this.#refs.codeInput.focus();
          return;
        }
        this.#audio?.playClick?.();
        this.#syncName();
        this.#setFeedback('');
        await this.#peerManager.joinPrivateRoom(code);
        break;
      }
      case 'copy': {
        const code = this.#peerManager.getRoomCode();
        if (!code) return;
        const ok = await copyText(code);
        this.#audio?.playClick?.();
        this.#setFeedback(ok ? `¡Código ${code} copiado! Pásaselo a tus amigas.` : `Copia a mano el código: ${code}`, false, 3200);
        break;
      }
      case 'leave':
        this.#audio?.playClick?.();
        this.#peerManager.leaveRoom();
        this.#setFeedback('Has vuelto al modo solitario.', false, 2600);
        break;
      case 'enter':
        this.#audio?.playSparkle?.();
        this.#onEnterGame?.();
        break;
      default:
        break;
    }
  }

  #setFeedback(text, isError = false, clearAfterMs = 0) {
    const el = this.#refs.feedback;
    if (!el) return;
    clearTimeout(this.#feedbackTimer);
    el.textContent = text;
    el.classList.toggle('is-error', Boolean(isError));
    if (clearAfterMs > 0) {
      this.#feedbackTimer = setTimeout(() => {
        if (el.textContent === text) el.textContent = '';
      }, clearAfterMs);
    }
  }

  render() {
    if (!this.#root) return;
    const st = this.#peerManager.getStatus();
    const r = this.#refs;
    const inRoom = st.state === 'online' || st.state === 'reconnecting';
    const busy = st.state === 'connecting';

    // Punto + texto de estado
    const dotState = st.state === 'online' ? 'online'
      : (busy || st.state === 'reconnecting') ? 'connecting'
      : st.state === 'error' ? 'error' : 'offline';
    r.dot.dataset.state = dotState;
    let text = 'Modo solitario';
    if (st.state === 'online') text = st.roomType === 'public' ? 'Conectada · Sala Pública' : `Conectada · Privada ${st.roomCode}`;
    else if (busy) text = st.message || 'Conectando…';
    else if (st.state === 'reconnecting') text = st.message || 'Reconectando…';
    else if (st.state === 'error') text = 'Desconectada';
    r.statusText.textContent = text;

    r.lobby.classList.toggle('hidden', inRoom);
    r.room.classList.toggle('hidden', !inRoom);
    r.lobby.querySelectorAll('button, input').forEach((el) => {
      if (el !== r.cancelBtn) el.disabled = busy;
    });
    r.cancelBtn.classList.toggle('hidden', !busy);

    if (st.state === 'error' && st.message) this.#setFeedback(st.message, true);
    else if (busy) this.#setFeedback('Conectando…');
    else if (st.state === 'online' && r.feedback.textContent === 'Conectando…') this.#setFeedback('');

    if (inRoom) {
      r.roomKind.textContent = st.roomType === 'public' ? '🌍 Sala Pública' : '👑 Sala Privada';
      r.roomPing.textContent = st.state === 'reconnecting'
        ? 'Buscando anfitrión…'
        : (st.isHost ? 'Anfitriona' : '') + (st.ping > 0 ? `${st.isHost ? ' · ' : ''}${st.ping} ms` : '');
      const showCode = st.roomType === 'private' && st.roomCode;
      r.codeBlock.classList.toggle('hidden', !showCode);
      if (showCode) r.code.textContent = st.roomCode;
      r.count.textContent = String(st.playerCount);
      const peers = this.#peerManager.getConnectedPeers();
      const items = [`<li class="is-self">♛ ${escapeHtml(this.#peerManager.getLocalName())} (Tú)</li>`];
      for (const p of peers) items.push(`<li>✦ ${escapeHtml(p.name)}</li>`);
      if (peers.length === 0) items.push('<li class="is-empty">Esperando a más jugadores…</li>');
      r.players.innerHTML = items.join('');
      r.enterBtn.classList.toggle('hidden', !this.#onEnterGame);
    }
  }

  dispose() {
    clearTimeout(this.#feedbackTimer);
    for (const u of this.#unsubs) u();
    this.#unsubs.length = 0;
    for (const c of this.#cleanups) c();
    this.#cleanups.length = 0;
    this.#root?.remove();
    this.#root = null;
    this.#refs = {};
  }
}
