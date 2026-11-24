/**
 * Gestor de experiencia PWA y pantalla completa para Reino Rosa Imperial.
 * Administra el registro del Service Worker, el aviso de instalación nativa
 * y el control de pantalla completa desde menú, HUD o tecla F11.
 */
export class PwaManager {
  #deferredPrompt = null;
  #initialized = false;
  #installed = false;
  #swRegistration = null;

  #btnInstallMenu = null;
  #btnInstallHud = null;
  #btnFullscreenMenu = null;
  #btnFullscreenHud = null;

  #displayMediaQueries = [];
  #onBeforeInstallPrompt = null;
  #onAppInstalled = null;
  #onFullscreenChange = null;
  #onKeyDown = null;
  #onDisplayModeChange = null;
  #onInstallClick = null;
  #onFullscreenClick = null;

  /**
   * Inicializa listeners PWA, sincroniza botones del DOM y registra ./sw.js.
   */
  init() {
    if (this.#initialized) return;
    this.#initialized = true;

    this.#cacheDomElements();
    this.#setupDisplayModeWatchers();
    this.#installed = this.isInstalled();
    this.#bindEvents();
    this.#syncInstallButtons();
    this.#syncFullscreenState();
    this.#registerServiceWorker();
  }

  /**
   * Dispara el diálogo nativo de instalación si está disponible.
   * @returns {Promise<boolean>} true si el usuario aceptó la instalación.
   */
  async promptInstall() {
    if (!this.#deferredPrompt) return false;

    const promptEvent = this.#deferredPrompt;
    this.#deferredPrompt = null;

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      const accepted = choice?.outcome === 'accepted';
      if (accepted) {
        this.#installed = true;
      }
      this.#syncInstallButtons();
      return accepted;
    } catch {
      this.#syncInstallButtons();
      return false;
    }
  }

  /**
   * Alterna entre modo ventana y pantalla completa.
   * @returns {Promise<boolean>} Estado final de pantalla completa.
   */
  async toggleFullscreen() {
    const doc = document;
    const root = document.documentElement;

    try {
      if (this.isFullscreen()) {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen();
        }
      } else if (root.requestFullscreen) {
        await root.requestFullscreen({ navigationUI: 'hide' });
      } else if (root.webkitRequestFullscreen) {
        root.webkitRequestFullscreen();
      }
    } catch {
      // Algunos navegadores bloquean fullscreen si no proviene de gesto de usuario
    }

    this.#syncFullscreenState();
    return this.isFullscreen();
  }

