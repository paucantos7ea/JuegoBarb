import * as THREE from 'three';
import { SpringValue } from '../core/SpringValue.js';
import { GraphicsSync, createContactShadow } from '../core/Engine.js';
import { bakeProceduralVertexAO, createLumenMaterial, ensureVertexColors } from '../core/LumenArtPipeline.js';
import {
  HORSE_BODY_Y,
  TORSO_Z_MIN,
  TORSO_Z_MAX,
  sampleTorso,
  torsoSurfacePoint,
  saddleThickness,
  saddleTopY,
  SADDLE,
  RIDER_ROOT_IN_BODY,
  RIDER_ANKLE,
  NECK_PIVOT,
  NECK_REST_X
} from './HorseAnatomy.js';

export const HORSE_VARIANTS = Object.freeze({
  imperial_white: Object.freeze({
    id: 'imperial_white',
    name: 'Blanco Imperial',
    coat: 0xfbf7f5,
    muzzle: 0xf2d6d6,
    mane: 0xf2c56a,
    hooves: 0xd9b36c,
    saddle: 0xd43b7a,
    leather: 0xa82560,
    trim: 0xf2c864,
    eye: 0x3a74ee
  }),
  pearl_rose: Object.freeze({
    id: 'pearl_rose',
    name: 'Perla Rosado',
    coat: 0xf7d6e6,
    muzzle: 0xefbcd3,
    mane: 0xfff5e6,
    hooves: 0xcfa46e,
    saddle: 0x9b2868,
    leather: 0x721a4c,
    trim: 0xf5d078,
    eye: 0x8b46d9
  }),
  royal_chestnut: Object.freeze({
    id: 'royal_chestnut',
    name: 'Castaño Miel',
    coat: 0xc47a3f,
    muzzle: 0x8a5232,
    mane: 0x45230f,
    hooves: 0x2a1d18,
    saddle: 0xb8245a,
    leather: 0x6b1636,
    trim: 0xf0c25c,
    eye: 0xb8772a
  }),
  jet_black: Object.freeze({
    id: 'jet_black',
    name: 'Negro Azabache',
    coat: 0x25212b,
    muzzle: 0x3b3444,
    mane: 0xdde2ee,
    hooves: 0x18151d,
    saddle: 0x881d58,
    leather: 0x4a0f31,
    trim: 0xe6eaf5,
    eye: 0x5cc4ff
  })
});

/** Compatibilidad: origen del jinete respecto a la raíz del caballo en reposo. */
export const HORSE_SEAT_OFFSET = Object.freeze({
  y: HORSE_BODY_Y + RIDER_ROOT_IN_BODY.y,
  z: RIDER_ROOT_IN_BODY.z
});

// ---------------------------------------------------------------------------
// Proporciones del esqueleto
// ---------------------------------------------------------------------------

const FOOT_H = 0.20;                      // menudillo -> suelo
const FRONT_L1 = 0.44;                    // antebrazo
const FRONT_L2 = 0.36;                    // caña
const HIND_L1 = 0.46;                     // pierna (gaskin)
const HIND_L2 = 0.40;                     // caña trasera
const HIND_REST_U = 0.20;                 // muslo hacia atrás en reposo
const HIND_REST_L = -0.20;                // caña vertical en reposo
const FRONT_PIVOT = Object.freeze({ x: 0.125, y: FRONT_L1 + FRONT_L2 + FOOT_H - HORSE_BODY_Y, z: 0.40 });
const HIND_PIVOT = Object.freeze({
  x: 0.135,
  y: HIND_L1 * Math.cos(HIND_REST_U) + HIND_L2 + FOOT_H - HORSE_BODY_Y,
  z: -0.53
});
const TAIL_PIVOT = Object.freeze({ y: 0.170, z: -0.885 });
const TAIL_LEN = Object.freeze([0.20, 0.26, 0.28]);
const TAIL_REST = Object.freeze([0.62, -0.34, -0.16]);
const EAR_REST = Object.freeze({ x: -0.10, z: 0.26 });

const HORSE_SPAWNS = Object.freeze([
  Object.freeze({ id: 'horse_1', variantId: 'imperial_white', x: -8.5, z: -11.5, yaw: 0.45 }),
  Object.freeze({ id: 'horse_2', variantId: 'pearl_rose', x: -8.2, z: 10.2, yaw: -0.35 }),
  Object.freeze({ id: 'horse_3', variantId: 'royal_chestnut', x: 18.0, z: -2.0, yaw: Math.PI * 0.5 }),
  Object.freeze({ id: 'horse_4', variantId: 'jet_black', x: 118.5, z: -7.0, yaw: -Math.PI * 0.5 }),
  Object.freeze({ id: 'horse_5', variantId: 'imperial_white', x: 118.5, z: 7.0, yaw: -Math.PI * 0.5 })
]);

const POMMEL_ANCHOR_Y = saddleTopY(SADDLE.pommelZ) + 0.035;
const LOD_NEAR_SQ = 50 * 50;
const LOD_FAR_SQ = 90 * 90;
const TAU = Math.PI * 2;

// Temporales preasignados para los updates (cero GC por fotograma)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _hl = new THREE.Vector3();
const _hr = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _legTargets = new Float32Array(12);

// ---------------------------------------------------------------------------
// Utilidades de modelado (solo al construir la caché, nunca por fotograma)
// ---------------------------------------------------------------------------

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Remuestrea una lista de secciones [y, z, semiAncho, semiAltoN+, semiAltoN-] con Catmull-Rom. */
function resampleRings(samples, n) {
  const out = [];
  const m = samples.length;
  for (let i = 0; i < n; i++) {
    const f = (i / (n - 1)) * (m - 1);
    const k = Math.min(m - 2, Math.floor(f));
    const t = f - k;
    const s0 = samples[Math.max(0, k - 1)];
    const s1 = samples[k];
    const s2 = samples[k + 1];
    const s3 = samples[Math.min(m - 1, k + 2)];
    const r = [];
    for (let c = 0; c < 5; c++) r.push(catmull(s0[c], s1[c], s2[c], s3[c], t));
    for (let c = 2; c < 5; c++) r[c] = Math.max(0, r[c]);
    // Los extremos marcados como polo (ancho 0) se conservan exactos
    if (i === 0 && samples[0][2] === 0) r[2] = r[3] = r[4] = 0;
    if (i === n - 1 && samples[m - 1][2] === 0) r[2] = r[3] = r[4] = 0;
    out.push(r);
  }
  return out;
}

/**
 * Forma esculpida por "loft": secciones elípticas asimétricas a lo largo de una curva del plano YZ.
 * Cada anillo: [y, z, semiAnchoX, semiAltoHaciaN, semiAltoHaciaMenosN], con N ⟂ tangente.
 */
class LoftShape {
  constructor(rings) {
    this.rings = rings;
    this.ny = [];
    this.nz = [];
    const n = rings.length;
    for (let i = 0; i < n; i++) {
      const a = rings[Math.max(0, i - 1)];
      const b = rings[Math.min(n - 1, i + 1)];
      let ty = b[0] - a[0];
      let tz = b[1] - a[1];
      const tl = Math.hypot(ty, tz) || 1;
      ty /= tl;
      tz /= tl;
      this.ny.push(tz);
      this.nz.push(-ty);
    }
  }

  /** Punto de la superficie en el anillo fraccionario `f`, ángulo `alpha` (0 = lado N) y desplazamiento. */
  point(f, alpha, offset, out) {
    const n = this.rings.length;
    const i = Math.max(0, Math.min(n - 2, Math.floor(f)));
    const k = Math.max(0, Math.min(1, f - i));
    const A = this.rings[i];
    const B = this.rings[i + 1];
    const lerp = (c) => A[c] + (B[c] - A[c]) * k;
    const ny = this.ny[i] + (this.ny[i + 1] - this.ny[i]) * k;
    const nz = this.nz[i] + (this.nz[i + 1] - this.nz[i]) * k;
    const s = Math.sin(alpha);
    const c = Math.cos(alpha);
    const w = lerp(2) + offset;
    const h = (c >= 0 ? lerp(3) : lerp(4)) + offset;
    out.set(w * s, lerp(0) + ny * h * c, lerp(1) + nz * h * c);
    return out;
  }

  /** Índice de anillo fraccionario más cercano a una coordenada z del eje. */
  ringAtZ(z) {
    const r = this.rings;
    for (let i = 0; i < r.length - 1; i++) {
      if ((z - r[i][1]) * (z - r[i + 1][1]) <= 0) {
        const d = r[i + 1][1] - r[i][1];
        return i + (Math.abs(d) > 1e-6 ? (z - r[i][1]) / d : 0);
      }
    }
    return r.length - 1;
  }

  /** Índice de anillo fraccionario más cercano a una coordenada y del eje. */
  ringAtY(y) {
    const r = this.rings;
    for (let i = 0; i < r.length - 1; i++) {
      if ((y - r[i][0]) * (y - r[i + 1][0]) <= 0) {
        const d = r[i + 1][0] - r[i][0];
        return i + (Math.abs(d) > 1e-6 ? (y - r[i][0]) / d : 0);
      }
    }
    return r.length - 1;
  }

