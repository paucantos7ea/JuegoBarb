const MAX_STEP = 1 / 120;

/**
 * Oscilador armónico amortiguado (muelle-amortiguador) escalar, sin asignaciones de memoria.
 * x'' = k·(objetivo − x) − c·x'   integrado con Euler semi-implícito en sub-pasos fijos
 * (estable con cualquier dt de fotograma). Pensado para física secundaria ligera:
 * falda, crin, cola, orejas, rebote del jinete, inclinaciones...
 */
export class SpringValue {
  x = 0;
  v = 0;
  k;
  c;

  /**
   * @param {number} stiffness rigidez k (1/s²)
   * @param {number} damping amortiguación c (1/s); crítico ≈ 2·√k
   * @param {number} [value=0] valor inicial
   */
  constructor(stiffness = 120, damping = 20, value = 0) {
    this.k = stiffness;
    this.c = damping;
    this.x = value;
  }

  /** Avanza el muelle hacia `target` y devuelve la posición resultante. */
  step(target, dt) {
    let remaining = dt > 0.1 ? 0.1 : dt;
    const k = this.k;
    const c = this.c;
    while (remaining > 1e-6) {
      const h = remaining < MAX_STEP ? remaining : MAX_STEP;
      this.v += ((target - this.x) * k - this.v * c) * h;
      this.x += this.v * h;
      remaining -= h;
    }
    return this.x;
  }

  /** Avanza y limita el resultado (y la velocidad si toca un tope) a [min, max]. */
  stepClamped(target, dt, min, max) {
    this.step(target, dt);
    if (this.x < min) {
      this.x = min;
      if (this.v < 0) this.v = 0;
    } else if (this.x > max) {
      this.x = max;
      if (this.v > 0) this.v = 0;
    }
    return this.x;
  }

  /** Suma un impulso de velocidad (p. ej. aterrizaje de un salto). */
  impulse(dv) {
    this.v += dv;
  }

  reset(value = 0) {
    this.x = value;
    this.v = 0;
  }
}
