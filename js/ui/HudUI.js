export class HudUI {
  #callbacks;
  #peerManager;
  #audio;
  #hudEl;
  #minimapCtx = null;
  #boundCleanups = [];
  #inviteModalOpen = false;
  #inviteWorldId = 'palacio_cristal';

  constructor({ peerManager, audio, callbacks }) {
    this.#peerManager = peerManager;
    this.#audio = audio;
    this.#callbacks = callbacks;
    this.#hudEl = document.getElementById('hud-overlay');
  }

  init() {
    const canvas = this.#el('minimap-canvas');
    this.#minimapCtx = canvas.getContext('2d');

    this.#syncMuteButton();

    this.#on('btn-hud-wardrobe', 'click', () => this.#callbacks.onToggleWardrobe?.());
    this.#on('btn-hud-world', 'click', () => this.#callbacks.onCycleWorld?.());
    this.#on('btn-hud-mute', 'click', () => {
      this.#audio?.toggleMute();
      this.#syncMuteButton();
    });
    this.#on('btn-hud-menu', 'click', () => this.#callbacks.onReturnToMenu?.());
    this.#on('btn-hud-invite', 'click', () => this.#callbacks.onOpenInvite?.());
    this.#on('btn-close-invite-modal', 'click', () => {
      this.closeInviteModal();
      this.#callbacks.onCloseInvite?.();
    });

    const bindGroup = (selector, onClick) => {
      this.#hudEl.querySelectorAll(selector).forEach((btn) => {
        const fn = () => { btn.blur?.(); onClick(btn); };
        btn.addEventListener('click', fn);
        this.#boundCleanups.push(() => btn.removeEventListener('click', fn));
      });
    };

    bindGroup('.activity-btn', (btn) => this.#callbacks.onStartMinigame?.(btn.dataset.minigame));
    bindGroup('.quick-chat-btn', (btn) => this.#callbacks.onSendChat?.(btn.dataset.msg));

    const form = this.#el('chat-form');
    const chatInput = this.#el('chat-input');
    const chatSubmit = (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (text) {
        this.#callbacks.onSendChat?.(text);
        chatInput.value = '';
      }
      chatInput.blur();
      this.#callbacks.onChatClose?.();
    };
    const chatFocus = () => this.#callbacks.onChatOpen?.();
    const chatKeyDown = (e) => {
      if (e.key === 'Escape' || e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        chatInput.blur();
        this.#callbacks.onChatClose?.();
      }
    };
    form.addEventListener('submit', chatSubmit);
    chatInput.addEventListener('focus', chatFocus);
    chatInput.addEventListener('keydown', chatKeyDown);
    this.#boundCleanups.push(
      () => form.removeEventListener('submit', chatSubmit),
      () => chatInput.removeEventListener('focus', chatFocus),
      () => chatInput.removeEventListener('keydown', chatKeyDown)
    );

    this.#boundCleanups.push(
      this.#peerManager.on('peerConnected', ({ name }) => {
        this.#el('ingame-invite-status').textContent = `¡${name} se ha unido! Puedes invitar a otro compañero con el código de arriba o cerrar esta ventana.`;
      }),
      this.#peerManager.on('peerFailed', ({ name }) => {
        this.#el('ingame-invite-status').textContent = `No se pudo conectar con ${name}. Comprobad que estáis en la misma red y repetid con el código de arriba.`;
      })
    );

    this.#on('btn-ingame-copy', 'click', async () => {
      const box = this.#el('ingame-offer-code');
      if (!box.value) return;
      try { await navigator.clipboard.writeText(box.value); } catch { box.select(); document.execCommand('copy'); }
      this.#el('ingame-invite-status').textContent = '¡Código copiado! Envíaselo a tu compañero.';
    });

    this.#on('btn-ingame-accept', 'click', async () => {
      const input = this.#el('ingame-answer-input');
      const status = this.#el('ingame-invite-status');
      try {
        const res = await this.#peerManager.acceptGuestAnswer(input.value);
        input.value = '';
        this.showToast(`Conectando con ${res.name}...`);
        const code = await this.#peerManager.createHostInvite(this.#inviteWorldId);
        this.#el('ingame-offer-code').value = code;
        status.textContent = `Conectando con ${res.name}... El código de arriba ya es nuevo para el siguiente compañero.`;
      } catch (err) {
        status.textContent = err.message;
      }
    });
  }

  #syncMuteButton() {
    const btn = this.#el('btn-hud-mute');
    if (!btn) return;
    const muted = Boolean(this.#audio?.isMuted());
    btn.textContent = muted ? '🔇' : '🔊';
    btn.title = muted ? 'Activar efectos de sonido' : 'Silenciar efectos de sonido';
    btn.setAttribute('aria-pressed', String(muted));
  }

  #el(id) {
    return document.getElementById(id);
  }

  #on(id, ev, fn) {
    const node = this.#el(id);
    if (!node) return;
    const handler = ev === 'click' ? (e) => { fn(e); node.blur?.(); } : fn;
    node.addEventListener(ev, handler);
    this.#boundCleanups.push(() => node.removeEventListener(ev, handler));
  }

  show() {
    this.#syncMuteButton();
    this.#hudEl.classList.remove('hidden');
  }

  hide() {
    this.#hudEl.classList.add('hidden');
    this.closeInviteModal();
  }

  focusChat() {
    const input = this.#el('chat-input');
    input?.focus();
  }

  setWorldInfo(worldName, zoneName) {
    this.#el('hud-world-name').textContent = worldName;
    if (zoneName) this.#el('hud-zone-name').textContent = zoneName;
  }

  setZoneName(zoneName) {
    this.#el('hud-zone-name').textContent = zoneName;
  }

  updateCompass(cameraYaw) {
    const track = this.#el('compass-track');
    if (!track) return;
    const norm = (((-cameraYaw) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const ratio = norm / (Math.PI * 2);
    const shift = (ratio - 0.5) * 180;
    track.style.transform = `translateX(${-shift.toFixed(1)}px)`;
  }

  updateParty(localName, remoteList) {
    const role = this.#peerManager.getRole();
    const badge = this.#el('hud-net-badge');
    const inviteBtn = this.#el('btn-hud-invite');
    badge.textContent = role === 'host' ? 'Host LAN' : role === 'guest' ? 'Grupo LAN' : 'Solo';
    inviteBtn.classList.toggle('hidden', role !== 'host');

    const listEl = this.#el('hud-party-list');
    const items = [
      `<li class="party-item"><span><i class="party-dot"></i>${this.#escape(localName)} (Tú)</span><span>♛</span></li>`,
      ...remoteList.map((r) => `<li class="party-item"><span><i class="party-dot"></i>${this.#escape(r.name)}</span><span>✦</span></li>`)
    ];
    listEl.innerHTML = items.join('');
  }

  updateQuests(quests) {
    const done = quests.filter((q) => q.completed).length;
    this.#el('hud-quest-summary').textContent = `${done}/${quests.length}`;
    this.#el('hud-quest-list').innerHTML = quests.map((q) => `
      <li class="quest-item${q.completed ? ' done' : ''}">
        <strong>${q.completed ? '✓ ' : '✦ '}${this.#escape(q.title)}</strong>
        <span>${this.#escape(q.detail)}</span>
      </li>
    `).join('');
  }

  setInteractPrompt(label) {
    const el = this.#el('interact-prompt');
    if (!label) {
      el.classList.add('hidden');
      return;
    }
    this.#el('interact-label').textContent = label;
    el.classList.remove('hidden');
  }

  setPointerLockState(locked) {
    const hint = this.#el('pointer-lock-hint');
    if (!hint) return;
    const isLocked = Boolean(locked);
    hint.classList.toggle('locked', isLocked);
    hint.innerHTML = isLocked
      ? '🎯 Cámara activa | <kbd>Tab</kbd>: Liberar ratón'
      : '🖱️ Clic o <kbd>Tab</kbd>: Capturar cámara';
  }

  appendChat(sender, text) {
    const box = this.#el('chat-messages');
    const line = document.createElement('div');
    line.className = 'chat-line';
    line.innerHTML = `<strong>${this.#escape(sender)}:</strong> ${this.#escape(text)}`;
    box.appendChild(line);
    while (box.children.length > 25) {
      box.removeChild(box.firstChild);
    }
    box.scrollTop = box.scrollHeight;
  }

  showToast(message) {
    const container = this.#el('toast-container');
    const div = document.createElement('div');
    div.className = 'toast-msg';
    div.textContent = message;
    container.appendChild(div);
    setTimeout(() => {
      div.style.opacity = '0';
      div.style.transition = 'opacity 0.35s ease';
      setTimeout(() => div.remove(), 360);
    }, 3400);
  }

  async openInviteModal(worldId = 'palacio_cristal') {
    this.#inviteWorldId = worldId;
    this.#inviteModalOpen = true;
    this.#el('invite-modal').classList.remove('hidden');
    this.#el('ingame-invite-status').textContent = 'Generando código LAN...';
    this.#el('ingame-offer-code').value = '';
    try {
      const code = await this.#peerManager.createHostInvite(worldId);
      this.#el('ingame-offer-code').value = code;
      this.#el('ingame-invite-status').textContent = 'Listo. Compártelo con tu compañero.';
    } catch (err) {
      this.#el('ingame-invite-status').textContent = err.message;
    }
  }

  closeInviteModal() {
    this.#inviteModalOpen = false;
    this.#el('invite-modal').classList.add('hidden');
  }

  isInviteModalOpen() {
    return this.#inviteModalOpen;
  }

  drawMinimap(playerPos, playerYaw, remotes, gemPositions) {
    const ctx = this.#minimapCtx;
    if (!ctx) return;
    const w = 168;
    const h = 168;
    const toX = (x) => ((x + 90) / 180) * w;
    const toY = (z) => ((z + 84) / 154) * h;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#2d152b';
    ctx.fillRect(0, 0, w, h);

    // Gran Palacio (cuerpo principal + ábside del Trono)
    ctx.fillStyle = 'rgba(255, 224, 240, 0.32)';
    ctx.strokeStyle = '#e5b869';
    ctx.lineWidth = 1.4;
    ctx.fillRect(toX(-36), toY(-54), toX(36) - toX(-36), toY(-22) - toY(-54));
    ctx.strokeRect(toX(-36), toY(-54), toX(36) - toX(-36), toY(-22) - toY(-54));
    ctx.fillRect(toX(-20), toY(-76), toX(20) - toX(-20), toY(-54) - toY(-76));
    ctx.strokeRect(toX(-20), toY(-76), toX(20) - toX(-20), toY(-54) - toY(-76));

    // Gran Fuente Monumental
    ctx.beginPath();
    ctx.arc(toX(0), toY(0), 6.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(130, 224, 255, 0.58)';
    ctx.fill();

    // Estanque Este de los Cisnes
    ctx.beginPath();
    ctx.ellipse(toX(46), toY(26), 10, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(110, 210, 250, 0.45)';
    ctx.fill();

    // Gran Pasarela en T + Gradas
    ctx.fillStyle = 'rgba(243, 116, 174, 0.46)';
    ctx.fillRect(toX(-48.8), toY(-13.5), toX(-43.2) - toX(-48.8), toY(19) - toY(-13.5));
    ctx.fillRect(toX(-54.5), toY(19), toX(-37.5) - toX(-54.5), toY(24) - toY(19));

    // Mirador Real y Lago Sur
    ctx.fillStyle = 'rgba(110, 210, 250, 0.32)';
    ctx.fillRect(0, toY(55), w, h - toY(55));
    ctx.beginPath();
    ctx.arc(toX(0), toY(46), 7.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 214, 153, 0.45)';
    ctx.fill();

    ctx.fillStyle = '#ff6ec7';
    for (const gp of gemPositions) {
      const gx = toX(gp.x);
      const gy = toY(gp.z);
      ctx.beginPath();
      ctx.moveTo(gx, gy - 4);
      ctx.lineTo(gx + 3.5, gy);
      ctx.lineTo(gx, gy + 4);
      ctx.lineTo(gx - 3.5, gy);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = '#5ac8fa';
    for (const r of remotes) {
      ctx.beginPath();
      ctx.arc(toX(r.pos.x), toY(r.pos.z), 3.8, 0, Math.PI * 2);
      ctx.fill();
    }

    const px = toX(playerPos.x);
    const py = toY(playerPos.z);
    ctx.fillStyle = '#fff5d6';
    ctx.beginPath();
    ctx.arc(px, py, 4.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ff68b2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.sin(playerYaw) * 9, py + Math.cos(playerYaw) * 9);
    ctx.stroke();
  }

  #escape(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  update() {}

  dispose() {
    for (const fn of this.#boundCleanups) fn();
    this.#boundCleanups.length = 0;
    this.hide();
  }
}
