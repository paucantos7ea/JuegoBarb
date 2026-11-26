import * as THREE from 'three';
import { bakeProceduralVertexAO } from '../core/LumenArtPipeline.js';
import { initCharacterVertexAttributes } from './CharacterAnatomy.js';

const TAU = Math.PI * 2;
const _faceTexCache = new Map();
const _tmpP = new THREE.Vector3();
const _tmpN = new THREE.Vector3();
const _tmpB = new THREE.Vector3();
const _tmpT = new THREE.Vector3();
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
 * Esculpe la geometría de cabeza estilizada RPG/Anime 3D (cráneo ovoide, pómulos suaves,
 * cuencas oculares sutiles, puente y punta nasal integrados en la malla, mentón en V suave
 * y orejas esculpidas) con UVs frontales limpias y atributo aSmoothNormal (técnica Genshin).
 *
 * @param {'female'|'male'} [archetype='female']
 * @returns {THREE.BufferGeometry}
 */
export function createStylizedHeadGeometry(archetype = 'female') {
  const isMale = archetype === 'male';
  const rx = isMale ? 0.120 : 0.114;
  const ry = isMale ? 0.136 : 0.130;
  const rz = isMale ? 0.124 : 0.118;

  const baseGeo = new THREE.SphereGeometry(1.0, 40, 30);
  const pos = baseGeo.attributes.position;
  const uv = baseGeo.attributes.uv;
  const count = pos.count;

  for (let i = 0; i < count; i++) {
    let nx = pos.getX(i);
    let ny = pos.getY(i);
    let nz = pos.getZ(i);

    let x = nx * rx;
    let y = ny * ry;
    let z = nz * rz;

    // Parte superior del cráneo ligeramente más amplia y redondeada
    if (ny > 0.15) {
      const topK = smoothstep(0.15, 0.85, ny);
      x *= 1.0 + topK * 0.04;
      z *= 1.0 + topK * 0.02;
    }

    // Sienes sutilmente recogidas para definir el óvalo facial
    if (nz > 0.1 && ny > 0.0 && ny < 0.55) {
      const temple = Math.exp(-Math.pow((ny - 0.25) / 0.22, 2)) * smoothstep(0.55, 0.92, Math.abs(nx));
      x *= 1.0 - temple * 0.055;
    }

    // Pómulos suaves y mejillas ligeramente redondeadas
    if (nz > 0.25 && ny > -0.45 && ny < 0.12) {
      const cheek = Math.exp(-Math.pow((ny + 0.18) / 0.24, 2)) * smoothstep(0.28, 0.78, Math.abs(nx));
      x *= 1.0 + cheek * (isMale ? 0.025 : 0.05);
      z += cheek * (isMale ? 0.005 : 0.009);
    }

    // Cuencas oculares muy sutiles para dar profundidad natural al iris pintado
    if (nz > 0.55 && ny > -0.18 && ny < 0.22) {
      const dL = Math.hypot((x + 0.042) / 0.030, (y + 0.004) / 0.022);
      const dR = Math.hypot((x - 0.042) / 0.030, (y + 0.004) / 0.022);
      const socket = Math.exp(-dL * dL * 1.8) + Math.exp(-dR * dR * 1.8);
      z -= socket * 0.0055;
    }

    // Puente nasal sutil y punta de nariz delicada esculpidos directamente en la malla
    if (nz > 0.72 && Math.abs(x) < 0.022 && y > -0.048 && y < 0.022) {
      const horiz = Math.exp(-Math.pow(x / 0.011, 2));
      const bridge = Math.exp(-Math.pow((y + 0.015) / 0.022, 2));
      const tip = Math.exp(-Math.pow((y + 0.028) / 0.011, 2));
      z += horiz * (bridge * 0.0065 + tip * (isMale ? 0.0115 : 0.0092));
    }

    // Mandíbula afinada hacia mentón en V suave y delicado
    if (ny < -0.05) {
      const jawT = smoothstep(-0.05, -0.96, ny);
      const taper = isMale ? 0.24 : 0.36;
      x *= 1.0 - Math.pow(jawT, 1.18) * taper;
      z *= 1.0 - Math.pow(jawT, 1.38) * (isMale ? 0.05 : 0.09);
      if (nz > 0.35 && Math.abs(x) < 0.045) {
        z += Math.pow(jawT, 1.8) * (isMale ? 0.010 : 0.008);
      }
      // Mentón ligeramente hacia delante y abajo para perfil limpio
      if (ny < -0.78 && nz > 0.1) {
        y -= smoothstep(-0.78, -1.0, ny) * 0.006;
      }
    }

    // Orejas estilizadas esculpidas integradas en la malla lateral (z ~ -0.008)
    if (Math.abs(nx) > 0.86 && ny > -0.28 && ny < 0.12 && nz > -0.24 && nz < 0.18) {
      const side = nx > 0 ? 1 : -1;
      const earEnv = Math.exp(-Math.pow((y + 0.012) / 0.022, 2)) * Math.exp(-Math.pow((z + 0.006) / 0.016, 2));
      x += side * earEnv * 0.016;
      z -= earEnv * 0.004;
    }

    pos.setXYZ(i, x, y, z);

    // Proyección UV frontal limpia en [0..1], evitando cruces sobre ojos/boca desde la nuca
    if (z > 0.0) {
      const u = clamp01(0.5 + x / (rx * 2.05));
      const v = clamp01(0.5 + y / (ry * 2.10));
      uv.setXY(i, u, v);
    } else {
      const borderU = x >= 0 ? 0.97 : 0.03;
      const sideBlend = smoothstep(-0.025, 0.0, z);
      const frontU = clamp01(0.5 + x / (rx * 2.05));
      const u = borderU + (frontU - borderU) * sideBlend;
      const v = clamp01(0.88 - Math.abs(y / ry) * 0.15);
      uv.setXY(i, u, v);
    }
  }

  baseGeo.computeVertexNormals();

  // Atributo aSmoothNormal: mezcla normal geométrica con normal esférica centrada en el rostro
  const nrm = baseGeo.attributes.normal;
  const smoothArr = new Float32Array(count * 3);
  const cx = 0.0;
  const cy = -0.008;
  const cz = 0.012;

  for (let i = 0; i < count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);

    let sx = px - cx;
    let sy = py - cy;
    let sz = pz - cz;
    const sl = Math.hypot(sx, sy, sz) || 1;
    sx /= sl;
    sy /= sl;
    sz /= sl;

    const gx = nrm.getX(i);
    const gy = nrm.getY(i);
    const gz = nrm.getZ(i);

    // Suavizado fuerte en el rostro frontal (82%) para eliminar sombras duras en nariz/ojos
    const faceW = smoothstep(-0.01, 0.055, pz) * 0.82;
    let mx = gx + (sx - gx) * faceW;
    let my = gy + (sy - gy) * faceW;
    let mz = gz + (sz - gz) * faceW;
    const ml = Math.hypot(mx, my, mz) || 1;

    smoothArr[i * 3] = mx / ml;
    smoothArr[i * 3 + 1] = my / ml;
    smoothArr[i * 3 + 2] = mz / ml;
  }

  bakeProceduralVertexAO(baseGeo, {
    aoStrength: 0.12,
    minAO: 0.86,
    shadowTint: 0xd99596,
    shadowTintStrength: 0.25,
    ridgeHighlight: 0.03,
    noiseStrength: 0.0,
    baseWeight: 0.25,
    cavityWeight: 0.15,
    undersideWeight: 0.20
  });
  baseGeo.setAttribute('aSmoothNormal', new THREE.BufferAttribute(smoothArr, 3));
  initCharacterVertexAttributes(baseGeo, 0, 0);
  baseGeo.computeBoundingBox();
  baseGeo.computeBoundingSphere();
  return baseGeo;
}

