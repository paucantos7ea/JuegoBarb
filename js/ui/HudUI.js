export class HudUI {
  #callbacks;
  #peerManager;
  #audio;
  #hudEl;
  #minimapCtx = null;
  #boundCleanups = [];
  #inviteModalOpen = false;
  #inviteWorldId = 'palacio_cristal';
  #coinDeltaTimer = null;
  #coinAnimTimer = null;

  constructor({ peerManager, audio, callbacks }) {
    this.#peerManager = peerManager;
    this.#audio = audio;
    this.#callbacks = callbacks;
    this.#hudEl = document.getElementById('hud-overlay');
  }

  init() {
    const canvas = this.#el('minimap-canvas');
    this.#minimapCtx = canvas.getContext('2d');

    this.#ensureCoinCounterUI();
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

    // Cúpula Real del Casino (-18.6, 17.0)
    const casinoX = toX(-18.6);
    const casinoY = toY(17.0);
    ctx.beginPath();
    ctx.arc(casinoX, casinoY, 8.8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(72, 229, 194, 0.22)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(casinoX, casinoY, 5.8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(45, 212, 191, 0.56)';
    ctx.strokeStyle = '#f5c451';
    ctx.lineWidth = 1.6;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(casinoX, casinoY, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = '#ffe58f';
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

  updateCoins(balance, delta = 0) {
    const valueEl = this.#el('hud-coin-value');
    const badgeEl = this.#el('hud-coin-badge');
    const deltaEl = this.#el('hud-coin-delta');
    if (valueEl) {
      const safeBalance = Number.isFinite(Number(balance)) ? Math.max(0, Math.round(Number(balance))) : 0;
      valueEl.textContent = String(safeBalance);
    }
    if (!badgeEl) return;

    const numDelta = Number(delta) || 0;
    if (numDelta === 0) return;

    clearTimeout(this.#coinAnimTimer);
    badgeEl.classList.remove('coin-gain', 'coin-spend');
    void badgeEl.offsetWidth;

    if (numDelta > 0) {
      badgeEl.classList.add('coin-gain');
      this.#coinAnimTimer = setTimeout(() => badgeEl.classList.remove('coin-gain'), 620);

      if (deltaEl) {
        clearTimeout(this.#coinDeltaTimer);
        deltaEl.textContent = `+${Math.round(numDelta)} 🪙`;
        deltaEl.classList.remove('show-gain');
        void deltaEl.offsetWidth;
        deltaEl.classList.add('show-gain');
        this.#coinDeltaTimer = setTimeout(() => {
          deltaEl.classList.remove('show-gain');
        }, 1150);
      }
    } else {
      badgeEl.classList.add('coin-spend');
      this.#coinAnimTimer = setTimeout(() => badgeEl.classList.remove('coin-spend'), 420);
    }
  }

  #ensureCoinCounterUI() {
    if (!document.getElementById('hud-coins-style')) {
      const style = document.createElement('style');
      style.id = 'hud-coins-style';
      style.textContent = `
        #hud-coin-badge {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 214, 130, 0.65);
          background: linear-gradient(135deg, rgba(64, 24, 52, 0.82), rgba(112, 46, 86, 0.72));
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 240, 200, 0.38);
          backdrop-filter: blur(10px);
          color: #fff2c6;
          font-weight: 700;
          font-size: 0.94rem;
          letter-spacing: 0.02em;
          user-select: none;
          pointer-events: auto;
          transition: transform 0.2s ease, box-shadow 0.25s ease, border-color 0.25s ease;
        }
        #hud-coin-badge .hud-coin-icon {
          font-size: 1.02rem;
          line-height: 1;
          filter: drop-shadow(0 0 4px rgba(255, 205, 85, 0.55));
        }
        #hud-coin-value {
          font-variant-numeric: tabular-nums;
          text-shadow: 0 1px 3px rgba(32, 10, 24, 0.75);
        }
        #hud-coin-badge.coin-gain {
          animation: hudCoinGoldFlash 0.6s cubic-bezier(0.22, 1, 0.36, 1);
        }
        #hud-coin-badge.coin-spend {
          animation: hudCoinSpendPulse 0.38s ease;
        }
        .hud-coin-delta {
          position: absolute;
          top: calc(100% + 6px);
          right: 6px;
          padding: 2px 8px;
          border-radius: 999px;
          background: linear-gradient(135deg, rgba(255, 215, 105, 0.95), rgba(242, 165, 65, 0.95));
          color: #3b1726;
          font-size: 0.78rem;
          font-weight: 800;
          white-space: nowrap;
          box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3);
          opacity: 0;
          transform: translateY(-4px) scale(0.92);
          pointer-events: none;
        }
        .hud-coin-delta.show-gain {
          animation: hudCoinDeltaFloat 1.1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes hudCoinGoldFlash {
          0% {
            transform: scale(1);
            border-color: rgba(255, 232, 150, 0.95);
            box-shadow: 0 0 0 rgba(255, 215, 100, 0), inset 0 1px 0 rgba(255, 245, 215, 0.6);
          }
          38% {
            transform: scale(1.1);
            border-color: #ffe896;
            box-shadow: 0 0 18px rgba(255, 210, 88, 0.78), inset 0 0 12px rgba(255, 232, 145, 0.45);
          }
          100% {
            transform: scale(1);
            border-color: rgba(255, 214, 130, 0.65);
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 240, 200, 0.38);
          }
        }
        @keyframes hudCoinSpendPulse {
          0% { transform: scale(1); }
          45% {
            transform: scale(0.95);
            border-color: rgba(255, 148, 194, 0.85);
            box-shadow: 0 0 10px rgba(255, 120, 180, 0.4);
          }
          100% { transform: scale(1); }
        }
        @keyframes hudCoinDeltaFloat {
          0% { opacity: 0; transform: translateY(-2px) scale(0.88); }
          18% { opacity: 1; transform: translateY(2px) scale(1.04); }
          75% { opacity: 1; transform: translateY(8px) scale(1); }
          100% { opacity: 0; transform: translateY(14px) scale(0.94); }
        }
        body.casino-open #hud-overlay {
          z-index: 10050 !important;
          pointer-events: none !important;
        }
        body.casino-open #hud-overlay.hidden {
          display: block !important;
        }
        body.casino-open #hud-overlay > *:not(.hud-top):not(#toast-container) {
          opacity: 0 !important;
          pointer-events: none !important;
        }
        body.casino-open .hud-top > *:not(.hud-actions) {
          opacity: 0 !important;
          pointer-events: none !important;
        }
        body.casino-open .hud-actions > *:not(#hud-coin-badge):not(#btn-hud-mute) {
          display: none !important;
        }
        body.casino-open #hud-coin-badge,
        body.casino-open #btn-hud-mute {
          position: relative;
          z-index: 10051 !important;
          pointer-events: auto !important;
          opacity: 1 !important;
          visibility: visible !important;
        }
        body.casino-open #toast-container {
          z-index: 10052 !important;
          opacity: 1 !important;
          visibility: visible !important;
        }
      `;
      document.head.appendChild(style);
    }

    if (this.#el('hud-coin-badge')) return;
    const badge = document.createElement('div');
    badge.id = 'hud-coin-badge';
    badge.title = 'Monedas Imperiales';
    badge.innerHTML = '<span class="hud-coin-icon" aria-hidden="true">🪙</span><span id="hud-coin-value">150</span><span id="hud-coin-delta" class="hud-coin-delta" aria-hidden="true"></span>';

    const host = this.#hudEl?.querySelector('.hud-actions') || this.#hudEl?.querySelector('.hud-top') || this.#hudEl;
    if (host) {
      host.prepend(badge);
    }
  }

  #escape(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  update() {}

  dispose() {
    clearTimeout(this.#coinDeltaTimer);
    clearTimeout(this.#coinAnimTimer);
    this.#coinDeltaTimer = null;
    this.#coinAnimTimer = null;
    for (const fn of this.#boundCleanups) fn();
    this.#boundCleanups.length = 0;
    this.hide();
  }
}
