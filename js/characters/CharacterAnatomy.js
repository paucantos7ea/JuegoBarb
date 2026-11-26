import * as THREE from 'three';
import { bakeProceduralVertexAO } from '../core/LumenArtPipeline.js';

const TAU = Math.PI * 2;
const _tmpV = new THREE.Vector3();
const _tmpA = new THREE.Vector3();
const _tmpB = new THREE.Vector3();
const _tmpC = new THREE.Vector3();

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
 * Garantiza normales orientadas hacia el exterior de la malla lofted.
 */
function ensureOutwardWinding(geometry, rings) {
  const pos = geometry.attributes.position;
  const nrm = geometry.attributes.normal;
  const mid = rings[Math.floor(rings.length * 0.5)];
  let score = 0;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (Math.abs(y - mid[0]) > 0.18) continue;
    const dx = pos.getX(i);
    const dz = pos.getZ(i) - mid[1];
    score += dx * nrm.getX(i) + dz * nrm.getZ(i);
  }
  if (score < 0 && geometry.index) {
    const arr = geometry.index.array;
    for (let i = 0; i < arr.length; i += 3) {
      const tmp = arr[i + 1];
      arr[i + 1] = arr[i + 2];
      arr[i + 2] = tmp;
    }
    geometry.index.needsUpdate = true;
    geometry.computeVertexNormals();
  }
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
    aoStrength = 0.24,
    shadowTint = 0x522a3a,
    shadowTintStrength = 0.30,
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
        const ang = uCoord * TAU + twist;
        const sa = Math.sin(ang);
        const ca = Math.cos(ang);
        const rz = ca >= 0 ? rzF : rzB;
        const mod = pinchAxis !== 0 ? (1.0 + pinchAxis * Math.cos(ang * pinchFreq)) : 1.0;
        positions.push(sa * rx * mod, y, zOff + ca * rz * mod);
        uvs.push(uCoord, vCoord);
      }
    }
  }

  const stride = radialSegs + 1;
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

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  ensureOutwardWinding(geo, sampled);

  bakeProceduralVertexAO(geo, {
    baseColor,
    topColor,
    aoStrength,
    minAO: 0.56,
    shadowTint,
    shadowTintStrength,
    ridgeHighlight: 0.05,
    noiseStrength: 0.02,
    baseWeight: 0.34,
    cavityWeight: 0.32,
    undersideWeight: 0.24
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
        [1.215, 0.016, 0.132, 0.108, 0.084],
        [1.275, 0.012, 0.138, 0.104, 0.084],
        [1.342, 0.002, 0.136, 0.078, 0.076],
        [1.376, -0.004, 0.056, 0.048, 0.048],
        [1.390, -0.006, 0.000, 0.000, 0.000]
      ];

  return createLoftedLimb(rings, 24, {
    resampleSteps: 22,
    aoStrength: 0.25,
    shadowTint: 0x452248,
    shadowTintStrength: 0.32,
    pinchAxis: isMale ? -0.02 : -0.035,
    pinchFreq: 2.0,
    ...options
  });
}

/**
 * Construye cuello estilizado continuo con suave transición trapecio/clavícula.
 */
