import { CharacterRig } from '../entities/CharacterRig.js';

export class MenuUI {
  #peerManager;
  #worldThemes;
  #audio;
  #callbacks;

  #overlayEl;
  #selectedAvatar = 'aurora';
  #selectedWorld = 'palacio_cristal';
  #unsubs = [];

  constructor({ peerManager, worldThemes, audio, callbacks }) {
    this.#peerManager = peerManager;
    this.#worldThemes = worldThemes;
    this.#audio = audio;
    this.#callbacks = callbacks;
    this.#overlayEl = document.getElementById('menu-overlay');
  }

  init() {
    this.#renderAvatars();
    this.#renderWorlds();
    this.#bindTabsAndSolo();
    this.#bindCoopFlows();

    this.#unsubs.push(
      this.#peerManager.on('peerConnected', () => this.#refreshLobbyPeers()),
      this.#peerManager.on('peerDisconnected', () => this.#refreshLobbyPeers()),
      this.#peerManager.on('peerFailed', ({ name }) => this.#showConnectionFailed(name))
    );
  }

  #showConnectionFailed(name) {
    const msg = `No se pudo conectar con ${name}. Comprobad que estáis en la misma red WiFi/cable `
      + 'y repetid el proceso con un código nuevo (ver README → Solución de problemas).';
    const role = this.#peerManager.getRole();
    if (role === 'host') this.#el('host-status').textContent = msg;
    if (role === 'guest') this.#el('guest-status').textContent = msg;
  }

  #el(id) {
    return document.getElementById(id);
  }

  #renderAvatars() {
    const grid = this.#el('avatar-selector');
    grid.innerHTML = '';
    for (const av of CharacterRig.AVATARS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `avatar-card${av.id === this.#selectedAvatar ? ' selected' : ''}`;
      btn.dataset.avatar = av.id;
      btn.innerHTML = `
        <span class="avatar-swatch" style="background:${av.swatch}">♛</span>
        <span>${av.name}</span>
      `;
      btn.addEventListener('click', () => {
        this.#selectedAvatar = av.id;
        this.#audio?.playClick();
        grid.querySelectorAll('.avatar-card').forEach((c) => {
          c.classList.toggle('selected', c.dataset.avatar === av.id);
        });
      });
      grid.appendChild(btn);
    }
  }

  #renderWorlds() {
    const grid = this.#el('world-selector');
    grid.innerHTML = '';
    for (const theme of this.#worldThemes.getAll()) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `world-card${theme.id === this.#selectedWorld ? ' selected' : ''}`;
      btn.dataset.world = theme.id;
      btn.innerHTML = `
        <span class="world-orb" style="background:${theme.orbGradient}"></span>
        <div class="world-info">
          <strong>${theme.name}</strong>
          <span>${theme.subtitle}</span>
        </div>
      `;
      btn.addEventListener('click', () => {
        this.selectWorld(theme.id);
        this.#audio?.playClick();
      });
      grid.appendChild(btn);
    }
  }

  selectWorld(worldId) {
    this.#selectedWorld = worldId;
    this.#el('world-selector').querySelectorAll('.world-card').forEach((c) => {
      c.classList.toggle('selected', c.dataset.world === worldId);
    });
    this.#callbacks.onPreviewWorld?.(worldId);
  }

  #bindTabsAndSolo() {
    const tabSolo = this.#el('tab-solo');
    const tabCoop = this.#el('tab-coop');
    const panelSolo = this.#el('panel-solo');
    const panelCoop = this.#el('panel-coop');

    const switchTab = (mode) => {
      this.#audio?.playClick();
      const isSolo = mode === 'solo';
      tabSolo.classList.toggle('active', isSolo);
      tabCoop.classList.toggle('active', !isSolo);
      panelSolo.classList.toggle('active', isSolo);
      panelCoop.classList.toggle('active', !isSolo);
    };

    tabSolo.addEventListener('click', () => switchTab('solo'));
    tabCoop.addEventListener('click', () => switchTab('coop'));

    this.#el('btn-start-solo').addEventListener('click', () => {
      this.#audio?.playSparkle();
      this.#peerManager.resetConnections();
      this.#launchGame();
    });
  }

  #bindCoopFlows() {
    const rolePicker = this.#el('coop-role-picker');
    const hostView = this.#el('coop-host-view');
    const guestView = this.#el('coop-guest-view');

    const showPicker = () => {
      this.#peerManager.resetConnections();
      rolePicker.classList.remove('hidden');
      hostView.classList.add('hidden');
      guestView.classList.add('hidden');
      this.#refreshLobbyPeers();
    };

    this.#el('btn-host-back').addEventListener('click', showPicker);
    this.#el('btn-guest-back').addEventListener('click', showPicker);

    const generateHostCode = async () => {
      const offerBox = this.#el('host-offer-code');
      const status = this.#el('host-status');
      this.#syncNameToPeer();
      offerBox.value = '';
      status.textContent = 'Generando código LAN directo...';
      try {
        const code = await this.#peerManager.createHostInvite(this.#selectedWorld);
        offerBox.value = code;
        status.textContent = 'Código listo. Cópialo y envíaselo a UN compañero (cada código sirve para una sola persona).';
      } catch (err) {
        status.textContent = `Error al crear invitación: ${err.message}`;
      }
    };

    this.#el('btn-coop-host').addEventListener('click', async () => {
      this.#audio?.playClick();
      rolePicker.classList.add('hidden');
      hostView.classList.remove('hidden');
      await generateHostCode();
    });

    this.#el('btn-new-invite').addEventListener('click', async () => {
      this.#audio?.playClick();
      await generateHostCode();
    });

    this.#el('btn-copy-offer').addEventListener('click', () => {
      this.#copyFrom('host-offer-code', 'host-status', '¡Código de invitación copiado!');
    });

    this.#el('btn-accept-answer').addEventListener('click', async () => {
      const input = this.#el('host-answer-input');
      const status = this.#el('host-status');
      try {
        const info = await this.#peerManager.acceptGuestAnswer(input.value);
        input.value = '';
        this.#audio?.playSparkle();
        // Cada invitación sirve para UN compañero: preparamos ya la siguiente
        await generateHostCode();
        if (this.#peerManager.getConnectedPeers().every((p) => p.id !== info.id)) {
          status.textContent = `Conectando con ${info.name}... (el código de arriba ya es nuevo, para el siguiente compañero)`;
        } else {
          this.#refreshLobbyPeers();
        }
      } catch (err) {
        status.textContent = err.message;
      }
    });

    this.#el('btn-start-host').addEventListener('click', () => {
      this.#audio?.playSparkle();
      this.#peerManager.broadcast({ type: 'start_game', worldId: this.#selectedWorld });
      this.#launchGame();
    });

    // Flujo Invitado
    this.#el('btn-coop-guest').addEventListener('click', () => {
      this.#audio?.playClick();
      rolePicker.classList.add('hidden');
      guestView.classList.remove('hidden');
      this.#el('guest-offer-input').value = '';
      this.#el('guest-answer-code').value = '';
      this.#el('btn-start-guest').disabled = true;
      this.#el('btn-start-guest').textContent = 'Esperando conexión del Host...';
    });

    this.#el('btn-generate-answer').addEventListener('click', async () => {
      const offerInput = this.#el('guest-offer-input');
      const answerOut = this.#el('guest-answer-code');
      const status = this.#el('guest-status');
      this.#syncNameToPeer();
      status.textContent = 'Procesando invitación del Host...';
      try {
        const res = await this.#peerManager.acceptHostInvite(offerInput.value);
        answerOut.value = res.answerCode;
        this.selectWorld(res.worldId);
        status.textContent = `Respuesta generada para ${res.hostName}. Cópiala y envíasela; cuando la pegue, el botón de abajo se activará.`;
        this.#audio?.playSparkle();
      } catch (err) {
        status.textContent = err.message;
      }
    });

    this.#el('btn-copy-answer').addEventListener('click', () => {
      this.#copyFrom('guest-answer-code', 'guest-status', '¡Código de respuesta copiado! Envíalo al Host.');
    });

    this.#el('btn-start-guest').addEventListener('click', () => {
      this.#audio?.playSparkle();
      this.#launchGame();
    });
  }

  async #copyFrom(textareaId, statusId, okMsg) {
    const el = this.#el(textareaId);
    const status = this.#el(statusId);
    if (!el.value) return;
    try {
      await navigator.clipboard.writeText(el.value);
      status.textContent = okMsg;
    } catch {
      el.select();
      document.execCommand('copy');
      status.textContent = okMsg;
    }
    this.#audio?.playClick();
  }

  #refreshLobbyPeers() {
    const peers = this.#peerManager.getConnectedPeers();
    const listEl = this.#el('host-peer-list');
    const countEl = this.#el('host-peer-count');
    if (countEl) countEl.textContent = String(peers.length);
    if (listEl) {
      listEl.innerHTML = peers.length === 0
        ? '<li style="opacity:.65">Sin compañeros aún</li>'
        : peers.map((p) => `<li>♛ ${this.#escape(p.name)}</li>`).join('');
    }

    if (this.#peerManager.getRole() === 'host' && peers.length > 0) {
      this.#el('host-status').textContent = `¡${peers[peers.length - 1].name} conectado! Puedes añadir más o iniciar.`;
    }

    if (this.#peerManager.getRole() === 'guest' && peers.length > 0) {
      const btn = this.#el('btn-start-guest');
      btn.disabled = false;
      btn.textContent = '¡Conectado! Entrar al Reino';
      this.#el('guest-status').textContent = '¡Conexión LAN establecida con el anfitrión!';
    }
  }

  #syncNameToPeer() {
    const name = this.#el('player-name-input').value.trim() || 'Estrella Real';
    this.#peerManager.setLocalName(name);
  }

  #launchGame() {
    this.#syncNameToPeer();
    this.#callbacks.onStartGame?.(this.getProfile());
  }

  #escape(str) {
    return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  getProfile() {
    const name = this.#el('player-name-input').value.trim() || 'Estrella Real';
    return {
      name,
      avatarId: this.#selectedAvatar,
      worldId: this.#selectedWorld
    };
  }

  show() {
    this.#overlayEl.classList.add('visible');
    this.#overlayEl.classList.remove('hidden');
  }

  hide() {
    this.#overlayEl.classList.remove('visible');
    this.#overlayEl.classList.add('hidden');
  }

  update() {}

  dispose() {
    for (const u of this.#unsubs) u();
    this.#unsubs.length = 0;
  }
}
