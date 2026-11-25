import { CharacterRig } from '../characters/CharacterRig.js';
import { MultiplayerUI } from './MultiplayerUI.js';

const NAME_STORAGE_KEY = 'reino_rosa_player_name_v1';

function loadStoredName() {
  try {
    const stored = localStorage.getItem(NAME_STORAGE_KEY);
    if (stored && stored.trim()) return stored.trim().slice(0, 18);
  } catch {}
  return `Princesa #${1000 + Math.floor(Math.random() * 9000)}`;
}

function saveName(name) {
  try { localStorage.setItem(NAME_STORAGE_KEY, name); } catch {}
}

export class MenuUI {
  #peerManager;
  #worldThemes;
  #audio;
  #callbacks;

  #overlayEl;
  #selectedAvatar = 'aurora';
  #selectedWorld = 'palacio_cristal';
  #defaultName = 'Princesa';
  #multiplayerUI = null;
  #cleanups = [];

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
    this.#bindNameField();
    this.#bindTabsAndSolo();

    this.#multiplayerUI = new MultiplayerUI({
      container: this.#el('menu-multiplayer-root'),
      peerManager: this.#peerManager,
      audio: this.#audio,
      getName: () => this.#currentName(),
      onEnterGame: () => this.#launchGame(),
      enterLabel: '✨ Entrar al Reino con la Sala'
    });
    this.#multiplayerUI.init();
  }

  #bindNameField() {
    const input = this.#el('player-name-input');
    this.#defaultName = loadStoredName();
    input.value = this.#defaultName;
    this.#peerManager.setLocalName(this.#defaultName);
    const onChange = () => {
      const name = this.#currentName();
      saveName(name);
      this.#peerManager.setLocalName(name);
    };
    input.addEventListener('change', onChange);
    this.#cleanups.push(() => input.removeEventListener('change', onChange));
  }

  #currentName() {
    return this.#el('player-name-input').value.trim().slice(0, 18) || this.#defaultName;
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
      this.#peerManager.leaveRoom({ silent: false });
      this.#launchGame();
    });
  }

  #syncNameToPeer() {
    const name = this.#currentName();
    saveName(name);
    this.#peerManager.setLocalName(name);
  }

  #launchGame() {
    this.#syncNameToPeer();
    this.#callbacks.onStartGame?.(this.getProfile());
  }

  getProfile() {
    return {
      name: this.#currentName(),
      avatarId: this.#selectedAvatar,
      worldId: this.#selectedWorld
    };
  }

  show() {
    this.#multiplayerUI?.render();
    this.#overlayEl.classList.add('visible');
    this.#overlayEl.classList.remove('hidden');
  }

  hide() {
    this.#overlayEl.classList.remove('visible');
    this.#overlayEl.classList.add('hidden');
  }

  update() {}

  dispose() {
    this.#multiplayerUI?.dispose();
    this.#multiplayerUI = null;
    for (const c of this.#cleanups) c();
    this.#cleanups.length = 0;
  }
}
