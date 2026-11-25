/**
 * Anatomía matemática compartida del caballo real.
 *
 * Única fuente de verdad del volumen del caballo: la usan tanto el esculpido 3D
 * (HorseSystem) como el sistema anti-clipping de la falda del jinete (CharacterRig),
 * de modo que la tela se calcula contra exactamente la misma superficie que se dibuja.
 *
 * Marco "cuerpo" (bodyPivot): origen en el centro del barril, +Z hacia el pecho,
 * +X a la izquierda del caballo, +Y arriba. Módulo de matemática pura (sin three.js).
 */

/** Altura del pivote del cuerpo sobre el suelo en reposo. */
export const HORSE_BODY_Y = 1.12;

// Perfil del torso [z, centroY, semiAncho, semiAltoSuperior, semiAltoInferior]
// Grupa redondeada y potente -> lomo cóncavo (asiento) -> cruz marcada -> pecho ancho.
const TORSO_KEYS = [
  [-0.935, 0.080, 0.000, 0.000, 0.000],
  [-0.925, 0.078, 0.085, 0.080, 0.095],
  [-0.895, 0.072, 0.150, 0.150, 0.175],
  [-0.840, 0.062, 0.198, 0.200, 0.228],
  [-0.740, 0.050, 0.232, 0.236, 0.258],
  [-0.580, 0.040, 0.245, 0.248, 0.272],
  [-0.400, 0.000, 0.234, 0.245, 0.265],
  [-0.200, -0.032, 0.218, 0.239, 0.260],
  [0.000, -0.036, 0.222, 0.246, 0.264],
  [0.180, -0.005, 0.228, 0.270, 0.262],
  [0.360, 0.030, 0.236, 0.277, 0.247],
  [0.500, 0.040, 0.228, 0.236, 0.236],
  [0.600, 0.022, 0.188, 0.190, 0.196],
  [0.660, 0.010, 0.130, 0.128, 0.140],
  [0.693, 0.004, 0.070, 0.066, 0.075],
  [0.703, 0.000, 0.000, 0.000, 0.000]
];

export const TORSO_Z_MIN = TORSO_KEYS[0][0];
export const TORSO_Z_MAX = TORSO_KEYS[TORSO_KEYS.length - 1][0];

/** Interpolación cúbica de Hermite (Catmull-Rom no uniforme) de una columna del perfil. */
function hermiteKeys(keys, z, col) {
  const n = keys.length;
  if (z <= keys[0][0]) return keys[0][col];
  if (z >= keys[n - 1][0]) return keys[n - 1][col];
  let i = 0;
  while (i < n - 2 && z > keys[i + 1][0]) i++;
  const z0 = keys[i][0];
  const z1 = keys[i + 1][0];
  const p0 = keys[i][col];
  const p1 = keys[i + 1][col];
  const tan = (k) => {
    const a = keys[Math.max(0, k - 1)];
    const b = keys[Math.min(n - 1, k + 1)];
    return (b[col] - a[col]) / Math.max(1e-6, b[0] - a[0]);
  };
  const h = z1 - z0;
  const t = (z - z0) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * h * tan(i) + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * h * tan(i + 1);
}

// Tabla precalculada (pasos de ~4 mm) para consultas O(1) sin asignaciones.
const LUT_N = 420;
const LUT_STEP = (TORSO_Z_MAX - TORSO_Z_MIN) / (LUT_N - 1);
const TORSO_LUT = new Float32Array(LUT_N * 4);
for (let i = 0; i < LUT_N; i++) {
  const z = TORSO_Z_MIN + i * LUT_STEP;
  // Extremos redondeados: el radio cae como un casquete elíptico (nunca negativo)
  TORSO_LUT[i * 4] = hermiteKeys(TORSO_KEYS, z, 1);
  TORSO_LUT[i * 4 + 1] = Math.max(0, hermiteKeys(TORSO_KEYS, z, 2));
  TORSO_LUT[i * 4 + 2] = Math.max(0, hermiteKeys(TORSO_KEYS, z, 3));
  TORSO_LUT[i * 4 + 3] = Math.max(0, hermiteKeys(TORSO_KEYS, z, 4));
}

/**
 * Sección transversal del torso en z (marco cuerpo). Escribe en `out` {yc, w, ht, hb}.
 * Fuera del rango del torso devuelve semiejes nulos.
 */
