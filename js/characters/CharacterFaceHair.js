import * as THREE from 'three';
import { bakeProceduralVertexAO } from '../core/LumenArtPipeline.js';
import { initCharacterVertexAttributes, ensureOutwardWinding } from './CharacterAnatomy.js';

export const FACE_UV = Object.freeze({
  eyeUL: 0.375,
  eyeUR: 0.625,
  eyeV: 0.487,
  eyeHalfU: 0.072,
  eyeHalfV: 0.074
});

const TAU = Math.PI * 2;
const _faceTexCache = new Map();
const _tmpP = new THREE.Vector3();
const _tmpN = new THREE.Vector3();
const _tmpB = new THREE.Vector3();
const _tmpT = new THREE.Vector3();
const _tmpA = new THREE.Vector3();
const _tmpE1 = new THREE.Vector3();
const _tmpE2 = new THREE.Vector3();
const _tmpTriN = new THREE.Vector3();
const _tmpC = new THREE.Color();
const _rootCol = new THREE.Color();
const _midCol = new THREE.Color();
const _tipCol = new THREE.Color();

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / Math.max(1e-6, e1 - e0));
  return t * t * (3 - 2 * t);
}

function hexToCss(hex) {
  return '#' + (hex >>> 0).toString(16).padStart(6, '0');
}

function shadeHex(hex, factor) {
  const r = Math.min(255, Math.max(0, Math.round(((hex >> 16) & 0xff) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(((hex >> 8) & 0xff) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((hex & 0xff) * factor)));
  return `rgb(${r},${g},${b})`;
}

/**
 * Esculpe la geometría de cabeza estilizada anime/RPG 3D mirando hacia +Z
 * (cráneo redondeado, mejillas suaves, mandíbula delicada sin picos, nariz sutil y orejas)
 * con proyección UV cilíndrica/frontal simétrica centrada en (0, 0, +1) y aSmoothNormal unitario.
 *
 * @param {'female'|'male'} [archetype='female']
 * @returns {THREE.BufferGeometry}
 */
export function createStylizedHeadGeometry(archetype = 'female') {
  const isMale = archetype === 'male';
  const rx = isMale ? 0.122 : 0.118;
  const ry = isMale ? 0.138 : 0.132;
  const rz = isMale ? 0.124 : 0.120;

  const baseGeo = new THREE.SphereGeometry(1.0, 36, 28);
  const pos = baseGeo.attributes.position;
  const uv = baseGeo.attributes.uv;
  const count = pos.count;

  for (let i = 0; i < count; i++) {
    const nx = pos.getX(i);
    const ny = pos.getY(i);
    const nz = pos.getZ(i);

    let x = nx * rx;
    let y = ny * ry;
    let z = nz * rz;

    // Parte superior del cráneo redondeada y equilibrada
    if (ny > 0.15) {
      const topK = smoothstep(0.15, 0.85, ny);
      x *= 1.0 + topK * 0.035;
      z *= 1.0 + topK * 0.02;
    }

    // Sienes sutilmente recogidas para definir el óvalo facial
    if (nz > 0.1 && ny > 0.0 && ny < 0.55) {
      const temple = Math.exp(-Math.pow((ny - 0.25) / 0.22, 2)) * smoothstep(0.55, 0.92, Math.abs(nx));
      x *= 1.0 - temple * 0.045;
    }

    // Mejillas dulces y pómulos suaves (sin cuencas oculares hundidas)
    if (nz > 0.25 && ny > -0.45 && ny < 0.12) {
      const cheek = Math.exp(-Math.pow((ny + 0.18) / 0.24, 2)) * smoothstep(0.28, 0.78, Math.abs(nx));
      x *= 1.0 + cheek * (isMale ? 0.024 : 0.048);
      z += cheek * (isMale ? 0.004 : 0.008);
    }

    // Puente nasal muy sutil y punta delicada alrededor de x=0, y=-0.024, z>0
    if (nz > 0.70 && Math.abs(x) < 0.020 && y > -0.044 && y < 0.020) {
      const horiz = Math.exp(-Math.pow(x / 0.010, 2));
      const bridge = Math.exp(-Math.pow((y + 0.010) / 0.020, 2));
      const tip = Math.exp(-Math.pow((y + 0.024) / 0.010, 2));
      z += horiz * (bridge * 0.004 + tip * (isMale ? 0.009 : 0.007));
    }

    // Mandíbula suavemente afinada hacia mentón dulce sin picos puntiagudos
    if (ny < -0.05) {
      const jawT = smoothstep(-0.05, -0.95, ny);
      const taper = isMale ? 0.20 : 0.28;
      x *= 1.0 - Math.pow(jawT, 1.15) * taper;
      z *= 1.0 - Math.pow(jawT, 1.35) * (isMale ? 0.04 : 0.06);
      if (nz > 0.25 && Math.abs(x) < 0.045) {
        z += Math.pow(jawT, 1.6) * (1.0 - smoothstep(-0.88, -1.0, ny) * 0.45) * (isMale ? 0.006 : 0.005);
      }
    }

    // Orejas laterales suaves alrededor de z = -0.008
    if (Math.abs(nx) > 0.85 && ny > -0.26 && ny < 0.12 && nz > -0.24 && nz < 0.16) {
      const side = nx > 0 ? 1 : -1;
      const earEnv = Math.exp(-Math.pow((y + 0.010) / 0.022, 2)) * Math.exp(-Math.pow((z + 0.008) / 0.016, 2));
      x += side * earEnv * 0.014;
      z -= earEnv * 0.003;
    }

    pos.setXYZ(i, x, y, z);

    // Proyección UV cilíndrica/frontal estrictamente centrada en (0, 0, +1) sin salto en z = 0
    const frontV = Math.min(0.98, Math.max(0.02, 0.5 + (y / ry) * 0.5));
    if (z > 0.0) {
      const theta = Math.atan2(x, z);
      const u = Math.min(0.98, Math.max(0.02, 0.5 + theta / (Math.PI * 0.92)));
      uv.setXY(i, u, frontV);
    } else {
      const u = x >= 0 ? 0.98 : 0.02;
      const backT = smoothstep(0.0, -0.02, z);
      const v = frontV * (1.0 - backT) + 0.94 * backT;
      uv.setXY(i, u, v);
    }
  }

  baseGeo.computeVertexNormals();
  ensureOutwardWinding(baseGeo);

  // Atributo aSmoothNormal: vector unitario desde el centro de la cabeza (0, -0.005, 0) hacia cada vértice
  const smoothArr = new Float32Array(count * 3);
  const cx = 0.0;
  const cy = -0.005;
  const cz = 0.0;

  for (let i = 0; i < count; i++) {
    const sx = pos.getX(i) - cx;
    const sy = pos.getY(i) - cy;
    const sz = pos.getZ(i) - cz;
    const sl = Math.hypot(sx, sy, sz) || 1.0;
    smoothArr[i * 3] = sx / sl;
    smoothArr[i * 3 + 1] = sy / sl;
    smoothArr[i * 3 + 2] = sz / sl;
  }

  bakeProceduralVertexAO(baseGeo, {
    minAO: 0.90,
    aoStrength: 0.08,
    shadowTint: 0xebb0b2,
    shadowTintStrength: 0.15,
    cavityWeight: 0.0,
    undersideWeight: 0.10,
    noiseStrength: 0.0
  });
  baseGeo.setAttribute('aSmoothNormal', new THREE.BufferAttribute(smoothArr, 3));
  initCharacterVertexAttributes(baseGeo, 0, 0);
  baseGeo.computeBoundingBox();
  baseGeo.computeBoundingSphere();
  return baseGeo;
}

/**
 * Dibuja un ojo anime/RPG 3D multicapa con simetría especular exacta alrededor de cx = 512.
 * En el espacio local espejado (scale(side, 1)), +X siempre es el extremo exterior del ojo.
 */
function drawAnimeEye(ctx, cx, cy, side, opts) {
  const { isMale, eye, skinHex } = opts;
  const ew = isMale ? 52 : 58;
  const eh = isMale ? 38 : 58;

  ctx.save();
  ctx.translate(cx, cy);

  // Parte estructural simétrica respecto a la línea media facial (cx = 512)
  ctx.save();
  ctx.scale(side, 1);

  // 1. Esclerótica limpia #fffaf8 con sombra sutil del párpado superior
  ctx.beginPath();
  ctx.moveTo(-ew * 0.94, eh * 0.12);
  ctx.bezierCurveTo(-ew * 0.48, -eh * 0.92, ew * 0.52, -eh * 0.92, ew * 0.98, eh * 0.04);
  ctx.bezierCurveTo(ew * 0.58, eh * 0.72, -ew * 0.48, eh * 0.74, -ew * 0.94, eh * 0.12);
  ctx.closePath();

  const scleraGrad = ctx.createLinearGradient(0, -eh * 0.85, 0, eh * 0.72);
  scleraGrad.addColorStop(0.0, '#e5dae4');
  scleraGrad.addColorStop(0.24, '#faf3f4');
  scleraGrad.addColorStop(1.0, '#fffaf8');
  ctx.fillStyle = scleraGrad;
  ctx.fill();

  // Clip interior del ojo para iris y pupila
  ctx.save();
  ctx.clip();

  // 2. Iris ovalado con degradado de 4 paradas + media luna inferior + pupila índigo profundo
  const irY = eh * 0.04;
  const irR = isMale ? 29 : 35;
  const irH = isMale ? 32 : 42;

  ctx.save();
  ctx.translate(0, irY);
  ctx.scale(1.0, irH / irR);

  const irisGrad = ctx.createLinearGradient(0, -irR, 0, irR);
  irisGrad.addColorStop(0.0, hexToCss(eye.ring));
  irisGrad.addColorStop(0.40, hexToCss(eye.iris));
  irisGrad.addColorStop(0.76, hexToCss(eye.glow));
  irisGrad.addColorStop(1.0, '#e2f8ff');

  ctx.beginPath();
  ctx.arc(0, 0, irR, 0, TAU);
  ctx.fillStyle = irisGrad;
  ctx.fill();

  // Anillo limbal oscuro exterior
  ctx.lineWidth = 3.6;
  ctx.strokeStyle = shadeHex(eye.ring, 0.55);
  ctx.stroke();

  // Micro-fibras radiales del iris
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * irR * 0.36, Math.sin(a) * irR * 0.36);
    ctx.lineTo(Math.cos(a) * irR * 0.88, Math.sin(a) * irR * 0.88);
    ctx.stroke();
  }

  // Media luna luminosa inferior
  const crescentGrad = ctx.createRadialGradient(0, irR * 0.46, 2, 0, irR * 0.46, irR * 0.60);
  crescentGrad.addColorStop(0, 'rgba(238, 252, 255, 0.88)');
  crescentGrad.addColorStop(0.6, 'rgba(188, 240, 255, 0.40)');
  crescentGrad.addColorStop(1, 'rgba(188, 240, 255, 0.0)');
  ctx.fillStyle = crescentGrad;
  ctx.beginPath();
  ctx.arc(0, irR * 0.42, irR * 0.54, 0, TAU);
  ctx.fill();

  // Pupila índigo profundo
  const pupilGrad = ctx.createRadialGradient(0, -irR * 0.04, 1, 0, -irR * 0.04, irR * 0.40);
  pupilGrad.addColorStop(0, '#0c0a26');
  pupilGrad.addColorStop(0.72, '#181542');
  pupilGrad.addColorStop(1, 'rgba(24, 21, 66, 0.0)');
  ctx.fillStyle = pupilGrad;
  ctx.beginPath();
  ctx.arc(0, -irR * 0.04, irR * 0.40, 0, TAU);
  ctx.fill();

  // Sombra sutil del párpado superior sobre el iris
  const lidShadow = ctx.createLinearGradient(0, -irR, 0, -irR * 0.12);
  lidShadow.addColorStop(0, 'rgba(24, 16, 48, 0.50)');
  lidShadow.addColorStop(1, 'rgba(24, 16, 48, 0.0)');
  ctx.fillStyle = lidShadow;
  ctx.fillRect(-irR, -irR, irR * 2, irR);

  ctx.restore();
  ctx.restore(); // Fin clip de ojo

  // 3. Pestaña superior gruesa curvada con rabillo exterior sutil
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#1e1326';
  ctx.lineWidth = isMale ? 6.6 : 9.2;
  ctx.beginPath();
  ctx.moveTo(-ew * 0.94, eh * 0.14);
  ctx.bezierCurveTo(-ew * 0.46, -eh * 0.92, ew * 0.48, -eh * 0.94, ew * 1.04, -eh * 0.08);
  ctx.stroke();

  if (!isMale) {
    // Rabillo exterior delicado
    ctx.lineWidth = 3.8;
    ctx.beginPath();
    ctx.moveTo(ew * 0.88, -eh * 0.22);
    ctx.quadraticCurveTo(ew * 1.05, -eh * 0.30, ew * 1.18, -eh * 0.42);
    ctx.stroke();

    ctx.lineWidth = 3.0;
    ctx.beginPath();
    ctx.moveTo(ew * 0.96, -eh * 0.08);
    ctx.quadraticCurveTo(ew * 1.10, -eh * 0.14, ew * 1.20, -eh * 0.22);
    ctx.stroke();
  }

  // Línea inferior sutil
  ctx.strokeStyle = 'rgba(58, 36, 54, 0.45)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-ew * 0.68, eh * 0.42);
  ctx.quadraticCurveTo(0, eh * 0.68, ew * 0.68, eh * 0.38);
  ctx.stroke();

  // Pliegue fino del párpado superior
  ctx.strokeStyle = shadeHex(skinHex, 0.74);
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-ew * 0.74, -eh * 0.90);
  ctx.quadraticCurveTo(0, -eh * 1.22, ew * 0.78, -eh * 0.82);
  ctx.stroke();

  ctx.restore(); // Fin transform simétrico scale(side, 1)

  // Doble destello blanco nítido (catchlight grande arriba-izquierda + punto abajo-derecha)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
  ctx.beginPath();
  ctx.ellipse(-ew * 0.22, -eh * 0.24, isMale ? 7.5 : 9.5, isMale ? 6.2 : 8.2, -0.25, 0, TAU);
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.beginPath();
  ctx.arc(ew * 0.22, eh * 0.26, isMale ? 3.8 : 4.5, 0, TAU);
  ctx.fill();

  ctx.restore();
}