  /** Malla cerrada y suave (normales soldadas, polos en los extremos de ancho nulo). */
  toGeometry(radial) {
    const pos = [];
    const uv = [];
    const idx = [];
    const starts = [];
    const n = this.rings.length;
    const p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const r = this.rings[i];
      const pole = r[2] < 1e-4 && r[3] < 1e-4 && r[4] < 1e-4;
      starts.push({ start: pos.length / 3, pole });
      if (pole) {
        pos.push(0, r[0], r[1]);
        uv.push(0.5, i / (n - 1));
      } else {
        for (let j = 0; j < radial; j++) {
          this.point(i, (j / radial) * TAU, 0, p);
          pos.push(p.x, p.y, p.z);
          uv.push(j / radial, i / (n - 1));
        }
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const A = starts[i];
      const B = starts[i + 1];
      for (let j = 0; j < radial; j++) {
        const j1 = (j + 1) % radial;
        if (A.pole && B.pole) continue;
        if (A.pole) {
          idx.push(A.start, B.start + j, B.start + j1);
        } else if (B.pole) {
          idx.push(A.start + j, B.start, A.start + j1);
        } else {
          idx.push(A.start + j, B.start + j, A.start + j1);
          idx.push(A.start + j1, B.start + j, B.start + j1);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    orientOutward(geo, this);
    return geo;
  }
}

/** Garantiza normales hacia fuera comprobando un anillo central contra su eje. */
function orientOutward(geo, shape) {
  const mid = Math.floor(shape.rings.length / 2);
  const r = shape.rings[mid];
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  let score = 0;
  for (let i = 0; i < pos.count; i++) {
    const dy = pos.getY(i) - r[0];
    const dz = pos.getZ(i) - r[1];
    const dx = pos.getX(i);
    if (Math.abs(dy) + Math.abs(dz) > 0.6 * (r[2] + r[3] + 0.05)) continue;
    score += dx * nrm.getX(i) + dy * nrm.getY(i) + dz * nrm.getZ(i);
  }
  if (score < 0) flipGeometry(geo);
}

function flipGeometry(geo) {
  const index = geo.index.array;
  for (let i = 0; i < index.length; i += 3) {
    const t = index[i + 1];
    index[i + 1] = index[i + 2];
    index[i + 2] = t;
  }
  geo.index.needsUpdate = true;
  geo.computeVertexNormals();
}

/** Fusiona geometrías (indexadas o no) con position/normal/uv/(color) en una sola indexada. */
function mergeGeos(list) {
  let vCount = 0;
  let iCount = 0;
  let hasColor = false;
  const parts = [];
  for (const g of list) {
    const pos = g.attributes.position;
    if (!g.attributes.normal) g.computeVertexNormals();
    const colorAttr = g.attributes.color;
    if (colorAttr) hasColor = true;
    const count = pos.count;
    const index = g.index ? g.index.array : null;
    parts.push({ g, count, index, colorAttr });
    vCount += count;
    iCount += index ? index.length : count;
  }
  const P = new Float32Array(vCount * 3);
  const N = new Float32Array(vCount * 3);
  const U = new Float32Array(vCount * 2);
  const C = hasColor ? new Float32Array(vCount * 3) : null;
  const I = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const { g, count, index, colorAttr } of parts) {
    P.set(g.attributes.position.array.subarray(0, count * 3), vo * 3);
    N.set(g.attributes.normal.array.subarray(0, count * 3), vo * 3);
    if (g.attributes.uv) U.set(g.attributes.uv.array.subarray(0, count * 2), vo * 2);
    if (C) {
      if (colorAttr && colorAttr.itemSize === 3) {
        C.set(colorAttr.array.subarray(0, count * 3), vo * 3);
      } else if (colorAttr) {
        const arr = colorAttr.array;
        const stride = colorAttr.itemSize;
        for (let k = 0; k < count; k++) {
          C[(vo + k) * 3] = arr[k * stride];
          C[(vo + k) * 3 + 1] = arr[k * stride + 1];
          C[(vo + k) * 3 + 2] = arr[k * stride + 2];
        }
      } else {
        C.fill(1, vo * 3, (vo + count) * 3);
      }
    }
    if (index) {
      for (let i = 0; i < index.length; i++) I[io++] = index[i] + vo;
    } else {
      for (let i = 0; i < count; i++) I[io++] = vo + i;
    }
    vo += count;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  if (C) geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
  geo.setIndex(new THREE.BufferAttribute(I, 1));
  geo.computeBoundingSphere();
  return geo;
}

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

/** Clona y transforma una geometría (posición, rotación Euler, escala). */
function placed(geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _q.setFromEuler(_e.set(rx, ry, rz));
  _m4.compose(_v1.set(x, y, z), _q, _s.set(sx, sy, sz));
  return geo.applyMatrix4(_m4);
}

/** Orienta una geometría con su +Y local apuntando de `a` a `b` (correas, etc.). */
function alongSegment(geo, a, b) {
  const dir = _v2.subVectors(b, a);
  const len = dir.length();
  geo.translate(0, 0.5, 0);
  geo.scale(1, len, 1);
  _q.setFromUnitVectors(_up, dir.normalize());
  _m4.compose(a, _q, _s.set(1, 1, 1));
  return geo.applyMatrix4(_m4);
}

/** Base ortonormal con +Z = forward. */
function basisMatrix(px, py, pz, fx, fy, fz, upx = 0, upy = 1, upz = 0) {
  const zA = new THREE.Vector3(fx, fy, fz).normalize();
  const xA = new THREE.Vector3(upx, upy, upz).cross(zA).normalize();
  const yA = new THREE.Vector3().crossVectors(zA, xA);
  return new THREE.Matrix4().makeBasis(xA, yA, zA).setPosition(px, py, pz);
}

/** Parche de superficie ceñido al torso: z ∈ [zA,zB], ángulo dorsal ∈ [pA,pB], grosor variable. */
function torsoPatch(zA, zB, pA, pB, nz, np, offsetFn, phiScale = null) {
  const pos = [];
  const uv = [];
  const idx = [];
  const sp = { x: 0, y: 0, nx: 0, ny: 0 };
  for (let i = 0; i <= nz; i++) {
    const u = i / nz;
    const z = zA + (zB - zA) * u;
    const ps = phiScale ? phiScale(u) : 1;
    for (let j = 0; j <= np; j++) {
      const v = j / np;
      const phi = (pA + (pB - pA) * v) * ps;
      torsoSurfacePoint(z, phi, offsetFn(z, phi, u, v), sp);
      pos.push(sp.x, sp.y, z);
      uv.push(v, u);
    }
  }
  const row = np + 1;
  for (let i = 0; i < nz; i++) {
    for (let j = 0; j < np; j++) {
      const a = i * row + j;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // Normal hacia fuera = alejándose del eje del torso
  const P = geo.attributes.position;
  const Nn = geo.attributes.normal;
  const sec = { yc: 0, w: 0, ht: 0, hb: 0 };
  let score = 0;
  for (let i = 0; i < P.count; i++) {
    sampleTorso(P.getZ(i), sec);
    score += P.getX(i) * Nn.getX(i) + (P.getY(i) - sec.yc) * Nn.getY(i);
  }
  if (score < 0) flipGeometry(geo);
  return geo;
}

/**
 * Mechón plano ahusado y curvado (crin/cola): raíz en el origen, cae por -Y,
 * ancho a lo largo de Z y ligero abombado hacia +X (volumen sin tubos rígidos).
 */
function lockGeometry(length, width, curlOut, curlFwd, segs = 8) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const cx = curlOut * t * t;
    const cy = -length * t;
    const cz = curlFwd * Math.sin(t * Math.PI * 0.85);
    const hw = width * Math.pow(1 - t, 0.75) * (0.62 + 0.38 * Math.sin(Math.min(1, t * 2.6) * Math.PI * 0.5));
    pos.push(cx, cy, cz - hw, cx + hw * 0.42, cy, cz, cx, cy, cz + hw);
    uv.push(0, t, 0.5, t, 1, t);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 3;
    const b = a + 3;
    idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Fusiona mechones colocados con matrices y añade morph targets relativos de "rotación
 * por raíz" (cada mechón gira alrededor de su propia raíz → la crin ondea sin despegarse).
 * @param {{geo: THREE.BufferGeometry, matrix: THREE.Matrix4}[]} locks
 * @param {{axis: THREE.Vector3, angle: number}[]} morphs eje en el marco del grupo
 */
function mergeLocksWithMorphs(locks, morphs) {
  const placedGeos = [];
  const ranges = [];
  let start = 0;
  for (const l of locks) {
    const root = l.root ? l.root.clone() : new THREE.Vector3().setFromMatrixPosition(l.matrix);
    const g = l.geo.clone().applyMatrix4(l.matrix);
    ranges.push({ start, count: g.attributes.position.count, root, weight: l.weight ?? 1 });
    start += g.attributes.position.count;
    placedGeos.push(g);
  }
  const geo = mergeGeos(placedGeos);
  if (morphs.length) {
    const P = geo.attributes.position;
    const N = geo.attributes.normal;
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    geo.morphAttributes.position = [];
    geo.morphAttributes.normal = [];
    for (const m of morphs) {
      const dp = new Float32Array(P.count * 3);
      const dn = new Float32Array(P.count * 3);
      for (const r of ranges) {
        q.setFromAxisAngle(m.axis, m.angle * r.weight);
        for (let i = r.start; i < r.start + r.count; i++) {
          v.set(P.getX(i), P.getY(i), P.getZ(i)).sub(r.root).applyQuaternion(q).add(r.root);
          dp[i * 3] = v.x - P.getX(i);
          dp[i * 3 + 1] = v.y - P.getY(i);
          dp[i * 3 + 2] = v.z - P.getZ(i);
          v.set(N.getX(i), N.getY(i), N.getZ(i)).applyQuaternion(q);
          dn[i * 3] = v.x - N.getX(i);
          dn[i * 3 + 1] = v.y - N.getY(i);
          dn[i * 3 + 2] = v.z - N.getZ(i);
        }
      }
      geo.morphAttributes.position.push(new THREE.BufferAttribute(dp, 3));
      geo.morphAttributes.normal.push(new THREE.BufferAttribute(dn, 3));
    }
    geo.morphTargetsRelative = true;
    geo.computeBoundingSphere();
  }
  for (const l of locks) l.geo.dispose();
  return geo;
}

// ---------------------------------------------------------------------------
// Caché estática de geometrías compartidas (todos los caballos, locales y remotos)
// ---------------------------------------------------------------------------

let _sharedGeos = null;
let _sharedRefCount = 0;

function buildTorsoGeo() {
  const n = 46;
  const rings = [];
  for (let i = 0; i < n; i++) {
    const u = 0.5 - 0.5 * Math.cos((Math.PI * i) / (n - 1));
    const z = THREE.MathUtils.clamp(TORSO_Z_MIN + (TORSO_Z_MAX - TORSO_Z_MIN) * u, TORSO_Z_MIN + 1e-4, TORSO_Z_MAX - 1e-4);
    const sec = sampleTorso(z, { yc: 0, w: 0, ht: 0, hb: 0 });
    const pole = i === 0 || i === n - 1;
    rings.push([sec.yc, z, pole ? 0 : sec.w, pole ? 0 : sec.ht, pole ? 0 : sec.hb]);
  }
  return new LoftShape(rings).toGeometry(30);
}

// Cuello en "S" suave: ancho y musculoso en el pecho, fino tras las orejas (marco pivote del cuello)
const NECK_SAMPLES = [
  [-0.150, -0.170, 0.0, 0.0, 0.0],
  [-0.120, -0.150, 0.172, 0.215, 0.225],
  [0.020, -0.050, 0.166, 0.192, 0.206],
  [0.190, 0.050, 0.136, 0.150, 0.166],
  [0.350, 0.110, 0.108, 0.112, 0.128],
  [0.480, 0.165, 0.090, 0.090, 0.104],
  [0.560, 0.215, 0.080, 0.076, 0.090],
  [0.600, 0.250, 0.0, 0.0, 0.0]
];
const HEAD_POLL = Object.freeze({ y: 0.545, z: 0.205 });

// Cabeza equina estilizada (marco pivote de la cabeza, en la nuca): frente ancha,
// mejillas suaves y hocico redondeado y dulce.
const HEAD_SAMPLES = [
  [0.032, -0.080, 0.0, 0.0, 0.0],
  [0.040, -0.052, 0.062, 0.060, 0.064],
  [0.026, 0.006, 0.084, 0.074, 0.094],
  [-0.010, 0.084, 0.090, 0.070, 0.108],
  [-0.064, 0.172, 0.070, 0.056, 0.074],
  [-0.118, 0.250, 0.060, 0.050, 0.058],
  [-0.160, 0.308, 0.065, 0.055, 0.066],
  [-0.188, 0.350, 0.060, 0.050, 0.060],
  [-0.200, 0.374, 0.0, 0.0, 0.0]
];

const FRONT_UPPER = [
  [0.070, 0.000, 0.0, 0.0, 0.0],
  [0.050, 0.000, 0.122, 0.148, 0.130],
  [-0.080, 0.012, 0.104, 0.124, 0.104],
  [-0.200, 0.010, 0.074, 0.088, 0.074],
  [-0.340, 0.000, 0.055, 0.058, 0.050],
  [-0.430, 0.000, 0.050, 0.050, 0.048],
  [-0.470, 0.000, 0.0, 0.0, 0.0]
];
const HIND_UPPER = [
  [0.100, -0.020, 0.0, 0.0, 0.0],
  [0.080, -0.020, 0.118, 0.160, 0.168],
  [-0.060, -0.030, 0.126, 0.150, 0.162],
  [-0.200, -0.020, 0.086, 0.100, 0.112],
  [-0.340, 0.000, 0.058, 0.056, 0.074],
  [-0.445, 0.000, 0.050, 0.046, 0.064],
  [-0.485, 0.000, 0.0, 0.0, 0.0]
];
function cannonSamples(len, hockBack) {
  return [
    [0.030, 0.000, 0.0, 0.0, 0.0],
    [0.000, 0.000, 0.053, 0.054, hockBack],
    [-0.065, 0.000, 0.043, 0.040, 0.047],
    [-len * 0.6, 0.000, 0.037, 0.033, 0.043],
    [-len + 0.04, 0.000, 0.041, 0.039, 0.049],
    [-len, -0.004, 0.044, 0.042, 0.054],
    [-len - 0.03, 0.000, 0.0, 0.0, 0.0]
  ];
}
// Menudillo + cuartilla inclinada hacia delante (marco pivote del menudillo)
const FOOT_SAMPLES = [
  [0.035, -0.004, 0.0, 0.0, 0.0],
  [0.000, -0.004, 0.046, 0.046, 0.058],
  [-0.050, 0.016, 0.036, 0.034, 0.040],
  [-0.095, 0.034, 0.038, 0.036, 0.040],
  [-0.118, 0.040, 0.048, 0.048, 0.048],
  [-0.128, 0.042, 0.0, 0.0, 0.0]
];

function buildLegGeos() {
  const frontUpper = new LoftShape(resampleRings(FRONT_UPPER, 16)).toGeometry(16);
  const hindUpper = new LoftShape(resampleRings(HIND_UPPER, 16)).toGeometry(16);
  const knee = placed(new THREE.SphereGeometry(0.054, 14, 10), 0, 0, 0.004, 0, 0, 0, 1, 1, 1.05);
  const frontLower = mergeGeos([new LoftShape(resampleRings(cannonSamples(FRONT_L2, 0.050), 16)).toGeometry(14), knee]);
  const hock = placed(new THREE.SphereGeometry(0.054, 14, 10), 0, 0.004, -0.010, 0, 0, 0, 1, 1, 1.15);
  const hindLower = mergeGeos([new LoftShape(resampleRings(cannonSamples(HIND_L2, 0.072), 16)).toGeometry(14), hock]);
  const fetlock = placed(new THREE.SphereGeometry(0.050, 14, 10), 0, -0.006, -0.006, 0, 0, 0, 0.95, 0.95, 1.15);
  const foot = mergeGeos([new LoftShape(resampleRings(FOOT_SAMPLES, 12)).toGeometry(14), fetlock]);
  // Casco pulido: tronco de cono ligeramente inclinado, base exacta en y = -FOOT_H
  const hoof = placed(new THREE.CylinderGeometry(0.049, 0.063, 0.085, 20), 0, -FOOT_H + 0.0425, 0.046, 0.10, 0, 0, 1, 1, 1.1);
  return { frontUpper, hindUpper, frontLower, hindLower, foot, hoof };
}

function buildHeadGeos() {
  const head = new LoftShape(resampleRings(HEAD_SAMPLES, 26));
  const headGeo = head.toGeometry(26);

  // Hocico suave con tono propio (capa ligeramente exterior desde el puente nasal)
  const muzzleSamples = HEAD_SAMPLES.slice(5).map((s, i) => (i === 0 ? [s[0], s[1], s[2] - 0.004, s[3] - 0.004, s[4] - 0.004] : [s[0], s[1], s[2] && s[2] + 0.004, s[3] && s[3] + 0.003, s[4] && s[4] + 0.004]));
  muzzleSamples.unshift([-0.100, 0.226, 0.0, 0.0, 0.0]);
  const muzzleGeo = new LoftShape(resampleRings(muzzleSamples, 14)).toGeometry(24);

  const p = new THREE.Vector3();
  const white = [];
  const iris = [];
  const dark = [];

  // Ojos grandes expresivos (esclera + iris luminoso + pupila + 2 destellos + pestañas)
  const eyeRing = head.ringAtZ(0.108);
  for (const side of [1, -1]) {
    head.point(eyeRing, side * 1.18, -0.010, p);
    const M = basisMatrix(p.x, p.y, p.z, side * 0.80, 0.16, 0.58);
    const add = (list, g) => list.push(g.applyMatrix4(M));
    add(white, placed(new THREE.SphereGeometry(0.031, 18, 14), 0, 0, 0, 0, 0, 0, 1, 1.12, 0.58));
    add(iris, placed(new THREE.SphereGeometry(0.0225, 18, 14), 0, -0.001, 0.0105, 0, 0, 0, 1, 1.1, 0.42));
    add(dark, placed(new THREE.SphereGeometry(0.0125, 14, 10), 0, -0.001, 0.0175, 0, 0, 0, 1, 1.2, 0.34));
    add(white, placed(new THREE.SphereGeometry(0.0062, 10, 8), side * -0.007, 0.010, 0.0215));
    add(white, placed(new THREE.SphereGeometry(0.0034, 8, 6), side * 0.006, -0.008, 0.0205));
    add(dark, placed(new THREE.TorusGeometry(0.032, 0.0042, 6, 18, Math.PI * 0.95), 0, 0.001, 0.006, -0.22, 0, Math.PI * 0.025));
    for (let k = 0; k < 3; k++) {
      const a = Math.PI * (0.18 + k * 0.13);
      const lx = Math.cos(a) * 0.034 * -side;
      const ly = Math.sin(a) * 0.036;
      add(dark, placed(new THREE.ConeGeometry(0.0042, 0.018, 5), lx, ly + 0.006, 0.006, -0.25, 0, -side * (0.6 - k * 0.3)));
    }
  }
  // Ollares sutiles
  const nostrilRing = head.ringAtZ(0.352);
  for (const side of [1, -1]) {
    head.point(nostrilRing, side * 0.95, -0.006, p);
    dark.push(placed(new THREE.SphereGeometry(0.012, 10, 8), p.x, p.y, p.z, 0.3, side * 0.5, 0, 0.62, 1.0, 0.55));
  }

  // Brida/cabezada dorada: testera, frontalera, muserola, carrilleras y filetes del bocado
  const gold = [];
  const strap = (pts, closed = false, r = 0.0068) => {
    const curve = new THREE.CatmullRomCurve3(pts, closed, 'centripetal');
    gold.push(new THREE.TubeGeometry(curve, Math.max(12, pts.length * 4), r, 5, closed));
  };
  const arc = (ring, a0, a1, off, steps) => {
    const pts = [];
    for (let i = 0; i <= steps; i++) pts.push(head.point(ring, a0 + ((a1 - a0) * i) / steps, off, new THREE.Vector3()));
    return pts;
  };
  const crownRing = head.ringAtZ(-0.030);
  const browRing = head.ringAtZ(0.030);
  const noseRing = head.ringAtZ(0.258);
  const bitRing = head.ringAtZ(0.318);
  strap(arc(crownRing, -1.55, 1.55, 0.006, 10));
  strap(arc(browRing, -1.35, 1.35, 0.006, 10));
  const nose = arc(noseRing, 0, TAU, 0.006, 20);
  nose.pop();
  strap(nose, true);
  const bitLocal = [];
  for (const side of [1, -1]) {
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const k = i / 8;
      pts.push(head.point(crownRing + (bitRing - crownRing) * k, side * (1.5 + 0.55 * k), 0.006, new THREE.Vector3()));
    }
    strap(pts);
    const b = head.point(bitRing, side * 2.05, 0.012, new THREE.Vector3());
    gold.push(placed(new THREE.TorusGeometry(0.018, 0.0048, 6, 16), b.x, b.y, b.z, 0, Math.PI * 0.5, 0));
    bitLocal.push(b);
  }
  const gemPos = head.point(browRing, 0, 0.016, new THREE.Vector3());

  // Orejas puntiagudas curvadas hacia delante (exterior pelaje + interior rosado)
  const earOuter = new LoftShape(resampleRings([
    [-0.010, 0.000, 0.0, 0.0, 0.0],
    [0.000, 0.000, 0.030, 0.022, 0.020],
    [0.050, 0.004, 0.035, 0.024, 0.019],
    [0.100, 0.016, 0.026, 0.018, 0.014],
    [0.138, 0.034, 0.012, 0.009, 0.007],
    [0.158, 0.050, 0.0, 0.0, 0.0]
  ], 14)).toGeometry(14);
  const earInner = placed(new LoftShape(resampleRings([
    [0.012, 0.000, 0.0, 0.0, 0.0],
    [0.020, 0.000, 0.020, 0.008, 0.010],
    [0.060, 0.006, 0.022, 0.008, 0.010],
    [0.104, 0.020, 0.014, 0.006, 0.007],
    [0.130, 0.036, 0.0, 0.0, 0.0]
  ], 12)).toGeometry(12), 0, 0, 0.013);

  // Flequillo suave entre las orejas (mechones con morph de vuelo)
  const foreLocks = [];
  const fRing = head.ringAtZ(-0.006);
  for (let i = 0; i < 4; i++) {
    const side = i - 1.5;
    const root = head.point(fRing, side * 0.20, 0.004, new THREE.Vector3());
    const dirDown = head.point(head.ringAtZ(0.12), side * 0.12, 0.012, new THREE.Vector3()).sub(root).normalize();
    // Base del mechón: -Y = hacia la cara, X = normal hacia fuera, Z = a lo ancho
    const yA = dirDown.clone().negate();
    const xA = new THREE.Vector3(0, 0.6, 0.8).normalize();
    const zA = new THREE.Vector3().crossVectors(xA, yA).normalize();
    xA.crossVectors(yA, zA).normalize();
    const M = new THREE.Matrix4().makeBasis(xA, yA, zA).setPosition(root);
    foreLocks.push({ geo: lockGeometry(0.12 + (i % 2) * 0.025, 0.032, 0.018, side * 0.01, 7), matrix: M });
  }
  const forelock = mergeLocksWithMorphs(foreLocks, [{ axis: new THREE.Vector3(1, 0, 0), angle: -0.75 }]);

  return {
    head: headGeo,
    muzzle: muzzleGeo,
    eyeWhite: mergeGeos(white),
    eyeIris: mergeGeos(iris),
    eyeDark: mergeGeos(dark),
    bridle: mergeGeos(gold),
    earOuter,
    earInner,
    forelock,
    bitLocal,
    gemPos
  };
}

function buildNeckAndMane() {
  const neck = new LoftShape(resampleRings(NECK_SAMPLES, 24));
  const neckGeo = neck.toGeometry(24);

  // Crin en capas: mechones planos ahusados que nacen en la cresta, abrazan su curva y caen
  // por el flanco del cuello (siguiendo la superficie esculpida, nunca atravesándola)
  const locks = [];
  const n = neck.rings.length;
  const p = new THREE.Vector3();
  const strip = (f0, side, len, hwRing, phiMax, layer) => {
    const pos = [];
    const idx = [];
    const SEG = 10;
    for (let k = 0; k <= SEG; k++) {
      const t = k / SEG;
      const phi = side * phiMax * Math.min(1, t * 1.15);
      const drop = Math.max(0, t * 1.15 - 1) * len;
      const f = Math.max(0.4, Math.min(n - 1.6, f0 - t * len * 9));
      const hw = hwRing * Math.pow(1 - t, 0.65) * (0.7 + 0.3 * Math.sin(Math.min(1, t * 3) * Math.PI * 0.5));
      const off = 0.010 + layer * 0.010 + t * 0.018;
      for (let j = -1; j <= 1; j++) {
        neck.point(f + j * hw, phi, off + (j === 0 ? hw * 0.012 : 0), p);
        pos.push(p.x, p.y - drop, p.z);
      }
    }
    for (let k = 0; k < SEG; k++) {
      const i0 = k * 3;
      const i1 = i0 + 3;
      idx.push(i0, i1, i0 + 1, i0 + 1, i1, i1 + 1, i0 + 1, i1 + 1, i0 + 2, i0 + 2, i1 + 1, i1 + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return { geo, matrix: new THREE.Matrix4(), root: neck.point(f0, 0, 0.01, new THREE.Vector3()), weight: 0.5 + (f0 / n) * 0.8 };
  };
  const LOCKS = 17;
  for (let i = 0; i < LOCKS; i++) {
    const u = 0.22 + (i / (LOCKS - 1)) * 0.72;
    const f0 = u * (n - 1);
    const len = 0.24 + 0.05 * Math.sin(i * 1.9) + (1 - u) * 0.06;
    locks.push(strip(f0, 1, len, 1.05, 1.95, i % 2));
    if (i % 3 === 1) locks.push(strip(f0 + 0.4, -1, len * 0.55, 0.8, 1.05, 0));
    // Cepillo corto erguido sobre la cresta (volumen)
    locks.push(strip(f0 + 0.3, i % 2 ? 1 : -1, 0.05, 0.75, 0.55, 2));
  }
  // Morphs: [0] viento hacia atrás (galope), [1]/[2] vaivén lateral ±
  const axisX = new THREE.Vector3(1, 0, 0);
  const axisNeck = new THREE.Vector3(0, 0.88, 0.47).normalize();
  const mane = mergeLocksWithMorphs(locks, [
    { axis: axisX, angle: 0.85 },
    { axis: axisNeck, angle: 0.40 },
    { axis: axisNeck, angle: -0.40 }
  ]);
  return { neck: neckGeo, mane };
}

function buildTailGeos() {
  const segs = [];
  const LOCK_COUNTS = [9, 10, 9];
  const LENS = [0.34, 0.38, 0.36];
  const WIDTHS = [0.064, 0.074, 0.064];
  for (let s = 0; s < 3; s++) {
    const geos = [];
    const count = LOCK_COUNTS[s];
    for (let k = 0; k < count; k++) {
      const a = (k / count) * TAU + s * 0.4;
      const r = s === 0 ? 0.030 : 0.044;
      const xA = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const yA = new THREE.Vector3(0, 1, 0);
      const zA = new THREE.Vector3().crossVectors(xA, yA);
      const M = new THREE.Matrix4().makeBasis(xA, yA, zA).setPosition(xA.x * r, 0.01, xA.z * r);
      const len = LENS[s] * (0.85 + 0.15 * Math.sin(k * 2.1 + s));
      geos.push(lockGeometry(len, WIDTHS[s], 0.035 + s * 0.01, 0.0, 8).applyMatrix4(M));
    }
    if (s === 0) {
      // Nacimiento de la cola (maslo) con pelaje
      geos.push(new LoftShape(resampleRings([
        [0.04, 0, 0, 0, 0], [0.02, 0, 0.050, 0.050, 0.050], [-0.10, 0, 0.040, 0.040, 0.040], [-0.18, 0, 0.032, 0.032, 0.032], [-0.20, 0, 0, 0, 0]
      ], 10)).toGeometry(12));
    }
    segs.push(geos);
  }
  return {
    tailHair1: mergeGeos(segs[0].slice(0, LOCK_COUNTS[0])),
    tailDock: segs[0][LOCK_COUNTS[0]],
    tailHair2: mergeGeos(segs[1]),
    tailHair3: mergeGeos(segs[2])
  };
}

function buildSaddleGeos() {
  const S = SADDLE;
  // Mantilla real ceñida al lomo (esquinas redondeadas)
  const blanketPhi = (u) => 0.80 + 0.20 * Math.sin(Math.PI * u);
  const blanket = torsoPatch(S.blanketZBack, S.blanketZFront, -S.blanketHalfAngle, S.blanketHalfAngle, 22, 30, () => S.blanketOffset, blanketPhi);

  // Silla esculpida: asiento acolchado + borrén trasero + borrén delantero (grosor analítico)
  const seat = torsoPatch(S.zBack, S.zFront, -S.halfAngle, S.halfAngle, 34, 22,
    (z, phi) => S.blanketOffset + 0.002 + saddleThickness(z, phi / S.halfAngle));
  // Faldones de la silla bajo los muslos + cincha bajo el barril
  const flapL = torsoPatch(-0.20, 0.10, 0.84, 1.42, 8, 8, () => S.blanketOffset + 0.005);
  const flapR = torsoPatch(-0.20, 0.10, -1.42, -0.84, 8, 8, () => S.blanketOffset + 0.005);
  const girth = torsoPatch(0.045, 0.095, 1.30, TAU - 1.30, 3, 24, () => 0.007);

  const leatherParts = [seat, flapL, flapR, girth];
  const goldParts = [];
  const sp = { x: 0, y: 0, nx: 0, ny: 0 };

  // Ribete dorado del borde de la mantilla (bucle cerrado)
  const edge = [];
  const NZ = 16;
  const NP = 10;
  const pt = (z, phi, off) => {
    torsoSurfacePoint(z, phi, off, sp);
    return new THREE.Vector3(sp.x, sp.y, z);
  };
  const zb = S.blanketZBack;
  const zf = S.blanketZFront;
  for (let i = 0; i <= NZ; i++) {
    const u = i / NZ;
    edge.push(pt(zb + (zf - zb) * u, S.blanketHalfAngle * blanketPhi(u), S.blanketOffset + 0.004));
  }
  for (let j = 1; j < NP; j++) edge.push(pt(zf, S.blanketHalfAngle * blanketPhi(1) * (1 - (2 * j) / NP), S.blanketOffset + 0.004));
  for (let i = NZ; i >= 0; i--) {
    const u = i / NZ;
    edge.push(pt(zb + (zf - zb) * u, -S.blanketHalfAngle * blanketPhi(u), S.blanketOffset + 0.004));
  }
  for (let j = 1; j < NP; j++) edge.push(pt(zb, -S.blanketHalfAngle * blanketPhi(0) * (1 - (2 * j) / NP), S.blanketOffset + 0.004));
  goldParts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge, true, 'centripetal'), 140, 0.0085, 5, true));

  // Ribete del borrén trasero
  const cantle = [];
  for (let i = 0; i <= 12; i++) {
    const phi = -0.78 + (1.56 * i) / 12;
    cantle.push(pt(S.cantleZ - 0.006, phi, S.blanketOffset + saddleThickness(S.cantleZ, phi / S.halfAngle) + 0.004));
  }
  goldParts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cantle, false, 'centripetal'), 36, 0.010, 6, false));

