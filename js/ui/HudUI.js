import { MultiplayerUI, copyText } from './MultiplayerUI.js';

const QUALITY_STORAGE_KEY = 'reino_rosa_quality_v1';

const QUALITY_OPTIONS = [
  { id: 'high', label: 'Alto', desc: 'Calidad completa optimizada' },
  { id: 'medium', label: 'Medio', desc: 'Recomendado (sombras 1024, bloom ligero)' },
  { id: 'low', label: 'Bajo', desc: 'Máximo rendimiento (sin sombras ni bloom)' }
];

const QUALITY_LABELS = {
  high: 'Alto',
  medium: 'Medio',
  low: 'Bajo'
};

export class HudUI {
  #engine = null;
  #callbacks;
  #peerManager;
  #audio;
  #hudEl;
  #minimapCtx = null;
  #boundCleanups = [];
  #injectedNodes = [];
  #inviteModalOpen = false;
  #multiplayerUI = null;
  #netPillKey = '';
  #chatOpen = false;
  #coinDeltaTimer = null;
  #coinAnimTimer = null;
  #quality = 'medium';
  #qualityPopoverEl = null;
  #qualityPopoverOpen = false;
  #fpsBadgeEl = null;
  #fpsVisible = false;

  constructor({ engine = null, peerManager, audio, callbacks }) {
    this.#engine = engine || document.getElementById('canvas-container')?.__engine || null;
    this.#peerManager = peerManager;
    this.#audio = audio;
    this.#callbacks = callbacks;
    this.#hudEl = document.getElementById('hud-overlay');
  }

  init() {
    const canvas = this.#el('minimap-canvas');
    this.#minimapCtx = canvas.getContext('2d');

    this.#quality = this.#resolveInitialQuality();
    this.#ensureCoinCounterUI();
    this.#ensureQualityAndFpsUI();
    this.#syncMuteButton();
    this.#syncQualityButtons();

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
    bindGroup('.quick-chat-btn', (btn) => {
      this.#callbacks.onSendChat?.(btn.dataset.msg);
      this.closeChat();
    });

    // Chat rápido plegable: [T] o 💬 lo abre; Enter/Esc lo cierra
    this.#on('btn-chat-toggle', 'click', () => {
      if (this.#chatOpen) this.closeChat();
      else this.focusChat();
    });

    const form = this.#el('chat-form');
    const chatInput = this.#el('chat-input');
    const chatSubmit = (e) => {
      e.preventDefault();
      const text = chatInput.value.trim().slice(0, 60);
      if (text) {
        this.#callbacks.onSendChat?.(text);
        chatInput.value = '';
      }
      this.closeChat();
    };
    const chatFocus = () => {
      this.#setChatOpen(true);
      this.#callbacks.onChatOpen?.();
    };
    const chatKeyDown = (e) => {
      if (e.key === 'Escape' || e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.closeChat();
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

    // Salas multijugador dentro de la partida
    this.#multiplayerUI = new MultiplayerUI({
      container: this.#el('ingame-multiplayer-root'),
      peerManager: this.#peerManager,
      audio: this.#audio,
      getName: () => this.#peerManager.getLocalName()
    });
    this.#multiplayerUI.init();