  /**
   * Indica si la aplicación se ejecuta instalada (standalone/fullscreen).
   * @returns {boolean}
   */
  isInstalled() {
    if (this.#installed) return true;
    const standaloneNav = window.navigator?.standalone === true;
    const standaloneMatch = window.matchMedia?.('(display-mode: standalone)')?.matches === true;
    const fullscreenMatch = window.matchMedia?.('(display-mode: fullscreen)')?.matches === true;
    return standaloneNav || standaloneMatch || fullscreenMatch;
  }

  /**
   * Indica si el documento se encuentra actualmente en pantalla completa.
   * @returns {boolean}
   */
  isFullscreen() {
    return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  }

  /**
   * Libera todos los listeners registrados y referencias DOM.
   */
  dispose() {
    if (!this.#initialized) return;
    this.#initialized = false;

    window.removeEventListener('beforeinstallprompt', this.#onBeforeInstallPrompt);
    window.removeEventListener('appinstalled', this.#onAppInstalled);
    window.removeEventListener('keydown', this.#onKeyDown);
    document.removeEventListener('fullscreenchange', this.#onFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', this.#onFullscreenChange);

    for (const mq of this.#displayMediaQueries) {
      mq.removeEventListener?.('change', this.#onDisplayModeChange);
    }
    this.#displayMediaQueries = [];

    [this.#btnInstallMenu, this.#btnInstallHud].forEach((btn) => {
      btn?.removeEventListener('click', this.#onInstallClick);
    });
    [this.#btnFullscreenMenu, this.#btnFullscreenHud].forEach((btn) => {
      btn?.removeEventListener('click', this.#onFullscreenClick);
    });

    this.#deferredPrompt = null;
    this.#btnInstallMenu = null;
    this.#btnInstallHud = null;
    this.#btnFullscreenMenu = null;
    this.#btnFullscreenHud = null;
  }

  #cacheDomElements() {
    this.#btnInstallMenu = document.getElementById('btn-pwa-install-menu');
    this.#btnInstallHud = document.getElementById('btn-pwa-install-hud');
    this.#btnFullscreenMenu = document.getElementById('btn-pwa-fullscreen-menu');
    this.#btnFullscreenHud = document.getElementById('btn-pwa-fullscreen-hud');
  }

  #setupDisplayModeWatchers() {
    if (typeof window.matchMedia !== 'function') return;
    this.#onDisplayModeChange = () => {
      this.#installed = this.isInstalled();
      this.#syncInstallButtons();
    };

    ['(display-mode: standalone)', '(display-mode: fullscreen)'].forEach((query) => {
      const mq = window.matchMedia(query);
      mq.addEventListener?.('change', this.#onDisplayModeChange);
      this.#displayMediaQueries.push(mq);
    });
  }

  #bindEvents() {
    this.#onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      this.#deferredPrompt = event;
      this.#syncInstallButtons();
    };

    this.#onAppInstalled = () => {
      this.#installed = true;
      this.#deferredPrompt = null;
      this.#syncInstallButtons();
    };

    this.#onFullscreenChange = () => {
      this.#syncFullscreenState();
    };

    this.#onKeyDown = (event) => {
      if (event.key === 'F11') {
        event.preventDefault();
        this.toggleFullscreen();
      }
    };

    this.#onInstallClick = (event) => {
      event.currentTarget?.blur?.();
      this.promptInstall();
    };

    this.#onFullscreenClick = (event) => {
      event.currentTarget?.blur?.();
      this.toggleFullscreen();
    };

    window.addEventListener('beforeinstallprompt', this.#onBeforeInstallPrompt);
    window.addEventListener('appinstalled', this.#onAppInstalled);
    window.addEventListener('keydown', this.#onKeyDown);
    document.addEventListener('fullscreenchange', this.#onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', this.#onFullscreenChange);

    [this.#btnInstallMenu, this.#btnInstallHud].forEach((btn) => {
      btn?.addEventListener('click', this.#onInstallClick);
    });
    [this.#btnFullscreenMenu, this.#btnFullscreenHud].forEach((btn) => {
      btn?.addEventListener('click', this.#onFullscreenClick);
    });
  }

  #syncInstallButtons() {
    const canShow = Boolean(this.#deferredPrompt) && !this.isInstalled();
    [this.#btnInstallMenu, this.#btnInstallHud].forEach((btn) => {
      if (!btn) return;
      btn.classList.toggle('hidden', !canShow);
    });
  }

  #syncFullscreenState() {
    const active = this.isFullscreen();
    document.body?.classList.toggle('pwa-fullscreen', active);

    if (this.#btnFullscreenMenu) {
      this.#btnFullscreenMenu.textContent = active ? '✕ Salir Pantalla Completa' : '⛶ Pantalla Completa';
      this.#btnFullscreenMenu.title = active ? 'Salir de Pantalla Completa [F11]' : 'Pantalla Completa [F11]';
      this.#btnFullscreenMenu.classList.toggle('is-fullscreen', active);
      this.#btnFullscreenMenu.setAttribute('aria-pressed', String(active));
    }

    if (this.#btnFullscreenHud) {
      this.#btnFullscreenHud.textContent = active ? '🗗' : '⛶';
      this.#btnFullscreenHud.title = active ? 'Salir de Pantalla Completa [F11]' : 'Pantalla Completa [F11]';
      this.#btnFullscreenHud.classList.toggle('is-fullscreen', active);
      this.#btnFullscreenHud.setAttribute('aria-pressed', String(active));
    }
  }

  async #registerServiceWorker() {
    const isSecureContextForSw =
      'serviceWorker' in navigator &&
      (location.protocol === 'https:' ||
        location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1');

    if (!isSecureContextForSw) return;

    try {
      this.#swRegistration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    } catch {
      this.#swRegistration = null;
    }
  }
}