  // Borrén delantero: perilla dorada
  const pommelTop = pt(S.pommelZ, 0, S.blanketOffset + saddleThickness(S.pommelZ, 0));
  goldParts.push(placed(new THREE.TorusGeometry(0.026, 0.0085, 8, 18), pommelTop.x, pommelTop.y + 0.004, pommelTop.z + 0.004, Math.PI * 0.5 - 0.35, 0, 0));
  const pommelGem = placed(new THREE.OctahedronGeometry(0.020, 1), pommelTop.x, pommelTop.y + 0.030, pommelTop.z + 0.010, 0, 0, 0, 1, 1.25, 1);

  // Medallones reales en la mantilla
  for (const side of [1, -1]) {
    torsoSurfacePoint(-0.33, side * 1.05, S.blanketOffset + 0.004, sp);
    const M = basisMatrix(sp.x, sp.y, -0.33, sp.nx, sp.ny, 0, 0, 0, 1);
    goldParts.push(placed(new THREE.CylinderGeometry(0.036, 0.036, 0.008, 18), 0, 0, 0, Math.PI * 0.5).applyMatrix4(M));
    goldParts.push(placed(new THREE.OctahedronGeometry(0.014, 0), 0, 0, 0.008).applyMatrix4(M));
  }

  // Aciones + estribos colgando exactamente bajo las botas del jinete
  const R = RIDER_ROOT_IN_BODY;
  for (const side of [1, -1]) {
    const ax = side * RIDER_ANKLE.x;
    const treadY = RIDER_ANKLE.y + R.y - 0.034;
    const treadZ = RIDER_ANKLE.z + R.z + 0.030;
    torsoSurfacePoint(-0.01, side * 0.98, S.blanketOffset + 0.012, sp);
    const top = new THREE.Vector3(sp.x, sp.y, -0.01);
    const archTop = new THREE.Vector3(ax, treadY + 0.088, treadZ);
    leatherParts.push(alongSegment(new THREE.BoxGeometry(0.020, 1, 0.006), top, archTop));
    // Hebilla
    goldParts.push(placed(new THREE.BoxGeometry(0.026, 0.020, 0.010), top.x + (archTop.x - top.x) * 0.15, top.y + (archTop.y - top.y) * 0.15, top.z + (archTop.z - top.z) * 0.15));
    // Arco del estribo (plano XY) + estribera
    goldParts.push(placed(new THREE.TorusGeometry(0.050, 0.0065, 8, 18, Math.PI), ax, treadY + 0.036, treadZ, 0, 0, 0, 1, 1.05, 1));
    goldParts.push(placed(new THREE.BoxGeometry(0.106, 0.010, 0.046), ax, treadY + 0.034, treadZ));
  }