/**
 * Dibuja un ojo anime/RPG 3D multicapa de alta resolución sobre el atlas 1024x1024.
 */
function drawAnimeEye(ctx, cx, cy, side, opts) {
  const { isMale, eye, skinHex } = opts;
  const ew = isMale ? 68 : 74;
  const eh = isMale ? 50 : 66;

  ctx.save();
  ctx.translate(cx, cy);

  // 1. Forma de la esclerótica (almendra estilizada)
  ctx.beginPath();
  ctx.moveTo(-ew * 0.96, eh * 0.10);
  ctx.bezierCurveTo(-ew * 0.52, -eh * 0.92, ew * 0.56, -eh * 0.90, ew * 0.98, eh * 0.04);
  ctx.bezierCurveTo(ew * 0.62, eh * 0.72, -ew * 0.52, eh * 0.74, -ew * 0.96, eh * 0.10);
  ctx.closePath();

  const scleraGrad = ctx.createLinearGradient(0, -eh * 0.85, 0, eh * 0.7);
  scleraGrad.addColorStop(0, '#cfd4e8');
  scleraGrad.addColorStop(0.26, '#f6f8ff');
  scleraGrad.addColorStop(1, '#ffffff');
  ctx.fillStyle = scleraGrad;
  ctx.fill();

  // Clip interior del ojo para iris y pupila
  ctx.save();
  ctx.clip();

  // 2. Iris grande con 4 paradas + media luna luminosa inferior
  const irX = -side * 3.0;
  const irY = eh * 0.05;
  const irR = isMale ? 38 : 45;
  const irH = isMale ? 42 : 52;

  ctx.save();
  ctx.translate(irX, irY);
  ctx.scale(1.0, irH / irR);

  const irisGrad = ctx.createLinearGradient(0, -irR, 0, irR);
  irisGrad.addColorStop(0.0, hexToCss(eye.ring));
  irisGrad.addColorStop(0.38, hexToCss(eye.iris));
  irisGrad.addColorStop(0.76, hexToCss(eye.glow));
  irisGrad.addColorStop(1.0, '#d8f6ff');

  ctx.beginPath();
  ctx.arc(0, 0, irR, 0, TAU);
  ctx.fillStyle = irisGrad;
  ctx.fill();

  // Anillo limbal oscuro exterior
  ctx.lineWidth = 4.5;
  ctx.strokeStyle = shadeHex(eye.ring, 0.55);
  ctx.stroke();

  // Micro-fibras radiales del iris
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * irR * 0.34, Math.sin(a) * irR * 0.34);
    ctx.lineTo(Math.cos(a) * irR * 0.88, Math.sin(a) * irR * 0.88);
    ctx.stroke();
  }

  // Media luna inferior luminosa
  const crescentGrad = ctx.createRadialGradient(0, irR * 0.45, 2, 0, irR * 0.45, irR * 0.62);
  crescentGrad.addColorStop(0, 'rgba(232, 250, 255, 0.86)');
  crescentGrad.addColorStop(0.6, 'rgba(184, 238, 255, 0.38)');
  crescentGrad.addColorStop(1, 'rgba(184, 238, 255, 0.0)');
  ctx.fillStyle = crescentGrad;
  ctx.beginPath();
  ctx.arc(0, irR * 0.42, irR * 0.56, 0, TAU);
  ctx.fill();

  // Pupila suave azul-índigo profundo
  const pupilGrad = ctx.createRadialGradient(0, -irR * 0.04, 1, 0, -irR * 0.04, irR * 0.40);
  pupilGrad.addColorStop(0, '#0c0a24');
  pupilGrad.addColorStop(0.7, '#16143a');
  pupilGrad.addColorStop(1, 'rgba(22, 20, 58, 0.0)');
  ctx.fillStyle = pupilGrad;
  ctx.beginPath();
  ctx.arc(0, -irR * 0.04, irR * 0.40, 0, TAU);
  ctx.fill();

  // Sombra superior del párpado sobre la parte alta del iris
  const lidShadow = ctx.createLinearGradient(0, -irR, 0, -irR * 0.15);
  lidShadow.addColorStop(0, 'rgba(24, 16, 48, 0.55)');
  lidShadow.addColorStop(1, 'rgba(24, 16, 48, 0.0)');
  ctx.fillStyle = lidShadow;
  ctx.fillRect(-irR, -irR, irR * 2, irR);

  ctx.restore();

  // Doble destello blanco nítido (catchlights)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
  ctx.beginPath();
  ctx.ellipse(irX - 18 * side, irY - 18, 11.5, 10.0, -0.25 * side, 0, TAU);
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.90)';
  ctx.beginPath();
  ctx.arc(irX + 16 * side, irY + 17, 5.2, 0, TAU);
  ctx.fill();

  ctx.restore(); // Fin clip de ojo

  // 3. Pestañas superiores curvadas y densas con rabillo delicado
  const outerDir = side; // +1 en ojo derecho (+X), -1 en ojo izquierdo (-X)
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#1e1326';
  ctx.lineWidth = isMale ? 7.5 : 10.5;
  ctx.beginPath();
  ctx.moveTo(-ew * 0.94 * outerDir, eh * 0.14);
  ctx.bezierCurveTo(-ew * 0.46 * outerDir, -eh * 0.92, ew * 0.48 * outerDir, -eh * 0.94, ew * 1.05 * outerDir, -eh * 0.08);
  ctx.stroke();

  if (!isMale) {
    // Rabillo elegante y 3 pestañas exteriores sutiles
    ctx.lineWidth = 4.2;
    for (let k = 0; k < 3; k++) {
      const bx = ew * (0.76 + k * 0.11) * outerDir;
      const by = -eh * (0.34 - k * 0.13);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + 10 * outerDir, by - 8, bx + 18 * outerDir, by - (14 - k * 3));
      ctx.stroke();
    }
  }

  // Línea inferior sutil de pestañas
  ctx.strokeStyle = 'rgba(58, 36, 54, 0.55)';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(-ew * 0.70, eh * 0.36);
  ctx.quadraticCurveTo(0, eh * 0.66, ew * 0.70, eh * 0.34);
  ctx.stroke();

  // Pliegue delicado del párpado superior
  ctx.strokeStyle = shadeHex(skinHex, 0.74);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-ew * 0.72, -eh * 0.88);
  ctx.quadraticCurveTo(0, -eh * 1.24, ew * 0.80, -eh * 0.76);
  ctx.stroke();

  ctx.restore();
}