export function sampleTorso(z, out) {
  if (z <= TORSO_Z_MIN || z >= TORSO_Z_MAX) {
    out.yc = 0; out.w = 0; out.ht = 0; out.hb = 0;
    return out;
  }
  const f = (z - TORSO_Z_MIN) / LUT_STEP;
  const i = Math.min(LUT_N - 2, Math.floor(f));
  const k = f - i;
  const a = i * 4;
  const b = a + 4;
  out.yc = TORSO_LUT[a] + (TORSO_LUT[b] - TORSO_LUT[a]) * k;
  out.w = TORSO_LUT[a + 1] + (TORSO_LUT[b + 1] - TORSO_LUT[a + 1]) * k;
  out.ht = TORSO_LUT[a + 2] + (TORSO_LUT[b + 2] - TORSO_LUT[a + 2]) * k;
  out.hb = TORSO_LUT[a + 3] + (TORSO_LUT[b + 3] - TORSO_LUT[a + 3]) * k;
  return out;
}

// ---------------------------------------------------------------------------
// Montura (mantilla + silla esculpida) ceñida al lomo
// ---------------------------------------------------------------------------

export const SADDLE = Object.freeze({
  zBack: -0.37,          // fin de la silla (tras el borrén trasero)
  zFront: 0.23,          // inicio (delante del borrén delantero)
  seatZ: -0.075,         // punto más bajo del asiento: aquí se sienta la pelvis
  cantleZ: -0.285,
  pommelZ: 0.160,
  halfAngle: 0.92,       // apertura lateral del asiento sobre la sección (rad desde arriba)
  blanketZBack: -0.43,
  blanketZFront: 0.25,
  blanketHalfAngle: 1.32,
  blanketOffset: 0.012,
  baseThickness: 0.034
});

const smooth01 = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Grosor de la silla sobre la mantilla en (z, v) con v ∈ [-1, 1] = posición lateral
 * normalizada dentro del asiento. Incluye asiento acolchado, borrén trasero y delantero.
 */
export function saddleThickness(z, v) {
  const env = smooth01(SADDLE.zBack, SADDLE.zBack + 0.07, z) * smooth01(SADDLE.zFront, SADDLE.zFront - 0.06, z);
  if (env <= 0) return 0;
  const lat = Math.max(0, 1 - v * v);
  const dc = (z - SADDLE.cantleZ) / 0.042;
  const dp = (z - SADDLE.pommelZ) / 0.038;
  const cantle = 0.082 * Math.exp(-dc * dc) * Math.pow(lat, 0.55);
  const pommel = 0.070 * Math.exp(-dp * dp) * lat * lat;
  return env * (SADDLE.baseThickness * Math.pow(lat, 0.35) + cantle + pommel);
}

const _sec = { yc: 0, w: 0, ht: 0, hb: 0 };

/**
 * Punto de la superficie del torso desplazado hacia fuera `offset` metros,
 * para la sección z y el ángulo phi medido desde la línea dorsal (0 = arriba, +pi/2 = flanco izq.).
 * Escribe en out {x, y, nx, ny}.
 */
export function torsoSurfacePoint(z, phi, offset, out) {
  sampleTorso(z, _sec);
  const s = Math.sin(phi);
  const c = Math.cos(phi);
  const h = c >= 0 ? _sec.ht : _sec.hb;
  const px = _sec.w * s;
  const py = h * c;
  // Normal del elipse (gradiente) para desplazar perpendicularmente
  let nx = _sec.w > 1e-5 ? s / _sec.w : 0;
  let ny = h > 1e-5 ? c / h : 1;
  const nl = Math.hypot(nx, ny) || 1;
  nx /= nl;
  ny /= nl;
  out.x = px + nx * offset;
  out.y = _sec.yc + py + ny * offset;
  out.nx = nx;
  out.ny = ny;
  return out;
}

/** Altura (marco cuerpo) de la parte superior del asiento en la línea central. */
export function saddleTopY(z) {
  sampleTorso(z, _sec);
  return _sec.yc + _sec.ht + SADDLE.blanketOffset + saddleThickness(z, 0);
}

/** Altura exacta del asiento de la silla (marco cuerpo) donde descansa la pelvis. */
export const SADDLE_SEAT_Y = saddleTopY(SADDLE.seatZ);

// ---------------------------------------------------------------------------
// Jinete
// ---------------------------------------------------------------------------

/** Altura del fondo de la pelvis del rig del personaje (base del torso torneado). */
export const RIDER_PELVIS_BOTTOM = 0.86;

