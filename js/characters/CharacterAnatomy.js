import * as THREE from 'three';
import { bakeProceduralVertexAO } from '../core/LumenArtPipeline.js';

const TAU = Math.PI * 2;
const _tmpV = new THREE.Vector3();
const _tmpP0 = new THREE.Vector3();
const _tmpP1 = new THREE.Vector3();
const _tmpP2 = new THREE.Vector3();
const _tmpE1 = new THREE.Vector3();
const _tmpE2 = new THREE.Vector3();
const _tmpTriN = new THREE.Vector3();
const _tmpCentroid = new THREE.Vector3();
const _tmpCenter = new THREE.Vector3();
const _tmpBboxCenter = new THREE.Vector3();

const WINDING_SWAP_ATTRS = ['position', 'uv', 'color', 'aSmoothNormal', 'aSwayWeight', 'aStrandPhase'];

const SOFT_AO_DEFAULTS = Object.freeze({
  aoStrength: 0.09,
  minAO: 0.86,
  shadowTint: 0xe8b0b2,
  shadowTintStrength: 0.14,
  baseWeight: 0.05,
  cavityWeight: 0.12,
  undersideWeight: 0.08,
  ridgeHighlight: 0.03,
  noiseStrength: 0.0
});

function bakeSoftVertexAO(geometry, options = {}) {
  const baseColor = options.baseColor ?? 0xffffff;
  const topColor = options.topColor ?? 0xffffff;
  bakeProceduralVertexAO(geometry, {
    ...SOFT_AO_DEFAULTS,
    baseColor,
    topColor,
    ...options
  });
  if (baseColor === 0xffffff && topColor === 0xffffff && geometry.attributes?.color) {
    const arr = geometry.attributes.color.array;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] > 1.0) arr[i] = 1.0;
    }
  }
  return geometry;
}

/**
 * Métricas anatómicas estandarizadas (canon estilizado 6.5–7 cabezas, suelo exacto en y = 0).
 * Compatibles con HorseAnatomy.js (RIDER_PELVIS_BOTTOM = 0.86), RidingDrape.js y BlackjackDealer.
 */
export const ANATOMY_METRICS = Object.freeze({
  female: Object.freeze({
    archetype: 'female',
    spineY: 1.00,
    waistY: 1.04,
    pelvisBottomY: 0.86,
    hipY: 0.91,
    hipHalfW: 0.090,
    thighLen: 0.44,
    shinLen: 0.42,
    footSoleDrop: 0.05,
    chestY: 1.23,
    shoulderY: 1.335,
    shoulderWidth: 0.178,
    upperArmLen: 0.27,
    forearmLen: 0.245,
    handOffsetY: -0.265,
    neckBaseY: 1.375,
    neckTopY: 1.49,
    headY: 1.595,
    headRadius: 0.125,
    totalHeight: 1.735
  }),
  male: Object.freeze({
    archetype: 'male',
    spineY: 1.00,
    waistY: 1.08,
    pelvisBottomY: 0.89,
    hipY: 0.96,
    hipHalfW: 0.106,
    thighLen: 0.46,
    shinLen: 0.44,
    footSoleDrop: 0.06,
    chestY: 1.29,
    shoulderY: 1.415,
    shoulderWidth: 0.222,
    upperArmLen: 0.29,
    forearmLen: 0.265,
    handOffsetY: -0.275,
    neckBaseY: 1.47,
    neckTopY: 1.59,
    headY: 1.715,
    headRadius: 0.132,
    totalHeight: 1.865
  })
});

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

/**
 * Remuestrea una lista de anillos [y, zOff, rx, rzFront, rzBack, twist?] usando Catmull-Rom.
 */
function resampleRings(samples, targetCount) {
  const m = samples.length;
  if (m < 2 || targetCount <= m) return samples.map((s) => [...s]);
  const out = [];
  for (let i = 0; i < targetCount; i++) {
    const f = (i / (targetCount - 1)) * (m - 1);
    const k = Math.min(m - 2, Math.floor(f));
    const t = f - k;
    const s0 = samples[Math.max(0, k - 1)];
    const s1 = samples[k];
    const s2 = samples[k + 1];
    const s3 = samples[Math.min(m - 1, k + 2)];
    const r = [
      catmullRom(s0[0], s1[0], s2[0], s3[0], t),
      catmullRom(s0[1], s1[1], s2[1], s3[1], t),
      Math.max(0, catmullRom(s0[2], s1[2], s2[2], s3[2], t)),
      Math.max(0, catmullRom(s0[3], s1[3], s2[3], s3[3], t)),
      Math.max(0, catmullRom(s0[4], s1[4], s2[4], s3[4], t)),
      catmullRom(s0[5] ?? 0, s1[5] ?? 0, s2[5] ?? 0, s3[5] ?? 0, t)
    ];
    if (i === 0 && samples[0][2] === 0) r[2] = r[3] = r[4] = 0;
    if (i === targetCount - 1 && samples[m - 1][2] === 0) r[2] = r[3] = r[4] = 0;
    out.push(r);
  }
  return out;
}