/**
 * Genera y cachea en memoria el par de texturas faciales (openMap 1024x1024 + blinkMap 512x512).
 * Cero regeneración en runtime.
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

  // Degradado sutil cálido en la zona frontal y mentón
  const warmGlow = ctx.createRadialGradient(512, 530, 80, 512, 530, 420);
  warmGlow.addColorStop(0, 'rgba(255, 240, 232, 0.14)');
  warmGlow.addColorStop(1, 'rgba(225, 165, 168, 0.0)');
  ctx.fillStyle = warmGlow;
  ctx.fillRect(0, 0, size, size);

  // Rubor melocotón-rosado suave en mejillas y puente nasal
  const blushCss = hexToCss(skin.blush);
  for (const cx of [235, 789]) {
    const g = ctx.createRadialGradient(cx, 628, 8, cx, 628, isMale ? 68 : 92);
    g.addColorStop(0, isMale ? 'rgba(226, 132, 146, 0.22)' : 'rgba(244, 142, 168, 0.40)');
    g.addColorStop(0.55, isMale ? 'rgba(226, 132, 146, 0.08)' : 'rgba(244, 142, 168, 0.18)');
    g.addColorStop(1, 'rgba(244, 142, 168, 0.0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, 628, 96, 62, 0, 0, TAU);
    ctx.fill();

    if (!isMale) {
      // Micro-destellos estilizados sobre pómulos (como ilustración RPG/anime)
      ctx.fillStyle = 'rgba(255, 246, 248, 0.36)';
      ctx.beginPath();
      ctx.ellipse(cx + (cx < 512 ? 12 : -12), 618, 9, 4.5, 0, 0, TAU);
      ctx.fill();
    }
  }
  // Rubor sutil en el puente nasal
  const noseBlush = ctx.createRadialGradient(512, 626, 4, 512, 626, 46);
  noseBlush.addColorStop(0, isMale ? 'rgba(220, 140, 145, 0.12)' : 'rgba(242, 148, 165, 0.24)');
  noseBlush.addColorStop(1, 'rgba(242, 148, 165, 0.0)');
  ctx.fillStyle = noseBlush;
  ctx.beginPath();
  ctx.ellipse(512, 626, 48, 22, 0, 0, TAU);
  ctx.fill();

  // Ojos simétricos alineados con UV (u = 0.316 -> 324, u = 0.684 -> 700, v = 0.485 -> 527)
  drawAnimeEye(ctx, 324, 527, -1, { isMale, eye, skinHex: skin.hex, blushCss });
  drawAnimeEye(ctx, 700, 527, 1, { isMale, eye, skinHex: skin.hex, blushCss });

  // Cejas finas arqueadas en tono miel/castaño del cabello
  ctx.strokeStyle = hexToCss(hairColor.brow);
  ctx.lineCap = 'round';
  ctx.lineWidth = isMale ? 7.0 : 5.0;
  for (const s of [-1, 1]) {
    const bx0 = 512 + s * 108;
    const bx1 = 512 + s * 195;
    const bx2 = 512 + s * 278;
    ctx.beginPath();
    ctx.moveTo(bx0, 412);
    ctx.quadraticCurveTo(bx1, isMale ? 392 : 382, bx2, 408);
    ctx.stroke();
  }

  // Sombra delicada bajo la punta nasal (coincide con el relieve geométrico)
  const noseShade = ctx.createRadialGradient(512, 650, 2, 512, 650, 22);
  noseShade.addColorStop(0, shadeHex(skin.hex, 0.84));
  noseShade.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = noseShade;
  ctx.beginPath();
  ctx.ellipse(512, 650, 16, 10, 0, 0, TAU);
  ctx.fill();

  // Labios delicados en coral rosado con brillo sutil (v = 0.251 -> y = 767)
  const lipY = 767;
  const lipW = isMale ? 50 : 46;
  ctx.lineCap = 'round';

  if (!isMale) {
    // Labio inferior con degradado coral rosado + gloss
    const lipGrad = ctx.createLinearGradient(512, lipY - 4, 512, lipY + 20);
    lipGrad.addColorStop(0, hexToCss(skin.lip));
    lipGrad.addColorStop(1, 'rgba(244, 150, 174, 0.15)');
    ctx.fillStyle = lipGrad;
    ctx.beginPath();
    ctx.moveTo(512 - lipW * 0.72, lipY + 2);
    ctx.quadraticCurveTo(512, lipY + 22, 512 + lipW * 0.72, lipY + 2);
    ctx.quadraticCurveTo(512, lipY + 5, 512 - lipW * 0.72, lipY + 2);
    ctx.fill();

    // Micro-brillo labial inferior
    ctx.fillStyle = 'rgba(255, 240, 244, 0.62)';
    ctx.beginPath();
    ctx.ellipse(512, lipY + 10, 12, 3.5, 0, 0, TAU);
    ctx.fill();
  }

  // Línea labial sonriente delicada
  ctx.strokeStyle = shadeHex(skin.lip, isMale ? 0.68 : 0.76);
  ctx.lineWidth = isMale ? 3.2 : 3.6;
  ctx.beginPath();
  ctx.moveTo(512 - lipW, lipY - 2);
  ctx.quadraticCurveTo(512 - lipW * 0.35, lipY + 4, 512, lipY + 2);
  ctx.quadraticCurveTo(512 + lipW * 0.35, lipY + 4, 512 + lipW, lipY - 2);
  ctx.stroke();

  const openMap = new THREE.CanvasTexture(canvas);
  openMap.colorSpace = THREE.SRGBColorSpace;
  openMap.anisotropy = 4;
  openMap.needsUpdate = true;

  // Textura blinkMap 512x512 (párpados cerrados para parpadeo 0-GC)
  const bSize = 512;
  const bCanvas = document.createElement('canvas');
  bCanvas.width = bSize;
  bCanvas.height = bSize;
  const bCtx = bCanvas.getContext('2d');
  bCtx.fillStyle = skinCss;
  bCtx.fillRect(0, 0, bSize, bSize);

  for (const [ex, side] of [[162, -1], [350, 1]]) {
    const ey = 263.5;
    bCtx.strokeStyle = shadeHex(skin.hex, 0.76);
    bCtx.lineWidth = 2.2;
    bCtx.beginPath();
    bCtx.moveTo(ex - 26, ey - 16);
    bCtx.quadraticCurveTo(ex, ey - 26, ex + 26, ey - 16);
    bCtx.stroke();

    bCtx.strokeStyle = '#1e1326';
    bCtx.lineCap = 'round';
    bCtx.lineWidth = isMale ? 4.2 : 5.4;
    bCtx.beginPath();
    bCtx.moveTo(ex - 34, ey + 2);
    bCtx.quadraticCurveTo(ex, ey + 15, ex + 36 * side + (side < 0 ? 68 : 0), ey + 1);
    bCtx.stroke();

    if (!isMale) {
      bCtx.lineWidth = 2.6;
      bCtx.beginPath();
      bCtx.moveTo(ex + 32 * side, ey + 3);
      bCtx.lineTo(ex + 41 * side, ey - 2);
      bCtx.stroke();
    }
  }

  const blinkMap = new THREE.CanvasTexture(bCanvas);
  blinkMap.colorSpace = THREE.SRGBColorSpace;
  blinkMap.needsUpdate = true;

  const entry = { openMap, blinkMap };
  _faceTexCache.set(cacheKey, entry);
  return entry;
}

/**
 * Construye un mechón capilar 3D con sección en diamante/cresta suave (para Angel Ring),
 * puntas afiladas, gradiente de color raíz->puntas y atributos aSwayWeight / aStrandPhase.
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
    rootTint = 0x8a7a6c,
    midTint = 0xffffff,
    tipTint = 0xfff5e4,
    outwardHint = null
  } = options;

  const vecPts = curvePoints.map((p) => (p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2])));
  const curve = new THREE.CatmullRomCurve3(vecPts, false, 'centripetal');

  const ringCount = segments + 1;
  // 5 vértices por anillo (borde izq -> cresta frontal -> borde der -> quilla trasera -> cierre) para UV continua y Angel Ring
  const vertsPerRing = 5;
  const vTotal = ringCount * vertsPerRing;
  const positions = new Float32Array(vTotal * 3);
  const uvs = new Float32Array(vTotal * 2);
  const colors = new Float32Array(vTotal * 3);
  const swayArr = new Float32Array(vTotal);
  const phaseArr = new Float32Array(vTotal);
  const indices = [];

  _rootCol.set(rootTint);
  _midCol.set(midTint);
  _tipCol.set(tipTint);

  const hint = outwardHint || new THREE.Vector3(0, 0.15, 1);

  for (let i = 0; i < ringCount; i++) {
    const t = i / segments;
    curve.getPointAt(t, _tmpP);
    curve.getTangentAt(t, _tmpT).normalize();

    // Marco estable orientado hacia el exterior del cráneo
    if (outwardHint) {
      _tmpN.copy(hint);
    } else {
      _tmpN.set(_tmpP.x, Math.max(0.05, _tmpP.y * 0.25), _tmpP.z);
      if (_tmpN.lengthSq() < 1e-5) _tmpN.set(0, 0, 1);
    }
    // Ortogonalizar N respecto a tangente T
    _tmpN.addScaledVector(_tmpT, -_tmpN.dot(_tmpT));
    if (_tmpN.lengthSq() < 1e-6) {
      _tmpN.set(1, 0, 0).cross(_tmpT);
    }
    _tmpN.normalize();
    _tmpB.crossVectors(_tmpT, _tmpN).normalize();

    const rootEase = t < 0.12 ? 0.55 + 0.45 * (t / 0.12) : 1.0;
    const tipTaper = 1.0 - Math.pow(t, 2.2) * 0.94;
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
      indices.push(a0, b0, a1, a1, b0, b1);
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
 * Construye una base craneal orgánica ceñida al cráneo (sin efecto casco redondo).
 */
