const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const MAX_STEP = 1 / 120;

/**
 * Muelle amortiguado de 2 ejes (x/z) integrado con Euler semi-implícito en sub-pasos
 * fijos: estable a cualquier framerate y con un ligero rebote natural al frenar.
 */
export class Spring2 {
  x = 0; z = 0; vx = 0; vz = 0;
  #k; #c;

  constructor(stiffness, damping) {
    this.#k = stiffness;
    this.#c = damping;
  }

  step(tx, tz, dt) {
    let remaining = dt;
    while (remaining > 1e-6) {
      const h = Math.min(MAX_STEP, remaining);
      this.vx += ((tx - this.x) * this.#k - this.vx * this.#c) * h;
      this.vz += ((tz - this.z) * this.#k - this.vz * this.#c) * h;
      this.x += this.vx * h;
      this.z += this.vz * h;
      remaining -= h;
    }
  }

  reset() {
    this.x = this.z = this.vx = this.vz = 0;
  }
}

/**
 * Física secundaria ligera para el pelo largo y el vuelo de la falda.
 * Recibe el movimiento real del personaje (velocidad local, giro y caída) y hace
 * que pelo y falda se balanceen con un pequeño retraso y vuelvan suavemente a su sitio.
 */
export class SpringMotion {
  #skirt = new Spring2(85, 7.2);
  #hair = new Spring2(46, 5.0);
  #flare = new Spring2(70, 8.5);

  /**
   * @param {number} dt
   * @param {{fwd:number, side:number, vy:number, yawRate:number, sway:number, flare:number}} m
   *   fwd/side: velocidad local (m/s), vy: velocidad vertical, yawRate: rad/s (giro + spin),
   *   sway: balanceo rítmico del paso (-1..1), flare: vuelo extra pedido por la pose.
   */
  update(dt, m) {
    const falling = Math.max(0, -m.vy);
    // Falda: se arrastra hacia atrás al avanzar y sale hacia fuera de la curva al girar
    const skirtX = clamp(m.fwd * 0.011, -0.08, 0.13);
    const skirtZ = clamp(-m.yawRate * 0.05 - m.side * 0.012, -0.2, 0.2) + m.sway * 0.035;
    this.#skirt.step(skirtX, skirtZ, dt);

    // Pelo: más lento y amplio; flota hacia atrás/arriba al caer
    const hairX = clamp(m.fwd * 0.028 + falling * 0.022, -0.06, 0.36);
    const hairZ = clamp(-m.yawRate * 0.07 - m.side * 0.025, -0.24, 0.24);
    this.#hair.step(hairX, hairZ, dt);

    // Vuelo radial: al caer o girar la falda se abre un poco
    this.#flare.step(clamp(m.flare + falling * 0.012 + Math.abs(m.yawRate) * 0.012, 0, 0.2), 0, dt);
  }

  /** Aplica el estado del muelle a los pivotes (cintura para la falda, nuca para el pelo). */
  apply(skirtPivot, hairSwing) {
    if (skirtPivot) {
      const f = Math.max(-0.02, this.#flare.x);
      skirtPivot.rotation.set(this.#skirt.x, 0, this.#skirt.z);
      skirtPivot.scale.set(1 + f, 1 - f * 0.3, 1 + f);
    }
    if (hairSwing) {
      hairSwing.rotation.set(clamp(this.#hair.x, -0.1, 0.42), 0, clamp(this.#hair.z, -0.28, 0.28));
    }
  }

  reset() {
    this.#skirt.reset();
    this.#hair.reset();
    this.#flare.reset();
  }
}