/**
 * Genera y cachea en memoria el atlas facial 1024x1024 (openMap) y mapa de parpadeo 512x512 (blinkMap)
 * con simetría especular exacta centrada en cx = 512.
 *
 * @param {object} [options]
 * @returns {{ openMap: THREE.CanvasTexture, blinkMap: THREE.CanvasTexture }}
 */
export function createFaceTextureSet(options = {}) {
  const {
    skin = { id: 'porcelana', hex: 0xfbe0d2, blush: 0xf498b4, lip: 0xe35f90 },
    eye = { id: 'zafiro', iris: 0x2d78e6, ring: 0x164296, glow: 0x8ad6ff },
    hairColor = { id: 'rubio_miel', brow: 0x9c743a },
    archetype = 'female',
    expression = 'gentle_smile'
  } = options;

  const isMale = archetype === 'male';
  const cacheKey = `${skin.id || skin.hex}|${eye.id || eye.iris}|${hairColor.id || hairColor.brow}|${archetype}|${expression}`;
  const cached = _faceTexCache.get(cacheKey);
  if (cached) return cached;

  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const skinCss = hexToCss(skin.hex);
  ctx.fillStyle = skinCss;
  ctx.fillRect(0, 0, size, size);

  // Degradado sutil cálido simétrico en el rostro frontal
  const warmGlow = ctx.createRadialGradient(512, 540, 60, 512, 540, 400);
  warmGlow.addColorStop(0, 'rgba(255, 242, 234, 0.14)');
  warmGlow.addColorStop(1, 'rgba(225, 165, 168, 0.0)');
  ctx.fillStyle = warmGlow;
  ctx.fillRect(0, 0, size, size);

  // Rubor melocotón-rosado suave simétrico en mejillas (315, 602) y (709, 602)
  for (const cx of [315, 709]) {
    const g = ctx.createRadialGradient(cx, 602, 6, cx, 602, isMale ? 56 : 74);
    g.addColorStop(0, isMale ? 'rgba(232, 146, 152, 0.20)' : 'rgba(246, 152, 170, 0.36)');
    g.addColorStop(0.55, isMale ? 'rgba(232, 146, 152, 0.07)' : 'rgba(246, 152, 170, 0.15)');
    g.addColorStop(1, 'rgba(246, 152, 170, 0.0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, 602, 76, 48, 0, 0, TAU);
    ctx.fill();

    if (!isMale) {
      ctx.fillStyle = 'rgba(255, 248, 250, 0.30)';
      ctx.beginPath();
      ctx.ellipse(cx + (cx < 512 ? 8 : -8), 594, 8, 4, 0, 0, TAU);
      ctx.fill();
    }
  }

  // Ojos simétricos exactamente en (384, 525) [u = 0.375, v = 0.487] y (640, 525) [u = 0.625, v = 0.487]
  drawAnimeEye(ctx, 384, 525, -1, { isMale, eye, skinHex: skin.hex });
  drawAnimeEye(ctx, 640, 525, 1, { isMale, eye, skinHex: skin.hex });

  // Cejas simétricas en hairColor.brow (femenina cy = 428, masculina cy = 442)
  ctx.strokeStyle = hexToCss(hairColor.brow);
  ctx.lineCap = 'round';
  ctx.lineWidth = isMale ? 6.4 : 4.4;
  const browY = isMale ? 442 : 428;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(512 + s * 66, browY + 6);
    ctx.quadraticCurveTo(512 + s * 128, browY - (isMale ? 10 : 14), 512 + s * 184, browY + 2);
    ctx.stroke();
  }

  // Pequeño punto cálido bajo la punta de la nariz en (512, 606) sin líneas negras duras
  const noseShade = ctx.createRadialGradient(512, 606, 1, 512, 606, 13);
  noseShade.addColorStop(0, shadeHex(skin.hex, 0.85));
  noseShade.addColorStop(0.55, shadeHex(skin.hex, 0.92));
  noseShade.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = noseShade;
  ctx.beginPath();
  ctx.ellipse(512, 606, 12, 7, 0, 0, TAU);
  ctx.fill();

  // Labios delicados sonrientes en cy = 678 (+-36px) con gloss inferior suave
  const lipY = 678;
  const lipW = 36;
  ctx.lineCap = 'round';

  if (!isMale) {
    const lipGrad = ctx.createLinearGradient(512, lipY - 2, 512, lipY + 18);
    lipGrad.addColorStop(0, hexToCss(skin.lip));
    lipGrad.addColorStop(1, 'rgba(244, 150, 174, 0.12)');
    ctx.fillStyle = lipGrad;
    ctx.beginPath();
    ctx.moveTo(512 - lipW * 0.72, lipY + 2);
    ctx.quadraticCurveTo(512, lipY + 19, 512 + lipW * 0.72, lipY + 2);
    ctx.quadraticCurveTo(512, lipY + 5, 512 - lipW * 0.72, lipY + 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 242, 246, 0.62)';
    ctx.beginPath();
    ctx.ellipse(512, lipY + 9, 10, 3.0, 0, 0, TAU);
    ctx.fill();
  }

  ctx.strokeStyle = shadeHex(skin.lip, isMale ? 0.72 : 0.78);
  ctx.lineWidth = isMale ? 3.0 : 3.2;
  ctx.beginPath();
  ctx.moveTo(512 - lipW, lipY - 2);
  ctx.quadraticCurveTo(512 - lipW * 0.35, lipY + 4, 512, lipY + 2);
  ctx.quadraticCurveTo(512 + lipW * 0.35, lipY + 4, 512 + lipW, lipY - 2);
  ctx.stroke();

  const openMap = new THREE.CanvasTexture(canvas);
  openMap.colorSpace = THREE.SRGBColorSpace;
  openMap.anisotropy = 4;
  openMap.needsUpdate = true;

  // Textura blinkMap 512x512 con pestañas cerradas estrictamente simétricas en (192, 262.5) y (320, 262.5)
  const bSize = 512;
  const bCanvas = document.createElement('canvas');
  bCanvas.width = bSize;
  bCanvas.height = bSize;
  const bCtx = bCanvas.getContext('2d');
  bCtx.fillStyle = skinCss;
  bCtx.fillRect(0, 0, bSize, bSize);

  const bWarmGlow = bCtx.createRadialGradient(256, 270, 30, 256, 270, 200);
  bWarmGlow.addColorStop(0, 'rgba(255, 242, 234, 0.14)');
  bWarmGlow.addColorStop(1, 'rgba(225, 165, 168, 0.0)');
  bCtx.fillStyle = bWarmGlow;
  bCtx.fillRect(0, 0, bSize, bSize);

  for (const [ex, side] of [[192, -1], [320, 1]]) {
    const ey = 262.5;
    bCtx.save();
    bCtx.translate(ex, ey);
    bCtx.scale(side, 1);

    // Pliegue sutil del párpado cerrado
    bCtx.strokeStyle = shadeHex(skin.hex, 0.76);
    bCtx.lineWidth = 1.6;
    bCtx.beginPath();
    bCtx.moveTo(-22, -12);
    bCtx.quadraticCurveTo(0, -19, 22, -12);
    bCtx.stroke();

    // Curva simétrica de pestañas cerradas de ex - 28 a ex + 28
    bCtx.strokeStyle = '#1e1326';
    bCtx.lineCap = 'round';
    bCtx.lineWidth = isMale ? 3.8 : 4.8;
    bCtx.beginPath();
    bCtx.moveTo(-28, 1);
    bCtx.bezierCurveTo(-12, 11, 12, 11, 28, 1);
    bCtx.stroke();

    if (!isMale) {
      bCtx.lineWidth = 2.2;
      bCtx.beginPath();
      bCtx.moveTo(24, 2);
      bCtx.lineTo(32, -2);
      bCtx.stroke();
    }

    bCtx.restore();
  }

  const blinkMap = new THREE.CanvasTexture(bCanvas);
  blinkMap.colorSpace = THREE.SRGBColorSpace;
  blinkMap.needsUpdate = true;

  const entry = { openMap, blinkMap };
  _faceTexCache.set(cacheKey, entry);
  return entry;
}