/**
 * Añade atributos estándar de personaje (aSmoothNormal, aSwayWeight, aStrandPhase) si no existen.
 */
export function initCharacterVertexAttributes(geometry, swayWeight = 0.0, strandPhase = 0.0) {
  if (!geometry || !geometry.attributes?.position) return geometry;
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const count = geometry.attributes.position.count;
  const norm = geometry.attributes.normal;

  if (!geometry.attributes.aSmoothNormal) {
    const smooth = new Float32Array(count * 3);
    smooth.set(norm.array.subarray(0, count * 3));
    geometry.setAttribute('aSmoothNormal', new THREE.BufferAttribute(smooth, 3));
  }
  if (!geometry.attributes.aSwayWeight) {
    const sway = new Float32Array(count);
    if (swayWeight !== 0) sway.fill(swayWeight);
    geometry.setAttribute('aSwayWeight', new THREE.BufferAttribute(sway, 1));
  }
  if (!geometry.attributes.aStrandPhase) {
    const phase = new Float32Array(count);
    if (strandPhase !== 0) phase.fill(strandPhase);
    geometry.setAttribute('aStrandPhase', new THREE.BufferAttribute(phase, 1));
  }
  return geometry;
}

/**
 * Garantiza normales orientadas hacia el exterior (soportando geometrías indexadas y no indexadas).
 * @param {THREE.BufferGeometry} geometry
 * @param {((centroid: THREE.Vector3, out: THREE.Vector3) => THREE.Vector3)|null} [centerFn=null]
 * @returns {THREE.BufferGeometry}
 */
export function ensureOutwardWinding(geometry, centerFn = null) {
  const pos = geometry?.attributes?.position;
  if (!pos || pos.count < 3) return geometry;

  if (!centerFn) {
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    geometry.boundingBox.getCenter(_tmpBboxCenter);
  }

  const idx = geometry.index;
  const triCount = idx ? Math.floor(idx.count / 3) : Math.floor(pos.count / 3);
  let score = 0;

  for (let t = 0; t < triCount; t++) {
    const base = t * 3;
    const i0 = idx ? idx.getX(base) : base;
    const i1 = idx ? idx.getX(base + 1) : base + 1;
    const i2 = idx ? idx.getX(base + 2) : base + 2;

    _tmpP0.fromBufferAttribute(pos, i0);
    _tmpP1.fromBufferAttribute(pos, i1);
    _tmpP2.fromBufferAttribute(pos, i2);

    _tmpE1.subVectors(_tmpP1, _tmpP0);
    _tmpE2.subVectors(_tmpP2, _tmpP0);
    _tmpTriN.crossVectors(_tmpE1, _tmpE2);

    _tmpCentroid.copy(_tmpP0).add(_tmpP1).add(_tmpP2).multiplyScalar(1 / 3);
    const center = centerFn ? (centerFn(_tmpCentroid, _tmpCenter) || _tmpCenter) : _tmpBboxCenter;
    _tmpV.subVectors(_tmpCentroid, center);
    score += _tmpTriN.dot(_tmpV);
  }

  if (score < 0) {
    if (idx) {
      const arr = idx.array;
      for (let i = 0; i + 2 < arr.length; i += 3) {
        const tmp = arr[i + 1];
        arr[i + 1] = arr[i + 2];
        arr[i + 2] = tmp;
      }
      idx.needsUpdate = true;
    } else {
      for (let a = 0; a < WINDING_SWAP_ATTRS.length; a++) {
        const attr = geometry.attributes[WINDING_SWAP_ATTRS[a]];
        if (!attr) continue;
        const itemSize = attr.itemSize;
        const arr = attr.array;
        for (let v = 0; v + 2 < pos.count; v += 3) {
          const o1 = (v + 1) * itemSize;
          const o2 = (v + 2) * itemSize;
          for (let k = 0; k < itemSize; k++) {
            const tmp = arr[o1 + k];
            arr[o1 + k] = arr[o2 + k];
            arr[o2 + k] = tmp;
          }
        }
        attr.needsUpdate = true;
      }
    }
    geometry.computeVertexNormals();
  } else if (!geometry.attributes.normal) {
    geometry.computeVertexNormals();
  }

  return geometry;
}

/**
 * Fusiona geometrías locales (con o sin índice) preservando position, normal, uv, color y atributos custom.
 */
