import * as THREE from 'three';
import {
  sampleTorso,
  saddleThickness,
  pushOutOfTorso,
  RIDER_ROOT_IN_BODY,
  SADDLE,
  CLOTH_MARGIN
} from '../world/HorseAnatomy.js';

/**
 * Caída de la falda a caballo ("vestido de princesa a caballo") sin clipping.
 *
 * Para cada malla de falda/capa se precalcula UNA vez (al montar con ese vestido) un juego de
 * morph targets relativos que la GPU mezcla gratis cada fotograma:
 *   [0] DRAPE   – la tela cae con elegancia sobre la grupa (atrás), los flancos (lados) y se
 *                 recoge sobre la cruz (delante), empujada fuera del volumen exacto del caballo,
 *                 la silla y las piernas del jinete (con holgura y orden de capas conservado).
 *   [1] LIFT    – se eleva y ondea hacia atrás con el viento del galope / caída de saltos.
 *   [2,3] WAVE  – par seno/coseno: onda viajera senoidal (sólo hacia fuera del caballo).
 *   [4,5] OUT±X – desplazamiento hacia el exterior de la curva en giros rápidos.
 * Todos los desplazamientos dinámicos van a lo largo de la normal exterior del caballo, por lo
 * que ninguna combinación de pesos (acotados) puede volver a meter la tela en el cuerpo.
 */
export const RIDE_MORPH = Object.freeze({ DRAPE: 0, LIFT: 1, WAVE_S: 2, WAVE_C: 3, OUT_POS: 4, OUT_NEG: 5, COUNT: 6 });

const WAIST_Y = 1.04;
const SPINE_PIVOT_Y = 1.0;
/** Inclinaciones del torso del jinete muestreadas para capas que cuelgan de la columna. */
export const RIDER_LEAN_RANGE = Object.freeze({ min: -0.08, max: 0.26 });
const LEAN_SAMPLES = [RIDER_LEAN_RANGE.min, 0, 0.13, RIDER_LEAN_RANGE.max];
const Z_BACK_LIMIT = -0.80;   // la tela nunca sobrepasa la grupa (marco cuerpo)
const Z_FRONT_LIMIT = 0.24;   // ni sube por el cuello
const LIFT_AMP = 0.11;
const WAVE_K = 9.0;
const OUT_AMP = 0.075;
const R0 = RIDER_ROOT_IN_BODY;

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const _sec = { yc: 0, w: 0, ht: 0, hb: 0 };
const _o = { x: 0, y: 0, z: 0 };

/**
 * Separación de capas: a la misma altura, la capa más exterior (mayor radio respecto a un
 * cono de referencia) queda también más fuera tras la caída -> sin z-fighting entre capas.
 */
function layerOffset(P, rho, bias) {
  const ref = 0.106 + Math.max(0, WAIST_Y - P.y) * 0.43;
  return CLOTH_MARGIN + 0.012 + 0.08 * rho + Math.max(-0.02, 0.45 * (rho - ref)) + bias;
}

/** Posición de caída (marco jinete) para un punto de la falda original. */
function drapePoint(P, out, bias) {
  const dy = WAIST_Y - P.y;
  const t = smooth(0.08, 0.36, dy);
  out.copy(P);
  if (t <= 0) return 0;
  const rho = Math.hypot(P.x, P.z);
  const s = Math.hypot(Math.max(0, dy), Math.max(0, rho - 0.10));
  const theta = Math.atan2(P.x, P.z);
  const cf = Math.cos(theta);
  const sf = Math.sin(theta);

  // Recorrido longitudinal: poco hacia delante (se recoge en la cruz), mucho hacia la grupa
  // (delante cubre los muslos y se recoge sobre la cruz; detrás se extiende por la grupa)
  const dz = cf > 0 ? cf * s * 0.50 : cf * s * 0.74;
  const zb = Math.min(Z_FRONT_LIMIT, Math.max(Z_BACK_LIMIT, R0.z + dz));
  // Recorrido lateral: la tela abraza el lomo y cae por el flanco
  const a = Math.abs(sf) * s * 1.08;
  const side = sf >= 0 ? 1 : -1;
  const layer = layerOffset(P, rho, bias);

  sampleTorso(zb, _sec);
  let top = _sec.ht + SADDLE.blanketOffset;
  if (zb > SADDLE.zBack && zb < SADDLE.zFront) top += saddleThickness(zb, 0);
  const ax = _sec.w + layer;
  const ay = top + layer;
  const avg = (ax + ay) * 0.5;
  const phi = a / Math.max(0.05, avg);
  let xb;
  let yb;
  if (phi <= Math.PI * 0.5) {
    xb = side * ax * Math.sin(phi);
    yb = _sec.yc + ay * Math.cos(phi);
  } else {
    const e = a - avg * Math.PI * 0.5;
    xb = side * (ax + e * 0.12);
    yb = _sec.yc - e;
  }
  yb = Math.max(yb, _sec.yc - _sec.hb - 0.30);

  out.set(xb - R0.x, yb - R0.y, zb - R0.z);
  out.lerpVectors(P, out, t);
  return t;
}

