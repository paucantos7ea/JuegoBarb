export class BaseGameMode {
  #name;
  #active = false;

  constructor(name = 'base') {
    if (new.target === BaseGameMode) {
      throw new Error('BaseGameMode es una clase abstracta y debe extenderse.');
    }
    this.#name = name;
  }

  getName() {
    return this.#name;
  }

  isActive() {
    return this.#active;
  }

  async init(context) {
    // Solo se marca activo cuando onInit termina (incluidos los await import() del mundo):
    // así update() nunca se ejecuta con el jugador o el escenario a medio construir.
    await this.onInit(context);
    this.#active = true;
  }

  async onInit() {}

  update(dt) {
    if (!this.#active) return;
    this.onUpdate(dt);
  }

  onUpdate() {}

  dispose() {
    this.#active = false;
    this.onDispose();
  }

  onDispose() {}
}