/**
 * Construye un mechón capilar 3D volumétrico sin torsión (twist-free, sin computeFrenetFrames),
 * winding exterior verificado contra `out`, gradiente raíz->puntas luminoso y atributos aSwayWeight / aStrandPhase.
 *
 * @param {Array<[number, number, number]>} curvePoints
 * @param {(t: number) => number} widthProfile
 * @param {(t: number) => number} thicknessProfile
 * @param {object} [options]
 * @returns {THREE.BufferGeometry}
 */
export function createHairStrandGeometry(curvePoints, widthProfile, thicknessProfile, options = {}) {
  const {
    segments = 16,
    swayMax = 1.0,
    phase = 0.0,
    rootTint = 0xe6d4be,
    midTint = 0xffffff,
    tipTint = 0xfff8ea,
    outwardHint = null
  } = options;

  const vecPts = curvePoints.map((p) => (p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2])));
  const curve = new THREE.CatmullRomCurve3(vecPts, false, 'centripetal');

  const ringCount = segments + 1;
  const vertsPerRing = 5;
  const vTotal = ringCount * vertsPerRing;
  const positions = new Float32Array(vTotal * 3);
  const uvs = new Float32Array(vTotal * 2);
  const colors = new Float32Array(vTotal * 3);
  const swayArr = new Float32Array(vTotal);
  const phaseArr = new Float32Array(vTotal);
  const ringOuts = new Float32Array(ringCount * 3);
  const indices = [];

  _rootCol.set(rootTint);
  _midCol.set(midTint);
  _tipCol.set(tipTint);

  const hint = outwardHint
    ? (outwardHint.isVector3 ? outwardHint : new THREE.Vector3(outwardHint[0], outwardHint[1], outwardHint[2]))
    : null;

  for (let i = 0; i < ringCount; i++) {
    const t = i / segments;
    curve.getPointAt(t, _tmpP);
    curve.getTangentAt(t, _tmpT).normalize();

    // Normal exterior libre de torsión
    if (hint) {
      _tmpN.copy(hint);
    } else {
      _tmpN.set(_tmpP.x, _tmpP.y > 0.08 ? (_tmpP.y - 0.04) * 0.65 : 0.0, _tmpP.z);
      if (_tmpN.lengthSq() < 1e-6) _tmpN.set(0, 0, 1);
    }
    _tmpN.normalize();
    // Ortogonalizar respecto a la tangente T
    _tmpN.addScaledVector(_tmpT, -_tmpN.dot(_tmpT));
    if (_tmpN.lengthSq() < 1e-6) {
      _tmpN.set(1, 0, 0).cross(_tmpT);
      if (_tmpN.lengthSq() < 1e-6) _tmpN.set(0, 0, 1).cross(_tmpT);
    }
    _tmpN.normalize();
    _tmpB.crossVectors(_tmpT, _tmpN).normalize();

    ringOuts[i * 3] = _tmpN.x;
    ringOuts[i * 3 + 1] = _tmpN.y;
    ringOuts[i * 3 + 2] = _tmpN.z;

    const rootEase = t < 0.12 ? 0.68 + 0.32 * (t / 0.12) : 1.0;
    const tipTaper = 1.0 - Math.pow(t, 2.4) * 0.90;
    const w = (typeof widthProfile === 'function' ? widthProfile(t) : widthProfile * tipTaper) * rootEase;
    const h = (typeof thicknessProfile === 'function' ? thicknessProfile(t) : thicknessProfile * tipTaper) * rootEase;

    if (t < 0.45) {
      _tmpC.copy(_rootCol).lerp(_midCol, t / 0.45);
    } else {
      _tmpC.copy(_midCol).lerp(_tipCol, (t - 0.45) / 0.55);
    }

    const swayW = Math.pow(t, 1.35) * swayMax;
    const ringOffsets = [
      [-w, 0.0, 0.0],
      [0.0, h, 0.25],
      [w, 0.0, 0.5],
      [0.0, -h * 0.55, 0.75],
      [-w, 0.0, 1.0]
    ];

    for (let j = 0; j < vertsPerRing; j++) {
      const idx = i * vertsPerRing + j;
      const [ob, on, uCoord] = ringOffsets[j];
      positions[idx * 3] = _tmpP.x + _tmpB.x * ob + _tmpN.x * on;
      positions[idx * 3 + 1] = _tmpP.y + _tmpB.y * ob + _tmpN.y * on;
      positions[idx * 3 + 2] = _tmpP.z + _tmpB.z * ob + _tmpN.z * on;
      uvs[idx * 2] = uCoord;
      uvs[idx * 2 + 1] = t;
      colors[idx * 3] = _tmpC.r;
      colors[idx * 3 + 1] = _tmpC.g;
      colors[idx * 3 + 2] = _tmpC.b;
      swayArr[idx] = swayW;
      phaseArr[idx] = phase;
    }
  }

  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < vertsPerRing - 1; j++) {
      const a0 = i * vertsPerRing + j;
      const a1 = a0 + 1;
      const b0 = a0 + vertsPerRing;
      const b1 = b0 + 1;
      indices.push(a0, a1, b0, a1, b1, b0);
    }
  }

  // Comprobación explícita de producto punto contra `out` en la cresta frontal (j = 0, 1)
  let frontDotSum = 0;
  for (let i = 0; i < segments; i++) {
    _tmpN.set(ringOuts[i * 3], ringOuts[i * 3 + 1], ringOuts[i * 3 + 2]);
    for (let j = 0; j < 2; j++) {
      const a0 = i * vertsPerRing + j;
      const a1 = a0 + 1;
      const b0 = a0 + vertsPerRing;
      _tmpA.set(positions[a0 * 3], positions[a0 * 3 + 1], positions[a0 * 3 + 2]);
      _tmpE1.set(positions[a1 * 3], positions[a1 * 3 + 1], positions[a1 * 3 + 2]).sub(_tmpA);
      _tmpE2.set(positions[b0 * 3], positions[b0 * 3 + 1], positions[b0 * 3 + 2]).sub(_tmpA);
      _tmpTriN.crossVectors(_tmpE1, _tmpE2);
      frontDotSum += _tmpTriN.dot(_tmpN);
    }
  }

  if (frontDotSum < 0) {
    for (let k = 0; k < indices.length; k += 3) {
      const tmp = indices[k + 1];
      indices[k + 1] = indices[k + 2];
      indices[k + 2] = tmp;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSwayWeight', new THREE.BufferAttribute(swayArr, 1));
  geo.setAttribute('aStrandPhase', new THREE.BufferAttribute(phaseArr, 1));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  initCharacterVertexAttributes(geo, 0, phase);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Construye una base craneal orgánica ceñida que despeja la frente por encima de las cejas
 * (y >= +0.052m en +Z), cubre coronilla (+1.5 a 2.2 cm), sienes y nuca sin costuras.
 */
function createScalpCapGeometry(isMale, rootTint = 0xdec8b0, midTint = 0xffffff) {
  const rx = isMale ? 0.129 : 0.125;
  const ry = isMale ? 0.148 : 0.142;
  const rz = isMale ? 0.132 : 0.128;

  const cols = 32;
  const rows = 18;
  const stride = cols + 1;
  const vTotal = (rows + 1) * stride;
  const positions = new Float32Array(vTotal * 3);
  const uvs = new Float32Array(vTotal * 2);
  const colors = new Float32Array(vTotal * 3);
  const sway = new Float32Array(vTotal);
  const phase = new Float32Array(vTotal);
  const indices = [];

  _rootCol.set(rootTint);
  _midCol.set(midTint);

  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const az = u * TAU;
      const sx = Math.sin(az);
      const sz = Math.cos(az);

      // En frente (+Z) el límite inferior queda sobre las cejas (y >= +0.052m); en nuca (-Z) baja al cuello
      const frontness = smoothstep(-0.18, 0.58, sz);
      const phiMax = 2.12 * (1.0 - frontness) + 1.12 * frontness;
      const phi = v * phiMax;

      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);

      const x = sx * sinP * rx;
      let y = cosP * ry + 0.008;
      const z = sz * sinP * rz - 0.005;

      if (z > 0.01) {
        const hairlineMin = 0.054 + (1.0 - Math.min(1.0, Math.abs(sx))) * 0.012;
        if (y < hairlineMin && v > 0.72) {
          y = hairlineMin;
        }
      }

      const idx = r * stride + c;
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;
      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = 1.0 - v;

      const mixK = smoothstep(-0.04, 0.13, y);
      _tmpC.copy(_rootCol).lerp(_midCol, 0.25 + mixK * 0.75);
      colors[idx * 3] = _tmpC.r;
      colors[idx * 3 + 1] = _tmpC.g;
      colors[idx * 3 + 2] = _tmpC.b;
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a00 = r * stride + c;
      const a10 = a00 + 1;
      const a01 = a00 + stride;
      const a11 = a01 + 1;
      indices.push(a00, a01, a10, a10, a01, a11);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSwayWeight', new THREE.BufferAttribute(sway, 1));
  geo.setAttribute('aStrandPhase', new THREE.BufferAttribute(phase, 1));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  ensureOutwardWinding(geo);
  initCharacterVertexAttributes(geo, 0, 0);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Construye una cascada continua volumétrica de cabello trasero (34 cols x 22 rows)
 * con forro interior de grosor real, ondas en S suaves detrás de hombros/brazos
 * y un borde festoneado continuo de 9 puntas redondeadas conectadas (sin tentáculos).
 *
 * @param {object} [options]
 * @returns {THREE.BufferGeometry}
 */
export function createHairMantleGeometry(options = {}) {
  const {
    cols = 34,
    rows = 22,
    yTop = 0.095,
    yBot = -0.60,
    spanAngle = Math.PI * 1.12,
    flareX = 0.092,
    flareZ = 0.056,
    swayMax = 0.95,
    phase = 0.4,
    rootTint = 0xe6d4be,
    midTint = 0xffffff,
    tipTint = 0xfff8ea
  } = options;

  const stride = cols + 1;
  const shellVerts = (rows + 1) * stride;
  const vTotal = shellVerts * 2;
  const positions = new Float32Array(vTotal * 3);
  const uvs = new Float32Array(vTotal * 2);
  const colors = new Float32Array(vTotal * 3);
  const swayArr = new Float32Array(vTotal);
  const phaseArr = new Float32Array(vTotal);
  const indices = [];

  _rootCol.set(rootTint);
  _midCol.set(midTint);
  _tipCol.set(tipTint);

  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    const rx = 0.118 + smoothstep(0.0, 0.55, t) * (flareX * 0.62) + smoothstep(0.45, 1.0, t) * (flareX * 0.38);
    const rz = 0.122 + smoothstep(0.0, 0.70, t) * flareZ;
    const zBias = -0.008 - smoothstep(0.08, 0.95, t) * 0.052;
    const sWaveZ = Math.sin(t * Math.PI * 2.2 - 0.35) * 0.020 * smoothstep(0.08, 0.92, t);

    if (t < 0.45) {
      _tmpC.copy(_rootCol).lerp(_midCol, t / 0.45);
    } else {
      _tmpC.copy(_midCol).lerp(_tipCol, (t - 0.45) / 0.55);
    }

    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const ang = Math.PI + (u - 0.5) * spanAngle;
      const sx = Math.sin(ang);
      const sz = Math.cos(ang);
      const sideMask = Math.sin(u * Math.PI);

      // 9 puntas redondeadas conectadas en el borde inferior
      const lobe = Math.pow(Math.sin(u * Math.PI * 9.0), 2.0);
      const sideArch = 1.0 - 0.18 * Math.pow(2.0 * u - 1.0, 2.0);
      const y = yTop + (yBot - yTop) * t * sideArch - Math.pow(t, 2.2) * lobe * 0.048;

      const sWaveX = Math.sin(t * Math.PI * 1.8) * 0.012 * t * sideMask;
      const ripple = Math.cos(u * Math.PI * 18.0) * 0.0085 * smoothstep(0.12, 0.85, t) * (1.0 - 0.30 * t);

      const ox = sx * (rx + ripple) + sWaveX;
      const oy = y;
      const oz = sz * (rz + ripple) + zBias + sWaveZ;

      _tmpN.set(sx, (1.0 - t) * 0.10, sz).normalize();
      const thick = (0.017 * (1.0 - 0.65 * t) + 0.004) * (0.28 + 0.72 * sideMask);

      const outerIdx = r * stride + c;
      const innerIdx = shellVerts + outerIdx;

      positions[outerIdx * 3] = ox;
      positions[outerIdx * 3 + 1] = oy;
      positions[outerIdx * 3 + 2] = oz;

      positions[innerIdx * 3] = ox - _tmpN.x * thick;
      positions[innerIdx * 3 + 1] = oy - _tmpN.y * thick * 0.35;
      positions[innerIdx * 3 + 2] = oz - _tmpN.z * thick;

      uvs[outerIdx * 2] = u;
      uvs[outerIdx * 2 + 1] = t;
      uvs[innerIdx * 2] = u;
      uvs[innerIdx * 2 + 1] = t;

      colors[outerIdx * 3] = _tmpC.r;
      colors[outerIdx * 3 + 1] = _tmpC.g;
      colors[outerIdx * 3 + 2] = _tmpC.b;

      colors[innerIdx * 3] = _tmpC.r * 0.94;
      colors[innerIdx * 3 + 1] = _tmpC.g * 0.94;
      colors[innerIdx * 3 + 2] = _tmpC.b * 0.94;

      const swayW = Math.pow(t, 1.35) * swayMax;
      const strandP = phase + Math.sin(u * Math.PI * 3.0) * 0.35;
      swayArr[outerIdx] = swayW;
      swayArr[innerIdx] = swayW;
      phaseArr[outerIdx] = strandP;
      phaseArr[innerIdx] = strandP;
    }
  }

  // Caras exteriores (winding saliente) y forro interior (winding invertido)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a00 = r * stride + c;
      const a10 = a00 + 1;
      const a01 = a00 + stride;
      const a11 = a01 + 1;
      indices.push(a00, a01, a10, a10, a01, a11);

      const b00 = shellVerts + a00;
      const b10 = b00 + 1;
      const b01 = b00 + stride;
      const b11 = b01 + 1;
      indices.push(b00, b10, b01, b10, b11, b01);
    }
  }

  // Costura del borde superior, borde inferior festoneado y bordes laterales para volumen cerrado
  for (let c = 0; c < cols; c++) {
    const tA0 = c;
    const tA1 = c + 1;
    const tB0 = shellVerts + tA0;
    const tB1 = shellVerts + tA1;
    indices.push(tA0, tA1, tB0, tA1, tB1, tB0);

    const a0 = rows * stride + c;
    const a1 = a0 + 1;
    const b0 = shellVerts + a0;
    const b1 = b0 + 1;
    indices.push(a0, b0, a1, a1, b0, b1);
  }
  for (let r = 0; r < rows; r++) {
    const lA0 = r * stride;
    const lA1 = lA0 + stride;
    const lB0 = shellVerts + lA0;
    const lB1 = shellVerts + lA1;
    indices.push(lA0, lB0, lA1, lA1, lB0, lB1);

    const rA0 = r * stride + cols;
    const rA1 = rA0 + stride;
    const rB0 = shellVerts + rA0;
    const rB1 = shellVerts + rA1;
    indices.push(rA0, rA1, rB0, rA1, rB1, rB0);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSwayWeight', new THREE.BufferAttribute(swayArr, 1));
  geo.setAttribute('aStrandPhase', new THREE.BufferAttribute(phaseArr, 1));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  ensureOutwardWinding(geo);
  initCharacterVertexAttributes(geo, 0, phase);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Aplica límite radial estricto en cabello corto masculino para garantizar <= maxRadius (0.166m).
 */
function clampHairGeometriesRadius(geometries, maxRadius = 0.132 * 1.26) {
  for (const geo of geometries) {
    const pos = geo.attributes.position;
    if (!pos) continue;
    let changed = false;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const r = Math.hypot(x, y, z);
      if (r > maxRadius) {
        const s = maxRadius / r;
        pos.setXYZ(i, x * s, y * s, z * s);
        changed = true;
      }
    }
    if (changed) {
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
    }
  }
}