function createSculptedNeck(archetype = 'female') {
  const isMale = archetype === 'male';
  const rings = isMale
    ? [
        [1.455, -0.006, 0.000, 0.000, 0.000],
        [1.465, -0.006, 0.068, 0.062, 0.062],
        [1.515, -0.004, 0.054, 0.052, 0.052],
        [1.575, 0.000, 0.051, 0.050, 0.050],
        [1.615, 0.004, 0.052, 0.051, 0.051],
        [1.630, 0.005, 0.000, 0.000, 0.000]
      ]
    : [
        [1.372, -0.006, 0.000, 0.000, 0.000],
        [1.382, -0.006, 0.052, 0.046, 0.048],
        [1.425, -0.003, 0.040, 0.039, 0.040],
        [1.475, 0.000, 0.038, 0.038, 0.038],
        [1.515, 0.003, 0.039, 0.039, 0.039],
        [1.530, 0.004, 0.000, 0.000, 0.000]
      ];
  return createLoftedLimb(rings, 16, {
    resampleSteps: 12,
    aoStrength: 0.16,
    shadowTint: 0x6a3b45,
    shadowTintStrength: 0.25
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
    [0.012 * s, 0.000, 0.000, 0.000, 0.000],
    [0.006 * s, 0.000, 0.016 * s, 0.011 * s, 0.011 * s],
    [-0.018 * s, 0.002 * s, 0.022 * s, 0.012 * s, 0.011 * s],
    [-0.042 * s, 0.004 * s, 0.021 * s, 0.010 * s, 0.010 * s],
    [-0.050 * s, 0.004 * s, 0.000, 0.000, 0.000]
  ], 12, { resampleSteps: 8, aoStrength: 0.16 });

  // Bloque de dedos ligeramente curvado hacia el interior (pose relajada / agarre suave de riendas)
  const fingers = createLoftedLimb([
    [-0.034 * s, 0.004 * s, 0.000, 0.000, 0.000],
    [-0.038 * s, 0.005 * s, 0.019 * s, 0.009 * s, 0.009 * s],
    [-0.062 * s, 0.002 * s, 0.017 * s, 0.008 * s, 0.008 * s],
    [-0.084 * s, -0.006 * s, 0.012 * s, 0.006 * s, 0.006 * s],
    [-0.095 * s, -0.012 * s, 0.000, 0.000, 0.000]
  ], 12, { resampleSteps: 8, aoStrength: 0.18 });
  fingers.translate(-side * 0.003 * s, 0, 0);

  // Pulgar separado orientado hacia adelante/interior
  const thumb = createLoftedLimb([
    [0.000, 0.000, 0.000, 0.000, 0.000],
    [-0.008 * s, 0.000, 0.0075 * s, 0.0075 * s, 0.0075 * s],
    [-0.024 * s, 0.002 * s, 0.0068 * s, 0.0068 * s, 0.0068 * s],
    [-0.038 * s, 0.001 * s, 0.0048 * s, 0.0048 * s, 0.0048 * s],
    [-0.044 * s, 0.000, 0.000, 0.000, 0.000]
  ], 10, { resampleSteps: 7, aoStrength: 0.16 });
  thumb.rotateZ(side * -0.45);
  thumb.rotateX(-0.35);
  thumb.translate(-side * 0.016 * s, -0.014 * s, 0.012 * s);

  const merged = mergeAnatomyGeometries([palm, fingers, thumb]);
  bakeProceduralVertexAO(merged, {
    aoStrength: 0.22,
    minAO: 0.60,
    shadowTint: 0x5c3040,
    shadowTintStrength: 0.26
  });
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

  if (isBoot) {
    // Bota estilizada de montar: empeine esculpido + punta fina + suela y tacón definidos
    const bootUpper = createLoftedLimb([
      [0.025, 0.000, 0.000, 0.000, 0.000],
      [0.018, 0.000, 0.041, 0.044, 0.046],
      [-0.010, 0.015, 0.042, 0.056, 0.046],
      [-0.036, 0.038, 0.041, 0.088, 0.054],
      [-0.048, 0.045, 0.038, 0.095, 0.052],
      [-0.054, 0.048, 0.000, 0.000, 0.000]
    ], 16, { resampleSteps: 10, aoStrength: 0.26, shadowTint: 0x201532 });

    const heel = createLoftedLimb([
      [-0.028, -0.025, 0.000, 0.000, 0.000],
      [-0.034, -0.025, 0.028, 0.028, 0.028],
      [soleY + 0.003, -0.025, 0.026, 0.026, 0.026],
      [soleY, -0.025, 0.000, 0.000, 0.000]
    ], 12, { resampleSteps: 6, aoStrength: 0.28, shadowTint: 0x181028 });

    const toeCap = createLoftedLimb([
      [-0.036, 0.092, 0.000, 0.000, 0.000],
      [-0.040, 0.092, 0.032, 0.046, 0.036],
      [soleY + 0.004, 0.096, 0.030, 0.048, 0.034],
      [soleY, 0.096, 0.000, 0.000, 0.000]
    ], 14, { resampleSteps: 6, aoStrength: 0.24, shadowTint: 0x1e1430 });

    return mergeAnatomyGeometries([bootUpper, heel, toeCap]);
  }

  // Zapatilla real de salón para damas: horma delicada, punta almendrada y tacón bajo grácil
  const vamp = createLoftedLimb([
    [-0.002, 0.015, 0.000, 0.000, 0.000],
    [-0.008, 0.022, 0.034, 0.056, 0.044],
    [-0.026, 0.038, 0.036, 0.082, 0.048],
    [-0.042, 0.045, 0.034, 0.088, 0.046],
    [soleY + 0.004, 0.046, 0.028, 0.082, 0.040],
    [soleY, 0.046, 0.000, 0.000, 0.000]
  ], 16, { resampleSteps: 10, aoStrength: 0.24, shadowTint: 0x422040 });

  const heel = createLoftedLimb([
    [-0.020, -0.028, 0.000, 0.000, 0.000],
    [-0.025, -0.028, 0.016, 0.016, 0.016],
    [soleY + 0.003, -0.030, 0.012, 0.012, 0.012],
    [soleY, -0.030, 0.000, 0.000, 0.000]
  ], 10, { resampleSteps: 6, aoStrength: 0.26, shadowTint: 0x351a38 });

  return mergeAnatomyGeometries([vamp, heel]);
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
        [-thighLen, 0.000, 0.050, 0.052, 0.050],
        [-thighLen - 0.025, 0.000, 0.000, 0.000, 0.000]
      ]
    : [
        [0.030, 0.000, 0.000, 0.000, 0.000],
        [0.012, 0.000, 0.062, 0.064, 0.070],
        [-0.13, 0.004, 0.059, 0.062, 0.065],
        [-0.29, 0.002, 0.047, 0.049, 0.049],
        [-thighLen, 0.000, 0.042, 0.044, 0.042],
        [-thighLen - 0.022, 0.000, 0.000, 0.000, 0.000]
      ];
  const shinRings = isMale
    ? [
        [0.025, 0.000, 0.000, 0.000, 0.000],
        [0.004, 0.002, 0.051, 0.054, 0.051],
        [-0.14, -0.005, 0.054, 0.052, 0.062],
        [-0.30, -0.004, 0.043, 0.044, 0.046],
        [-shinLen, 0.000, 0.038, 0.040, 0.040],
        [-shinLen - 0.018, 0.000, 0.000, 0.000, 0.000]
      ]
    : [
        [0.022, 0.000, 0.000, 0.000, 0.000],
        [0.004, 0.002, 0.042, 0.044, 0.042],
        [-0.13, -0.005, 0.045, 0.042, 0.053],
        [-0.29, -0.003, 0.033, 0.034, 0.036],
        [-shinLen, 0.000, 0.029, 0.031, 0.031],
        [-shinLen - 0.016, 0.000, 0.000, 0.000, 0.000]
      ];

  const thighGeo = track(createLoftedLimb(thighRings, 16, { resampleSteps: 14 }));
  const shinGeo = track(createLoftedLimb(shinRings, 16, { resampleSteps: 14 }));
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
        [0.012, 0.000, 0.056, 0.056, 0.056],
        [-0.08, 0.000, 0.049, 0.050, 0.050],
        [-0.20, 0.000, 0.042, 0.043, 0.043],
        [-upperLen, 0.000, 0.038, 0.039, 0.039],
        [-upperLen - 0.022, 0.000, 0.000, 0.000, 0.000]
      ]
    : [
        [0.032, 0.000, 0.000, 0.000, 0.000],
        [0.010, 0.000, 0.040, 0.040, 0.040],
        [-0.07, 0.000, 0.034, 0.035, 0.035],
        [-0.18, 0.000, 0.029, 0.030, 0.030],
        [-upperLen, 0.000, 0.026, 0.027, 0.027],
        [-upperLen - 0.018, 0.000, 0.000, 0.000, 0.000]
      ];
  const forearmRings = isMale
    ? [
        [0.024, 0.000, 0.000, 0.000, 0.000],
        [0.004, 0.000, 0.040, 0.040, 0.040],
        [-0.09, 0.002, 0.038, 0.038, 0.038],
        [-0.20, 0.001, 0.030, 0.029, 0.029],
        [-foreLen, 0.000, 0.026, 0.023, 0.023],
        [-foreLen - 0.014, 0.000, 0.000, 0.000, 0.000]
      ]
    : [
        [0.020, 0.000, 0.000, 0.000, 0.000],
        [0.004, 0.000, 0.028, 0.028, 0.028],
        [-0.08, 0.002, 0.027, 0.027, 0.027],
        [-0.18, 0.001, 0.021, 0.020, 0.020],
        [-foreLen, 0.000, 0.018, 0.015, 0.015],
        [-foreLen - 0.012, 0.000, 0.000, 0.000, 0.000]
      ];

  const upperArmGeo = track(createLoftedLimb(upperArmRings, 14, { resampleSteps: 12 }));
  const forearmGeo = track(createLoftedLimb(forearmRings, 14, { resampleSteps: 12 }));
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

    armMeshes.push(upper, lower);
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