function createScalpCapGeometry(isMale, rootTint, midTint) {
  const rx = isMale ? 0.123 : 0.118;
  const ry = isMale ? 0.138 : 0.132;
  const rz = isMale ? 0.127 : 0.122;

  const geo = new THREE.SphereGeometry(1.0, 26, 16, 0, TAU, 0, Math.PI * 0.56);
  const pos = geo.attributes.position;
  const count = pos.count;
  const colors = new Float32Array(count * 3);
  const sway = new Float32Array(count);
  const phase = new Float32Array(count);

  _rootCol.set(rootTint);
  _midCol.set(midTint);

  for (let i = 0; i < count; i++) {
    let x = pos.getX(i) * rx;
    let y = pos.getY(i) * ry;
    let z = pos.getZ(i) * rz;

    // Despeja la frente por delante y baja ligeramente hacia la nuca
    if (z > 0.015) {
      y += z * 0.34;
    } else {
      y -= Math.abs(z) * 0.16;
    }
    pos.setXYZ(i, x, y + 0.008, z - 0.006);

    const mixK = smoothstep(-0.02, 0.13, y);
    _tmpC.copy(_rootCol).lerp(_midCol, mixK * 0.65);
    colors[i * 3] = _tmpC.r;
    colors[i * 3 + 1] = _tmpC.g;
    colors[i * 3 + 2] = _tmpC.b;
  }

  geo.computeVertexNormals();
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSwayWeight', new THREE.BufferAttribute(sway, 1));
  geo.setAttribute('aStrandPhase', new THREE.BufferAttribute(phase, 1));
  initCharacterVertexAttributes(geo, 0, 0);
  return geo;
}