/** Empuje radial fuera de una cápsula con compresión monótona (orden de capas). */
function pushCapsule(P, A, B, r) {
  const abx = B.x - A.x;
  const aby = B.y - A.y;
  const abz = B.z - A.z;
  const len2 = abx * abx + aby * aby + abz * abz || 1;
  let k = ((P.x - A.x) * abx + (P.y - A.y) * aby + (P.z - A.z) * abz) / len2;
  k = k < 0 ? 0 : k > 1 ? 1 : k;
  const cx = A.x + abx * k;
  const cy = A.y + aby * k;
  const cz = A.z + abz * k;
  let dx = P.x - cx;
  let dy = P.y - cy;
  let dz = P.z - cz;
  const d = Math.hypot(dx, dy, dz);
  const band = 0.012;
  if (d >= r + band) return;
  if (d < 1e-6) {
    dx = Math.sign(cx) || 1; dy = 0; dz = 0;
  } else {
    dx /= d; dy /= d; dz /= d;
  }
  const target = r + band * Math.exp((d - r - band) / band);
  P.set(cx + dx * target, cy + dy * target, cz + dz * target);
}

/** Empuje fuera del torso del caballo para un punto en marco jinete (opcionalmente con inclinación). */
function pushTorsoRider(P, lean) {
  let x = P.x;
  let y = P.y;
  let z = P.z;
  let c = 1;
  let s = 0;
  if (lean !== 0) {
    // Punto colgado de la columna inclinada `lean` -> marco jinete
    c = Math.cos(lean);
    s = Math.sin(lean);
    const ry = y - SPINE_PIVOT_Y;
    y = SPINE_PIVOT_Y + ry * c - z * s;
    z = ry * s + z * c;
  }
  if (!pushOutOfTorso(x + R0.x, y + R0.y, z + R0.z, CLOTH_MARGIN, _o)) return;
  x = _o.x - R0.x;
  y = _o.y - R0.y;
  z = _o.z - R0.z;
  if (lean !== 0) {
    const ry = y - SPINE_PIVOT_Y;
    const ny = SPINE_PIVOT_Y + ry * c + z * s;
    const nz = -ry * s + z * c;
    y = ny;
    z = nz;
  }
  P.set(x, y, z);
}

/** Normal exterior del caballo (marco jinete) en el punto P (sección elíptica). */
function torsoNormal(P, out) {
  const zb = P.z + R0.z;
  sampleTorso(zb, _sec);
  if (_sec.w <= 1e-4) return out.set(0, 1, 0);
  const dy = P.y + R0.y - _sec.yc;
  const ax = _sec.w + 0.05;
  const ay = (dy >= 0 ? _sec.ht : _sec.hb) + 0.05;
  out.set((P.x + R0.x) / (ax * ax), dy / (ay * ay), 0);
  const l = out.length();
  return l > 1e-6 ? out.divideScalar(l) : out.set(0, 1, 0);
}