/**
 * Construye un sistema completo de cabello volumétrico cohesivo (mantos continuos + mechones sin torsión).
 * Soporta los 5 estilos del catálogo + variantes de la Biblia de Arte.
 *
 * @param {string} styleId
 * @param {object} [options]
 * @returns {{ group: THREE.Group, crownAnchorY: number, geometries: THREE.BufferGeometry[] }}
 */
export function buildVolumetricHair(styleId = 'princess_imperial_waves', options = {}) {
  const {
    materials = {},
    isMale = false
  } = options;

  const hairMat = materials.hair;
  const goldMat = materials.roseGold || materials.hair;
  const gemMat = materials.crystal || materials.roseGold || materials.hair;
  const ribbonMat = materials.secondary || materials.roseGold || materials.hair;

  const group = new THREE.Group();
  const geometries = [];
  const addMesh = (geo, mat = hairMat, swayGroup = false) => {
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = mat !== gemMat;
    mesh.receiveShadow = true;
    if (swayGroup) mesh.userData.isLongHair = true;
    group.add(mesh);
    return mesh;
  };

  // Gradiente luminoso raíz cálida -> cuerpo -> puntas sedosas (luminancia mínima >= 0.78)
  const rootTint = 0xe6d4be;
  const midTint = 0xffffff;
  const tipTint = 0xfff8ea;

  // Normaliza alias entre Biblia de Arte y CatalogData
  let normalized = styleId;
  if (normalized === 'melena_ondulada') normalized = 'princess_imperial_waves';
  if (normalized === 'principe_tupe' || (isMale && normalized !== 'court_noble_short')) {
    if (normalized !== 'court_noble_short') normalized = 'prince_royal_tousled';
  }
  if (normalized === 'recogido_mono') normalized = 'court_updo_bun';
  if (normalized === 'media_melena') normalized = 'court_half_up';

  addMesh(createScalpCapGeometry(isMale, rootTint, midTint), hairMat);

  const strand = (pts, w0, w1, thick0, thick1, segs, swayMax, phase, outHint = null) => {
    const geo = createHairStrandGeometry(
      pts,
      (t) => w0 * (1 - t) + w1 * t,
      (t) => thick0 * (1 - t) + thick1 * t,
      { segments: segs, swayMax, phase, rootTint, midTint, tipTint, outwardHint: outHint }
    );
    return addMesh(geo, hairMat, swayMax > 0.4);
  };

  if (normalized === 'prince_royal_tousled' || normalized === 'court_noble_short') {
    const isSwept = normalized === 'court_noble_short';

    // Nuca continua ceñida al cráneo para evitar huecos traseros
    addMesh(
      createHairMantleGeometry({
        cols: 20,
        rows: 10,
        yTop: 0.088,
        yBot: -0.095,
        spanAngle: Math.PI * 1.06,
        flareX: 0.012,
        flareZ: 0.010,
        swayMax: 0.14,
        phase: 0.2,
        rootTint,
        midTint,
        tipTint
      }),
      hairMat
    );

    // 10 mechones planos/suaves de flequillo abrazando la frente (sin efecto erizo)
    const bangCount = 10;
    for (let i = 0; i < bangCount; i++) {
      const k = i / (bangCount - 1);
      const x0 = -0.088 + k * 0.176;
      const sweepX = isSwept ? 0.030 : (x0 >= 0 ? 0.012 : -0.012);
      const drop = isSwept ? 0.020 + k * 0.014 : 0.032 + (i % 3) * 0.010;
      const tipX = x0 * 1.02 + sweepX;
      const tipY = 0.056 - drop;
      const zMid = Math.sqrt(Math.max(0.01, 1.0 - Math.min(0.85, Math.pow(x0 / 0.128, 2)))) * 0.130;
      strand(
        [
          [x0 * 0.72, 0.132, 0.044],
          [x0 * 0.96, 0.106, zMid * 0.86],
          [x0 + sweepX * 0.5, 0.076 - drop * 0.35, zMid * 0.98],
          [tipX, tipY, zMid * 0.92]
        ],
        0.028,
        0.007,
        0.009,
        0.003,
        12,
        0.16,
        i * 0.61,
        [x0 * 0.4, 0.35, 0.90]
      );
    }

    // Capas superiores suaves hacia coronilla y nuca (pegadas al cráneo)
    for (let i = 0; i < 6; i++) {
      const a = (i / 5 - 0.5) * 1.55;
      const sx = Math.sin(a);
      const cz = -Math.cos(a * 0.55);
      strand(
        [
          [sx * 0.045, 0.144, 0.004],
          [sx * 0.090, 0.132, cz * 0.068],
          [sx * 0.112, 0.068, cz * 0.118],
          [sx * 0.105, -0.035, cz * 0.124]
        ],
        0.036,
        0.010,
        0.010,
        0.003,
        12,
        0.18,
        2.5 + i * 0.55,
        [sx * 0.65, 0.45, cz * 0.65]
      );
    }

    // Patillas suaves enmarcando sienes
    for (const s of [-1, 1]) {
      strand(
        [
          [s * 0.108, 0.064, 0.026],
          [s * 0.124, 0.012, 0.022],
          [s * 0.118, -0.045, 0.012]
        ],
        0.024,
        0.006,
        0.009,
        0.003,
        10,
        0.14,
        s * 1.3,
        [s * 0.92, 0.0, 0.35]
      );
    }

    // Límite radial estricto <= 0.132 * 1.26 (<= 0.166m) en TODOS los vértices
    clampHairGeometriesRadius(geometries, 0.1658);
    return { group, crownAnchorY: 0.146, geometries };
  }

  // 7 mechones anchos arqueados partidos lateralmente (siempre sobre ojos, enmarcando mejillas)
  const archedPartedBangs = () => {
    const specs = [
      { side: -1, xTop: -0.014, xArch: -0.072, yArch: 0.088, xEnd: -0.114, yEnd: -0.065, zEnd: 0.070, w0: 0.036 },
      { side: -1, xTop: -0.026, xArch: -0.094, yArch: 0.072, xEnd: -0.126, yEnd: -0.108, zEnd: 0.056, w0: 0.034 },
      { side: -1, xTop: -0.038, xArch: -0.110, yArch: 0.054, xEnd: -0.130, yEnd: -0.142, zEnd: 0.038, w0: 0.032 },
      { side: 1, xTop: 0.006, xArch: 0.058, yArch: 0.098, xEnd: 0.104, yEnd: -0.048, zEnd: 0.078, w0: 0.034 },
      { side: 1, xTop: 0.018, xArch: 0.078, yArch: 0.084, xEnd: 0.118, yEnd: -0.082, zEnd: 0.066, w0: 0.036 },
      { side: 1, xTop: 0.030, xArch: 0.098, yArch: 0.068, xEnd: 0.128, yEnd: -0.120, zEnd: 0.052, w0: 0.034 },
      { side: 1, xTop: 0.042, xArch: 0.112, yArch: 0.050, xEnd: 0.132, yEnd: -0.148, zEnd: 0.034, w0: 0.030 }
    ];
    for (let i = 0; i < specs.length; i++) {
      const b = specs[i];
      strand(
        [
          [b.xTop, 0.138, 0.048],
          [b.xArch * 0.72, 0.114, 0.104],
          [b.xArch, b.yArch, 0.106],
          [b.xEnd, b.yEnd, b.zEnd]
        ],
        b.w0,
        0.007,
        0.011,
        0.003,
        14,
        0.28,
        i * 0.77,
        [b.side * 0.55, 0.20, 0.80]
      );
    }
  };

  if (normalized === 'princess_imperial_waves') {
    // 1. Manto trasero continuo (34x22 con forro interior y 9 puntas redondeadas conectadas)
    addMesh(
      createHairMantleGeometry({
        cols: 34,
        rows: 22,
        yTop: 0.095,
        yBot: -0.60,
        spanAngle: Math.PI * 1.12,
        flareX: 0.094,
        flareZ: 0.058,
        swayMax: 0.95,
        phase: 0.4,
        rootTint,
        midTint,
        tipTint
      }),
      hairMat,
      true
    );

    // 2. 7 mechones anchos arqueados partidos lateralmente sobre la frente
    archedPartedBangs();

    // 3. 4 mechones anchos ondulados cayendo suavemente delante de hombros y pecho
    for (const s of [-1, 1]) {
      strand(
        [
          [s * 0.106, 0.068, 0.030],
          [s * 0.136, -0.055, 0.072],
          [s * 0.128, -0.205, 0.106],
          [s * 0.144, -0.350, 0.114],
          [s * 0.130, -0.475, 0.102]
        ],
        0.036,
        0.009,
        0.013,
        0.004,
        18,
        0.82,
        1.2 * s,
        [s * 0.58, 0.04, 0.80]
      );
      strand(
        [
          [s * 0.114, 0.048, -0.006],
          [s * 0.150, -0.085, 0.048],
          [s * 0.144, -0.245, 0.088],
          [s * 0.160, -0.395, 0.092],
          [s * 0.146, -0.525, 0.082]
        ],
        0.034,
        0.008,
        0.012,
        0.003,
        18,
        0.88,
        2.6 * s,
        [s * 0.72, 0.02, 0.68]
      );
    }

    // 4. 7 mechones anchos de relieve ceñidos +0.009-0.013m fuera del manto
    const reliefCount = 7;
    const spanAngle = Math.PI * 1.12;
    const flareX = 0.094;
    const flareZ = 0.058;
    const tNodes = [0.04, 0.28, 0.54, 0.78, 0.98];

    for (let i = 0; i < reliefCount; i++) {
      const u = (i + 0.5) / reliefCount;
      const ang = Math.PI + (u - 0.5) * spanAngle * 0.90;
      const sx = Math.sin(ang);
      const sz = Math.cos(ang);
      const sideArch = 1.0 - 0.18 * Math.pow(2.0 * u - 1.0, 2.0);
      const offsetOut = 0.010 + (i % 2) * 0.0025;
      const pts = [];

      for (let k = 0; k < tNodes.length; k++) {
        const t = tNodes[k];
        const rx = 0.118 + smoothstep(0.0, 0.55, t) * (flareX * 0.62) + smoothstep(0.45, 1.0, t) * (flareX * 0.38);
        const rz = 0.122 + smoothstep(0.0, 0.70, t) * flareZ;
        const zBias = -0.008 - smoothstep(0.08, 0.95, t) * 0.052;
        const sWaveZ = Math.sin(t * Math.PI * 2.2 - 0.35) * 0.020 * smoothstep(0.08, 0.92, t);
        const sWaveX = Math.sin(t * Math.PI * 1.8) * 0.012 * t * Math.sin(u * Math.PI);
        const y = 0.095 + (-0.60 - 0.095) * t * sideArch;
        pts.push([
          sx * (rx + offsetOut) + sWaveX,
          y,
          sz * (rz + offsetOut) + zBias + sWaveZ
        ]);
      }

      strand(
        pts,
        0.046,
        0.013,
        0.013,
        0.004,
        20,
        0.95,
        0.5 + i * 0.65,
        [sx, 0.06, sz]
      );
    }

    return { group, crownAnchorY: 0.142, geometries };
  }

  if (normalized === 'court_updo_bun') {
    archedPartedBangs();

    // Base trasera continua barrida hacia el moño alto (sin huecos en nuca)
    addMesh(
      createHairMantleGeometry({
        cols: 24,
        rows: 10,
        yTop: 0.098,
        yBot: -0.072,
        spanAngle: Math.PI * 1.08,
        flareX: 0.010,
        flareZ: 0.008,
        swayMax: 0.10,
        phase: 0.1,
        rootTint,
        midTint,
        tipTint
      }),
      hairMat
    );

    // Barridos laterales cohesivos subiendo hacia el moño
    for (const s of [-1, 1]) {
      strand(
        [
          [s * 0.108, 0.058, 0.036],
          [s * 0.122, -0.025, 0.044],
          [s * 0.108, -0.105, 0.036]
        ],
        0.020,
        0.005,
        0.008,
        0.003,
        10,
        0.42,
        s * 1.5,
        [s * 0.85, 0.0, 0.52]
      );
      strand(
        [
          [s * 0.108, 0.062, 0.012],
          [s * 0.096, 0.112, -0.052],
          [s * 0.034, 0.152, -0.088]
        ],
        0.038,
        0.018,
        0.014,
        0.007,
        12,
        0.05,
        2.0 + s,
        [s * 0.6, 0.55, -0.58]
      );
    }

    // Núcleo sólido del moño alto + 8 cintas trenzadas envolventes sin torsión
    const bunGeo = new THREE.SphereGeometry(0.066, 22, 16);
    bunGeo.scale(1.04, 0.88, 1.0);
    bunGeo.translate(0, 0.172, -0.088);
    const bunPos = bunGeo.attributes.position;
    const bunCol = new Float32Array(bunPos.count * 3);
    _rootCol.set(rootTint);
    _midCol.set(midTint);
    for (let i = 0; i < bunPos.count; i++) {
      const k = smoothstep(0.11, 0.23, bunPos.getY(i));
      _tmpC.copy(_rootCol).lerp(_midCol, 0.35 + k * 0.65);
      bunCol[i * 3] = _tmpC.r;
      bunCol[i * 3 + 1] = _tmpC.g;
      bunCol[i * 3 + 2] = _tmpC.b;
    }
    bunGeo.setAttribute('color', new THREE.BufferAttribute(bunCol, 3));
    bunGeo.computeVertexNormals();
    ensureOutwardWinding(bunGeo);
    initCharacterVertexAttributes(bunGeo, 0.04, 0);
    addMesh(bunGeo, hairMat);

    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      const r0 = 0.056;
      const r1 = 0.070;
      strand(
        [
          [Math.cos(a) * r0, 0.134, -0.088 + Math.sin(a) * r0],
          [Math.cos(a + 0.85) * r1, 0.172, -0.088 + Math.sin(a + 0.85) * r1],
          [Math.cos(a + 1.75) * r0 * 0.78, 0.208, -0.088 + Math.sin(a + 1.75) * r0 * 0.78],
          [Math.cos(a + 2.55) * 0.024, 0.220, -0.088 + Math.sin(a + 2.55) * 0.024]
        ],
        0.032,
        0.012,
        0.013,
        0.005,
        12,
        0.06,
        k * 0.78,
        [Math.cos(a + 0.9), 0.35, Math.sin(a + 0.9)]
      );
    }

    const bunRing = addMesh(new THREE.TorusGeometry(0.068, 0.007, 8, 22), goldMat);
    bunRing.position.set(0, 0.145, -0.088);
    bunRing.rotation.x = Math.PI / 2;
    const pin = addMesh(new THREE.OctahedronGeometry(0.017, 0), gemMat);
    pin.position.set(0.068, 0.188, -0.105);
    return { group, crownAnchorY: 0.140, geometries };
  }

  if (normalized === 'court_half_up') {
    archedPartedBangs();

    // Cascada continua a media espalda
    addMesh(
      createHairMantleGeometry({
        cols: 34,
        rows: 22,
        yTop: 0.090,
        yBot: -0.34,
        spanAngle: Math.PI * 1.06,
        flareX: 0.058,
        flareZ: 0.044,
        swayMax: 0.74,
        phase: 0.3,
        rootTint,
        midTint,
        tipTint
      }),
      hairMat,
      true
    );

    // Bandas laterales semirrecogidas hacia el pasador trasero + mechones frontales suaves
    for (const s of [-1, 1]) {
      strand(
        [
          [s * 0.112, 0.064, 0.032],
          [s * 0.128, 0.034, -0.052],
          [s * 0.058, 0.018, -0.136],
          [0, 0.012, -0.148]
        ],
        0.034,
        0.014,
        0.013,
        0.006,
        12,
        0.12,
        s * 1.1,
        [s * 0.5, 0.25, -0.82]
      );
      strand(
        [
          [s * 0.108, 0.054, 0.038],
          [s * 0.136, -0.055, 0.058],
          [s * 0.128, -0.185, 0.068]
        ],
        0.030,
        0.007,
        0.011,
        0.003,
        12,
        0.60,
        2.4 + s,
        [s * 0.65, 0.05, 0.75]
      );
    }

    // 5 mechones anchos de relieve sobre la cascada trasera
    for (let i = 0; i < 5; i++) {
      const u = (i + 0.5) / 5;
      const ang = Math.PI + (u - 0.5) * Math.PI * 0.84;
      const sx = Math.sin(ang);
      const sz = Math.cos(ang);
      const wave = Math.sin(i * 1.7) * 0.015;
      strand(
        [
          [sx * 0.124, 0.058, sz * 0.126 - 0.010],
          [sx * 0.146, -0.065, sz * 0.150 - 0.020],
          [sx * 0.162 + wave, -0.205, sz * 0.168 - 0.032],
          [sx * 0.156 - wave * 0.5, -0.328, sz * 0.162 - 0.038]
        ],
        0.044,
        0.012,
        0.012,
        0.004,
        16,
        0.74,
        i * 0.61,
        [sx, 0.05, sz]
      );
    }

    const bow = addMesh(new THREE.TorusGeometry(0.024, 0.006, 8, 16), ribbonMat);
    bow.position.set(0, 0.014, -0.152);
    bow.scale.set(1.3, 0.75, 0.8);
    const jewel = addMesh(new THREE.OctahedronGeometry(0.016, 0), gemMat);
    jewel.position.set(0, 0.014, -0.160);
    return { group, crownAnchorY: 0.140, geometries };
  }

  if (normalized === 'coleta_alta') {
    archedPartedBangs();

    // Base trasera continua barrida hacia la coleta alta
    addMesh(
      createHairMantleGeometry({
        cols: 24,
        rows: 10,
        yTop: 0.095,
        yBot: -0.075,
        spanAngle: Math.PI * 1.08,
        flareX: 0.010,
        flareZ: 0.008,
        swayMax: 0.12,
        phase: 0.15,
        rootTint,
        midTint,
        tipTint
      }),
      hairMat
    );

    for (const s of [-1, 1]) {
      strand(
        [
          [s * 0.106, 0.058, 0.040],
          [s * 0.122, -0.032, 0.048],
          [s * 0.110, -0.128, 0.054]
        ],
        0.022,
        0.005,
        0.009,
        0.003,
        10,
        0.42,
        s,
        [s * 0.82, 0.0, 0.56]
      );
    }

    const claspRing = addMesh(new THREE.TorusGeometry(0.034, 0.010, 8, 18), goldMat);
    claspRing.position.set(0, 0.115, -0.122);
    claspRing.rotation.x = 0.65;
    const claspGem = addMesh(new THREE.OctahedronGeometry(0.016, 0), gemMat);
    claspGem.position.set(0, 0.128, -0.148);

    // 12 mechones anchos cohesivos formando la cascada de la coleta alta
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const sx = Math.cos(a) * 0.026;
      const sy = Math.sin(a) * 0.022;
      const outX = Math.cos(a) * 0.082;
      const outZ = -0.195 - Math.abs(Math.sin(a)) * 0.028;
      strand(
        [
          [sx * 0.5, 0.118 + sy * 0.4, -0.120],
          [outX * 0.65, 0.085 + sy * 0.7, outZ],
          [outX * 1.05, -0.115, outZ - 0.022],
          [outX * 0.86, -0.325, outZ + 0.012],
          [outX * 0.62, -0.475, outZ + 0.022]
        ],
        0.040,
        0.010,
        0.014,
        0.004,
        18,
        0.96,
        i * 0.52,
        [Math.cos(a) * 0.65, 0.15, -0.75]
      );
    }
    return { group, crownAnchorY: 0.142, geometries };
  }

  // 'trenza_lateral'
  archedPartedBangs();
  addMesh(
    createHairMantleGeometry({
      cols: 24,
      rows: 10,
      yTop: 0.095,
      yBot: -0.095,
      spanAngle: Math.PI * 1.08,
      flareX: 0.014,
      flareZ: 0.012,
      swayMax: 0.16,
      phase: 0.2,
      rootTint,
      midTint,
      tipTint
    }),
    hairMat
  );

  for (let i = 0; i < 6; i++) {
    const u = i / 5;
    const ang = Math.PI * (0.64 + u * 0.72);
    const sx = Math.sin(ang);
    const sz = Math.cos(ang);
    strand(
      [
        [sx * 0.110, 0.068, sz * 0.116 - 0.010],
        [sx * 0.126 + 0.036, -0.025, sz * 0.128 - 0.012],
        [0.106 + u * 0.024, -0.105, -0.022 + u * 0.052]
      ],
      0.038,
      0.018,
      0.013,
      0.006,
      12,
      0.16,
      i * 0.6,
      [sx * 0.5 + 0.4, 0.1, sz * 0.6]
    );
  }

  // Trenza en 3 ramales anchos entrelazados en S sobre el hombro (+X)
  for (let b = 0; b < 3; b++) {
    const phaseOff = (b / 3) * TAU;
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      pts.push([
        0.128 + Math.sin(t * 10.5 + phaseOff) * 0.018 * (1 - t * 0.45),
        -0.105 - t * 0.36,
        0.048 + Math.cos(t * 10.5 + phaseOff) * 0.014 * (1 - t * 0.45) + Math.sin(t * Math.PI) * 0.030
      ]);
    }
    strand(pts, 0.028, 0.007, 0.013, 0.004, 18, 0.74, b * 1.9, [0.65, 0.05, 0.75]);
  }
  const braidTie = addMesh(new THREE.TorusGeometry(0.020, 0.006, 8, 14), goldMat);
  braidTie.position.set(0.130, -0.395, 0.052);
  braidTie.rotation.x = Math.PI / 2;
  const braidGem = addMesh(new THREE.OctahedronGeometry(0.013, 0), gemMat);
  braidGem.position.set(0.130, -0.395, 0.072);
  return { group, crownAnchorY: 0.140, geometries };
}

