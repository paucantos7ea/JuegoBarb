export class MinigameManager {
  #context;
  #overlayEl;
  #activeGame = null;
  #activeId = null;
  #onFinishCallback = null;

  constructor(context, overlayEl) {
    this.#context = context;
    this.#overlayEl = overlayEl;
  }

  init() {}

  #loading = false;
  #disposed = false;

  async start(id, onFinish = null) {
    // Evita dobles arranques mientras se descarga el módulo con await import()
    if (this.#loading || this.#disposed) return;
    if (this.#activeGame) {
      this.stop();
    }

    this.#loading = true;
    let GameClass = null;
    try {
      if (id === 'fashion') {
        GameClass = (await import('./FashionRunwayGame.js')).FashionRunwayGame;
      } else if (id === 'ball') {
        GameClass = (await import('./RoyalBallRhythmGame.js')).RoyalBallRhythmGame;
      } else if (id === 'race') {
        GameClass = (await import('./GardenRaceGame.js')).GardenRaceGame;
      } else {
        throw new Error(`Minijuego desconocido: ${id}`);
      }
    } catch (err) {
      console.error('[MinigameManager] No se pudo cargar el minijuego:', err);
      onFinish?.(null);
      return;
    } finally {
      this.#loading = false;
    }

    // El modo pudo cerrarse (volver al menú) mientras se descargaba el módulo
    if (this.#disposed) return;

    this.#activeId = id;
    this.#onFinishCallback = onFinish;
    this.#overlayEl.innerHTML = '';
    this.#overlayEl.classList.remove('hidden');

    this.#activeGame = new GameClass({
      ...this.#context,
      overlayEl: this.#overlayEl,
      onExit: (summary) => this.stop(summary)
    });
    this.#activeGame.init();
  }

  isActive() {
    return this.#activeGame !== null || this.#loading;
  }

  getActiveId() {
    return this.#activeId;
  }

  update(dt) {
    this.#activeGame?.update(dt);
  }

  stop(summary = null) {
    if (this.#activeGame) {
      this.#activeGame.dispose();
      this.#activeGame = null;
    }
    this.#activeId = null;
    this.#overlayEl.innerHTML = '';
    this.#overlayEl.classList.add('hidden');
    if (this.#onFinishCallback) {
      const cb = this.#onFinishCallback;
      this.#onFinishCallback = null;
      cb(summary);
    }
  }

  dispose() {
    this.#disposed = true;
    this.#onFinishCallback = null;
    this.stop();
  }
}