/**
 * Construye un sistema completo de cabello volumétrico por mechones 3D curvados.
 * Soporta los 5 estilos del catálogo + variantes de la Biblia de Arte.
 *
 * @param {string} styleId
 * @param {object} [options]
 * @returns {{ group: THREE.Group, crownAnchorY: number, geometries: THREE.BufferGeometry[] }}
 */
export function buildVolumetricHair(styleId = 'princess_imperial_waves', options = {}) {
  const {
    materials = {},
    isMale = false,
    hairColor = { hex: 0xf0c975 }
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

  // Gradiente natural de raíz cálida -> cuerpo -> puntas luminosas
  const rootTint = 0xc9a896;
  const midTint = 0xffffff;
  const tipTint = 0xfff5e0;

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
      (t) => (w0 * (1 - t) + w1 * t),
      (t) => (thick0 * (1 - t) + thick1 * t),
      { segments: segs, swayMax, phase, rootTint, midTint, tipTint, outwardHint: outHint }
    );
    return addMesh(geo, hairMat, swayMax > 0.4);
  };

  if (normalized === 'prince_royal_tousled' || normalized === 'court_noble_short') {
    const isSwept = normalized === 'court_noble_short';
    // Flequillo asimétrico masculino en mechones afilados (20-24 mechones en capas)
    const bangCount = 9;
    for (let i = 0; i < bangCount; i++) {
      const k = i / (bangCount - 1);
      const x0 = -0.095 + k * 0.19;
      const sideBias = x0 + (isSwept ? 0.04 : -0.02);
      const lenDrop = isSwept ? 0.035 : (0.075 + (i % 3) * 0.022);
      strand([
        [x0 * 0.65, 0.132, 0.042],
        [x0 * 0.92, 0.105, 0.102],
        [sideBias * 1.05, 0.068 - lenDrop * 0.45, 0.124],
        [sideBias * 1.18, 0.032 - lenDrop, 0.114]
      ], 0.028, 0.004, 0.014, 0.003, 12, 0.25, i * 0.71);
    }
    // Capas superiores despeinadas hacia atrás y coronilla
    for (let i = 0; i < 7; i++) {
      const a = (i / 6 - 0.5) * 1.8;
      strand([
        [Math.sin(a) * 0.04, 0.142, 0.01],
        [Math.sin(a) * 0.085, 0.148, -0.045],
        [Math.sin(a) * 0.112, 0.088, -0.108],
        [Math.sin(a) * 0.108, 0.005, -0.132]
      ], 0.036, 0.008, 0.018, 0.004, 12, 0.35, 3.0 + i * 0.63);
    }
    // Patillas y nuca escalonada en capas
    for (const s of [-1, 1]) {
      strand([
        [s * 0.105, 0.065, 0.032],
        [s * 0.122, 0.015, 0.026],
        [s * 0.115, -0.048, 0.012]
      ], 0.024, 0.005, 0.011, 0.003, 10, 0.22, s * 1.4);
      strand([
        [s * 0.085, 0.045, -0.075],
        [s * 0.095, -0.025, -0.115],
        [s * 0.082, -0.095, -0.108]
      ], 0.032, 0.007, 0.014, 0.003, 10, 0.42, 5.2 + s * 0.8);
    }
    for (let i = 0; i < 5; i++) {
      const x = -0.065 + (i / 4) * 0.13;
      strand([
        [x * 0.7, 0.055, -0.098],
        [x * 0.95, -0.015, -0.128],
        [x * 0.85, -0.105, -0.116]
      ], 0.034, 0.007, 0.015, 0.003, 12, 0.45, 7.1 + i * 0.52);
    }
    return { group, crownAnchorY: 0.145, geometries };
  }

  // Flequillo partido lateralmente común para estilos femeninos (8 mechones enmarcando pómulos)
  const sidePart = (count = 8) => {
    for (let i = 0; i < count; i++) {
      const isRight = i >= count / 2;
      const localIdx = isRight ? i - count / 2 : i;
      const side = isRight ? 1 : -1;
      const spread = 0.025 + localIdx * 0.028;
      const drop = 0.055 + localIdx * 0.018;
      strand([
        [side * 0.012, 0.135, 0.052],
        [side * (0.045 + spread * 0.55), 0.108, 0.108],
        [side * (0.082 + spread * 0.45), 0.038 - drop * 0.3, 0.112 - localIdx * 0.01],
        [side * (0.098 + spread * 0.30), -0.052 - drop, 0.075 - localIdx * 0.014]
      ], 0.026, 0.004, 0.011, 0.003, 14, 0.32, i * 0.83);
    }
  };

  if (normalized === 'princess_imperial_waves') {
    // Protagonista: 34 mechones en capas hasta debajo de la cintura
    sidePart(8);

    // 4 mechones finos sueltos (wisps) alrededor de sienes y mejillas
    for (const s of [-1, 1]) {
      strand([
        [s * 0.108, 0.042, 0.045],
        [s * 0.122, -0.035, 0.052],
        [s * 0.114, -0.125, 0.042]
      ], 0.014, 0.003, 0.007, 0.002, 10, 0.48, 2.2 + s);
      strand([
        [s * 0.095, 0.075, 0.068],
        [s * 0.120, 0.005, 0.084],
        [s * 0.112, -0.085, 0.070]
      ], 0.012, 0.0025, 0.006, 0.002, 10, 0.45, 4.1 + s);
    }

    // 4 tirabuzones laterales largos ondulados cayendo sobre hombros y pecho
    for (const s of [-1, 1]) {
      strand([
        [s * 0.108, 0.078, 0.030],
        [s * 0.145, -0.045, 0.055],
        [s * 0.132, -0.195, 0.072],
        [s * 0.152, -0.345, 0.048],
        [s * 0.135, -0.495, 0.065]
      ], 0.030, 0.006, 0.014, 0.003, 18, 0.85, 1.3 * s);
      strand([
        [s * 0.114, 0.055, -0.008],
        [s * 0.154, -0.085, 0.025],
        [s * 0.142, -0.245, 0.048],
        [s * 0.162, -0.395, 0.022],
        [s * 0.146, -0.540, 0.038]
      ], 0.028, 0.006, 0.013, 0.003, 18, 0.92, 2.7 * s);
    }

    // 18 mechones traseros en doble cascada ondulada (capa interna y externa hasta debajo de la cintura)
    const innerCount = 8;
    for (let i = 0; i < innerCount; i++) {
      const u = i / (innerCount - 1);
      const ang = Math.PI * (0.64 + u * 0.72);
      const sx = Math.sin(ang);
      const sz = Math.cos(ang);
      const waveOff = (i % 2 === 0 ? 1 : -1) * 0.022;
      strand([
        [sx * 0.106, 0.072, sz * 0.112 - 0.012],
        [sx * 0.128, -0.080, sz * 0.140 - 0.016],
        [sx * 0.148 + waveOff * 0.4, -0.255, sz * 0.168 - 0.026],
        [sx * 0.162 - waveOff * 0.5, -0.435, sz * 0.184 - 0.035],
        [sx * 0.155 + waveOff * 0.6, -0.605, sz * 0.175 - 0.028]
      ], 0.038, 0.009, 0.015, 0.003, 20, 0.95, 0.8 + i * 0.68);
    }

    const outerCount = 10;
    for (let i = 0; i < outerCount; i++) {
      const u = i / (outerCount - 1);
      const ang = Math.PI * (0.56 + u * 0.88);
      const sx = Math.sin(ang);
      const sz = Math.cos(ang);
      const waveA = Math.sin(i * 1.9) * 0.028;
      const lenExtra = (1.0 - Math.abs(u - 0.5) * 1.1) * 0.08;
      strand([
        [sx * 0.112, 0.095, sz * 0.118 - 0.010],
        [sx * 0.138, -0.075, sz * 0.156 - 0.018],
        [sx * 0.168 + waveA * 0.5, -0.265, sz * 0.194 - 0.028],
        [sx * 0.186 - waveA * 0.7, -0.455 - lenExtra * 0.4, sz * 0.208 - 0.038],
        [sx * 0.174 + waveA * 0.6, -0.635 - lenExtra, sz * 0.192 - 0.024]
      ], 0.042, 0.008, 0.017, 0.004, 22, 1.0, 4.4 + i * 0.59);
    }
    return { group, crownAnchorY: 0.140, geometries };
  }

  if (normalized === 'court_updo_bun') {
    sidePart(6);
    // Wisps suaves en nuca y patillas
    for (const s of [-1, 1]) {
      strand([
        [s * 0.105, 0.055, 0.040],
        [s * 0.118, -0.030, 0.044],
        [s * 0.105, -0.115, 0.032]
      ], 0.018, 0.003, 0.008, 0.002, 10, 0.45, s * 1.5);
      // Barridos laterales hacia el moño alto
      strand([
        [s * 0.108, 0.065, 0.015],
        [s * 0.095, 0.115, -0.055],
        [s * 0.032, 0.155, -0.092]
      ], 0.034, 0.016, 0.014, 0.007, 12, 0.05, 2.0 + s);
    }
    // Moño alto imperial construido con 8 cintas trenzadas envolventes
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      const r0 = 0.058;
      const r1 = 0.072;
      strand([
        [Math.cos(a) * r0, 0.135, -0.088 + Math.sin(a) * r0],
        [Math.cos(a + 0.85) * r1, 0.172, -0.088 + Math.sin(a + 0.85) * r1],
        [Math.cos(a + 1.75) * r0 * 0.78, 0.210, -0.088 + Math.sin(a + 1.75) * r0 * 0.78],
        [Math.cos(a + 2.55) * 0.025, 0.222, -0.088 + Math.sin(a + 2.55) * 0.025]
      ], 0.030, 0.010, 0.016, 0.005, 12, 0.08, k * 0.78);
    }
    // Horquilla imperial dorada con gema cristal
    addMesh(new THREE.TorusGeometry(0.068, 0.007, 8, 22), goldMat).position.set(0, 0.145, -0.088);
    group.children[group.children.length - 1].rotation.x = Math.PI / 2;
    const pin = addMesh(new THREE.OctahedronGeometry(0.017, 0), gemMat);
    pin.position.set(0.068, 0.188, -0.105);
    return { group, crownAnchorY: 0.138, geometries };
  }

  if (normalized === 'court_half_up') {
    sidePart(8);
    // Semirrecogido lateral hacia pasador trasero + cascada a media espalda
    for (const s of [-1, 1]) {
      strand([
        [s * 0.112, 0.065, 0.032],
        [s * 0.128, 0.035, -0.052],
        [s * 0.055, 0.018, -0.134],
        [0, 0.012, -0.145]
      ], 0.032, 0.012, 0.014, 0.006, 12, 0.12, s * 1.1);
      strand([
        [s * 0.108, 0.055, 0.038],
        [s * 0.134, -0.055, 0.045],
        [s * 0.126, -0.175, 0.048]
      ], 0.028, 0.005, 0.012, 0.003, 12, 0.65, 2.4 + s);
    }
    for (let i = 0; i < 12; i++) {
      const u = i / 11;
      const ang = Math.PI * (0.58 + u * 0.84);
      const sx = Math.sin(ang);
      const sz = Math.cos(ang);
      const wave = Math.sin(i * 1.7) * 0.020;
      strand([
        [sx * 0.108, 0.065, sz * 0.115 - 0.010],
        [sx * 0.138, -0.065, sz * 0.148 - 0.018],
        [sx * 0.158 + wave, -0.205, sz * 0.175 - 0.025],
        [sx * 0.152 - wave * 0.6, -0.325, sz * 0.165 - 0.020]
      ], 0.036, 0.007, 0.015, 0.003, 16, 0.78, i * 0.61);
    }
    // Lazo satinado trasero + gema
    const bow = addMesh(new THREE.TorusGeometry(0.024, 0.006, 8, 16), ribbonMat);
    bow.position.set(0, 0.014, -0.148);
    bow.scale.set(1.3, 0.75, 0.8);
    const jewel = addMesh(new THREE.OctahedronGeometry(0.016, 0), gemMat);
    jewel.position.set(0, 0.014, -0.155);
    return { group, crownAnchorY: 0.138, geometries };
  }

  if (normalized === 'coleta_alta') {
    sidePart(6);
    for (const s of [-1, 1]) {
      strand([
        [s * 0.105, 0.058, 0.042],
        [s * 0.122, -0.035, 0.048],
        [s * 0.108, -0.132, 0.055]
      ], 0.020, 0.004, 0.009, 0.002, 10, 0.45, s);
    }
    const claspRing = addMesh(new THREE.TorusGeometry(0.034, 0.010, 8, 18), goldMat);
    claspRing.position.set(0, 0.115, -0.122);
    claspRing.rotation.x = 0.65;
    const claspGem = addMesh(new THREE.OctahedronGeometry(0.016, 0), gemMat);
    claspGem.position.set(0, 0.128, -0.148);

    // 14 mechones en cascada de coleta alta fluida
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      const sx = Math.cos(a) * 0.028;
      const sy = Math.sin(a) * 0.024;
      const outX = Math.cos(a) * 0.088;
      const outZ = -0.195 - Math.abs(Math.sin(a)) * 0.035;
      strand([
        [sx * 0.5, 0.118 + sy * 0.4, -0.120],
        [outX * 0.7, 0.085 + sy * 0.8, outZ],
        [outX * 1.12, -0.115, outZ - 0.025],
        [outX * 0.88, -0.325, outZ + 0.015],
        [outX * 0.65, -0.475, outZ + 0.025]
      ], 0.032, 0.007, 0.014, 0.003, 18, 0.98, i * 0.48);
    }
    return { group, crownAnchorY: 0.140, geometries };
  }

  // 'trenza_lateral'
  sidePart(6);
  for (let i = 0; i < 8; i++) {
    const u = i / 7;
    const ang = Math.PI * (0.62 + u * 0.76);
    strand([
      [Math.sin(ang) * 0.106, 0.068, Math.cos(ang) * 0.114 - 0.010],
      [Math.sin(ang) * 0.122 + 0.035, -0.025, Math.cos(ang) * 0.125 - 0.012],
      [0.108 + u * 0.025, -0.105, -0.025 + u * 0.055]
    ], 0.032, 0.014, 0.013, 0.006, 12, 0.16, i * 0.6);
  }
  // Trenza en 3 ramales entrelazados en S cayendo sobre el hombro izquierdo (+X)
  for (let b = 0; b < 3; b++) {
    const phaseOff = (b / 3) * TAU;
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      pts.push([
        0.124 + Math.sin(t * 10.5 + phaseOff) * 0.018 * (1 - t * 0.5),
        -0.105 - t * 0.36,
        0.042 + Math.cos(t * 10.5 + phaseOff) * 0.014 * (1 - t * 0.5) + Math.sin(t * Math.PI) * 0.028
      ]);
    }
    strand(pts, 0.024, 0.005, 0.014, 0.003, 18, 0.76, b * 1.9);
  }
  const braidTie = addMesh(new THREE.TorusGeometry(0.020, 0.006, 8, 14), goldMat);
  braidTie.position.set(0.126, -0.395, 0.048);
  braidTie.rotation.x = Math.PI / 2;
  const braidGem = addMesh(new THREE.OctahedronGeometry(0.013, 0), gemMat);
  braidGem.position.set(0.126, -0.395, 0.068);
  return { group, crownAnchorY: 0.138, geometries };
}

