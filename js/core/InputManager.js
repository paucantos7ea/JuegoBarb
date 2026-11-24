export class InputManager {
  #domElement;
  #keys = new Set();
  #controlsLocked = false;
  #pointerLockEnabled = false;
  #isDragging = false;
  #lastMouseX = 0;
  #lastMouseY = 0;
  #lookDeltaX = 0;
  #lookDeltaY = 0;
  #zoomDelta = 0;
  #skipLockFrames = 0;
  #pointerLockGuard = null;
  #actionListeners = new Map();
  #boundHandlers = {};
  static #EMOTE_KEYS = { Digit1: 'wave', Digit2: 'spin', Digit3: 'curtsy', Digit4: 'star', Numpad1: 'wave', Numpad2: 'spin', Numpad3: 'curtsy', Numpad4: 'star' };

  constructor(domElement) {
    this.#domElement = domElement;
  }

  init() {
    this.#boundHandlers.keyDown = (e) => this.#onKeyDown(e);
    this.#boundHandlers.keyUp = (e) => this.#onKeyUp(e);
    this.#boundHandlers.mouseDown = (e) => this.#onMouseDown(e);
    this.#boundHandlers.mouseMove = (e) => this.#onMouseMove(e);
    this.#boundHandlers.mouseUp = () => { this.#isDragging = false; };
    this.#boundHandlers.wheel = (e) => this.#onWheel(e);
    this.#boundHandlers.pointerLockChange = () => this.#onPointerLockChange();
    this.#boundHandlers.pointerLockError = () => this.#onPointerLockError();
    this.#boundHandlers.visibilityChange = () => this.#onVisibilityChange();
    this.#boundHandlers.contextMenu = (e) => {
      if (e.target === this.#domElement) e.preventDefault();
    };
    this.#boundHandlers.blur = () => {
      this.#keys.clear();
      this.#isDragging = false;
      this.#resetLookDeltas();
    };

    window.addEventListener('keydown', this.#boundHandlers.keyDown);
    window.addEventListener('keyup', this.#boundHandlers.keyUp);
    window.addEventListener('mousemove', this.#boundHandlers.mouseMove);
    window.addEventListener('mouseup', this.#boundHandlers.mouseUp);
    window.addEventListener('blur', this.#boundHandlers.blur);
    document.addEventListener('pointerlockchange', this.#boundHandlers.pointerLockChange);
    document.addEventListener('pointerlockerror', this.#boundHandlers.pointerLockError);
    document.addEventListener('visibilitychange', this.#boundHandlers.visibilityChange);
    this.#domElement.addEventListener('mousedown', this.#boundHandlers.mouseDown);
    this.#domElement.addEventListener('wheel', this.#boundHandlers.wheel, { passive: true });
    this.#domElement.addEventListener('contextmenu', this.#boundHandlers.contextMenu);
  }

  #resetLookDeltas() {
    this.#lookDeltaX = this.#lookDeltaY = this.#zoomDelta = 0;
  }

  #isTypingInField() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
  }

  #onPointerLockChange() {
    const locked = this.isPointerLocked();
    document.body.classList.toggle('pointer-locked', locked);
    this.#skipLockFrames = locked ? 2 : 0;
    this.#resetLookDeltas();
    if (!locked) {
      this.#isDragging = false;
    }
    this.#emit('pointerLockChange', locked);
  }

  #onPointerLockError() {
    this.#isDragging = false;
    this.#skipLockFrames = 0;
    // Habitual tras pulsar Esc (el navegador bloquea la re-captura ~1 s): no es un error del juego
    console.debug('[InputManager] Captura de ratón rechazada por el navegador; vuelve a hacer clic.');
  }

  #onVisibilityChange() {
    if (!document.hidden) return;
    this.#keys.clear();
    this.#isDragging = false;
    this.#resetLookDeltas();
    this.exitPointerLock();
  }

  setPointerLockEnabled(enabled) {
    this.#pointerLockEnabled = Boolean(enabled);
    if (!this.#pointerLockEnabled) {
      this.exitPointerLock();
      document.body.classList.remove('pointer-locked');
    }
  }

  /**
   * Función que devuelve true mientras haya UI que necesite el cursor libre
   * (diálogos, modales...). Bloquea la captura por clic, Tab o reanudación automática.
   * @param {(() => boolean)|null} fn
   */
  setPointerLockGuard(fn) {
    this.#pointerLockGuard = typeof fn === 'function' ? fn : null;
  }

  #isPointerLockBlocked() {
    try {
      return Boolean(this.#pointerLockGuard?.());
    } catch {
      return false;
    }
  }

  isPointerLocked() {
    return document.pointerLockElement === this.#domElement;
  }

  requestPointerLock() {
    if (!this.#pointerLockEnabled || this.#controlsLocked || this.#isTypingInField()) return;
    if (this.isPointerLocked() || this.#isPointerLockBlocked()) return;
    // Sin gesto de usuario activo (p. ej. al acabar un minijuego por temporizador) el navegador
    // rechazaría la petición con 'pointerlockerror': esperamos al siguiente clic.
    if (navigator.userActivation && !navigator.userActivation.isActive) return;
    try {
      const res = this.#domElement.requestPointerLock?.();
      if (res && typeof res.catch === 'function') {
        res.catch(() => {});
      }
    } catch {
      // Algunos navegadores bloquean re-captura inmediata tras Esc
    }
  }

  exitPointerLock() {
    this.#resetLookDeltas();
    this.#skipLockFrames = 0;
    if (document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch {
        // Ignorar si ya fue liberado
      }
    }
  }

  togglePointerLock() {
    if (this.isPointerLocked()) {
      this.exitPointerLock();
    } else {
      this.requestPointerLock();
    }
  }

  #onKeyDown(e) {
    if (e.code === 'Tab' && this.#pointerLockEnabled) {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat && !this.#controlsLocked && !this.#isTypingInField()) {
        if (document.activeElement?.tagName === 'BUTTON') {
          document.activeElement.blur();
        }
        this.togglePointerLock();
      }
      return;
    }

    if (this.#isTypingInField()) {
      if (e.code === 'Escape') {
        document.activeElement.blur();
      }
      return;
    }

    if (e.code === 'Escape') {
      this.#emit('escape');
      return;
    }

    if (this.#controlsLocked) {
      // [C] también cierra el Vestidor abierto (el modo decide si procede)
      if (e.code === 'KeyC' && !e.repeat) this.#emit('wardrobe');
      this.#emit('lockedKey', e.code);
      return;
    }

    if (!e.repeat) {
      if (e.code === 'KeyE') this.#emit('interact');
      if (e.code === 'KeyC') this.#emit('wardrobe');
      if (e.code === 'KeyT') {
        e.preventDefault();
        this.#emit('chat');
        return;
      }
      if (e.code === 'Space') this.#emit('jump');
      if (InputManager.#EMOTE_KEYS[e.code]) this.#emit('emote', InputManager.#EMOTE_KEYS[e.code]);
    }

    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    this.#keys.add(e.code);
  }

  #onKeyUp(e) {
    this.#keys.delete(e.code);
  }

  #onMouseDown(e) {
    if (this.#controlsLocked || this.#isTypingInField()) return;
    if (this.#pointerLockEnabled) {
      if (e.button === 0) {
        if (document.activeElement?.tagName === 'BUTTON') {
          document.activeElement.blur();
        }
        if (!this.isPointerLocked()) {
          this.requestPointerLock();
        }
      }
      return;
    }
    if (e.button === 0 || e.button === 2) {
      this.#isDragging = true;
      this.#lastMouseX = e.clientX;
      this.#lastMouseY = e.clientY;
    }
  }

  #onMouseMove(e) {
    if (this.#controlsLocked || this.#isTypingInField()) return;
    if (this.#pointerLockEnabled) {
      if (!this.isPointerLocked()) return;
      if (this.#skipLockFrames > 0) {
        this.#skipLockFrames -= 1;
        return;
      }
      // Filtrar saltos puntuales del navegador al capturar/liberar
      if (Math.abs(e.movementX) >= 240 || Math.abs(e.movementY) >= 240) {
        return;
      }
      this.#lookDeltaX += e.movementX;
      this.#lookDeltaY += e.movementY;
      return;
    }
    if (!this.#isDragging) return;
    const dx = e.clientX - this.#lastMouseX;
    const dy = e.clientY - this.#lastMouseY;
    this.#lastMouseX = e.clientX;
    this.#lastMouseY = e.clientY;
    this.#lookDeltaX += dx;
    this.#lookDeltaY += dy;
  }

  #onWheel(e) {
    if (this.#controlsLocked || this.#isTypingInField()) return;
    this.#zoomDelta += Math.sign(e.deltaY) * 0.65;
  }

  onAction(actionName, callback) {
    if (!this.#actionListeners.has(actionName)) {
      this.#actionListeners.set(actionName, new Set());
    }
    this.#actionListeners.get(actionName).add(callback);
    return () => this.#actionListeners.get(actionName)?.delete(callback);
  }

  #emit(actionName, payload) {
    const set = this.#actionListeners.get(actionName);
    if (!set) return;
    for (const cb of set) {
      cb(payload);
    }
  }

  setControlsLocked(locked) {
    this.#controlsLocked = Boolean(locked);
    if (this.#controlsLocked) {
      this.#keys.clear();
      this.#isDragging = false;
      this.#resetLookDeltas();
      this.exitPointerLock();
    }
  }

  isControlsLocked() {
    return this.#controlsLocked || this.#isTypingInField();
  }

  getMoveVector() {
    if (this.isControlsLocked()) return { x: 0, z: 0 };
    let x = 0;
    let z = 0;
    if (this.#keys.has('KeyW') || this.#keys.has('ArrowUp')) z += 1;
    if (this.#keys.has('KeyS') || this.#keys.has('ArrowDown')) z -= 1;
    if (this.#keys.has('KeyD')) x += 1;
    if (this.#keys.has('KeyA')) x -= 1;
    return { x, z };
  }

  getCameraKeyTurn() {
    if (this.isControlsLocked()) return 0;
    let turn = 0;
    if (this.#keys.has('ArrowLeft')) turn += 1;
    if (this.#keys.has('ArrowRight')) turn -= 1;
    return turn;
  }

  isSprinting() {
    if (this.isControlsLocked()) return false;
    return this.#keys.has('ShiftLeft') || this.#keys.has('ShiftRight');
  }

  isKeyDown(code) {
    return !this.isControlsLocked() && this.#keys.has(code);
  }

  consumeLookDelta() {
    const delta = {
      x: this.#lookDeltaX,
      y: this.#lookDeltaY,
      zoom: this.#zoomDelta,
      pointerLocked: this.isPointerLocked()
    };
    this.#resetLookDeltas();
    return delta;
  }

  update() {}

  dispose() {
    this.exitPointerLock();
    window.removeEventListener('keydown', this.#boundHandlers.keyDown);
    window.removeEventListener('keyup', this.#boundHandlers.keyUp);
    window.removeEventListener('mousemove', this.#boundHandlers.mouseMove);
    window.removeEventListener('mouseup', this.#boundHandlers.mouseUp);
    window.removeEventListener('blur', this.#boundHandlers.blur);
    document.removeEventListener('pointerlockchange', this.#boundHandlers.pointerLockChange);
    document.removeEventListener('pointerlockerror', this.#boundHandlers.pointerLockError);
    document.removeEventListener('visibilitychange', this.#boundHandlers.visibilityChange);
    this.#domElement.removeEventListener('mousedown', this.#boundHandlers.mouseDown);
    this.#domElement.removeEventListener('wheel', this.#boundHandlers.wheel);
    this.#domElement.removeEventListener('contextmenu', this.#boundHandlers.contextMenu);
    this.#actionListeners.clear();
    this.#keys.clear();
    this.#pointerLockGuard = null;
  }
}