/**
 * Construye una tiara fina de oro rosa y cristales ceñida a la coronilla (y ~ 0.135-0.155),
 * o corona imperial esculpida.
 */
export function buildRoyalHeadpiece(type = 'tiara', materials = {}, options = {}) {
  const goldMat = materials.roseGold;
  const gemMat = materials.crystal;
  const geometries = [];
  const track = options.track || ((g) => { geometries.push(g); return g; });
  const group = new THREE.Group();

  if (type === 'tiara') {
    // Aro fino de oro rosa ceñido a la coronilla del cabello (y ~ 0.135-0.155)
    const bandCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.114, 0.102, 0.006),
      new THREE.Vector3(-0.092, 0.130, 0.050),
      new THREE.Vector3(0.0, 0.144, 0.076),
      new THREE.Vector3(0.092, 0.130, 0.050),
      new THREE.Vector3(0.114, 0.102, 0.006)
    ]);
    group.add(new THREE.Mesh(track(new THREE.TubeGeometry(bandCurve, 26, 0.0042, 8, false)), goldMat));

    // 5 arcos de filigrana con volutas simétricas
    const arches = [
      { x0: -0.084, x1: -0.044, h: 0.024, z: 0.054 },
      { x0: -0.046, x1: -0.012, h: 0.036, z: 0.068 },
      { x0: -0.018, x1: 0.018, h: 0.054, z: 0.076 },
      { x0: 0.012, x1: 0.046, h: 0.036, z: 0.068 },
      { x0: 0.044, x1: 0.084, h: 0.024, z: 0.054 }
    ];
    for (const a of arches) {
      const xm = (a.x0 + a.x1) * 0.5;
      const yBase = 0.144 - Math.abs(xm) * 0.34;
      const arcCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(a.x0, yBase - 0.006, a.z - 0.004),
        new THREE.Vector3(xm, yBase + a.h, a.z + 0.006),
        new THREE.Vector3(a.x1, yBase - 0.006, a.z - 0.004)
      ]);
      group.add(new THREE.Mesh(track(new THREE.TubeGeometry(arcCurve, 14, 0.0030, 6, false)), goldMat));
    }

    // Gema central tipo lágrima/cristal HDR y perlas laterales
    const centerGem = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.020, 1)), gemMat);
    centerGem.scale.set(0.75, 1.35, 0.55);
    centerGem.position.set(0, 0.184, 0.080);
    group.add(centerGem);

    const sideGeo = track(new THREE.OctahedronGeometry(0.010, 0));
    for (const s of [-1, 1]) {
      const g1 = new THREE.Mesh(sideGeo, gemMat);
      g1.position.set(s * 0.032, 0.168, 0.072);
      const g2 = new THREE.Mesh(sideGeo, gemMat);
      g2.scale.setScalar(0.78);
      g2.position.set(s * 0.064, 0.148, 0.056);
      group.add(g1, g2);
    }
    return { group, geometries };
  }

  // Corona Imperial
  group.position.set(0, 0.148, -0.005);
  const rimCurve = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * TAU;
    rimCurve.push(new THREE.Vector3(Math.sin(a) * 0.098, 0, Math.cos(a) * 0.101));
  }
  const baseBand = new THREE.Mesh(track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimCurve, true), 32, 0.007, 8, true)), goldMat);
  group.add(baseBand);

  const gemGeo = track(new THREE.OctahedronGeometry(0.013, 0));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const x = Math.sin(a) * 0.097;
    const z = Math.cos(a) * 0.100;
    const arch = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.sin(a - 0.36) * 0.096, 0.002, Math.cos(a - 0.36) * 0.099),
      new THREE.Vector3(x * 1.04, 0.056, z * 1.04),
      new THREE.Vector3(Math.sin(a + 0.36) * 0.096, 0.002, Math.cos(a + 0.36) * 0.099)
    ]);
    group.add(new THREE.Mesh(track(new THREE.TubeGeometry(arch, 12, 0.0038, 6, false)), goldMat));
    const gem = new THREE.Mesh(gemGeo, gemMat);
    gem.position.set(x * 1.04, 0.064, z * 1.04);
    group.add(gem);
  }
  return { group, geometries };
}

