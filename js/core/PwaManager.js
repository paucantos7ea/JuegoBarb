/**
 * Gestor de experiencia PWA y pantalla completa para Reino Rosa Imperial.
 * Administra el registro del Service Worker, el diálogo nativo de instalación
 * (beforeinstallprompt), la guía de instalación desde la barra de direcciones
 * y el control de pantalla completa desde menú, HUD o tecla F11.
 */
export class PwaManager {
  #deferredPrompt = null;
  #initialized = false;
  #installed = false;
  #swRegistration = null;
  #guideTimer = null;

  #btnInstallMenu = null;
  #btnInstallHud = null;
  #btnFullscreenMenu = null;
  #btnFullscreenHud = null;
  #installGuideEl = null;
  #installGuideTextEl = null;
  #btnGuideClose = null;

  #displayMediaQueries = [];
  #onBeforeInstallPrompt = null;
  #onAppInstalled = null;
  #onFullscreenChange = null;
  #onKeyDown = null;
  #onDisplayModeChange = null;
  #onInstallClick = null;
  #onFullscreenClick = null;
  #onGuideCloseClick = null;

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
   * Dispara el diálogo nativo de instalación si está disponible; si el navegador
   * aún no ha emitido beforeinstallprompt o aplica restricciones de aula, muestra
   * un aviso visual claro indicando el icono "Instalar Reino Rosa 3D" en la barra.
   * @returns {Promise<boolean>} true si el usuario aceptó la instalación nativa.
   */
  async promptInstall() {
    if (this.isInstalled()) return true;

    if (!this.#deferredPrompt) {
      this.#showManualInstallHint();
      return false;
    }

    const promptEvent = this.#deferredPrompt;
    this.#deferredPrompt = null;
    this.#hideInstallGuide();

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
      this.#showManualInstallHint();
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

    this.#hideInstallGuide();
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
    this.#btnGuideClose?.removeEventListener('click', this.#onGuideCloseClick);

    this.#deferredPrompt = null;
    this.#btnInstallMenu = null;
    this.#btnInstallHud = null;
    this.#btnFullscreenMenu = null;
    this.#btnFullscreenHud = null;
    this.#installGuideEl = null;
    this.#installGuideTextEl = null;
    this.#btnGuideClose = null;
  }

  #cacheDomElements() {
    this.#btnInstallMenu = document.getElementById('btn-pwa-install-menu');
    this.#btnInstallHud = document.getElementById('btn-pwa-install-hud');
    this.#btnFullscreenMenu = document.getElementById('btn-pwa-fullscreen-menu');
    this.#btnFullscreenHud = document.getElementById('btn-pwa-fullscreen-hud');
    this.#installGuideEl = document.getElementById('pwa-install-guide');
    this.#installGuideTextEl = document.getElementById('pwa-install-guide-text');
    this.#btnGuideClose = document.getElementById('btn-pwa-guide-close');
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
      this.#hideInstallGuide();
      this.#syncInstallButtons();
    };

    this.#onAppInstalled = () => {
      this.#installed = true;
      this.#deferredPrompt = null;
      this.#hideInstallGuide();
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

    this.#onGuideCloseClick = () => {
      this.#hideInstallGuide();
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
    this.#btnGuideClose?.addEventListener('click', this.#onGuideCloseClick);
  }

  #syncInstallButtons() {
    const installed = this.isInstalled();
    const promptReady = Boolean(this.#deferredPrompt);

    if (this.#btnInstallMenu) {
      this.#btnInstallMenu.classList.toggle('hidden', installed);
      this.#btnInstallMenu.classList.toggle('is-ready', promptReady && !installed);
      this.#btnInstallMenu.title = promptReady
        ? 'Instalar Reino Rosa 3D como aplicación de escritorio'
        : 'Pulsa para instalar o ver cómo usar el icono de la barra de direcciones';
    }

    if (this.#btnInstallHud) {
      this.#btnInstallHud.classList.toggle('hidden', installed);
      this.#btnInstallHud.classList.toggle('is-ready', promptReady && !installed);
    }
  }

  #showManualInstallHint() {
    const message =
      'Haz clic en el icono "Instalar Reino Rosa 3D" (🖥️) a la derecha de la barra de direcciones de Chrome o Edge, o abre el menú ⋮ → Guardar y compartir → Instalar página como aplicación.';

    if (this.#installGuideEl && this.#installGuideTextEl) {
      this.#installGuideTextEl.textContent = message;
      this.#installGuideEl.classList.remove('hidden');
      clearTimeout(this.#guideTimer);
      this.#guideTimer = setTimeout(() => this.#hideInstallGuide(), 12000);
    }

    // Si estamos dentro de la partida (menú oculto), mostrar también un toast en el HUD
    const menuEl = document.getElementById('menu-overlay');
    const toastContainer = document.getElementById('toast-container');
    if (menuEl && !menuEl.classList.contains('visible') && toastContainer) {
      const div = document.createElement('div');
      div.className = 'toast-msg';
      div.textContent = '📲 Pulsa el icono "Instalar Reino Rosa 3D" en la barra de direcciones del navegador.';
      toastContainer.appendChild(div);
      setTimeout(() => {
        div.style.opacity = '0';
        div.style.transition = 'opacity 0.35s ease';
        setTimeout(() => div.remove(), 360);
      }, 5200);
    }
  }

  #hideInstallGuide() {
    clearTimeout(this.#guideTimer);
    this.#guideTimer = null;
    this.#installGuideEl?.classList.add('hidden');
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