/**
 * Construye (o reconstruye) los morph targets de montar de una malla de falda/capa.
 * @param {THREE.Mesh} mesh malla hija de skirtInner o del grupo del atuendo
 * @param {'skirt'|'spine'} kind 'spine' = cuelga de la columna (capa) y se valida en todas las inclinaciones
 * @param {{a: THREE.Vector3, b: THREE.Vector3, r: number}[]} capsules piernas del jinete (marco jinete)
 * @param {{c: THREE.Vector3, r: THREE.Vector3}} pelvis elipsoide de la pelvis del jinete
 * @param {number} [layerBias=0] separación extra de esta capa (sobrefaldas, ribetes)
 */
export function buildRidingMorphs(mesh, kind, capsules, pelvis, layerBias = 0) {
  const geo = mesh.geometry;
  const posAttr = geo.attributes.position;
  const nrmAttr = geo.attributes.normal;
  const count = posAttr.count;

  mesh.updateMatrix();
  const M = mesh.matrix;
  const Minv = new THREE.Matrix4().copy(M).invert();
  const lin = new THREE.Matrix3().setFromMatrix4(Minv);

  const drapeLocal = new Float32Array(count * 3);
  const dDrape = new Float32Array(count * 3);
  const dLift = new Float32Array(count * 3);
  const dWaveS = new Float32Array(count * 3);
  const dWaveC = new Float32Array(count * 3);
  const dOutP = new Float32Array(count * 3);
  const dOutN = new Float32Array(count * 3);

  const P = new THREE.Vector3();
  const Q = new THREE.Vector3();
  const n = new THREE.Vector3();
  const d = new THREE.Vector3();
  const leanList = kind === 'spine' ? LEAN_SAMPLES : [0];

  for (let i = 0; i < count; i++) {
    P.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)).applyMatrix4(M);
    const orig = P.clone();
    const t = drapePoint(P, Q, layerBias);

    for (let it = 0; it < 3; it++) {
      for (let c = 0; c < capsules.length; c++) pushCapsule(Q, capsules[c].a, capsules[c].b, capsules[c].r);
      if (pelvis) {
        const ex = (Q.x - pelvis.c.x) / pelvis.r.x;
        const ey = (Q.y - pelvis.c.y) / pelvis.r.y;
        const ez = (Q.z - pelvis.c.z) / pelvis.r.z;
        const rr = Math.hypot(ex, ey, ez);
        if (rr < 1.04 && rr > 1e-6) {
          const k = (1 + 0.04 * Math.exp((rr - 1.04) / 0.04)) / rr;
          Q.set(pelvis.c.x + ex * k * pelvis.r.x, pelvis.c.y + ey * k * pelvis.r.y, pelvis.c.z + ez * k * pelvis.r.z);
        }
      }
      for (let l = 0; l < leanList.length; l++) pushTorsoRider(Q, leanList[l]);
    }

    // Desplazamiento de caída (marco local de la malla)
    P.copy(Q).applyMatrix4(Minv);
    drapeLocal[i * 3] = P.x;
    drapeLocal[i * 3 + 1] = P.y;
    drapeLocal[i * 3 + 2] = P.z;
    dDrape[i * 3] = P.x - posAttr.getX(i);
    dDrape[i * 3 + 1] = P.y - posAttr.getY(i);
    dDrape[i * 3 + 2] = P.z - posAttr.getZ(i);

    // Física: sólo hacia fuera del caballo (normal exterior), ponderada por la caída de tela
    const dy = WAIST_Y - orig.y;
    const rho = Math.hypot(orig.x, orig.z);
    const s = Math.hypot(Math.max(0, dy), Math.max(0, rho - 0.1));
    const g = t * smooth(0.22, 0.75, s);
    if (g <= 0) continue;
    torsoNormal(Q, n);
    const back = Math.max(0, -Math.cos(Math.atan2(orig.x, orig.z)));
    d.copy(n).multiplyScalar(LIFT_AMP * 0.5 * g);
    d.z -= LIFT_AMP * 0.5 * g * 0.35 * back;
    d.applyMatrix3(lin);
    dLift[i * 3] = d.x; dLift[i * 3 + 1] = d.y; dLift[i * 3 + 2] = d.z;
    const ws = Math.sin(WAVE_K * s);
    const wc = Math.cos(WAVE_K * s);
    dWaveS[i * 3] = d.x * ws; dWaveS[i * 3 + 1] = d.y * ws; dWaveS[i * 3 + 2] = d.z * ws;
    dWaveC[i * 3] = d.x * wc; dWaveC[i * 3 + 1] = d.y * wc; dWaveC[i * 3 + 2] = d.z * wc;
    for (const sign of [1, -1]) {
      const w = Math.max(0, sign * n.x) * OUT_AMP * g;
      if (w <= 0) continue;
      d.set(n.x * w, (n.y + 0.3) * w, n.z * w).applyMatrix3(lin);
      const arr = sign > 0 ? dOutP : dOutN;
      arr[i * 3] = d.x; arr[i * 3 + 1] = d.y; arr[i * 3 + 2] = d.z;
    }
  }

  // Normales suaves de la forma caída (soldando vértices que comparten posición original)
  const drapeNormals = computeWeldedNormals(geo, drapeLocal);
  const dNormal = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) dNormal[i] = drapeNormals[i] - nrmAttr.array[i];
  const zero = new THREE.BufferAttribute(new Float32Array(count * 3), 3);

  geo.morphAttributes.position = [
    new THREE.BufferAttribute(dDrape, 3),
    new THREE.BufferAttribute(dLift, 3),
    new THREE.BufferAttribute(dWaveS, 3),
    new THREE.BufferAttribute(dWaveC, 3),
    new THREE.BufferAttribute(dOutP, 3),
    new THREE.BufferAttribute(dOutN, 3)
  ];
  geo.morphAttributes.normal = [new THREE.BufferAttribute(dNormal, 3), zero, zero, zero, zero, zero];
  geo.morphTargetsRelative = true;
  geo.computeBoundingSphere();
  mesh.updateMorphTargets();
  for (let i = 0; i < RIDE_MORPH.COUNT; i++) mesh.morphTargetInfluences[i] = 0;
}