/**
 * Construye los 5 accesorios acoplables 3D (tiara, corona, gafas, bolso, cetro)
 * compatibles con el catálogo y CharacterRig.
 */
export function buildStylizedAccessories(pivots, materials, track) {
  const nodes = {};
  const headGroup = pivots.head;
  const leftForearm = pivots.forearmL;
  const rightForearm = pivots.forearmR;

  const tiaraRes = buildRoyalHeadpiece('tiara', materials, { track });
  headGroup.add(tiaraRes.group);
  nodes.tiara = tiaraRes.group;

  const coronaRes = buildRoyalHeadpiece('corona', materials, { track });
  headGroup.add(coronaRes.group);
  nodes.corona = coronaRes.group;

  // Gafas Chic con montura oro rosa curvada
  const gafas = new THREE.Group();
  const frameGeo = track(new THREE.TorusGeometry(0.027, 0.0042, 8, 20));
  const lensGeo = track(new THREE.CylinderGeometry(0.025, 0.025, 0.004, 16));
  for (const s of [-1, 1]) {
    const lens = new THREE.Mesh(lensGeo, materials.dark);
    lens.rotation.x = Math.PI / 2;
    lens.scale.set(1.18, 1, 0.82);
    lens.position.set(s * 0.043, -0.002, 0.123);
    const frame = new THREE.Mesh(frameGeo, materials.roseGold);
    frame.scale.set(1.18, 0.82, 1);
    frame.position.set(s * 0.043, -0.002, 0.125);
    gafas.add(lens, frame);
  }
  const bridgeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.012, 0.004, 0.127),
    new THREE.Vector3(0, 0.008, 0.129),
    new THREE.Vector3(0.012, 0.004, 0.127)
  ]);
  gafas.add(new THREE.Mesh(track(new THREE.TubeGeometry(bridgeCurve, 8, 0.0032, 6, false)), materials.roseGold));
  headGroup.add(gafas);
  nodes.gafas = gafas;

  // Bolso de Mano Imperial (en mano izquierda)
  const bolso = new THREE.Group();
  const bagGeo = track(new THREE.BoxGeometry(0.125, 0.098, 0.056));
  const bag = new THREE.Mesh(bagGeo, materials.roseGold);
  bag.position.set(0.016, -0.32, 0.018);
  bag.castShadow = true;
  const clasp = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.015, 0)), materials.crystal);
  clasp.position.set(0.016, -0.295, 0.048);
  const strap = new THREE.Mesh(track(new THREE.TorusGeometry(0.042, 0.006, 6, 14, Math.PI)), materials.roseGold);
  strap.position.set(0.016, -0.272, 0.018);
  bolso.add(bag, clasp, strap);
  leftForearm.add(bolso);
  nodes.bolso = bolso;

  // Cetro Estelar (en mano derecha)
  const cetro = new THREE.Group();
  const rodCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.008, -0.34, -0.14),
    new THREE.Vector3(-0.008, -0.24, 0.16),
    new THREE.Vector3(-0.008, -0.12, 0.46)
  ]);
  const rod = new THREE.Mesh(track(new THREE.TubeGeometry(rodCurve, 14, 0.010, 8, false)), materials.roseGold);
  rod.castShadow = true;
  const halo = new THREE.Mesh(track(new THREE.TorusGeometry(0.068, 0.007, 8, 22)), materials.roseGold);
  halo.position.set(-0.008, -0.105, 0.485);
  const star = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.048, 0)), materials.crystal);
  star.position.set(-0.008, -0.105, 0.485);
  cetro.add(rod, halo, star);
  rightForearm.add(cetro);
  nodes.cetro = cetro;

  return nodes;
}
