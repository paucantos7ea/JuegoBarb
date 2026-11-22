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
  #actionListeners = new Map();
  #boundHandlers = {};

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
    this.#boundHandlers.contextMenu = (e) => {
      if (e.target === this.#domElement) e.preventDefault();
    };
    this.#boundHandlers.blur = () => {
      this.#keys.clear();
      this.#isDragging = false;
    };

    window.addEventListener('keydown', this.#boundHandlers.keyDown);
    window.addEventListener('keyup', this.#boundHandlers.keyUp);
    window.addEventListener('mousemove', this.#boundHandlers.mouseMove);
    window.addEventListener('mouseup', this.#boundHandlers.mouseUp);
    window.addEventListener('blur', this.#boundHandlers.blur);
    document.addEventListener('pointerlockchange', this.#boundHandlers.pointerLockChange);
    this.#domElement.addEventListener('mousedown', this.#boundHandlers.mouseDown);
    this.#domElement.addEventListener('wheel', this.#boundHandlers.wheel, { passive: true });
    this.#domElement.addEventListener('contextmenu', this.#boundHandlers.contextMenu);
  }

  #isTypingInField() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
  }

  #onPointerLockChange() {
    const locked = this.isPointerLocked();
    if (!locked) {
      this.#isDragging = false;
    }
    this.#emit('pointerLockChange', locked);
  }

  setPointerLockEnabled(enabled) {
    this.#pointerLockEnabled = Boolean(enabled);
    if (!this.#pointerLockEnabled) {
      this.exitPointerLock();
    }
  }

  isPointerLocked() {
    return document.pointerLockElement === this.#domElement;
  }

  requestPointerLock() {
    if (!this.#pointerLockEnabled || this.#controlsLocked || this.#isTypingInField()) return;
    if (this.isPointerLocked()) return;
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
    if (this.#isTypingInField()) {
      if (e.code === 'Escape') {
        document.activeElement.blur();
      }
      return;
    }

    if (e.code === 'Tab' && this.#pointerLockEnabled) {
      e.preventDefault();
      if (!e.repeat && !this.#controlsLocked) {
        this.togglePointerLock();
      }
      return;
    }

    if (e.code === 'Escape') {
      this.#emit('escape');
      return;
    }

    if (this.#controlsLocked) {
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
    if (e.button === 0 && this.#pointerLockEnabled && !this.isPointerLocked()) {
      this.requestPointerLock();
    }
    if (e.button === 0 || e.button === 2) {
      this.#isDragging = true;
      this.#lastMouseX = e.clientX;
      this.#lastMouseY = e.clientY;
    }
  }

  #onMouseMove(e) {
    if (this.#controlsLocked || this.#isTypingInField()) return;
    if (this.isPointerLocked()) {
      // Filtrar saltos puntuales del navegador al capturar/liberar
      if (Math.abs(e.movementX) < 320 && Math.abs(e.movementY) < 320) {
        this.#lookDeltaX += e.movementX;
        this.#lookDeltaY += e.movementY;
      }
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
    this.#lookDeltaX = 0;
    this.#lookDeltaY = 0;
    this.#zoomDelta = 0;
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
    this.#domElement.removeEventListener('mousedown', this.#boundHandlers.mouseDown);
    this.#domElement.removeEventListener('wheel', this.#boundHandlers.wheel);
    this.#domElement.removeEventListener('contextmenu', this.#boundHandlers.contextMenu);
    this.#actionListeners.clear();
    this.#keys.clear();
  }
}