  return {
    blanket,
    leather: mergeGeos(leatherParts),
    trim: mergeGeos(goldParts),
    pommelGem
  };
}

function acquireSharedGeometries() {
  _sharedRefCount++;
  if (_sharedGeos) return _sharedGeos;

  const head = buildHeadGeos();
  const neck = buildNeckAndMane();
  const legs = buildLegGeos();
  const tail = buildTailGeos();
  const saddle = buildSaddleGeos();

  // Riendas: tramo cilíndrico unitario (base en el origen) que se orienta cada fotograma
  const rein = new THREE.CylinderGeometry(0.0072, 0.0072, 1, 6, 1, true);
  rein.translate(0, 0.5, 0);

  _sharedGeos = {
    torso: buildTorsoGeo(),
    ...neck,
    ...head,
    ...legs,
    ...tail,
    ...saddle,
    gem: new THREE.OctahedronGeometry(0.019, 1),
    rein,
    halo: new THREE.RingGeometry(0.72, 0.92, 40)
  };

  const bodyAO = { aoStrength: 0.34, undersideWeight: 0.46, cavityWeight: 0.24, baseWeight: 0.22, shadowTint: 0x2a1d4a, ridgeHighlight: 0.10 };
  for (const key of ['torso', 'neck', 'head', 'frontUpper', 'hindUpper', 'frontLower', 'hindLower', 'foot', 'tailDock']) {
    if (_sharedGeos[key]) bakeProceduralVertexAO(_sharedGeos[key], bodyAO);
  }
  const hairAO = { aoStrength: 0.38, baseWeight: 0.36, cavityWeight: 0.34, shadowTint: 0x281b44, ridgeHighlight: 0.12 };
  for (const key of ['mane', 'forelock', 'tailHair1', 'tailHair2', 'tailHair3']) {
    if (_sharedGeos[key]) bakeProceduralVertexAO(_sharedGeos[key], hairAO);
  }
  const tackAO = { aoStrength: 0.30, shadowTint: 0x2a1940 };
  for (const key of ['blanket', 'leather', 'muzzle']) {
    if (_sharedGeos[key]) bakeProceduralVertexAO(_sharedGeos[key], tackAO);
  }

  return _sharedGeos;
}