/**
 * Origen del jinete (sus pies en reposo) expresado en el marco cuerpo del caballo:
 * la pelvis queda exactamente sobre el asiento, nunca hundida en el lomo.
 */
export const RIDER_ROOT_IN_BODY = Object.freeze({
  x: 0,
  y: SADDLE_SEAT_Y + 0.004 - RIDER_PELVIS_BOTTOM,
  z: SADDLE.seatZ
});

/**
 * Pose anatómica del jinete a caballo (radianes, convención de CharacterAnimator).
 * Caderas abiertas lo justo para rodear el barril, rodillas flexionadas hacia los estribos,
 * espalda erguida y codos flexionados con las manos adelantadas sobre las riendas.
 */
export const RIDER_POSE = Object.freeze({
  // Calculada numéricamente: muslos y espinillas quedan ≥1 cm fuera del barril + silla
  legX: -0.60,
  legZ: 0.75,
  shinX: 1.00,
  shinZ: -0.65,
  // Manos a ~(±0.08, 1.06, 0.30) del jinete: justo delante del borrén, sobre las riendas
  armX: -0.36,
  armZ: 0.16,
  foreX: -1.20,
  foreZ: -0.72
});

/** Tobillo del jinete en reposo (marco jinete) → los estribos se cuelgan exactamente ahí. */
export const RIDER_ANKLE = Object.freeze({ x: 0.322, y: 0.234, z: 0.122 });

// ---------------------------------------------------------------------------
// Volumen de holgura (anti-clipping)
// ---------------------------------------------------------------------------

/** Holgura mínima de la tela respecto al caballo (m). */
export const CLOTH_MARGIN = 0.034;

/** Banda de compresión (normalizada) que conserva el orden de capas de la tela empujada. */
const PUSH_BAND = 0.07;

/** Patas del caballo: semiancho lateral máximo barrido por las patas bajo el vientre. */
export const LEG_CLEAR_X = 0.29;

/**
 * Empuja (x, y, z) del marco cuerpo fuera del torso + silla con `margin` de holgura.
 * Conserva el orden de capas mediante compresión exponencial monótona.
 * Escribe el resultado en `out` {x, y, z}. Devuelve true si el punto se movió.
 */
export function pushOutOfTorso(x, y, z, margin, out) {
  out.x = x; out.y = y; out.z = z;
  sampleTorso(z, _sec);
  if (_sec.w <= 1e-4) return false;

  const dy = y - _sec.yc;
  const upper = dy >= 0;
  let hTop = _sec.ht;
  if (upper && z > SADDLE.blanketZBack && z < SADDLE.blanketZFront) {
    // Mantilla + silla: la sección crece por arriba en la zona de la montura
    const v = Math.min(1, Math.abs(x) / Math.max(0.05, _sec.w * Math.sin(SADDLE.halfAngle)));
    hTop += SADDLE.blanketOffset + saddleThickness(z, v);
  }
  const ax = _sec.w + margin;
  const ay = (upper ? hTop : _sec.hb) + margin;
  const ex = x / ax;
  const ey = dy / ay;
  const r = Math.hypot(ex, ey);
  const r1 = 1 + PUSH_BAND;
  let moved = false;

  if (r < r1) {
    // f(r) = 1 + c·e^((r - r1)/c): continua, monótona y siempre ≥ 1 (fuera del caballo)
    const target = 1 + PUSH_BAND * Math.exp((r - r1) / PUSH_BAND);
    if (r < 1e-5) {
      out.y = _sec.yc + ay * target;
    } else {
      const k = target / r;
      out.x = ex * k * ax;
      out.y = _sec.yc + ey * k * ay;
    }
    moved = true;
  }

  // Bajo el vientre las patas barren |x| < LEG_CLEAR_X: la tela nunca pasa por ahí
  const bellyY = _sec.yc - _sec.hb * 0.55;
  if (out.y < bellyY && Math.abs(out.x) < LEG_CLEAR_X && z > -0.85 && z < 0.62) {
    const sx = out.x >= 0 ? 1 : -1;
    const deficit = LEG_CLEAR_X - Math.abs(out.x);
    out.x = sx * (LEG_CLEAR_X + 0.012 * Math.exp(-deficit / 0.012));
    moved = true;
  }
  return moved;
}

// Pivote del cuello (marco cuerpo): base sobre el pecho, delante de la cruz.
export const NECK_PIVOT = Object.freeze({ y: 0.150, z: 0.470 });
export const NECK_REST_X = -0.06;