    // Píldora de estado de red en la barra superior
    this.#on('hud-net-pill', 'click', async () => {
      const st = this.#peerManager.getStatus();
      if (st.roomType === 'private' && st.roomCode && st.state === 'online') {
        const ok = await copyText(st.roomCode);
        this.showToast(ok ? `📋 Código ${st.roomCode} copiado` : `Código de la sala: ${st.roomCode}`);
      } else {
        this.#callbacks.onOpenInvite?.();
      }
    });
    const refreshNet = () => this.#renderNetPill();
    this.#boundCleanups.push(
      this.#peerManager.on('status', refreshNet),
      this.#peerManager.on('peerConnected', refreshNet),
      this.#peerManager.on('peerDisconnected', refreshNet)
    );
    this.#renderNetPill();
  }

  /** Píldora: 🟢 Pública · 3 jugadores · 42ms  (🟡 conectando / 🔴 desconectado). */
  #renderNetPill() {
    const pill = this.#el('hud-net-pill');
    if (!pill) return;
    const st = this.#peerManager.getStatus();
    const visible = st.state !== 'offline';
    let dot = 'offline';
    let text = '';
    if (st.state === 'online') {
      dot = 'online';
      const room = st.roomType === 'public' ? 'Pública' : `Privada: ${st.roomCode}`;
      const players = `${st.playerCount} ${st.playerCount === 1 ? 'jugador' : 'jugadores'}`;
      text = `${room} · ${players}${st.ping > 0 ? ` · ${st.ping}ms` : ''}`;
    } else if (st.state === 'connecting' || st.state === 'reconnecting') {
      dot = 'connecting';
      text = st.state === 'reconnecting' ? 'Reconectando…' : 'Conectando…';
    } else if (st.state === 'error') {
      dot = 'error';
      text = 'Desconectada';
    }
    const key = `${visible}|${dot}|${text}`;
    if (key !== this.#netPillKey) {
      this.#netPillKey = key;
      pill.classList.toggle('hidden', !visible);
      this.#el('hud-net-dot').dataset.state = dot;
      this.#el('hud-net-text').textContent = text;
      pill.title = st.roomType === 'private' && st.state === 'online'
        ? 'Clic para copiar el código de la sala'
        : (st.message || 'Estado de la sala');
    }
    const badge = this.#el('hud-net-badge');
    if (badge) {
      badge.textContent = st.state === 'online'
        ? (st.roomType === 'public' ? 'Pública' : 'Privada')
        : st.state === 'connecting' || st.state === 'reconnecting' ? '…' : 'Solo';
    }
  }

  #setChatOpen(open) {
    this.#chatOpen = Boolean(open);
    this.#el('chat-panel')?.classList.toggle('is-collapsed', !this.#chatOpen);
  }

  closeChat() {
    const input = this.#el('chat-input');
    this.#setChatOpen(false);
    if (document.activeElement === input) input.blur();
    this.#callbacks.onChatClose?.();
  }

  isChatOpen() {
    return this.#chatOpen;
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
    this.#syncQualityButtons();
    this.#hudEl.classList.remove('hidden');
  }

  hide() {
    this.#closeQualityPopover();
    this.#hudEl.classList.add('hidden');
    this.closeInviteModal();
  }

  focusChat() {
    this.#setChatOpen(true);
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

  updateCompass(cameraYaw, playerPos = null, casinoCenter = null) {
    const track = this.#el('compass-track');
    if (track) {
      const norm = (((-cameraYaw) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const ratio = norm / (Math.PI * 2);
      const shift = (ratio - 0.5) * 180;
      track.style.transform = `translateX(${-shift.toFixed(1)}px)`;
    }

    const pin = this.#el('compass-casino-pin');
    if (!pin) return;
    if (!playerPos || !casinoCenter) {
      pin.style.display = 'none';
      return;
    }
    const rel = this.#computeRelativeBearing(cameraYaw, playerPos, casinoCenter);
    const pct = Math.max(8, Math.min(92, 50 + (rel / (Math.PI * 0.65)) * 42));
    pin.style.display = '';
    pin.style.left = `${pct.toFixed(1)}%`;
  }

  #computeRelativeBearing(yaw, fromPos, targetPos) {
    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const dx = targetPos.x - fromPos.x;
    const dz = targetPos.z - fromPos.z;
    return Math.atan2(dx * rightX + dz * rightZ, dx * fwdX + dz * fwdZ);
  }

  updateParty(localName, remoteList) {
    this.#renderNetPill();

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

  /** Abre el modal de Salas (Pública / Privada / Salir) dentro de la partida. */
  openInviteModal() {
    this.#inviteModalOpen = true;
    this.#multiplayerUI?.render();
    this.#el('invite-modal').classList.remove('hidden');
  }

  closeInviteModal() {
    this.#inviteModalOpen = false;
    this.#el('invite-modal').classList.add('hidden');
  }

  isInviteModalOpen() {
    return this.#inviteModalOpen;
  }

  drawMinimap(playerPos, playerYaw, remotes = [], gemPositions = [], options = {}) {
    const ctx = this.#minimapCtx;
    if (!ctx || !playerPos) return;

    const SIZE = 184;
    const CX = 92;
    const CY = 92;
    const CANVAS_R = 88;
    const RADAR_RADIUS = 115;
    const scale = CANVAS_R / RADAR_RADIUS;

    const horses = Array.isArray(options?.horses) ? options.horses : [];
    const casinoCenter = options?.casinoCenter || { x: 162, z: 0 };
    const cameraYaw = Number.isFinite(options?.cameraYaw) ? options.cameraYaw : playerYaw;

    const toRadar = (wx, wz) => ({
      x: CX + (wx - playerPos.x) * scale,
      y: CY + (wz - playerPos.z) * scale
    });

    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.beginPath();
    ctx.arc(CX, CY, CANVAS_R, 0, Math.PI * 2);
    ctx.clip();

    // Fondo radial pastel-oscuro real
    const bgGrad = ctx.createRadialGradient(CX, CY, 6, CX, CY, CANVAS_R);
    bgGrad.addColorStop(0, '#3b1a36');
    bgGrad.addColorStop(1, '#220d22');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Anillos concéntricos y ejes suaves
    ctx.strokeStyle = 'rgba(229, 184, 105, 0.16)';
    ctx.lineWidth = 1;
    for (const r of [28, 56, 84]) {
      ctx.beginPath();
      ctx.arc(CX, CY, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255, 210, 232, 0.08)';
    ctx.beginPath();
    ctx.moveTo(CX - CANVAS_R, CY);
    ctx.lineTo(CX + CANVAS_R, CY);
    ctx.moveTo(CX, CY - CANVAS_R);
    ctx.lineTo(CX, CY + CANVAS_R);
    ctx.stroke();

    // Lago Sur (z >= 55) y Mirador Real (0, 46)
    const lakeTop = toRadar(0, 55).y;
    if (lakeTop < SIZE) {
      ctx.fillStyle = 'rgba(110, 210, 250, 0.30)';
      const topY = Math.max(0, lakeTop);
      ctx.fillRect(0, topY, SIZE, SIZE - topY);
    }
    const mirador = toRadar(0, 46);
    ctx.beginPath();
    ctx.arc(mirador.x, mirador.y, 8.5 * scale, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 214, 153, 0.42)';
    ctx.fill();

    // Estanque Este (46, 26)
    const pond = toRadar(46, 26);
    ctx.beginPath();
    ctx.ellipse(pond.x, pond.y, 12 * scale, 9.5 * scale, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(110, 210, 250, 0.45)';
    ctx.fill();

    // Castillo (0, -45) + ábside del Trono
    const castleMain = toRadar(-36, -54);
    const castleApse = toRadar(-20, -76);
    ctx.fillStyle = 'rgba(255, 224, 240, 0.28)';
    ctx.strokeStyle = 'rgba(229, 184, 105, 0.72)';
    ctx.lineWidth = 1.2;
    ctx.fillRect(castleMain.x, castleMain.y, 72 * scale, 32 * scale);
    ctx.strokeRect(castleMain.x, castleMain.y, 72 * scale, 32 * scale);
    ctx.fillRect(castleApse.x, castleApse.y, 40 * scale, 22 * scale);
    ctx.strokeRect(castleApse.x, castleApse.y, 40 * scale, 22 * scale);

    // Pasarela en T (-46, 5)
    const catStem = toRadar(-48.8, -13.5);
    const catCross = toRadar(-54.5, 19);
    ctx.fillStyle = 'rgba(243, 116, 174, 0.46)';
    ctx.fillRect(catStem.x, catStem.y, 5.6 * scale, 32.5 * scale);
    ctx.fillRect(catCross.x, catCross.y, 17 * scale, 5 * scale);

    // Gran Fuente (0, 0)
    const fountain = toRadar(0, 0);
    ctx.beginPath();
    ctx.arc(fountain.x, fountain.y, 8 * scale, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(130, 224, 255, 0.58)';
    ctx.fill();

    // Paseo Real del Casino (X: 42..127, Z: -4.4..4.4)
    const walk = toRadar(42, -4.4);
    ctx.fillStyle = 'rgba(245, 196, 81, 0.28)';
    ctx.strokeStyle = 'rgba(243, 116, 174, 0.6)';
    ctx.lineWidth = 1;
    ctx.fillRect(walk.x, walk.y, 85 * scale, 8.8 * scale);
    ctx.strokeRect(walk.x, walk.y, 85 * scale, 8.8 * scale);

    // Gran Cúpula del Casino (r = 35)
    const casPt = toRadar(casinoCenter.x, casinoCenter.z);
    ctx.beginPath();
    ctx.arc(casPt.x, casPt.y, 35 * scale, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(243, 116, 174, 0.22)';
    ctx.fill();
    ctx.strokeStyle = '#f5c451';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Gemas (◆)
    ctx.fillStyle = '#ff6ec7';
    for (const gp of gemPositions) {
      if (!gp) continue;
      const g = toRadar(gp.x, gp.z);
      if (Math.hypot(g.x - CX, g.y - CY) > CANVAS_R - 2) continue;
      ctx.beginPath();
      ctx.moveTo(g.x, g.y - 3.8);
      ctx.lineTo(g.x + 3.2, g.y);
      ctx.lineTo(g.x, g.y + 3.8);
      ctx.lineTo(g.x - 3.2, g.y);
      ctx.closePath();
      ctx.fill();
    }

    // Caballos libres (🐴)
    for (const h of horses) {
      if (!h || h.mounted) continue;
      const hx = h.pos?.x ?? h.x ?? h.position?.x;
      const hz = h.pos?.z ?? h.z ?? h.position?.z;
      if (!Number.isFinite(hx) || !Number.isFinite(hz)) continue;
      const hp = toRadar(hx, hz);
      if (Math.hypot(hp.x - CX, hp.y - CY) > CANVAS_R - 5) continue;
      ctx.beginPath();
      ctx.arc(hp.x, hp.y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = '#fff2c6';
      ctx.strokeStyle = '#d99b56';
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🐴', hp.x, hp.y - 6);
    }

    // Compañeros (●)
    ctx.fillStyle = '#5ac8fa';
    for (const r of remotes) {
      if (!r?.pos) continue;
      const rp = toRadar(r.pos.x, r.pos.z);
      if (Math.hypot(rp.x - CX, rp.y - CY) > CANVAS_R - 3) continue;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, 3.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Iconos clave discretos: Castillo (🏰) en (0, -45) y Pasarela (✨) en (-46, 5)
    this.#drawDiscreteLandmark(ctx, CX, CY, toRadar(0, -45), '🏰', 'rgba(229, 184, 105, 0.72)');
    this.#drawDiscreteLandmark(ctx, CX, CY, toRadar(-46, 5), '✨', 'rgba(243, 116, 174, 0.72)');

    // Icono destacado del Casino (🎰 + diamante dorado + etiqueta "Casino")
    const casDx = casPt.x - CX;
    const casDy = casPt.y - CY;
    const casDistPx = Math.hypot(casDx, casDy);
    const casClamped = casDistPx > 74;
    const casAngle = Math.atan2(casDy, casDx);
    const casX = casClamped ? CX + Math.cos(casAngle) * 76 : casPt.x;
    const casY = casClamped ? CY + Math.sin(casAngle) * 76 : casPt.y;

    ctx.beginPath();
    ctx.arc(casX, casY, 11.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(245, 196, 81, 0.28)';
    ctx.fill();

    if (casClamped) {
      const tipX = CX + Math.cos(casAngle) * 85;
      const tipY = CY + Math.sin(casAngle) * 85;
      const baseX = CX + Math.cos(casAngle) * 79;
      const baseY = CY + Math.sin(casAngle) * 79;
      const perpX = -Math.sin(casAngle) * 3.5;
      const perpY = Math.cos(casAngle) * 3.5;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(baseX + perpX, baseY + perpY);
      ctx.lineTo(baseX - perpX, baseY - perpY);
      ctx.closePath();
      ctx.fillStyle = '#ffe28a';
      ctx.fill();
    }

    ctx.beginPath();
    ctx.moveTo(casX, casY - 7.5);
    ctx.lineTo(casX + 7.5, casY);
    ctx.lineTo(casX, casY + 7.5);
    ctx.lineTo(casX - 7.5, casY);
    ctx.closePath();
    ctx.fillStyle = '#f5c451';
    ctx.strokeStyle = '#fff6d6';
    ctx.lineWidth = 1.2;
    ctx.fill();
    ctx.stroke();

    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎰', casX, casY + 0.5);

    const labelY = casClamped && casY > CY + 54 ? casY - 12 : casY + 12.5;
    ctx.font = 'bold 9px sans-serif';
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = 'rgba(34, 13, 34, 0.92)';
    ctx.strokeText('Casino', casX, labelY);
    ctx.fillStyle = '#ffe58f';
    ctx.fillText('Casino', casX, labelY);

    // Flecha de posición y orientación del jugador en el centro (92, 92)
    const dirX = Math.sin(playerYaw);
    const dirY = Math.cos(playerYaw);
    const perpX = -dirY;
    const perpY = dirX;
    ctx.beginPath();
    ctx.arc(CX, CY, 6.8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 245, 214, 0.22)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(CX + dirX * 9.5, CY + dirY * 9.5);
    ctx.lineTo(CX - dirX * 5 + perpX * 5.2, CY - dirY * 5 + perpY * 5.2);
    ctx.lineTo(CX - dirX * 2.4, CY - dirY * 2.4);
    ctx.lineTo(CX - dirX * 5 - perpX * 5.2, CY - dirY * 5 - perpY * 5.2);
    ctx.closePath();
    ctx.fillStyle = '#fff8e2';
    ctx.strokeStyle = '#f5c451';
    ctx.lineWidth = 1.4;
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    // Actualizar pill de distancia y dirección al Casino
    this.#updateCasinoDistancePill(playerPos, casinoCenter, cameraYaw);
  }

  #drawDiscreteLandmark(ctx, cx, cy, pt, icon, ringColor) {
    const dx = pt.x - cx;
    const dy = pt.y - cy;
    const d = Math.hypot(dx, dy);
    const clamped = d > 74;
    const ang = Math.atan2(dy, dx);
    const x = clamped ? cx + Math.cos(ang) * 76 : pt.x;
    const y = clamped ? cy + Math.sin(ang) * 76 : pt.y;

    if (clamped) {
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ang) * 84, cy + Math.sin(ang) * 84, 2, 0, Math.PI * 2);
      ctx.fillStyle = ringColor;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(x, y, clamped ? 6.5 : 7.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(38, 15, 34, 0.72)';
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();

    ctx.font = clamped ? '9px sans-serif' : '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, x, y + 0.5);
  }

  #updateCasinoDistancePill(playerPos, casinoCenter, cameraYaw) {
    const pill = this.#el('casino-distance-pill');
    const distText = this.#el('casino-dist-text');
    const arrow = this.#el('casino-dir-arrow');
    if (!pill && !distText && !arrow) return;

    const dist = Math.hypot(casinoCenter.x - playerPos.x, casinoCenter.z - playerPos.z);
    if (dist <= 38) {
      if (distText) distText.textContent = '¡En la Gran Cúpula!';
      pill?.classList.add('at-casino');
      if (arrow) arrow.style.display = 'none';
      return;
    }

    if (distText) distText.textContent = `Casino · ${Math.round(dist)} m`;
    pill?.classList.remove('at-casino');
    if (arrow) {
      arrow.style.display = '';
      const rel = this.#computeRelativeBearing(cameraYaw, playerPos, casinoCenter);
      const deg = (rel * 180 / Math.PI) - 90;
      arrow.style.transform = `rotate(${deg.toFixed(1)}deg)`;
    }
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

  #getEngine() {
    if (!this.#engine) {
      this.#engine = document.getElementById('canvas-container')?.__engine || null;
    }
    return this.#engine;
  }

  #resolveInitialQuality() {
    const engineQuality = this.#getEngine()?.getQuality?.();
    if (engineQuality && QUALITY_LABELS[engineQuality]) return engineQuality;
    try {
      const saved = localStorage.getItem(QUALITY_STORAGE_KEY);
      if (saved && QUALITY_LABELS[saved]) return saved;
    } catch {
      // Sin acceso a localStorage
    }
    return 'medium';
  }

  #ensureQualityAndFpsUI() {
    if (!document.getElementById('hud-quality-fps-style')) {
      const style = document.createElement('style');
      style.id = 'hud-quality-fps-style';
      style.textContent = `
        #btn-hud-quality {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          white-space: nowrap;
        }
        #reino-quality-popover {
          position: fixed;
          z-index: 10075;
          width: 268px;
          padding: 8px;
          border-radius: 16px;
          border: 1px solid rgba(229, 184, 105, 0.72);
          background: rgba(255, 246, 251, 0.94);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          box-shadow: 0 12px 30px rgba(62, 18, 44, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.85);
          display: flex;
          flex-direction: column;
          gap: 6px;
          pointer-events: auto;
        }
        #reino-quality-popover.hidden {
          display: none;
        }
        .quality-popover-title {
          font-size: 0.7rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--gold-deep, #b07a32);
          padding: 2px 6px 2px;
        }
        .quality-option-btn {
          width: 100%;
          text-align: left;
          padding: 8px 10px;
          border-radius: 11px;
          border: 1.5px solid transparent;
          background: rgba(255, 255, 255, 0.78);
          color: var(--ink-dark, #3d182b);
          display: flex;
          flex-direction: column;
          gap: 2px;
          cursor: pointer;
          transition: background 0.16s ease, border-color 0.16s ease, transform 0.12s ease;
        }
        .quality-option-btn:hover {
          background: #fff;
          border-color: rgba(243, 116, 174, 0.45);
        }
        .quality-option-btn.active {
          background: linear-gradient(135deg, rgba(255, 232, 244, 0.95), rgba(255, 246, 224, 0.95));
          border-color: var(--rose-500, #d44d8f);
          box-shadow: 0 4px 12px rgba(199, 65, 130, 0.18);
        }
        .quality-option-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.82rem;
          font-weight: 800;
          color: var(--rose-600, #a72f6b);
        }
        .quality-option-desc {
          font-size: 0.7rem;
          color: var(--ink-muted, #764a62);
          line-height: 1.28;
        }
        body.casino-open #reino-quality-popover {
          display: none !important;
        }
        #reino-fps-badge {
          position: fixed;
          top: 58px;
          right: 16px;
          z-index: 10080;
          pointer-events: none;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 5px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 214, 130, 0.58);
          background: rgba(34, 14, 30, 0.82);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
          color: #fff5fa;
          font-size: 0.74rem;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          letter-spacing: 0.02em;
          white-space: nowrap;
        }
        #reino-fps-badge.hidden {
          display: none;
        }
        #reino-fps-badge .fps-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
          background: #47c97f;
          box-shadow: 0 0 8px rgba(71, 201, 127, 0.75);
        }
        #reino-fps-badge.fps-good {
          color: #d8ffe9;
          border-color: rgba(71, 201, 127, 0.6);
        }
        #reino-fps-badge.fps-good .fps-dot {
          background: #47c97f;
          box-shadow: 0 0 8px rgba(71, 201, 127, 0.75);
        }
        #reino-fps-badge.fps-warn {
          color: #ffefc2;
          border-color: rgba(246, 189, 77, 0.68);
        }
        #reino-fps-badge.fps-warn .fps-dot {
          background: #f6bd4d;
          box-shadow: 0 0 8px rgba(246, 189, 77, 0.75);
        }
        #reino-fps-badge.fps-low {
          color: #ffd3e2;
          border-color: rgba(255, 102, 152, 0.72);
        }
        #reino-fps-badge.fps-low .fps-dot {
          background: #ff6698;
          box-shadow: 0 0 8px rgba(255, 102, 152, 0.8);
        }
      `;
      document.head.appendChild(style);
      this.#injectedNodes.push(style);
    }

    const hudActions = this.#hudEl?.querySelector('.hud-actions');
    if (hudActions && !this.#el('btn-hud-quality')) {
      const btn = document.createElement('button');
      btn.id = 'btn-hud-quality';
      btn.className = 'icon-btn glass-chip';
      btn.type = 'button';
      btn.title = 'Calidad gráfica';
      btn.setAttribute('aria-haspopup', 'true');
      btn.setAttribute('aria-expanded', 'false');
      const menuBtn = this.#el('btn-hud-menu');
      if (menuBtn && menuBtn.parentNode === hudActions) {
        hudActions.insertBefore(btn, menuBtn);
      } else {
        hudActions.appendChild(btn);
      }
      this.#injectedNodes.push(btn);

      const onHudQualityClick = (e) => {
        e.stopPropagation();
        btn.blur?.();
        this.#toggleQualityPopover(btn);
      };
      btn.addEventListener('click', onHudQualityClick);
      this.#boundCleanups.push(() => btn.removeEventListener('click', onHudQualityClick));
    }

    const pwaToolbar = document.querySelector('#menu-overlay .pwa-toolbar');
    if (pwaToolbar && !this.#el('btn-menu-quality')) {
      const menuQBtn = document.createElement('button');
      menuQBtn.id = 'btn-menu-quality';
      menuQBtn.className = 'pwa-btn pwa-fullscreen-btn';
      menuQBtn.type = 'button';
      menuQBtn.title = 'Calidad gráfica';
      menuQBtn.setAttribute('aria-haspopup', 'true');
      menuQBtn.setAttribute('aria-expanded', 'false');
      pwaToolbar.appendChild(menuQBtn);
      this.#injectedNodes.push(menuQBtn);

      const onMenuQualityClick = (e) => {
        e.stopPropagation();
        menuQBtn.blur?.();
        this.#toggleQualityPopover(menuQBtn);
      };
      menuQBtn.addEventListener('click', onMenuQualityClick);
      this.#boundCleanups.push(() => menuQBtn.removeEventListener('click', onMenuQualityClick));
    }

    const appRoot = document.getElementById('app-root') || document.body;
    if (!this.#el('reino-quality-popover')) {
      const popover = document.createElement('div');
      popover.id = 'reino-quality-popover';
      popover.className = 'hidden';
      popover.setAttribute('role', 'menu');
      popover.setAttribute('aria-label', 'Selector de calidad gráfica');
      popover.innerHTML = `
        <div class="quality-popover-title">Calidad Gráfica</div>
        ${QUALITY_OPTIONS.map((opt) => `
          <button class="quality-option-btn" type="button" data-quality="${opt.id}" role="menuitemradio" aria-checked="false">
            <span class="quality-option-head">
              <span>${opt.label}</span>
              <span class="quality-check" aria-hidden="true"></span>
            </span>
            <span class="quality-option-desc">${opt.desc}</span>
          </button>
        `).join('')}
      `;
      appRoot.appendChild(popover);
      this.#qualityPopoverEl = popover;
      this.#injectedNodes.push(popover);

      const onPopoverClick = (e) => {
        e.stopPropagation();
        const optionBtn = e.target.closest?.('.quality-option-btn');
        if (!optionBtn) return;
        const q = optionBtn.dataset.quality;
        if (q) this.#selectQuality(q);
      };
      popover.addEventListener('click', onPopoverClick);
      this.#boundCleanups.push(() => popover.removeEventListener('click', onPopoverClick));
    } else {
      this.#qualityPopoverEl = this.#el('reino-quality-popover');
    }

    if (!this.#el('reino-fps-badge')) {
      const fpsBadge = document.createElement('div');
      fpsBadge.id = 'reino-fps-badge';
      fpsBadge.className = 'hidden fps-good';
      fpsBadge.setAttribute('aria-live', 'off');
      fpsBadge.innerHTML = '<span class="fps-dot" aria-hidden="true"></span><span id="reino-fps-text">60 FPS · 16.7 ms · 0 DC · Medio</span>';
      appRoot.appendChild(fpsBadge);
      this.#fpsBadgeEl = fpsBadge;
      this.#injectedNodes.push(fpsBadge);
    } else {
      this.#fpsBadgeEl = this.#el('reino-fps-badge');
    }

    const onDocClick = (e) => {
      if (!this.#qualityPopoverOpen) return;
      if (this.#qualityPopoverEl?.contains(e.target)) return;
      if (e.target === this.#el('btn-hud-quality') || e.target === this.#el('btn-menu-quality')) return;
      this.#closeQualityPopover();
    };
    const onPointerLockChange = () => {
      if (document.pointerLockElement) {
        this.#closeQualityPopover();
      }
    };
    const onKeyDown = (e) => {
      if (e.code === 'F3') {
        e.preventDefault();
        if (e.repeat) return;
        this.#fpsVisible = !this.#fpsVisible;
        this.#fpsBadgeEl?.classList.toggle('hidden', !this.#fpsVisible);
        return;
      }
      if ((e.code === 'Escape' || e.key === 'Escape') && this.#qualityPopoverOpen) {
        this.#closeQualityPopover();
      }
    };
    const onExternalQuality = (e) => {
      const q = e?.detail?.quality;
      if (q && QUALITY_LABELS[q] && q !== this.#quality) {
        this.#quality = q;
        this.#syncQualityButtons();
      }
    };

    document.addEventListener('click', onDocClick);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('reino:set-quality', onExternalQuality);
    this.#boundCleanups.push(
      () => document.removeEventListener('click', onDocClick),
      () => document.removeEventListener('pointerlockchange', onPointerLockChange),
      () => window.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('reino:set-quality', onExternalQuality)
    );

    this.#getEngine()?.setStatsListener?.((stats) => this.#updateFpsBadge(stats));
  }

  #syncQualityButtons() {
    const label = QUALITY_LABELS[this.#quality] || 'Medio';
    const hudBtn = this.#el('btn-hud-quality');
    if (hudBtn) {
      hudBtn.textContent = `⚙️ ${label}`;
      hudBtn.setAttribute('aria-expanded', String(this.#qualityPopoverOpen));
    }
    const menuBtn = this.#el('btn-menu-quality');
    if (menuBtn) {
      menuBtn.textContent = `⚙️ Calidad: ${label}`;
      menuBtn.setAttribute('aria-expanded', String(this.#qualityPopoverOpen));
    }
    if (this.#qualityPopoverEl) {
      this.#qualityPopoverEl.querySelectorAll('.quality-option-btn').forEach((optBtn) => {
        const isActive = optBtn.dataset.quality === this.#quality;
        optBtn.classList.toggle('active', isActive);
        optBtn.setAttribute('aria-checked', String(isActive));
        const check = optBtn.querySelector('.quality-check');
        if (check) check.textContent = isActive ? '✓' : '';
      });
    }
  }

  #toggleQualityPopover(anchorEl) {
    if (!this.#qualityPopoverEl) return;
    if (this.#qualityPopoverOpen) {
      this.#closeQualityPopover();
      return;
    }
    this.#qualityPopoverOpen = true;
    this.#syncQualityButtons();
    this.#qualityPopoverEl.classList.remove('hidden');

    const rect = anchorEl.getBoundingClientRect();
    const popWidth = 268;
    const left = Math.max(12, Math.min(window.innerWidth - popWidth - 12, rect.right - popWidth));
    const top = Math.min(window.innerHeight - 190, rect.bottom + 8);
    this.#qualityPopoverEl.style.left = `${Math.round(left)}px`;
    this.#qualityPopoverEl.style.top = `${Math.round(top)}px`;
  }

  #closeQualityPopover() {
    if (!this.#qualityPopoverOpen) return;
    this.#qualityPopoverOpen = false;
    this.#qualityPopoverEl?.classList.add('hidden');
    this.#syncQualityButtons();
  }

  #selectQuality(quality) {
    if (!QUALITY_LABELS[quality]) return;
    this.#quality = quality;
    try {
      localStorage.setItem(QUALITY_STORAGE_KEY, quality);
    } catch {
      // Sin acceso a localStorage
    }
    this.#getEngine()?.setQuality?.(quality);
    window.dispatchEvent(new CustomEvent('reino:set-quality', { detail: { quality } }));
    this.#syncQualityButtons();
    this.#closeQualityPopover();
    this.showToast(`✨ Calidad gráfica: ${QUALITY_LABELS[quality]}`);
  }

  #updateFpsBadge(stats) {
    if (!this.#fpsBadgeEl || !stats) return;
    const fps = Math.max(0, Math.round(Number(stats.fps) || 0));
    const frameMs = Number.isFinite(Number(stats.frameMs)) ? Number(stats.frameMs).toFixed(1) : '0.0';
    const drawCalls = Math.max(0, Math.round(Number(stats.drawCalls) || 0));
    const qLabel = QUALITY_LABELS[stats.quality] || QUALITY_LABELS[this.#quality] || 'Medio';

    const textEl = this.#fpsBadgeEl.querySelector('#reino-fps-text');
    if (textEl) {
      textEl.textContent = `${fps} FPS · ${frameMs} ms · ${drawCalls} DC · ${qLabel}`;
    }

    this.#fpsBadgeEl.classList.remove('fps-good', 'fps-warn', 'fps-low');
    if (fps >= 50) {
      this.#fpsBadgeEl.classList.add('fps-good');
    } else if (fps >= 35) {
      this.#fpsBadgeEl.classList.add('fps-warn');
    } else {
      this.#fpsBadgeEl.classList.add('fps-low');
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
    this.#getEngine()?.setStatsListener?.(null);
    for (const fn of this.#boundCleanups) fn();
    this.#boundCleanups.length = 0;
    this.#multiplayerUI?.dispose();
    this.#multiplayerUI = null;
    this.#setChatOpen(false);
    this.#netPillKey = '';
    for (const node of this.#injectedNodes) node?.remove?.();
    this.#injectedNodes.length = 0;
    this.#qualityPopoverEl = null;
    this.#fpsBadgeEl = null;
    this.#qualityPopoverOpen = false;
    this.#fpsVisible = false;
    this.hide();
  }
}