function releaseSharedGeometries() {
  _sharedRefCount = Math.max(0, _sharedRefCount - 1);
  if (_sharedRefCount === 0 && _sharedGeos) {
    for (const geo of Object.values(_sharedGeos)) {
      if (geo && geo.isBufferGeometry) geo.dispose();
    }
    _sharedGeos = null;
  }
}

// ---------------------------------------------------------------------------
// Caché de materiales compartidos por variante de pelaje
// ---------------------------------------------------------------------------

const _matCache = new Map();
let _horseCoatTex = null;

function getHorseCoatTexture() {
  if (_horseCoatTex) return _horseCoatTex;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 160; i++) {
    const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    const rx = (s - Math.floor(s)) * size;
    const s2 = Math.sin(i * 39.346 + 11.135) * 43758.5453;
    const ry = (s2 - Math.floor(s2)) * size;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 255, 255, 0.14)' : 'rgba(220, 210, 224, 0.12)';
    ctx.beginPath();
    ctx.ellipse(rx, ry, 10, 7, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.needsUpdate = true;
  _horseCoatTex = tex;
  return tex;
}

function acquireMaterials(variant) {
  let entry = _matCache.get(variant.id);
  if (!entry) {
    const std = (o) => new THREE.MeshStandardMaterial(o);
    const coatTex = getHorseCoatTexture();
    const gemMat = createLumenMaterial(
      { color: variant.eye, emissive: variant.eye, emissiveIntensity: 1.45, roughness: 0.16, metalness: 0.25 },
      { preserveRoughness: true, rimStrength: 0.45, rimPower: 2.5, rimTint: 0xffe8fb, heightFog: false, cacheTag: `horse_gem_${variant.id}` }
    );
    gemMat.userData.preserveRoughness = true;
    const coatMat = createLumenMaterial(
      { map: coatTex, color: variant.coat, roughness: 0.40, metalness: 0.04, vertexColors: true },
      { preserveRoughness: true, rimStrength: 0.38, rimPower: 2.8, rimTint: 0xffe0f2, shadowLiftColor: 0x2b1d4a, shadowLiftStrength: 0.15, heightFog: false, cacheTag: `horse_coat_${variant.id}` }
    );
    coatMat.userData.preserveRoughness = true;
    entry = {
      refs: 0,
      mats: {
        coat: coatMat,
        muzzle: createLumenMaterial(
          { color: variant.muzzle, roughness: 0.62, metalness: 0.0, vertexColors: true },
          { rimStrength: 0.30, rimPower: 3.0, rimTint: 0xffe0f2, shadowLiftColor: 0x2b1d4a, shadowLiftStrength: 0.15, heightFog: false, cacheTag: `horse_muzzle_${variant.id}` }
        ),
        mane: createLumenMaterial(
          { color: variant.mane, roughness: 0.38, metalness: 0.06, side: THREE.DoubleSide, vertexColors: true },
          { rimStrength: 0.42, rimPower: 2.6, rimTint: 0xffd8f0, shadowLiftColor: 0x281b44, shadowLiftStrength: 0.14, heightFog: false, cacheTag: `horse_mane_${variant.id}` }
        ),
        hooves: createLumenMaterial(
          { color: variant.hooves, roughness: 0.20, metalness: 0.38, vertexColors: true },
          { rimStrength: 0.28, rimPower: 3.2, rimTint: 0xffe4d8, shadowLiftColor: 0x281c44, shadowLiftStrength: 0.12, heightFog: false, cacheTag: `horse_hooves_${variant.id}` }
        ),
        saddle: createLumenMaterial(
          { color: variant.saddle, roughness: 0.48, metalness: 0.06, side: THREE.DoubleSide, vertexColors: true },
          { rimStrength: 0.34, rimPower: 2.9, rimTint: 0xffcce8, shadowLiftColor: 0x2a1940, shadowLiftStrength: 0.15, heightFog: false, cacheTag: `horse_saddle_${variant.id}` }
        ),
        leather: createLumenMaterial(
          { color: variant.leather, roughness: 0.38, metalness: 0.08, vertexColors: true },
          { rimStrength: 0.30, rimPower: 3.0, rimTint: 0xffd8e8, shadowLiftColor: 0x2a1940, shadowLiftStrength: 0.14, heightFog: false, cacheTag: `horse_leather_${variant.id}` }
        ),
        trim: createLumenMaterial(
          { color: variant.trim, roughness: 0.22, metalness: 0.88, vertexColors: true },
          { rimStrength: 0.36, rimPower: 2.8, rimTint: 0xfff0d4, shadowLiftColor: 0x2a1d4a, shadowLiftStrength: 0.12, heightFog: false, cacheTag: `horse_trim_${variant.id}` }
        ),
        gem: gemMat,
        eyeWhite: std({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.18, roughness: 0.18 }),
        iris: std({ color: variant.eye, emissive: variant.eye, emissiveIntensity: 0.35, roughness: 0.15, metalness: 0.08 }),
        dark: createLumenMaterial(
          { color: 0x18121c, roughness: 0.22, metalness: 0.05 },
          { rimStrength: 0.15, rimPower: 3.5, rimTint: 0xd4e8ff, shadowLiftColor: 0x201830, shadowLiftStrength: 0.10, heightFog: false, cacheTag: `horse_dark_${variant.id}` }
        ),
        earInner: createLumenMaterial(
          { color: 0xf6b6c8, roughness: 0.7, metalness: 0.0 },
          { rimStrength: 0.22, rimPower: 3.2, rimTint: 0xffd6ec, shadowLiftColor: 0x2b1d4a, shadowLiftStrength: 0.14, heightFog: false, cacheTag: `horse_ear_${variant.id}` }
        )
      }
    };
    _matCache.set(variant.id, entry);
  }
  entry.refs++;
  return entry.mats;
}

function releaseMaterials(variantId) {
  const entry = _matCache.get(variantId);
  if (!entry) return;
  entry.refs--;
  if (entry.refs <= 0) {
    for (const m of Object.values(entry.mats)) m.dispose();
    _matCache.delete(variantId);
  }
}

// ---------------------------------------------------------------------------
// Ensamblado del modelo
// ---------------------------------------------------------------------------

function mesh(geo, mat, shadow = false) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
}

function frozen(obj) {
  obj.matrixAutoUpdate = false;
  obj.updateMatrix();
  return obj;
}

function buildLeg(geos, mats, side, front) {
  const P = front ? FRONT_PIVOT : HIND_PIVOT;
  const upper = new THREE.Group();
  upper.position.set(side * P.x, P.y, P.z);
  upper.add(frozen(mesh(front ? geos.frontUpper : geos.hindUpper, mats.coat, true)));

  const lower = new THREE.Group();
  lower.position.y = -(front ? FRONT_L1 : HIND_L1);
  upper.add(lower);
  lower.add(frozen(mesh(front ? geos.frontLower : geos.hindLower, mats.coat, true)));

  const foot = new THREE.Group();
  foot.position.y = -(front ? FRONT_L2 : HIND_L2);
  lower.add(foot);
  foot.add(frozen(mesh(geos.foot, mats.coat, true)));
  foot.add(frozen(mesh(geos.hoof, mats.hooves, true)));

  if (!front) {
    upper.rotation.x = HIND_REST_U;
    lower.rotation.x = HIND_REST_L;
  }
  return { upper, lower, foot };
}

function createAnimState() {
  return {
    phase: 0,
    idleT: Math.random() * 10,
    lead: 1,
    speed: 0,
    accel: 0,
    vy: 0,
    yawRate: 0,
    prevX: 0, prevY: 0, prevZ: 0, prevYaw: 0, prevSpeed: 0,
    hasPrev: false,
    wasAir: false,
    bounce: 0,
    pitch: 0,
    breath: 0,
    nodT: -1, nodTimer: 3 + Math.random() * 4,
    restLegTimer: 4 + Math.random() * 6, restSide: 0, restO: 6,
    earTimerL: 1 + Math.random() * 3, earTimerR: 2 + Math.random() * 3, earFlickL: -1, earFlickR: -1,
    legs: new Float32Array([0, 0, 0, 0, 0, 0, HIND_REST_U, HIND_REST_L, 0, HIND_REST_U, HIND_REST_L, 0]),
    bank: new SpringValue(55, 11),
    land: new SpringValue(160, 13),
    neckX: new SpringValue(70, 13, NECK_REST_X),
    headX: new SpringValue(70, 13),
    headY: new SpringValue(30, 9),
    restLeg: new SpringValue(20, 8),
    tail1x: new SpringValue(38, 5.5, TAIL_REST[0]),
    tail1z: new SpringValue(38, 5.5),
    tail2x: new SpringValue(46, 5.0, TAIL_REST[1]),
    tail2z: new SpringValue(46, 5.0),
    tail3x: new SpringValue(52, 4.6, TAIL_REST[2]),
    tail3z: new SpringValue(52, 4.6),
    maneFlow: new SpringValue(36, 7),
    maneSway: new SpringValue(42, 4.5),
    forelock: new SpringValue(40, 6),
    earLx: new SpringValue(90, 12), earLz: new SpringValue(90, 12),
    earRx: new SpringValue(90, 12), earRz: new SpringValue(90, 12)
  };
}

/**
 * Crea un caballo real estilizado: torso orgánico esculpido, cuello en S, cabeza equina con
 * ojos expresivos, patas de 3 segmentos articulados, crin/cola de mechones y montura completa.
 * Todas las geometrías y materiales están cacheados y compartidos entre caballos.
 * @param {string} [variantId='imperial_white']
 */