function computeWeldedNormals(geo, positions) {
  const base = geo.attributes.position;
  const count = base.count;
  const index = geo.index ? geo.index.array : null;
  const triCount = index ? index.length / 3 : count / 3;
  const acc = new Float32Array(count * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let f = 0; f < triCount; f++) {
    const i0 = index ? index[f * 3] : f * 3;
    const i1 = index ? index[f * 3 + 1] : f * 3 + 1;
    const i2 = index ? index[f * 3 + 2] : f * 3 + 2;
    a.fromArray(positions, i0 * 3);
    b.fromArray(positions, i1 * 3).sub(a);
    c.fromArray(positions, i2 * 3).sub(a);
    b.cross(c);
    for (const v of [i0, i1, i2]) {
      acc[v * 3] += b.x;
      acc[v * 3 + 1] += b.y;
      acc[v * 3 + 2] += b.z;
    }
  }
  // Soldadura por posición original (las faldas fusionadas no están indexadas)
  const groups = new Map();
  for (let i = 0; i < count; i++) {
    const key = `${Math.round(base.getX(i) * 2e4)},${Math.round(base.getY(i) * 2e4)},${Math.round(base.getZ(i) * 2e4)}`;
    let gi = groups.get(key);
    if (!gi) {
      gi = [0, 0, 0, []];
      groups.set(key, gi);
    }
    gi[0] += acc[i * 3];
    gi[1] += acc[i * 3 + 1];
    gi[2] += acc[i * 3 + 2];
    gi[3].push(i);
  }
  const out = new Float32Array(count * 3);
  const baseN = geo.attributes.normal;
  for (const gi of groups.values()) {
    let l = Math.hypot(gi[0], gi[1], gi[2]);
    for (const i of gi[3]) {
      if (l < 1e-9) {
        out[i * 3] = baseN.getX(i);
        out[i * 3 + 1] = baseN.getY(i);
        out[i * 3 + 2] = baseN.getZ(i);
        continue;
      }
      // Conserva la orientación original (caras dobles/interiores)
      const sgn = gi[0] * baseN.getX(i) + gi[1] * baseN.getY(i) + gi[2] * baseN.getZ(i) < 0 ? -1 : 1;
      out[i * 3] = (gi[0] / l) * sgn;
      out[i * 3 + 1] = (gi[1] / l) * sgn;
      out[i * 3 + 2] = (gi[2] / l) * sgn;
    }
  }
  return out;
}