function mergeAnatomyGeometries(geos) {
  let vTotal = 0;
  let iTotal = 0;
  const prepared = [];

  for (const raw of geos) {
    const g = raw;
    if (!g.attributes.normal) g.computeVertexNormals();
    initCharacterVertexAttributes(g);
    const pos = g.attributes.position;
    const count = pos.count;
    const idx = g.index ? g.index.array : null;
    prepared.push({
      g,
      count,
      idx,
      hasColor: Boolean(g.attributes.color)
    });
    vTotal += count;
    iTotal += idx ? idx.length : count;
  }

  const posOut = new Float32Array(vTotal * 3);
  const nrmOut = new Float32Array(vTotal * 3);
  const uvOut = new Float32Array(vTotal * 2);
  const colOut = new Float32Array(vTotal * 3);
  const smoothOut = new Float32Array(vTotal * 3);
  const swayOut = new Float32Array(vTotal);
  const phaseOut = new Float32Array(vTotal);
  const idxOut = new Uint32Array(iTotal);

  let vo = 0;
  let io = 0;
  for (const item of prepared) {
    const { g, count, idx } = item;
    posOut.set(g.attributes.position.array.subarray(0, count * 3), vo * 3);
    nrmOut.set(g.attributes.normal.array.subarray(0, count * 3), vo * 3);
    if (g.attributes.uv) {
      uvOut.set(g.attributes.uv.array.subarray(0, count * 2), vo * 2);
    }
    if (g.attributes.color) {
      colOut.set(g.attributes.color.array.subarray(0, count * 3), vo * 3);
    } else {
      colOut.fill(1.0, vo * 3, (vo + count) * 3);
    }
    smoothOut.set(g.attributes.aSmoothNormal.array.subarray(0, count * 3), vo * 3);
    swayOut.set(g.attributes.aSwayWeight.array.subarray(0, count), vo);
    phaseOut.set(g.attributes.aStrandPhase.array.subarray(0, count), vo);

    if (idx) {
      for (let k = 0; k < idx.length; k++) idxOut[io++] = idx[k] + vo;
    } else {
      for (let k = 0; k < count; k++) idxOut[io++] = vo + k;
    }
    vo += count;
    g.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(posOut, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nrmOut, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvOut, 2));
  merged.setAttribute('color', new THREE.BufferAttribute(colOut, 3));
  merged.setAttribute('aSmoothNormal', new THREE.BufferAttribute(smoothOut, 3));
  merged.setAttribute('aSwayWeight', new THREE.BufferAttribute(swayOut, 1));
  merged.setAttribute('aStrandPhase', new THREE.BufferAttribute(phaseOut, 1));
  merged.setIndex(new THREE.BufferAttribute(idxOut, 1));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Construye una extremidad o segmento anatómico orgánico mediante secciones elípticas
 * asimétricas interpoladas con Catmull-Rom, UVs limpias [0..1] y Vertex AO horneado.
 *
 * @param {Array<[number, number, number, number, number, number?]>} rings
 *   Cada anillo: [y, zOffset, rx, rzFront, rzBack, twist?]
 * @param {number} radialSegs
 * @param {object} [options]
 * @returns {THREE.BufferGeometry}
 */
export function createLoftedLimb(rings, radialSegs = 16, options = {}) {
  const {
    resampleSteps = Math.max(rings.length, 14),
    aoStrength = SOFT_AO_DEFAULTS.aoStrength,
    minAO = SOFT_AO_DEFAULTS.minAO,
    shadowTint = SOFT_AO_DEFAULTS.shadowTint,
    shadowTintStrength = SOFT_AO_DEFAULTS.shadowTintStrength,
    baseWeight = SOFT_AO_DEFAULTS.baseWeight,
    cavityWeight = SOFT_AO_DEFAULTS.cavityWeight,
    undersideWeight = SOFT_AO_DEFAULTS.undersideWeight,
    ridgeHighlight = SOFT_AO_DEFAULTS.ridgeHighlight,
    noiseStrength = SOFT_AO_DEFAULTS.noiseStrength,
    baseColor = 0xffffff,
    topColor = 0xffffff,
    pinchAxis = 0.0,
    pinchFreq = 2.0
  } = options;

  const sampled = resampleRings(rings, resampleSteps);
  const n = sampled.length;
  const positions = [];
  const uvs = [];
  const indices = [];
  const starts = [];

  for (let i = 0; i < n; i++) {
    const r = sampled[i];
    const y = r[0];
    const zOff = r[1];
    const rx = r[2];
    const rzF = r[3];
    const rzB = r[4];
    const twist = r[5] ?? 0;
    const vCoord = i / (n - 1);
    const pole = rx < 1e-4 && rzF < 1e-4 && rzB < 1e-4;
    starts.push({ start: positions.length / 3, pole });

    if (pole) {
      positions.push(0, y, zOff);
      uvs.push(0.5, vCoord);
    } else {
      for (let j = 0; j <= radialSegs; j++) {
        const uCoord = j / radialSegs;
        const ang = (uCoord - 0.5) * TAU + twist;
        const sa = Math.sin(ang);
        const ca = Math.cos(ang);
        const rz = ca >= 0 ? rzF : rzB;
        const mod = pinchAxis !== 0 ? (1.0 + pinchAxis * Math.cos(ang * pinchFreq)) : 1.0;
        positions.push(sa * rx * mod, y, zOff + ca * rz * mod);
        uvs.push(uCoord, vCoord);
      }
    }
  }

  for (let i = 0; i < n - 1; i++) {
    const A = starts[i];
    const B = starts[i + 1];
    if (A.pole && B.pole) continue;
    for (let j = 0; j < radialSegs; j++) {
      if (A.pole) {
        indices.push(A.start, B.start + j + 1, B.start + j);
      } else if (B.pole) {
        indices.push(A.start + j, A.start + j + 1, B.start);
      } else {
        const a0 = A.start + j;
        const a1 = a0 + 1;
        const b0 = B.start + j;
        const b1 = b0 + 1;
        indices.push(a0, a1, b0, a1, b1, b0);
      }
    }
  }

  const ascending = n < 2 || sampled[n - 1][0] >= sampled[0][0];
  const zOffInterp = (y) => {
    if (n === 0) return 0;
    if (n === 1) return sampled[0][1];
    if (ascending) {
      if (y <= sampled[0][0]) return sampled[0][1];
      if (y >= sampled[n - 1][0]) return sampled[n - 1][1];
      for (let i = 0; i < n - 1; i++) {
        const yA = sampled[i][0];
        const yB = sampled[i + 1][0];
        if (y >= yA && y <= yB) {
          const span = yB - yA;
          const t = Math.abs(span) > 1e-6 ? (y - yA) / span : 0;
          return sampled[i][1] + (sampled[i + 1][1] - sampled[i][1]) * t;
        }
      }
    } else {
      if (y >= sampled[0][0]) return sampled[0][1];
      if (y <= sampled[n - 1][0]) return sampled[n - 1][1];
      for (let i = 0; i < n - 1; i++) {
        const yA = sampled[i][0];
        const yB = sampled[i + 1][0];
        if (y <= yA && y >= yB) {
          const span = yB - yA;
          const t = Math.abs(span) > 1e-6 ? (y - yA) / span : 0;
          return sampled[i][1] + (sampled[i + 1][1] - sampled[i][1]) * t;
        }
      }
    }
    return sampled[n - 1][1];
  };
  const axisCenterFn = (c, out) => out.set(0, c.y, zOffInterp(c.y));

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  ensureOutwardWinding(geo, axisCenterFn);

  bakeSoftVertexAO(geo, {
    baseColor,
    topColor,
    aoStrength,
    minAO,
    shadowTint,
    shadowTintStrength,
    baseWeight,
    cavityWeight,
    undersideWeight,
    ridgeHighlight,
    noiseStrength
  });
  initCharacterVertexAttributes(geo, 0, 0);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Esculpe el torso anatómico estilizado (6.5–7 cabezas) con cuello/clavículas suaves,
 * cintura tipo corsé y pelvis equilibrada sin primitivas rígidas.
 * @param {'female'|'male'} archetype
 * @param {object} [options]
 * @returns {THREE.BufferGeometry}
 */
export function createSculptedTorso(archetype = 'female', options = {}) {
  const isMale = archetype === 'male';
  // Anillos: [y, zOff, rx, rzFront, rzBack]
  const rings = isMale
    ? [
        [0.888, 0.000, 0.000, 0.000, 0.000],
        [0.898, -0.002, 0.118, 0.088, 0.096],
        [0.955, 0.002, 0.140, 0.098, 0.104],
        [1.040, 0.006, 0.132, 0.092, 0.094],
        [1.125, 0.008, 0.138, 0.098, 0.096],
        [1.235, 0.010, 0.166, 0.116, 0.102],
        [1.345, 0.006, 0.194, 0.118, 0.104],
        [1.418, -0.002, 0.178, 0.096, 0.090],
        [1.462, -0.006, 0.072, 0.064, 0.064],
        [1.475, -0.008, 0.000, 0.000, 0.000]
      ]
    : [
        [0.860, 0.000, 0.000, 0.000, 0.000],
        [0.874, -0.004, 0.112, 0.084, 0.096],
        [0.935, 0.000, 0.132, 0.092, 0.105],
        [1.035, 0.008, 0.092, 0.070, 0.074],
        [1.120, 0.012, 0.106, 0.082, 0.080],
        [1.215, 0.016, 0.130, 0.106, 0.084],
        [1.275, 0.010, 0.142, 0.094, 0.082],
        [1.335, 0.002, 0.152, 0.074, 0.072],
        [1.372, -0.004, 0.068, 0.056, 0.056],
        [1.392, -0.006, 0.000, 0.000, 0.000]
      ];

  return createLoftedLimb(rings, 24, {
    resampleSteps: 22,
    pinchAxis: isMale ? -0.02 : -0.035,
    pinchFreq: 2.0,
    ...options
  });
}

/**
 * Construye cuello estilizado continuo con suave transición trapecio/clavícula
 * y penetración profunda en torso y base craneal (> 2.5 cm).
 */
function createSculptedNeck(archetype = 'female') {
  const isMale = archetype === 'male';
  const rings = isMale
    ? [
        [1.422, -0.006, 0.000, 0.000, 0.000],
        [1.430, -0.006, 0.084, 0.070, 0.070],
        [1.480, -0.004, 0.062, 0.058, 0.058],
        [1.535, -0.001, 0.052, 0.051, 0.051],
        [1.610, 0.003, 0.051, 0.050, 0.050],
        [1.665, 0.005, 0.052, 0.051, 0.051],
        [1.678, 0.006, 0.000, 0.000, 0.000]
      ]
    : [
        [1.332, -0.006, 0.000, 0.000, 0.000],
        [1.340, -0.006, 0.072, 0.060, 0.060],
        [1.385, -0.005, 0.052, 0.046, 0.048],
        [1.425, -0.002, 0.039, 0.039, 0.040],
        [1.495, 0.001, 0.038, 0.038, 0.038],
        [1.560, 0.004, 0.040, 0.040, 0.040],
        [1.572, 0.005, 0.000, 0.000, 0.000]
      ];
  return createLoftedLimb(rings, 16, {
    resampleSteps: 14,
    aoStrength: 0.08,
    minAO: 0.86
  });
}

/**
 * Construye una mano estilizada esculpida (palma lofted + pulgar separado + bloque de dedos grácil).
 * @param {1|-1} side +1 para mano izquierda (+X), -1 para derecha (-X)
 * @param {'female'|'male'} archetype
 * @returns {THREE.BufferGeometry}
 */
export function createSculptedHand(side = 1, archetype = 'female') {
  const s = archetype === 'male' ? 1.12 : 1.0;

  // Palma grácil afinada desde muñeca hacia nudillos
  const palm = createLoftedLimb([
    [0.016 * s, 0.000, 0.000, 0.000, 0.000],
    [0.006 * s, 0.000, 0.0175 * s, 0.013 * s, 0.013 * s],
    [-0.018 * s, 0.002 * s, 0.022 * s, 0.012 * s, 0.011 * s],
    [-0.042 * s, 0.004 * s, 0.021 * s, 0.010 * s, 0.010 * s],
    [-0.050 * s, 0.004 * s, 0.000, 0.000, 0.000]
  ], 12, { resampleSteps: 9 });

  // Bloque de dedos ligeramente curvado hacia el interior (pose relajada / agarre suave de riendas)
  const fingers = createLoftedLimb([
    [-0.034 * s, 0.004 * s, 0.000, 0.000, 0.000],
    [-0.038 * s, 0.005 * s, 0.019 * s, 0.009 * s, 0.009 * s],
    [-0.062 * s, 0.002 * s, 0.017 * s, 0.008 * s, 0.008 * s],
    [-0.084 * s, -0.006 * s, 0.012 * s, 0.006 * s, 0.006 * s],
    [-0.095 * s, -0.012 * s, 0.000, 0.000, 0.000]
  ], 14, { resampleSteps: 10 });
  fingers.translate(-side * 0.0025 * s, 0, 0);

  // Pulgar separado orientado hacia adelante/interior
  const thumb = createLoftedLimb([
    [0.002 * s, 0.000, 0.000, 0.000, 0.000],
    [-0.008 * s, 0.000, 0.0075 * s, 0.0075 * s, 0.0075 * s],
    [-0.024 * s, 0.002 * s, 0.0068 * s, 0.0068 * s, 0.0068 * s],
    [-0.038 * s, 0.001 * s, 0.0048 * s, 0.0048 * s, 0.0048 * s],
    [-0.044 * s, 0.000, 0.000, 0.000, 0.000]
  ], 10, { resampleSteps: 8 });
  thumb.rotateZ(side * -0.45);
  thumb.rotateX(-0.35);
  thumb.translate(-side * 0.016 * s, -0.014 * s, 0.012 * s);

  const merged = mergeAnatomyGeometries([palm, fingers, thumb]);
  ensureOutwardWinding(merged);
  bakeSoftVertexAO(merged);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Construye calzado esculpido (zapatilla real estilizada o bota de montar moldeada)
 * con la suela exactamente apoyada en y = -0.05 (femenino) o y = -0.06 (masculino) desde el tobillo.
 *
 * @param {'female'|'male'} archetype
 * @param {'heel'|'boot'} [style='heel']
 * @returns {THREE.BufferGeometry}
 */
export function createSculptedFoot(archetype = 'female', style = 'heel') {
  const isMale = archetype === 'male';
  const isBoot = style === 'boot' || isMale;
  const soleY = isMale ? -0.060 : -0.050;
  let merged;

  if (isBoot) {
    // Bota estilizada de montar: empeine esculpido + punta fina + suela y tacón definidos
    const bootUpper = createLoftedLimb([
      [0.025, 0.000, 0.000, 0.000, 0.000],
      [0.018, 0.000, 0.041, 0.044, 0.046],
      [-0.010, 0.015, 0.042, 0.056, 0.046],
      [-0.036, 0.038, 0.041, 0.088, 0.054],
      [-0.048, 0.045, 0.038, 0.095, 0.052],
      [-0.054, 0.048, 0.000, 0.000, 0.000]
    ], 16, { resampleSteps: 10 });

    const heel = createLoftedLimb([
      [-0.028, -0.025, 0.000, 0.000, 0.000],
      [-0.034, -0.025, 0.028, 0.028, 0.028],
      [soleY + 0.003, -0.025, 0.026, 0.026, 0.026],
      [soleY, -0.025, 0.000, 0.000, 0.000]
    ], 12, { resampleSteps: 6 });

    const toeCap = createLoftedLimb([
      [-0.036, 0.092, 0.000, 0.000, 0.000],
      [-0.040, 0.092, 0.032, 0.046, 0.036],
      [soleY + 0.004, 0.096, 0.030, 0.048, 0.034],
      [soleY, 0.096, 0.000, 0.000, 0.000]
    ], 14, { resampleSteps: 6 });

    merged = mergeAnatomyGeometries([bootUpper, heel, toeCap]);
  } else {
    // Zapatilla real de salón para damas: horma delicada, punta almendrada y tacón bajo grácil
    const vamp = createLoftedLimb([
      [0.004, 0.012, 0.000, 0.000, 0.000],
      [-0.006, 0.020, 0.033, 0.052, 0.042],
      [-0.026, 0.038, 0.035, 0.082, 0.046],
      [-0.042, 0.045, 0.033, 0.088, 0.044],
      [soleY + 0.004, 0.046, 0.028, 0.082, 0.040],
      [soleY, 0.046, 0.000, 0.000, 0.000]
    ], 16, { resampleSteps: 10 });

    const heel = createLoftedLimb([
      [-0.018, -0.028, 0.000, 0.000, 0.000],
      [-0.025, -0.028, 0.016, 0.016, 0.016],
      [soleY + 0.003, -0.030, 0.012, 0.012, 0.012],
      [soleY, -0.030, 0.000, 0.000, 0.000]
    ], 10, { resampleSteps: 6 });

    merged = mergeAnatomyGeometries([vamp, heel]);
  }

  // Garantiza apoyo estricto de la suela en soleY y winding exterior
  const pos = merged.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < soleY) pos.setY(i, soleY);
  }
  pos.needsUpdate = true;
  ensureOutwardWinding(merged);
  bakeSoftVertexAO(merged);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function createJointSphere(radius, widthSegments = 14, heightSegments = 10) {
  const geo = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
  ensureOutwardWinding(geo);
  bakeSoftVertexAO(geo, { aoStrength: 0.08, minAO: 0.86 });
  initCharacterVertexAttributes(geo, 0, 0);
  return geo;
}

function makePivot(parent, x, y, z) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const inner = new THREE.Group();
  inner.position.set(-x, -y, -z);
  pivot.add(inner);
  parent.add(pivot);
  return [pivot, inner];
}

/**
 * Construye la jerarquía esquelética estilizada completa compatible con CharacterRig,
 * HorseSystem.js y BlackjackDealer (CasinoDomeBuilder.js).
 *
 * @param {'female'|'male'} archetype
 * @param {object} [options]
 * @returns {{
 *   pivots: object,
 *   meshes: object,
 *   metrics: object,
 *   geometries: THREE.BufferGeometry[]
 * }}
 */
export function buildStylizedSkeleton(archetype = 'female', options = {}) {
  const isMale = archetype === 'male';
  const metrics = ANATOMY_METRICS[isMale ? 'male' : 'female'];
  const mats = options.materials || {};
  const geometries = [];
  const track = (g) => {
    geometries.push(g);
    return g;
  };

  const root = new THREE.Group();
  root.userData.isCharacter = true;
  root.rotation.order = 'YXZ';

  // root.children[0] DEBE ser bodyGroup (contrato BlackjackDealer.#findBones)
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  // spine en y = 1.00 con spineInner = spine.children[0] en (0, -1.00, 0)
  const [spine, spineInner] = makePivot(bodyGroup, 0, metrics.spineY, 0);
  const [skirtPivot, skirtInner] = makePivot(bodyGroup, 0, metrics.waistY, 0);
  skirtPivot.name = 'skirtGroup';

  const chest = new THREE.Group();
  chest.position.set(0, metrics.chestY, 0);
  spineInner.add(chest);

  const neck = new THREE.Group();
  neck.position.set(0, metrics.neckBaseY, 0);
  spineInner.add(neck);

  const pelvis = new THREE.Group();
  pelvis.position.set(0, metrics.hipY, 0);
  bodyGroup.add(pelvis);

  // Torso y cuello anatómicos esculpidos
  const torsoGeo = track(createSculptedTorso(metrics.archetype));
  const torsoMat = isMale ? (mats.primary || mats.skin) : (mats.primary || mats.skin);
  const torsoMesh = new THREE.Mesh(torsoGeo, torsoMat);
  torsoMesh.castShadow = true;
  torsoMesh.receiveShadow = true;
  spineInner.add(torsoMesh);

  const neckGeo = track(createSculptedNeck(metrics.archetype));
  const neckMesh = new THREE.Mesh(neckGeo, mats.skin);
  neckMesh.castShadow = true;
  neckMesh.receiveShadow = true;
  spineInner.add(neckMesh);

  // Piernas lofted orgánicas: muslo -> rodilla suavizada -> pantorrilla -> calzado en y = 0
  const thighLen = metrics.thighLen;
  const shinLen = metrics.shinLen;
  const thighRings = isMale
    ? [
        [0.032, 0.000, 0.000, 0.000, 0.000],
        [0.015, 0.000, 0.072, 0.074, 0.078],
        [-0.14, 0.004, 0.068, 0.070, 0.072],
        [-0.30, 0.003, 0.056, 0.058, 0.058],
        [-thighLen, 0.000, 0.052, 0.052, 0.051],
        [-thighLen - 0.025, 0.000, 0.000, 0.000, 0.000]
      ]
    : [
        [0.030, 0.000, 0.000, 0.000, 0.000],
        [0.012, 0.000, 0.062, 0.064, 0.070],
        [-0.13, 0.004, 0.059, 0.062, 0.065],
        [-0.29, 0.002, 0.047, 0.049, 0.049],
        [-thighLen, 0.000, 0.043, 0.044, 0.043],
        [-thighLen - 0.022, 0.000, 0.000, 0.000, 0.000]
      ];
  const shinRings = isMale
    ? [
        [0.025, 0.000, 0.000, 0.000, 0.000],
        [0.004, 0.002, 0.052, 0.054, 0.052],
        [-0.14, -0.005, 0.054, 0.052, 0.062],
        [-0.30, -0.004, 0.043, 0.044, 0.046],
        [-shinLen, 0.000, 0.038, 0.040, 0.040],
        [-shinLen - 0.018, 0.000, 0.000, 0.000, 0.000]
      ]
    : [
        [0.022, 0.000, 0.000, 0.000, 0.000],
        [0.004, 0.002, 0.043, 0.044, 0.043],
        [-0.13, -0.005, 0.045, 0.042, 0.053],
        [-0.29, -0.003, 0.033, 0.034, 0.036],
        [-shinLen, 0.000, 0.029, 0.031, 0.031],
        [-shinLen - 0.016, 0.000, 0.000, 0.000, 0.000]
      ];

  const thighGeo = track(createLoftedLimb(thighRings, 16, { resampleSteps: 14 }));
  const shinLoft = createLoftedLimb(shinRings, 16, { resampleSteps: 14 });
  const kneeSphere = createJointSphere(isMale ? 0.052 : 0.043, 14, 10);
  const shinGeo = track(mergeAnatomyGeometries([shinLoft, kneeSphere]));
  const shoeGeo = track(createSculptedFoot(metrics.archetype, isMale ? 'boot' : 'heel'));

  const thighL = new THREE.Group();
  const thighR = new THREE.Group();
  thighL.position.set(metrics.hipHalfW, metrics.hipY, 0);
  thighR.position.set(-metrics.hipHalfW, metrics.hipY, 0);

  const thighMeshes = [];
  const shinMeshes = [];
  const shoeMeshes = [];
  let shinL = null;
  let shinR = null;
  let footL = null;
  let footR = null;

  [thighL, thighR].forEach((legGroup, idx) => {
    const thighMat = isMale ? (mats.secondary || mats.dark) : mats.skin;
    const thigh = new THREE.Mesh(thighGeo, thighMat);
    thigh.castShadow = true;
    thigh.receiveShadow = true;
    legGroup.add(thigh);

    const shinGroup = new THREE.Group();
    shinGroup.position.set(0, -thighLen, 0);
    const shinMat = isMale ? (mats.dark || mats.secondary) : mats.skin;
    const shin = new THREE.Mesh(shinGeo, shinMat);
    shin.castShadow = true;
    shin.receiveShadow = true;
    shinGroup.add(shin);

    const footPivot = new THREE.Group();
    footPivot.position.set(0, -shinLen, 0);
    const shoeMat = isMale ? (mats.dark || mats.roseGold) : (mats.roseGold || mats.dark);
    const shoe = new THREE.Mesh(shoeGeo, shoeMat);
    shoe.castShadow = true;
    shoe.receiveShadow = true;
    footPivot.add(shoe);
    shinGroup.add(footPivot);

    legGroup.add(shinGroup);
    bodyGroup.add(legGroup);

    thighMeshes.push(thigh);
    shinMeshes.push(shin);
    shoeMeshes.push(shoe);

    if (idx === 0) {
      shinL = shinGroup;
      footL = footPivot;
    } else {
      shinR = shinGroup;
      footR = footPivot;
    }
  });

  // Brazos lofted orgánicos con manos esculpidas (deltoides -> bíceps -> antebrazo -> muñeca -> mano)
  const upperLen = metrics.upperArmLen;
  const foreLen = metrics.forearmLen;
  const upperArmRings = isMale
    ? [
        [0.036, 0.000, 0.000, 0.000, 0.000],
        [0.012, 0.000, 0.055, 0.055, 0.055],
        [-0.08, 0.000, 0.049, 0.050, 0.050],
        [-0.20, 0.000, 0.043, 0.044, 0.044],
        [-upperLen, 0.000, 0.040, 0.040, 0.040],
        [-upperLen - 0.020, 0.000, 0.000, 0.000, 0.000]
      ]
    : [
        [0.032, 0.000, 0.000, 0.000, 0.000],
        [0.010, 0.000, 0.041, 0.041, 0.041],
        [-0.07, 0.000, 0.0355, 0.036, 0.036],
        [-0.18, 0.000, 0.0305, 0.031, 0.031],
        [-upperLen, 0.000, 0.0285, 0.0285, 0.0285],
        [-upperLen - 0.016, 0.000, 0.000, 0.000, 0.000]
      ];
  const forearmRings = isMale
    ? [
        [0.024, 0.000, 0.000, 0.000, 0.000],
        [0.004, 0.000, 0.040, 0.040, 0.040],
        [-0.09, 0.002, 0.039, 0.039, 0.039],
        [-0.20, 0.001, 0.031, 0.030, 0.030],
        [-foreLen, 0.000, 0.026, 0.023, 0.023],
        [-foreLen - 0.014, 0.000, 0.000, 0.000, 0.000]
      ]
    : [
        [0.020, 0.000, 0.000, 0.000, 0.000],
        [0.004, 0.000, 0.0285, 0.0285, 0.0285],
        [-0.08, 0.002, 0.0275, 0.0275, 0.0275],
        [-0.18, 0.001, 0.0225, 0.0215, 0.0215],
        [-foreLen, 0.000, 0.0195, 0.0165, 0.0165],
        [-foreLen - 0.012, 0.000, 0.000, 0.000, 0.000]
      ];

  const deltoidGeo = track(createJointSphere(isMale ? 0.055 : 0.043, 14, 12));
  const upperArmGeo = track(createLoftedLimb(upperArmRings, 14, { resampleSteps: 12 }));
  const forearmLoft = createLoftedLimb(forearmRings, 14, { resampleSteps: 12 });
  const elbowSphere = createJointSphere(isMale ? 0.040 : 0.0285, 14, 10);
  const forearmGeo = track(mergeAnatomyGeometries([forearmLoft, elbowSphere]));
  const handGeoL = track(createSculptedHand(1, metrics.archetype));
  const handGeoR = track(createSculptedHand(-1, metrics.archetype));

  const shoulderL = new THREE.Group();
  const shoulderR = new THREE.Group();
  shoulderL.position.set(metrics.shoulderWidth, metrics.shoulderY, 0);
  shoulderR.position.set(-metrics.shoulderWidth, metrics.shoulderY, 0);

  const armMeshes = [];
  const handMeshes = [];
  let upperArmL = null;
  let upperArmR = null;
  let forearmL = null;
  let forearmR = null;
  let handL = null;
  let handR = null;

  [shoulderL, shoulderR].forEach((armGroup, idx) => {
    const side = idx === 0 ? 1 : -1;
    const armMat = isMale ? (mats.primary || mats.skin) : mats.skin;

    const deltoid = new THREE.Mesh(deltoidGeo, armMat);
    deltoid.position.set(-side * 0.012, 0, 0);
    deltoid.castShadow = true;
    deltoid.receiveShadow = true;
    armGroup.add(deltoid);

    const upper = new THREE.Mesh(upperArmGeo, armMat);
    upper.castShadow = true;
    upper.receiveShadow = true;
    armGroup.add(upper);

    // forearm DEBE ser hijo directo de shoulder con position.y === -0.27 (femenino)
    const forearm = new THREE.Group();
    forearm.position.set(0, -upperLen, 0);
    forearm.rotation.set(-0.22, 0, side * 0.08);

    const lower = new THREE.Mesh(forearmGeo, armMat);
    lower.castShadow = true;
    lower.receiveShadow = true;
    forearm.add(lower);

    const handPivot = new THREE.Group();
    handPivot.position.set(0, -foreLen, 0);
    const hand = new THREE.Mesh(idx === 0 ? handGeoL : handGeoR, mats.skin);
    hand.castShadow = false;
    hand.receiveShadow = true;
    handPivot.add(hand);
    forearm.add(handPivot);

    armGroup.add(forearm);
    spineInner.add(armGroup);

    armMeshes.push(deltoid, upper, lower);
    handMeshes.push(hand);

    if (idx === 0) {
      upperArmL = upper;
      forearmL = forearm;
      handL = handPivot;
    } else {
      upperArmR = upper;
      forearmR = forearm;
      handR = handPivot;
    }
  });

  // Cabeza, cabello y corona (headGroup se añade a spineInner en CharacterRig)
  const head = new THREE.Group();
  head.position.set(0, metrics.headY, 0);
  const hairRoot = new THREE.Group();
  head.add(hairRoot);
  const crownAnchor = new THREE.Group();
  crownAnchor.position.set(0, metrics.headRadius * 1.05, 0);
  head.add(crownAnchor);

  return {
    pivots: {
      root,
      bodyGroup,
      pelvis,
      spine,
      spineInner,
      chest,
      neck,
      head,
      hairRoot,
      crownAnchor,
      skirtPivot,
      skirtInner,
      shoulderL,
      shoulderR,
      upperArmL,
      upperArmR,
      forearmL,
      forearmR,
      handL,
      handR,
      thighL,
      thighR,
      shinL,
      shinR,
      footL,
      footR
    },
    meshes: {
      torso: torsoMesh,
      neck: neckMesh,
      armMeshes,
      handMeshes,
      thighMeshes,
      shinMeshes,
      shoeMeshes
    },
    metrics,
    geometries
  };
}