export function createHorseModel(variantId = 'imperial_white') {
  const variant = HORSE_VARIANTS[variantId] || HORSE_VARIANTS.imperial_white;
  const geos = acquireSharedGeometries();
  const mats = acquireMaterials(variant);

  const root = new THREE.Group();
  root.name = `Horse_${variant.id}`;

  const bodyPivot = new THREE.Group();
  bodyPivot.position.y = HORSE_BODY_Y;
  root.add(bodyPivot);

  const torso = mesh(geos.torso, mats.coat, true);
  bodyPivot.add(torso);

  // Montura (marco cuerpo: ceñida exactamente al perfil del lomo)
  const saddleGroup = new THREE.Group();
  saddleGroup.add(mesh(geos.blanket, mats.saddle, true));
  saddleGroup.add(mesh(geos.leather, mats.leather, true));
  saddleGroup.add(mesh(geos.trim, mats.trim, false));
  saddleGroup.add(mesh(geos.pommelGem, mats.gem, false));
  for (const c of saddleGroup.children) frozen(c);
  bodyPivot.add(frozen(saddleGroup));

  // Cuello + crin
  const neckPivot = new THREE.Group();
  neckPivot.position.set(0, NECK_PIVOT.y, NECK_PIVOT.z);
  neckPivot.rotation.x = NECK_REST_X;
  bodyPivot.add(neckPivot);
  neckPivot.add(frozen(mesh(geos.neck, mats.coat, true)));
  const mane = mesh(geos.mane, mats.mane, true);
  mane.updateMorphTargets();
  neckPivot.add(frozen(mane));

  // Cabeza
  const headPivot = new THREE.Group();
  headPivot.position.set(0, HEAD_POLL.y, HEAD_POLL.z);
  headPivot.scale.setScalar(1.1);
  neckPivot.add(headPivot);
  headPivot.add(frozen(mesh(geos.head, mats.coat, true)));
  headPivot.add(frozen(mesh(geos.muzzle, mats.muzzle, false)));
  headPivot.add(frozen(mesh(geos.eyeWhite, mats.eyeWhite)));
  headPivot.add(frozen(mesh(geos.eyeIris, mats.iris)));
  headPivot.add(frozen(mesh(geos.eyeDark, mats.dark)));
  headPivot.add(frozen(mesh(geos.bridle, mats.trim)));
  const headGem = mesh(geos.gem, mats.gem);
  headGem.position.copy(geos.gemPos);
  headPivot.add(frozen(headGem));
  const forelock = mesh(geos.forelock, mats.mane);
  forelock.updateMorphTargets();
  headPivot.add(frozen(forelock));

  const buildEar = (side) => {
    const ear = new THREE.Group();
    ear.position.set(side * 0.046, 0.088, -0.012);
    ear.rotation.set(EAR_REST.x, 0, -side * EAR_REST.z);
    ear.add(frozen(mesh(geos.earOuter, mats.coat)));
    ear.add(frozen(mesh(geos.earInner, mats.earInner)));
    headPivot.add(ear);
    return ear;
  };
  const lEar = buildEar(1);
  const rEar = buildEar(-1);

  // Cola articulada en 3 segmentos encadenados
  const tail1 = new THREE.Group();
  tail1.position.set(0, TAIL_PIVOT.y, TAIL_PIVOT.z);
  tail1.rotation.x = TAIL_REST[0];
  bodyPivot.add(tail1);
  tail1.add(frozen(mesh(geos.tailDock, mats.coat, true)));
  tail1.add(frozen(mesh(geos.tailHair1, mats.mane, true)));
  const tail2 = new THREE.Group();
  tail2.position.y = -TAIL_LEN[0];
  tail2.rotation.x = TAIL_REST[1];
  tail1.add(tail2);
  tail2.add(frozen(mesh(geos.tailHair2, mats.mane, true)));
  const tail3 = new THREE.Group();
  tail3.position.y = -TAIL_LEN[1];
  tail3.rotation.x = TAIL_REST[2];
  tail2.add(tail3);
  tail3.add(frozen(mesh(geos.tailHair3, mats.mane, true)));

  // Patas: delanteras +Z, traseras -Z; izquierda +X, derecha -X
  const fl = buildLeg(geos, mats, 1, true);
  const fr = buildLeg(geos, mats, -1, true);
  const bl = buildLeg(geos, mats, 1, false);
  const br = buildLeg(geos, mats, -1, false);
  bodyPivot.add(fl.upper, fr.upper, bl.upper, br.upper);

  // Riendas 3D (2 tramos por lado con caída natural)
  const reins = [];
  for (let i = 0; i < 4; i++) {
    const r = mesh(geos.rein, mats.trim);
    r.frustumCulled = false;
    bodyPivot.add(r);
    reins.push(r);
  }

  let disposed = false;
  const model = {
    root,
    variantId: variant.id,
    bones: {
      bodyPivot, torso, neckPivot, headPivot, lEar, rEar, tail1, tail2, tail3,
      legs: [fl, fr, bl, br]
    },
    mane,
    forelock,
    reins,
    bitLocal: geos.bitLocal,
    anim: createAnimState(),
    /** Datos de la montura para el jinete (actualizados sin asignar memoria). */
    mount: { bounce: 0, pitch: 0, bank: 0, speed: 0, accel: 0, vy: 0, yawRate: 0, gait: 'idle', airborne: false },
    // Compatibilidad con código antiguo
    bounceY: 0,
    pitch: 0,
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      releaseMaterials(variant.id);
      releaseSharedGeometries();
    }
  };
  ensureVertexColors(root, { aoStrength: 0.20, shadowTint: 0x281c44 });
  updateHorseReins(model, null);
  return model;
}

// ---------------------------------------------------------------------------
// Animación: marchas reales + física secundaria (cero asignaciones)
// ---------------------------------------------------------------------------

const sstep = (k) => k * k * (3 - 2 * k);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Ciclo de una pata: apoyo (barre de delante a atrás) + vuelo (recoge rodilla/corvejón).
 * Escribe [muslo, caña, menudillo] en _legTargets a partir de `o`.
 */
function legCycle(o, u, duty, reach, lift, front) {
  let up;
  let low;
  let foot;
  if (u < duty) {
    const k = u / duty;
    up = -reach + 1.9 * reach * k;
    const load = Math.sin(Math.PI * k);
    low = front ? 0.04 * load : -0.06 * load;
    foot = -0.16 * load;
  } else {
    const k = (u - duty) / (1 - duty);
    const e = sstep(k);
    up = 0.9 * reach - 1.9 * reach * e - Math.sin(Math.PI * k) * reach * 0.12;
    const l = Math.sin(Math.PI * Math.min(1, k * 1.15));
    low = front ? lift * 1.55 * l : -lift * 1.15 * l;
    foot = 0.55 * l * lift;
  }
  _legTargets[o] = up + (front ? 0 : HIND_REST_U);
  _legTargets[o + 1] = low + (front ? 0 : HIND_REST_L);
  _legTargets[o + 2] = foot;
}

function trackMotion(model, dt) {
  const a = model.anim;
  const r = model.root;
  const yaw = r.rotation.y;
  if (!a.hasPrev) {
    a.prevX = r.position.x;
    a.prevY = r.position.y;
    a.prevZ = r.position.z;
    a.prevYaw = yaw;
    a.hasPrev = true;
  }
  const vx = (r.position.x - a.prevX) / dt;
  const vz = (r.position.z - a.prevZ) / dt;
  let h = Math.hypot(vx, vz);
  if (h > 45) h = a.speed; // teletransporte
  const vy = clamp((r.position.y - a.prevY) / dt, -30, 30);
  const yr = clamp(wrapAngle(yaw - a.prevYaw) / dt, -6, 6);
  a.prevX = r.position.x;
  a.prevY = r.position.y;
  a.prevZ = r.position.z;
  a.prevYaw = yaw;

  const prevSpeed = a.speed;
  a.speed += (h - a.speed) * (1 - Math.exp(-dt * 8));
  a.accel += ((a.speed - prevSpeed) / dt - a.accel) * (1 - Math.exp(-dt * 6));
  a.vy += (vy - a.vy) * (1 - Math.exp(-dt * 16));
  a.yawRate += (yr - a.yawRate) * (1 - Math.exp(-dt * 9));
}

/**
 * Anima el caballo: reposo vivo, trote diagonal (walk), galope de 3 tiempos con banking (run),
 * salto con aterrizaje amortiguado (jump) y física secundaria de cola, crin, flequillo y orejas.
 * @param {ReturnType<typeof createHorseModel>} model
 * @param {'idle'|'walk'|'run'|'jump'} [animState='idle']
 * @param {number} [dt=0.016]
 * @param {number} [speedRatio=0]
 * @param {boolean} [micro=true] false = sin micro-animaciones (LOD lejano)
 */