/**
 * Construye una tiara fina de oro rosa y cristales, o corona imperial esculpida.
 */
export function buildRoyalHeadpiece(type = 'tiara', materials = {}, options = {}) {
  const goldMat = materials.roseGold;
  const gemMat = materials.crystal;
  const geometries = [];
  const track = options.track || ((g) => { geometries.push(g); return g; });
  const group = new THREE.Group();

  if (type === 'tiara') {
    // Aro fino de oro rosa ceñido al cráneo
    const bandCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.108, 0.102, 0.008),
      new THREE.Vector3(-0.088, 0.128, 0.056),
      new THREE.Vector3(0.0, 0.142, 0.082),
      new THREE.Vector3(0.088, 0.128, 0.056),
      new THREE.Vector3(0.108, 0.102, 0.008)
    ]);
    group.add(new THREE.Mesh(track(new THREE.TubeGeometry(bandCurve, 26, 0.0042, 8, false)), goldMat));

    // 5 arcos de filigrana con volutas simétricas
    const arches = [
      { x0: -0.084, x1: -0.044, h: 0.024, z: 0.058 },
      { x0: -0.046, x1: -0.012, h: 0.038, z: 0.074 },
      { x0: -0.018, x1: 0.018, h: 0.058, z: 0.082 },
      { x0: 0.012, x1: 0.046, h: 0.038, z: 0.074 },
      { x0: 0.044, x1: 0.084, h: 0.024, z: 0.058 }
    ];
    for (const a of arches) {
      const xm = (a.x0 + a.x1) * 0.5;
      const yBase = 0.142 - Math.abs(xm) * 0.34;
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
    centerGem.position.set(0, 0.184, 0.086);
    group.add(centerGem);

    const sideGeo = track(new THREE.OctahedronGeometry(0.010, 0));
    for (const s of [-1, 1]) {
      const g1 = new THREE.Mesh(sideGeo, gemMat);
      g1.position.set(s * 0.032, 0.168, 0.078);
      const g2 = new THREE.Mesh(sideGeo, gemMat);
      g2.scale.setScalar(0.78);
      g2.position.set(s * 0.064, 0.148, 0.060);
      group.add(g1, g2);
    }
    return { group, geometries };
  }

  // Corona Imperial
  group.position.set(0, 0.145, -0.004);
  const rimCurve = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * TAU;
    rimCurve.push(new THREE.Vector3(Math.sin(a) * 0.095, 0, Math.cos(a) * 0.098));
  }
  const baseBand = new THREE.Mesh(track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimCurve, true), 32, 0.007, 8, true)), goldMat);
  group.add(baseBand);

  const gemGeo = track(new THREE.OctahedronGeometry(0.013, 0));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const x = Math.sin(a) * 0.094;
    const z = Math.cos(a) * 0.097;
    const arch = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.sin(a - 0.36) * 0.093, 0.002, Math.cos(a - 0.36) * 0.096),
      new THREE.Vector3(x * 1.04, 0.056, z * 1.04),
      new THREE.Vector3(Math.sin(a + 0.36) * 0.093, 0.002, Math.cos(a + 0.36) * 0.096)
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
    lens.position.set(s * 0.042, -0.002, 0.122);
    const frame = new THREE.Mesh(frameGeo, materials.roseGold);
    frame.scale.set(1.18, 0.82, 1);
    frame.position.set(s * 0.042, -0.002, 0.124);
    gafas.add(lens, frame);
  }
  const bridgeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.012, 0.004, 0.126),
    new THREE.Vector3(0, 0.008, 0.128),
    new THREE.Vector3(0.012, 0.004, 0.126)
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
