export class GameModeManager {
  #registry = new Map();
  #currentMode = null;

  init() {}

  register(id, factoryFn) {
    this.#registry.set(id, factoryFn);
  }

  async switchMode(id, context = {}) {
    if (!this.#registry.has(id)) {
      throw new Error(`Modo de juego no registrado: ${id}`);
    }
    if (this.#currentMode) {
      this.#currentMode.dispose();
      this.#currentMode = null;
    }
    const factory = this.#registry.get(id);
    const mode = await factory(context);
    this.#currentMode = mode;
    await this.#currentMode.init(context);
    return this.#currentMode;
  }

  getCurrentMode() {
    return this.#currentMode;
  }

  update(dt) {
    this.#currentMode?.update(dt);
  }

  dispose() {
    if (this.#currentMode) {
      this.#currentMode.dispose();
      this.#currentMode = null;
    }
    this.#registry.clear();
  }
}