export function animateHorseModel(model, animState = 'idle', dt = 0.016, speedRatio = 0, micro = true) {
  if (!model || !model.bones) return;
  dt = dt > 0.1 ? 0.1 : dt;
  if (dt <= 0) return;
  const a = model.anim;
  const b = model.bones;
  trackMotion(model, dt);

  const airborne = animState === 'jump';
  let gaitBounce = 0;
  let gaitPitch = 0;
  let neckT = NECK_REST_X;
  let headT = 0;
  let headYT = 0;
  let legLambda = 24;

  if (animState === 'run') {
    // Galope de 3 tiempos: posterior exterior -> diagonal -> mano de galope + suspensión
    if (a.yawRate > 0.45) a.lead = 1;
    else if (a.yawRate < -0.45) a.lead = -1;
    a.phase = (a.phase + dt * (2.25 + speedRatio * 0.4)) % 1;
    const ph = a.phase;
    const D = 0.36;
    const L = a.lead > 0;
    legCycle(L ? 0 : 3, (ph + 1 - 0.36) % 1, D, 0.74, 0.95, true);   // mano de galope
    legCycle(L ? 3 : 0, (ph + 1 - 0.18) % 1, D, 0.74, 0.95, true);   // mano exterior (diagonal)
    legCycle(L ? 6 : 9, (ph + 1 - 0.18) % 1, D, 0.62, 0.85, false);  // posterior interior (diagonal)
    legCycle(L ? 9 : 6, ph, D, 0.62, 0.85, false);                   // posterior exterior
    gaitBounce = 0.072 * (0.5 + 0.5 * Math.cos(TAU * (ph - 0.80))) - 0.02;
    gaitPitch = -0.075 * Math.cos(TAU * (ph - 0.12));
    neckT = 0.20 + 0.15 * Math.cos(TAU * (ph - 0.12));
    headT = -0.08 - 0.08 * Math.cos(TAU * (ph - 0.12));
  } else if (animState === 'walk') {
    // Trote diagonal de 2 tiempos: (mano izq + pie dcho) / (mano dcha + pie izq)
    a.phase = (a.phase + dt * (2.5 + speedRatio * 0.6)) % 1;
    const ph = a.phase;
    const D = 0.46;
    legCycle(0, ph, D, 0.44, 0.7, true);
    legCycle(9, ph, D, 0.40, 0.6, false);
    legCycle(3, (ph + 0.5) % 1, D, 0.44, 0.7, true);
    legCycle(6, (ph + 0.5) % 1, D, 0.40, 0.6, false);
    gaitBounce = 0.044 * (0.5 + 0.5 * Math.cos(2 * TAU * (ph - 0.475))) - 0.012;
    gaitPitch = 0.012 * Math.sin(2 * TAU * ph);
    neckT = 0.07 + 0.045 * Math.sin(2 * TAU * (ph + 0.1));
    headT = -0.02 - 0.03 * Math.sin(2 * TAU * (ph + 0.1));
  } else if (airborne) {
    // Salto: despegue con cuartos delanteros arriba y rodillas recogidas; caída alcanzando el suelo
    const k = clamp(a.vy / 6, -1, 1);
    const up = k > 0 ? k : 0;
    const down = k < 0 ? -k : 0;
    const mid = 1 - up - down;
    for (let i = 0; i < 2; i++) {
      const o = i * 3;
      _legTargets[o] = -1.05 * (up + mid) - 0.55 * down + (i ? 0.08 : 0);
      _legTargets[o + 1] = 1.75 * (up + mid) + 0.18 * down;
      _legTargets[o + 2] = 0.6 * (up + mid) - 0.05 * down;
    }
    for (let i = 2; i < 4; i++) {
      const o = i * 3;
      _legTargets[o] = HIND_REST_U + 0.50 * up - 0.10 * mid - 0.38 * down + (i === 3 ? 0.06 : 0);
      _legTargets[o + 1] = HIND_REST_L - 0.05 * up - 0.5 * mid - 0.78 * down;
      _legTargets[o + 2] = 0.15 * up + 0.45 * (mid + down);
    }
    gaitPitch = -0.30 * up + 0.13 * down - 0.08 * mid;
    gaitBounce = 0.02;
    neckT = -0.05 * up + 0.22 * down + 0.08 * mid;
    headT = 0.05 * up - 0.12 * down;
    legLambda = 14;
  } else {
    // Reposo vivo: respiración, cabeceo ocasional, una pata trasera descansando a ratos
    a.idleT += dt;
    for (let i = 0; i < 12; i++) _legTargets[i] = 0;
    _legTargets[6] = _legTargets[9] = HIND_REST_U;
    _legTargets[7] = _legTargets[10] = HIND_REST_L;
    if (micro) {
      a.restLegTimer -= dt;
      if (a.restLegTimer <= 0) {
        a.restLegTimer = 7 + Math.random() * 7;
        a.restSide = a.restSide !== 0 ? 0 : (Math.random() < 0.5 ? 1 : -1);
        if (a.restSide !== 0 && a.restLeg.x < 0.05) a.restO = a.restSide > 0 ? 6 : 9;
      }
      const rl = a.restLeg.step(a.restSide !== 0 ? 1 : 0, dt);
      const o = a.restO;
      _legTargets[o] += -0.06 * rl;
      _legTargets[o + 1] += -0.30 * rl;
      _legTargets[o + 2] += 0.55 * rl;
      gaitBounce = -0.006 * rl;

      a.nodTimer -= dt;
      if (a.nodTimer <= 0) {
        a.nodTimer = 4 + Math.random() * 5;
        a.nodT = 0;
      }
      if (a.nodT >= 0) {
        a.nodT += dt;
        if (a.nodT > 1.4) a.nodT = -1;
        else headT += Math.sin((a.nodT / 1.4) * TAU) * 0.10 * Math.sin((a.nodT / 1.4) * Math.PI);
      }
    }
    neckT = NECK_REST_X + Math.sin(a.idleT * 0.9) * 0.025;
    headYT = Math.sin(a.idleT * 0.43) * 0.14 + Math.sin(a.idleT * 1.1 + 1.3) * 0.04;
    legLambda = 7;
  }

  // Patas con suavizado exponencial (transiciones de marcha sin saltos)
  const kl = 1 - Math.exp(-dt * legLambda);
  const legs = a.legs;
  for (let i = 0; i < 12; i++) legs[i] += (_legTargets[i] - legs[i]) * kl;

  // Aterrizaje: compresión amortiguada de patas y torso
  if (a.wasAir && !airborne) {
    a.land.impulse(-clamp(Math.abs(a.vy) * 0.22 + 0.4, 0.4, 2.2));
  }
  a.wasAir = airborne;
  const comp = a.land.step(0, dt);
  const squash = comp < 0 ? -comp : 0;

  for (let i = 0; i < 4; i++) {
    const leg = b.legs[i];
    const o = i * 3;
    const front = i < 2;
    leg.upper.rotation.x = legs[o] + (front ? -0.5 : -0.45) * squash;
    leg.lower.rotation.x = legs[o + 1] + (front ? 1.0 : -0.9) * squash;
    leg.foot.rotation.x = legs[o + 2] + (front ? -0.5 : 0.45) * squash;
  }

  const kb = 1 - Math.exp(-dt * 16);
  a.bounce += (gaitBounce - a.bounce) * kb;
  a.pitch += (gaitPitch - a.pitch) * (1 - Math.exp(-dt * (airborne ? 6 : 14)));
  const speedF = clamp(a.speed / 12, 0, 1.25);
  const bank = a.bank.stepClamped(animState === 'idle' ? 0 : -a.yawRate * 0.09 * speedF, dt, -0.22, 0.22);

  b.bodyPivot.position.y = HORSE_BODY_Y + a.bounce + comp;
  b.bodyPivot.rotation.x = a.pitch + squash * 0.06;
  b.bodyPivot.rotation.z = bank;

  const neckX = a.neckX.step(neckT + squash * 0.35, dt);
  b.neckPivot.rotation.x = neckX;
  b.headPivot.rotation.x = a.headX.step(headT - squash * 0.15, dt);
  b.headPivot.rotation.y = a.headY.step(headYT + clamp(a.yawRate * 0.08, -0.25, 0.25), dt);

  const falling = a.vy < 0 ? clamp(-a.vy * 0.08, 0, 0.6) : 0;

  if (micro) {
    // Respiración del torso
    a.breath += dt * (animState === 'run' ? 4.2 : animState === 'walk' ? 2.8 : 1.9);
    const br = Math.sin(a.breath);
    const amp = animState === 'idle' ? 0.012 : 0.007;
    b.torso.scale.set(1 + br * amp, 1 + br * amp * 0.65, 1);

    // Cola y crin sincronizadas con viento global (GraphicsSync) + movimiento (GC-Free)
    const yaw = model.root.rotation.y;
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);
    const wd = GraphicsSync.uWindDir.value;
    const ws = GraphicsSync.uWindStrength.value;
    const windSide = (wd.x * cosY - wd.y * sinY) * ws;
    const windFwd = (wd.x * sinY + wd.y * cosY) * ws;

    const sway = (animState === 'idle' ? Math.sin(a.idleT * 1.3) * 0.12 + Math.sin(a.idleT * 3.1) * 0.03 : 0) + windSide * 0.16;
    const tx1 = TAIL_REST[0] + clamp(a.speed * 0.03, 0, 0.46) + falling * 0.6 + Math.max(-0.08, -windFwd * 0.12);
    const tz1 = clamp(-a.yawRate * 0.16, -0.4, 0.4) + sway;
    const t1x = a.tail1x.stepClamped(tx1, dt, -0.2, 1.6);
    const t1z = a.tail1z.stepClamped(tz1, dt, -0.6, 0.6);
    const t2x = a.tail2x.stepClamped(TAIL_REST[1] + clamp(a.speed * 0.02, 0, 0.32) - a.tail1x.v * 0.05 + falling * 0.3, dt, -1.0, 0.8);
    const t2z = a.tail2z.stepClamped(sway * 0.6 - a.tail1z.v * 0.06, dt, -0.6, 0.6);
    const t3x = a.tail3x.stepClamped(TAIL_REST[2] + clamp(a.speed * 0.012, 0, 0.2) - a.tail2x.v * 0.05, dt, -1.0, 0.8);
    const t3z = a.tail3z.stepClamped(sway * 0.4 - a.tail2z.v * 0.06, dt, -0.6, 0.6);
    b.tail1.rotation.set(t1x, 0, t1z);
    b.tail2.rotation.set(t2x, 0, t2z);
    b.tail3.rotation.set(t3x, 0, t3z);

    // Crin y flequillo (morph targets por mechón): viento, giros y caída de saltos
    const flowT = clamp(a.speed / 17, 0, 1) * 0.95 + falling * 0.7 + ws * 0.14 + (animState === 'idle' ? 0.05 + Math.sin(a.idleT * 0.7) * 0.04 : 0);
    const flow = a.maneFlow.stepClamped(flowT, dt, 0, 1.2);
    const swayT = clamp(-a.yawRate * 0.35 + windSide * 0.25, -1, 1) + (animState === 'run' ? Math.sin(a.phase * TAU) * 0.25 : animState === 'idle' ? sway * 0.8 : 0);
    const mSway = a.maneSway.stepClamped(swayT, dt, -1, 1);
    const mi = model.mane.morphTargetInfluences;
    if (mi) {
      mi[0] = flow;
      mi[1] = mSway > 0 ? mSway : 0;
      mi[2] = mSway < 0 ? -mSway : 0;
    }
    const fi = model.forelock.morphTargetInfluences;
    if (fi) fi[0] = a.forelock.stepClamped(flow * 0.9 + falling * 0.5, dt, 0, 1.1);

    // Orejas independientes: atentas al avanzar, algo atrás al galopar, aleteos en reposo
    let lx = 0;
    let rx = 0;
    let lz = 0;
    let rz = 0;
    if (animState === 'idle') {
      a.earTimerL -= dt;
      a.earTimerR -= dt;
      if (a.earTimerL <= 0) { a.earTimerL = 2 + Math.random() * 4; a.earFlickL = 0; }
      if (a.earTimerR <= 0) { a.earTimerR = 2.5 + Math.random() * 4; a.earFlickR = 0; }
      if (a.earFlickL >= 0) {
        a.earFlickL += dt;
        if (a.earFlickL > 0.5) a.earFlickL = -1;
        else { const f = Math.sin((a.earFlickL / 0.5) * Math.PI); lx = -0.45 * f; lz = 0.25 * f; }
      }
      if (a.earFlickR >= 0) {
        a.earFlickR += dt;
        if (a.earFlickR > 0.5) a.earFlickR = -1;
        else { const f = Math.sin((a.earFlickR / 0.5) * Math.PI); rx = -0.45 * f; rz = 0.25 * f; }
      }
      lx += Math.sin(a.idleT * 0.6) * 0.12;
      rx += Math.sin(a.idleT * 0.5 + 2.0) * 0.12;
    } else if (animState === 'run') {
      lx = rx = -0.28;
    } else {
      lx = rx = 0.18;
    }
    b.lEar.rotation.x = EAR_REST.x + a.earLx.step(lx, dt);
    b.lEar.rotation.z = -EAR_REST.z - a.earLz.step(lz, dt);
    b.rEar.rotation.x = EAR_REST.x + a.earRx.step(rx, dt);
    b.rEar.rotation.z = EAR_REST.z + a.earRz.step(rz, dt);
  }

  const m = model.mount;
  m.bounce = a.bounce + comp;
  m.pitch = b.bodyPivot.rotation.x;
  m.bank = bank;
  m.speed = a.speed;
  m.accel = a.accel;
  m.vy = a.vy;
  m.yawRate = a.yawRate;
  m.gait = animState;
  m.airborne = airborne;
  model.bounceY = m.bounce;
  model.pitch = m.pitch;
}

/** Devuelve el caballo a una pose de reposo limpia (al desmontar). */
export function resetHorseModel(model) {
  const a = model.anim;
  a.hasPrev = false;
  a.speed = a.accel = a.vy = a.yawRate = 0;
  a.bounce = a.pitch = 0;
  a.wasAir = false;
  a.bank.reset();
  a.land.reset();
  model.bones.bodyPivot.position.y = HORSE_BODY_Y;
  model.bones.bodyPivot.rotation.set(0, 0, 0);
}

/**
 * Coloca el origen del jinete soldado al asiento: compone raíz del caballo (yaw) y
 * pivote del cuerpo (rebote, cabeceo, banking). Orden de Euler 'YXZ' = mismo marco que el cuerpo.
 */
export function placeRiderOnHorse(model, riderRoot) {
  const bp = model.bones.bodyPivot;
  const R = RIDER_ROOT_IN_BODY;
  const p = bp.rotation.x;
  const k = bp.rotation.z;
  const cb = Math.cos(k);
  const sb = Math.sin(k);
  const x1 = R.x * cb - R.y * sb;
  const y1 = R.x * sb + R.y * cb;
  const cp = Math.cos(p);
  const sp = Math.sin(p);
  const y2 = y1 * cp - R.z * sp;
  const z2 = y1 * sp + R.z * cp;
  const lx = x1 + bp.position.x;
  const ly = y2 + bp.position.y;
  const lz = z2 + bp.position.z;
  const root = model.root;
  const yaw = root.rotation.y;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  riderRoot.position.set(root.position.x + lx * cy + lz * sy, root.position.y + ly, root.position.z - lx * sy + lz * cy);
  if (riderRoot.rotation.order !== 'YXZ') riderRoot.rotation.order = 'YXZ';
  riderRoot.rotation.set(p, yaw, k);
}

function setReinSegment(m, a, b) {
  _v3.subVectors(b, a);
  const len = _v3.length();
  if (len < 1e-5) return;
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(_up, _v3.divideScalar(len));
  m.scale.set(1, len, 1);
}

/**
 * Actualiza las riendas: del bocado a las manos del jinete (si `rig` expone getHandPositions)
 * o, sin jinete, a la perilla de la silla. Cero asignaciones.
 */
export function updateHorseReins(model, rig = null) {
  const b = model.bones;
  b.neckPivot.updateMatrix();
  b.headPivot.updateMatrix();
  const R = RIDER_ROOT_IN_BODY;
  let hasHands = false;
  if (rig && typeof rig.getHandPositions === 'function') {
    hasHands = rig.getHandPositions(_hl, _hr);
    if (hasHands) {
      _hl.x += R.x; _hl.y += R.y; _hl.z += R.z;
      _hr.x += R.x; _hr.y += R.y; _hr.z += R.z;
    }
  }
  if (!hasHands) {
    _hl.set(0.05, POMMEL_ANCHOR_Y, SADDLE.pommelZ + 0.03);
    _hr.set(-0.05, POMMEL_ANCHOR_Y, SADDLE.pommelZ + 0.03);
  }
  for (let s = 0; s < 2; s++) {
    const bit = _v1.copy(model.bitLocal[s]).applyMatrix4(b.headPivot.matrix).applyMatrix4(b.neckPivot.matrix);
    const hand = s === 0 ? _hl : _hr;
    const dist = bit.distanceTo(hand);
    const sag = hasHands ? 0.02 + dist * 0.06 : 0.05 + dist * 0.12;
    _v2.addVectors(bit, hand).multiplyScalar(0.5);
    _v2.y -= sag;
    setReinSegment(model.reins[s * 2], bit, _v2);
    setReinSegment(model.reins[s * 2 + 1], _v2, hand);
  }
}

/**
 * Gestiona los caballos reales del mundo, la búsqueda de monturas libres,
 * el montaje/desmontaje, la sincronización de animación y el LOD por distancia.
 */
export class HorseSystem {
  #scene;
  #collision;
  #audio;
  #waterSystem = null;
  #waterSample = { inWater: false, surfaceY: 0, depth: 0, flowX: 0, flowZ: 0, distToBank: 99 };
  #root = null;
  #horses = [];
  #positionsCache = [];
  #haloMats = [];
  #pulseTime = 0;
  #hasSharedRef = false;

  constructor(scene, collisionSystem, audioManager = null) {
    this.#scene = scene;
    this.#collision = collisionSystem;
    this.#audio = audioManager;
  }

  setWaterSystem(waterSystem) {
    this.#waterSystem = waterSystem || null;
  }

  /** Escribe en outVec la posición del caballo montado o el libre más cercano (GC-Free). */
  getNearestHorsePosition(refPos, outVec) {
    if (!this.#horses.length || !refPos) return false;
    let best = null;
    let bestSq = Infinity;
    for (let i = 0; i < this.#horses.length; i++) {
      const h = this.#horses[i];
      if (h.mounted) {
        outVec.set(h.x, h.y, h.z);
        return true;
      }
      const dx = h.x - refPos.x;
      const dz = h.z - refPos.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestSq) {
        bestSq = dSq;
        best = h;
      }
    }
    if (!best) return false;
    outVec.set(best.x, best.y, best.z);
    return true;
  }

  init() {
    this.#root = new THREE.Group();
    this.#root.name = 'RoyalHorses';
    const sharedGeos = acquireSharedGeometries();
    this.#hasSharedRef = true;

    for (let i = 0; i < HORSE_SPAWNS.length; i++) {
      const cfg = HORSE_SPAWNS[i];
      const variant = HORSE_VARIANTS[cfg.variantId] || HORSE_VARIANTS.imperial_white;
      const model = createHorseModel(cfg.variantId);
      const groundY = this.#collision?.getGroundHeight?.(cfg.x, cfg.z, 0, 2.0) ?? 0;

      model.root.position.set(cfg.x, groundY, cfg.z);
      model.root.rotation.y = cfg.yaw;
      model.anim.idleT = i * 1.37;

      // Halo sutil en el suelo para indicar montura disponible (sin luces extra)
      const haloMat = new THREE.MeshBasicMaterial({
        color: variant.trim,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      this.#haloMats.push(haloMat);
      const halo = new THREE.Mesh(sharedGeos.halo, haloMat);
      halo.rotation.x = -Math.PI * 0.5;
      halo.position.y = 0.03;
      model.root.add(halo);

      const shadow = createContactShadow(1.15, 0.46);
      shadow.position.set(cfg.x, groundY + 0.024, cfg.z);
      shadow.rotation.y = cfg.yaw;
      shadow.scale.set(0.76, 1, 1.38);
      this.#root.add(shadow);
      this.#root.add(model.root);

      const horse = {
        id: cfg.id,
        variantId: variant.id,
        name: variant.name,
        x: cfg.x,
        y: groundY,
        z: cfg.z,
        yaw: cfg.yaw,
        mounted: false,
        model,
        root: model.root,
        halo,
        shadow,
        lodFrame: i,
        lodAcc: 0
      };
      this.#horses.push(horse);
      this.#positionsCache.push({ id: horse.id, variantId: horse.variantId, x: horse.x, z: horse.z, mounted: false });
    }
    this.#scene.add(this.#root);
  }

  /** Devuelve el caballo libre más cercano dentro de maxDist, o null. */
  getNearestFreeHorse(playerPos, maxDist = 3.2) {
    if (!playerPos) return null;
    let best = null;
    let bestDistSq = maxDist * maxDist;
    for (let i = 0; i < this.#horses.length; i++) {
      const h = this.#horses[i];
      if (h.mounted) continue;
      const dx = playerPos.x - h.x;
      const dy = playerPos.y - h.y;
      const dz = playerPos.z - h.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq <= bestDistSq) {
        bestDistSq = distSq;
        best = h;
      }
    }
    return best;
  }

  mountHorse(horse) {
    if (!horse) return null;
    horse.mounted = true;
    if (horse.halo) horse.halo.visible = false;
    horse.model.anim.hasPrev = false;
    this.#audio?.playClick?.();
    return horse;
  }

  /** Desmonta al jinete buscando una posición adyacente libre de colisiones. */
  dismountHorse(horse) {
    if (!horse) return { x: 0, y: 0, z: 0 };
    horse.mounted = false;
    if (horse.halo) horse.halo.visible = true;
    resetHorseModel(horse.model);
    updateHorseReins(horse.model, null);

    const sinY = Math.sin(horse.yaw);
    const cosY = Math.cos(horse.yaw);
    const dirs = [
      [cosY, -sinY, 1.35], [-cosY, sinY, 1.35], [-sinY, -cosY, 1.45],
      [sinY, cosY, 1.45], [cosY, -sinY, 0.95], [-cosY, sinY, 0.95]
    ];
    for (let i = 0; i < dirs.length; i++) {
      const [dx, dz, dist] = dirs[i];
      const tx = horse.x + dx * dist;
      const tz = horse.z + dz * dist;
      const ty = this.#collision?.getGroundHeight?.(tx, tz, horse.y + 0.4, 1.5) ?? horse.y;
      const blocked = this.#collision?.isPointBlocked?.(tx, ty + 0.9, tz, 0.42) ?? false;
      if (!blocked) {
        this.#audio?.playClick?.();
        return { x: tx, y: ty, z: tz };
      }
    }
    const fallbackY = this.#collision?.getGroundHeight?.(horse.x, horse.z, horse.y + 0.4, 1.5) ?? horse.y;
    this.#audio?.playClick?.();
    return { x: horse.x, y: fallbackY, z: horse.z };
  }

  /**
   * Sincroniza posición, rotación y animación del caballo montado por el jugador local.
   * Devuelve los datos de montura prealocados (rebote, cabeceo, banking, velocidad...).
   */
  syncMountedHorse(horse, pos, yaw, animState, speedRatio, dt) {
    horse.x = pos.x;
    horse.y = pos.y;
    horse.z = pos.z;
    horse.yaw = yaw;
    horse.root.position.set(pos.x, pos.y, pos.z);
    horse.root.rotation.y = yaw;
    animateHorseModel(horse.model, animState, dt, speedRatio, true);

    if (horse.shadow) {
      let groundY = this.#collision?.getGroundHeight?.(pos.x, pos.z, pos.y, 1.15) ?? 0;
      let inDeepWater = false;
      if (this.#waterSystem) {
        const bridgeY = this.#waterSystem.getBridgeHeightAt(pos.x, pos.z);
        if (bridgeY !== null && bridgeY <= pos.y + 1.15 && bridgeY >= groundY) {
          groundY = bridgeY;
        } else {
          this.#waterSystem.sampleWater(pos.x, pos.z, this.#waterSample);
          inDeepWater = this.#waterSample.inWater && this.#waterSample.depth > 0.25;
        }
      }
      const heightAbove = Math.max(0, pos.y - groundY);
      const jumpScale = Math.max(0.45, 1.0 - heightAbove * 0.12);
      horse.shadow.position.set(pos.x, groundY + 0.024, pos.z);
      horse.shadow.rotation.y = yaw;
      horse.shadow.scale.set(0.76 * jumpScale, 1, 1.38 * jumpScale);
      horse.shadow.material.opacity = inDeepWater ? 0.0 : 0.46 * Math.max(0.22, 1.0 - heightAbove * 0.22);
    }

    return horse.model.mount;
  }

  /** Suelda el jinete al asiento del caballo (incluye rebote, cabeceo y banking). */
  placeRider(horse, riderRoot) {
    placeRiderOnHorse(horse.model, riderRoot);
  }

  /** Riendas del bocado a las manos del jinete. */
  updateReins(horse, rig) {
    updateHorseReins(horse.model, rig);
  }

  getHorsePositions() {
    for (let i = 0; i < this.#horses.length; i++) {
      const h = this.#horses[i];
      const entry = this.#positionsCache[i];
      entry.x = h.x;
      entry.z = h.z;
      entry.mounted = h.mounted;
    }
    return this.#positionsCache;
  }

  /**
   * Caballos libres con LOD: >50 u -> física 1 de cada 3 fotogramas; >90 u -> pausados.
   * @param {number} dt
   * @param {THREE.Vector3} [playerPos]
   */
  update(dt, playerPos = null) {
    this.#pulseTime += dt;
    const pulse = 0.96 + Math.sin(this.#pulseTime * 2.6) * 0.05;

    for (let i = 0; i < this.#horses.length; i++) {
      const h = this.#horses[i];
      if (h.mounted) continue;
      let distSq = 0;
      if (playerPos) {
        const dx = playerPos.x - h.x;
        const dz = playerPos.z - h.z;
        distSq = dx * dx + dz * dz;
      }
      if (distSq > LOD_FAR_SQ) {
        h.lodAcc = 0;
        continue;
      }
      if (h.halo) h.halo.scale.set(pulse, pulse, 1);
      if (distSq > LOD_NEAR_SQ) {
        h.lodAcc += dt;
        h.lodFrame++;
        if (h.lodFrame % 3 !== 0) continue;
        animateHorseModel(h.model, 'idle', h.lodAcc, 0, true);
        h.lodAcc = 0;
      } else {
        animateHorseModel(h.model, 'idle', dt, 0, true);
      }
    }
  }

  dispose() {
    if (this.#root) {
      this.#scene?.remove(this.#root);
      this.#root = null;
    }
    for (let i = 0; i < this.#horses.length; i++) {
      const h = this.#horses[i];
      if (h.shadow) {
        h.shadow.geometry?.dispose();
        h.shadow.material?.dispose();
      }
      h.model.dispose();
    }
    for (let i = 0; i < this.#haloMats.length; i++) this.#haloMats[i].dispose();
    if (this.#hasSharedRef) {
      releaseSharedGeometries();
      this.#hasSharedRef = false;
    }
    this.#horses.length = 0;
    this.#haloMats.length = 0;
    this.#positionsCache.length = 0;
  }
}
