import * as THREE from 'three';
import { bakeProceduralVertexAO } from '../core/LumenArtPipeline.js';
import { initCharacterVertexAttributes, ensureOutwardWinding } from './CharacterAnatomy.js';

const TAU = Math.PI * 2;
const _coutureTexCache = new Map();
const _axisCenter = new THREE.Vector3();

function defaultAxisCenter(c, out = _axisCenter) {
  return out.set(0, c.y, 0);
}

/**
 * 6 Paletas cortesanas armónicas con el Reino Rosa Nocturno (Parte 3).
 */
export const COURT_PALETTES = Object.freeze({
  imperial_lavender: Object.freeze({
    id: 'imperial_lavender',
    primary: 0xb794e6,
    secondary: 0xf4ebff,
    accent: 0xeac27a,
    deep: 0x623f9e,
    tulle: 0xd9c2ff
  }),
  champagne_gold: Object.freeze({
    id: 'champagne_gold',
    primary: 0xf2d1b3,
    secondary: 0xfff8ee,
    accent: 0xe6b868,
    deep: 0xc98f66,
    tulle: 0xffe8cc
  }),
  petal_rose: Object.freeze({
    id: 'petal_rose',
    primary: 0xf5a6c6,
    secondary: 0xfff0f6,
    accent: 0xebc074,
    deep: 0xc85d8e,
    tulle: 0xffd2e6
  }),
  starlight_sapphire: Object.freeze({
    id: 'starlight_sapphire',
    primary: 0x263f7e,
    secondary: 0xe8f2ff,
    accent: 0xebbf6b,
    deep: 0x14224a,
    tulle: 0x9ec8ff
  }),
  palace_emerald: Object.freeze({
    id: 'palace_emerald',
    primary: 0x2a7c66,
    secondary: 0xebfff6,
    accent: 0xeac170,
    deep: 0x16493c,
    tulle: 0x9de6cb
  }),
  velvet_burgundy: Object.freeze({
    id: 'velvet_burgundy',
    primary: 0x7c2248,
    secondary: 0xfae8ef,
    accent: 0xe8be6d,
    deep: 0x48102a,
    tulle: 0xea9dc0
  })
});

function hexCss(hex, alpha = 1) {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

function mixHexCss(hexA, hexB, t) {
  const rA = (hexA >> 16) & 0xff;
  const gA = (hexA >> 8) & 0xff;
  const bA = hexA & 0xff;
  const rB = (hexB >> 16) & 0xff;
  const gB = (hexB >> 8) & 0xff;
  const bB = hexB & 0xff;
  const r = Math.round(rA + (rB - rA) * t);
  const g = Math.round(gA + (gB - gA) * t);
  const b = Math.round(bA + (bB - bA) * t);
  return `rgb(${r},${g},${b})`;
}

function drawGoldPath(ctx, bCtx, rCtx, size, bSize, lw, drawFn) {
  const scale = bSize / size;
  ctx.lineWidth = lw;
  ctx.beginPath();
  drawFn(ctx, 1);
  ctx.stroke();

  bCtx.lineWidth = Math.max(1.5, lw * scale);
  bCtx.beginPath();
  drawFn(bCtx, scale);
  bCtx.stroke();

  rCtx.lineWidth = Math.max(1.8, lw * scale);
  rCtx.beginPath();
  drawFn(rCtx, scale);
  rCtx.stroke();
}

/**
 * Genera y cachea texturas PBR procedurales de alta costura en Canvas2D:
 * 'silk_embroidery', 'peplum_silk', 'corset_lace', 'starlight_tulle', 'royal_velvet'.
 *
 * @param {'silk_embroidery'|'peplum_silk'|'corset_lace'|'starlight_tulle'|'royal_velvet'} styleKey
 * @param {object} palette
 * @returns {{ map: THREE.CanvasTexture, bumpMap: THREE.CanvasTexture, roughnessMap: THREE.CanvasTexture, alphaMap?: THREE.CanvasTexture }}
 */
export function getCoutureTextures(styleKey = 'silk_embroidery', palette = {}) {
  const primary = palette.primary ?? 0xf5a6c6;
  const secondary = palette.secondary ?? 0xfff0f6;
  const accent = palette.accent ?? 0xebc074;
  const deep = palette.deep ?? primary;
  const frontPanel = palette.frontPanel !== false;
  const tulleColor = palette.tulle ?? secondary;
  const key = `${styleKey}|${primary.toString(16)}|${secondary.toString(16)}|${accent.toString(16)}|${deep.toString(16)}|${frontPanel ? 1 : 0}|${tulleColor.toString(16)}`;
  const cached = _coutureTexCache.get(key);
  if (cached) return cached;

  const size = styleKey === 'silk_embroidery' ? 1024 : 512;
  const cAlbedo = document.createElement('canvas');
  cAlbedo.width = size;
  cAlbedo.height = size;
  const ctx = cAlbedo.getContext('2d');

  const bSize = 512;
  const cBump = document.createElement('canvas');
  cBump.width = bSize;
  cBump.height = bSize;
  const bCtx = cBump.getContext('2d');
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, bSize, bSize);

  const cRough = document.createElement('canvas');
  cRough.width = bSize;
  cRough.height = bSize;
  const rCtx = cRough.getContext('2d');

  const goldCss = hexCss(accent);
  const goldLight = mixHexCss(accent, 0xffffff, 0.38);
  let alphaMap = null;

  if (styleKey === 'silk_embroidery') {
    // Gradiente pastel luminoso (v=1 cintura en y=0 -> v=0 dobladillo en y=size)
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0.0, mixHexCss(secondary, primary, 0.16));
    grad.addColorStop(0.45, mixHexCss(primary, 0xffffff, 0.20));
    grad.addColorStop(1.0, mixHexCss(primary, deep, 0.14));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Micro-trama satinada sutil
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
    ctx.lineWidth = 1.2;
    for (let x = -size; x < size * 2; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + size * 0.42, size);
      ctx.stroke();
    }

    // Roughness mate de seda luminosa (0.93) sin brillo plástico
    rCtx.fillStyle = '#ededed';
    rCtx.fillRect(0, 0, bSize, bSize);

    ctx.strokeStyle = goldCss;
    bCtx.strokeStyle = '#e8e8e8';
    rCtx.strokeStyle = '#484848';

    // Panel central frontal marfil/crema (u in [0.435, 0.565], ensanchando suavemente hacia el bajo)
    if (frontPanel) {
      const topL = size * 0.435;
      const topR = size * 0.565;
      const botL = size * 0.412;
      const botR = size * 0.588;
      const panelGrad = ctx.createLinearGradient(0, 0, 0, size);
      panelGrad.addColorStop(0.0, mixHexCss(secondary, 0xfffaf4, 0.72));
      panelGrad.addColorStop(0.65, mixHexCss(secondary, 0xfcf2e6, 0.56));
      panelGrad.addColorStop(1.0, mixHexCss(secondary, 0xf7e8d8, 0.46));
      ctx.fillStyle = panelGrad;
      ctx.beginPath();
      ctx.moveTo(topL, 0);
      ctx.lineTo(topR, 0);
      ctx.lineTo(botR, size * 0.94);
      ctx.lineTo(botL, size * 0.94);
      ctx.closePath();
      ctx.fill();

      // Doble galón dorado enmarcando ambos lados del panel frontal
      for (const sign of [-1, 1]) {
        const xTop = size * 0.5 + sign * (size * 0.065);
        const xBot = size * 0.5 + sign * (size * 0.088);
        drawGoldPath(ctx, bCtx, rCtx, size, bSize, 4.0, (c, s) => {
          c.moveTo(xTop * s, 0);
          c.lineTo(xBot * s, size * 0.94 * s);
        });
        drawGoldPath(ctx, bCtx, rCtx, size, bSize, 2.2, (c, s) => {
          c.moveTo((xTop - sign * 8) * s, 0);
          c.lineTo((xBot - sign * 8) * s, size * 0.94 * s);
        });
      }
    }

    // Cenefa imperial ornamentada de filigrana y rosas doradas en el bajo (y in [830..990])
    for (const [bandY, lw] of [[834, 4.0], [848, 2.2], [972, 3.0], [986, 6.0]]) {
      drawGoldPath(ctx, bCtx, rCtx, size, bSize, lw, (c, s) => {
        c.moveTo(0, bandY * s);
        c.lineTo(size * s, bandY * s);
      });
    }

    const repeats = 8;
    const step = size / repeats;
    const scale = bSize / size;
    for (let i = 0; i < repeats; i++) {
      const cx = (i + 0.5) * step;
      const cy = 910;

      // Volutas S-scroll simétricas
      drawGoldPath(ctx, bCtx, rCtx, size, bSize, 3.2, (c, s) => {
        c.moveTo((cx - step * 0.46) * s, (cy + 34) * s);
        c.bezierCurveTo((cx - step * 0.24) * s, (cy - 44) * s, (cx + step * 0.24) * s, (cy - 44) * s, (cx + step * 0.46) * s, (cy + 34) * s);
        c.moveTo((cx - step * 0.40) * s, (cy + 48) * s);
        c.quadraticCurveTo(cx * s, (cy + 14) * s, (cx + step * 0.40) * s, (cy + 48) * s);
      });

      // Rosa estilizada dorada de 5 pétalos
      ctx.fillStyle = goldLight;
      ctx.beginPath();
      ctx.arc(cx, cy - 6, 7.5, 0, TAU);
      ctx.fill();
      bCtx.fillStyle = '#e8e8e8';
      bCtx.beginPath();
      bCtx.arc(cx * scale, (cy - 6) * scale, 7.5 * scale, 0, TAU);
      bCtx.fill();
      rCtx.fillStyle = '#484848';
      rCtx.beginPath();
      rCtx.arc(cx * scale, (cy - 6) * scale, 8.5 * scale, 0, TAU);
      rCtx.fill();

      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * TAU - Math.PI / 2;
        const px = cx + Math.cos(a) * 15;
        const py = cy - 6 + Math.sin(a) * 15;
        drawGoldPath(ctx, bCtx, rCtx, size, bSize, 2.6, (c, s) => {
          c.ellipse(px * s, py * s, 6.5 * s, 10 * s, a, 0, TAU);
        });
      }

      // Festones en el borde inferior de la cenefa
      drawGoldPath(ctx, bCtx, rCtx, size, bSize, 3.0, (c, s) => {
        c.arc(cx * s, 972 * s, step * 0.23 * s, Math.PI, TAU);
      });
    }
  } else if (styleKey === 'peplum_silk') {
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0.0, mixHexCss(secondary, primary, 0.16));
    grad.addColorStop(0.65, mixHexCss(primary, 0xffffff, 0.16));
    grad.addColorStop(1.0, mixHexCss(primary, deep, 0.10));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    rCtx.fillStyle = '#ededed';
    rCtx.fillRect(0, 0, bSize, bSize);

    // Ribete dorado limpio en el borde inferior (v in [0..0.07] => y in [0.93*size..size])
    ctx.strokeStyle = goldCss;
    bCtx.strokeStyle = '#e8e8e8';
    rCtx.strokeStyle = '#484848';

    drawGoldPath(ctx, bCtx, rCtx, size, bSize, 2.5, (c, s) => {
      c.moveTo(0, size * 0.936 * s);
      c.lineTo(size * s, size * 0.936 * s);
    });
    drawGoldPath(ctx, bCtx, rCtx, size, bSize, 7.5, (c, s) => {
      c.moveTo(0, size * 0.974 * s);
      c.lineTo(size * s, size * 0.974 * s);
    });

    // Filigrana delicada siguiendo el borde inferior del peplum
    const dots = 24;
    for (let i = 0; i < dots; i++) {
      const dx = ((i + 0.5) / dots) * size;
      const dy = size * 0.953;
      ctx.fillStyle = goldLight;
      ctx.beginPath();
      ctx.arc(dx, dy, 2.4, 0, TAU);
      ctx.fill();
      bCtx.fillStyle = '#e8e8e8';
      bCtx.beginPath();
      bCtx.arc(dx, dy, 2.4, 0, TAU);
      bCtx.fill();
      rCtx.fillStyle = '#484848';
      rCtx.beginPath();
      rCtx.arc(dx, dy, 2.8, 0, TAU);
      rCtx.fill();
    }
  } else if (styleKey === 'corset_lace') {
    const sideGrad = ctx.createLinearGradient(0, 0, 0, size);
    sideGrad.addColorStop(0.0, mixHexCss(secondary, primary, 0.28));
    sideGrad.addColorStop(0.65, mixHexCss(primary, 0xffffff, 0.16));
    sideGrad.addColorStop(1.0, mixHexCss(primary, deep, 0.12));
    ctx.fillStyle = sideGrad;
    ctx.fillRect(0, 0, size, size);

    rCtx.fillStyle = '#ededed';
    rCtx.fillRect(0, 0, bSize, bSize);

    // Panel central frontal marfil en V (u in [0.40, 0.60] en escote -> afinando en V hacia cintura)
    const topL = size * 0.40;
    const topR = size * 0.60;
    const botL = size * 0.455;
    const botR = size * 0.545;
    const ivoryGrad = ctx.createLinearGradient(0, 0, 0, size);
    ivoryGrad.addColorStop(0.0, mixHexCss(secondary, 0xfffaf3, 0.78));
    ivoryGrad.addColorStop(1.0, mixHexCss(secondary, 0xf9ecde, 0.62));
    ctx.fillStyle = ivoryGrad;
    ctx.beginPath();
    ctx.moveTo(topL, 0);
    ctx.lineTo(topR, 0);
    ctx.lineTo(botR, size);
    ctx.lineTo(botL, size);
    ctx.closePath();
    ctx.fill();

    // Costuras sutiles de ballenas en los laterales pastel
    ctx.strokeStyle = mixHexCss(primary, 0xffffff, 0.35);
    ctx.lineWidth = 1.6;
    for (const uSide of [0.12, 0.26, 0.74, 0.88]) {
      ctx.beginPath();
      ctx.moveTo(uSide * size, 0);
      ctx.lineTo(uSide * size, size);
      ctx.stroke();
    }

    // Costuras doradas finas en los bordes del panel en V, escote corazón y cintura
    ctx.strokeStyle = goldCss;
    bCtx.strokeStyle = '#e8e8e8';
    rCtx.strokeStyle = '#484848';

    drawGoldPath(ctx, bCtx, rCtx, size, bSize, 2.8, (c, s) => {
      c.moveTo(topL * s, 0);
      c.lineTo(botL * s, size * s);
      c.moveTo(topR * s, 0);
      c.lineTo(botR * s, size * s);
    });

    // Ribete dorado en escote (v ≈ 1, y cerca de 0) y cintura (v ≈ 0, y cerca de size)
    drawGoldPath(ctx, bCtx, rCtx, size, bSize, 4.0, (c, s) => {
      c.moveTo(0, 12 * s);
      c.lineTo(size * s, 12 * s);
      c.moveTo(0, (size - 10) * s);
      c.lineTo(size * s, (size - 10) * s);
    });
    for (let i = 0; i < 16; i++) {
      const lx = (i + 0.5) * (size / 16);
      drawGoldPath(ctx, bCtx, rCtx, size, bSize, 2.0, (c, s) => {
        c.arc(lx * s, 16 * s, (size / 32) * s, 0, Math.PI);
      });
    }
  } else if (styleKey === 'starlight_tulle') {
    ctx.fillStyle = hexCss(tulleColor);
    ctx.fillRect(0, 0, size, size);
    rCtx.fillStyle = '#949494';
    rCtx.fillRect(0, 0, bSize, bSize);

    // Red romboidal ultrafina
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 0.7;
    for (let i = -size; i < size * 2; i += 11) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + size, size);
      ctx.moveTo(i + size, 0);
      ctx.lineTo(i, size);
      ctx.stroke();
    }

    // Gradiente alfa vertical suave
    const cAlpha = document.createElement('canvas');
    cAlpha.width = size;
    cAlpha.height = size;
    const aCtx = cAlpha.getContext('2d');
    const aGrad = aCtx.createLinearGradient(0, 0, 0, size);
    aGrad.addColorStop(0.0, '#323232');
    aGrad.addColorStop(0.45, '#7e7e7e');
    aGrad.addColorStop(0.86, '#c6c6c6');
    aGrad.addColorStop(1.0, '#e8e8e8');
    aCtx.fillStyle = aGrad;
    aCtx.fillRect(0, 0, size, size);

    // Micro-destellos sutiles y diminutos (sin manchas blancas grandes)
    for (let i = 0; i < 88; i++) {
      const sx = ((i * 173 + 29) % (size - 24)) + 12;
      const sy = ((i * 257 + 41) % (size - 32)) + 16;
      const r = (i % 4 === 0) ? 1.1 : 0.75;
      ctx.fillStyle = (i % 3 === 0) ? 'rgba(255, 252, 255, 0.78)' : 'rgba(255, 248, 255, 0.56)';
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, TAU);
      ctx.fill();
    }

    alphaMap = new THREE.CanvasTexture(cAlpha);
    alphaMap.wrapS = THREE.RepeatWrapping;
    alphaMap.wrapT = THREE.ClampToEdgeWrapping;
    alphaMap.needsUpdate = true;
  } else {
    // 'royal_velvet': paño azul medianoche luminoso (#213870 -> #192b58, nunca negro puro)
    const hasCustomPrimary = palette.primary != null;
    const topNavy = hasCustomPrimary ? mixHexCss(primary, 0x213870, primary === 0x263f7e ? 0.35 : 0.0) : '#213870';
    const botNavy = hasCustomPrimary ? mixHexCss(primary, deep, 0.36) : '#192b58';
    const vGrad = ctx.createLinearGradient(0, 0, 0, size);
    vGrad.addColorStop(0.0, topNavy);
    vGrad.addColorStop(1.0, botNavy);
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1.0;
    for (let x = 0; x < size; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }

    rCtx.fillStyle = '#ededed';
    rCtx.fillRect(0, 0, bSize, bSize);

    ctx.strokeStyle = goldCss;
    bCtx.strokeStyle = '#e8e8e8';
    rCtx.strokeStyle = '#484848';

    drawGoldPath(ctx, bCtx, rCtx, size, bSize, 6.0, (c, s) => {
      c.moveTo(0, size * 0.935 * s);
      c.lineTo(size * s, size * 0.935 * s);
    });
    drawGoldPath(ctx, bCtx, rCtx, size, bSize, 2.0, (c, s) => {
      c.moveTo(0, size * 0.905 * s);
      c.lineTo(size * s, size * 0.905 * s);
    });
  }

  const map = new THREE.CanvasTexture(cAlbedo);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.anisotropy = 4;
  map.needsUpdate = true;

  const bumpMap = new THREE.CanvasTexture(cBump);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.ClampToEdgeWrapping;
  bumpMap.needsUpdate = true;

  const roughnessMap = new THREE.CanvasTexture(cRough);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.ClampToEdgeWrapping;
  roughnessMap.needsUpdate = true;

  const res = { map, bumpMap, roughnessMap };
  if (alphaMap) res.alphaMap = alphaMap;
  _coutureTexCache.set(key, res);
  return res;
}

const FEMALE_TORSO_RINGS = [
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

const MALE_TORSO_RINGS = [
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
];

const DEFAULT_BALLGOWN_PROFILE = [
  [0.108, 1.04, 0.85],
  [0.22, 0.86, 0.92],
  [0.35, 0.60, 0.95],
  [0.47, 0.30, 0.97],
  [0.55, 0.045, 0.98]
];

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

function resampleSkirtProfile(profile, targetRings = 20) {
  const m = profile.length;
  if (m < 2 || targetRings <= m) {
    return profile.map(([r, y, zr = 1.0]) => [r, y, zr]);
  }
  const out = [];
  for (let i = 0; i < targetRings; i++) {
    const f = (i / (targetRings - 1)) * (m - 1);
    const k = Math.min(m - 2, Math.floor(f));
    const t = f - k;
    const p0 = profile[Math.max(0, k - 1)];
    const p1 = profile[k];
    const p2 = profile[k + 1];
    const p3 = profile[Math.min(m - 1, k + 2)];
    const r = Math.max(0.002, catmullRom(p0[0], p1[0], p2[0], p3[0], t));
    const y = catmullRom(p0[1], p1[1], p2[1], p3[1], t);
    const zr = THREE.MathUtils.clamp(catmullRom(p0[2] ?? 1.0, p1[2] ?? 1.0, p2[2] ?? 1.0, p3[2] ?? 1.0, t), 0.5, 1.3);
    out.push([r, y, zr]);
  }
  return out;
}

function sampleSkirtProfileAtY(sampledProfile, y) {
  if (y >= sampledProfile[0][1]) return sampledProfile[0];
  const last = sampledProfile[sampledProfile.length - 1];
  if (y <= last[1]) return last;
  for (let i = 0; i < sampledProfile.length - 1; i++) {
    const a = sampledProfile[i];
    const b = sampledProfile[i + 1];
    if (y <= a[1] && y >= b[1]) {
      const span = a[1] - b[1];
      const t = span > 1e-5 ? (a[1] - y) / span : 0;
      return [
        a[0] + (b[0] - a[0]) * t,
        y,
        (a[2] ?? 1.0) + ((b[2] ?? 1.0) - (a[2] ?? 1.0)) * t
      ];
    }
  }
  return last;
}

function resampleTorsoRings(rings, targetSteps = 22) {
  const m = rings.length;
  const out = [];
  for (let i = 0; i < targetSteps; i++) {
    const f = (i / (targetSteps - 1)) * (m - 1);
    const k = Math.min(m - 2, Math.floor(f));
    const t = f - k;
    const s0 = rings[Math.max(0, k - 1)];
    const s1 = rings[k];
    const s2 = rings[k + 1];
    const s3 = rings[Math.min(m - 1, k + 2)];
    out.push([
      catmullRom(s0[0], s1[0], s2[0], s3[0], t),
      catmullRom(s0[1], s1[1], s2[1], s3[1], t),
      Math.max(0, catmullRom(s0[2], s1[2], s2[2], s3[2], t)),
      Math.max(0, catmullRom(s0[3], s1[3], s2[3], s3[3], t)),
      Math.max(0, catmullRom(s0[4], s1[4], s2[4], s3[4], t))
    ]);
  }
  return out;
}

const FEMALE_TORSO_SAMPLED = resampleTorsoRings(FEMALE_TORSO_RINGS, 22);
const MALE_TORSO_SAMPLED = resampleTorsoRings(MALE_TORSO_RINGS, 22);

function sampleTorsoPoint(sampledRings, y, phi, radialOffset, pinchAxis, outVec) {
  let ringA = sampledRings[0];
  let ringB = sampledRings[sampledRings.length - 1];
  let t = 0;
  if (y <= ringA[0]) {
    t = 0;
    ringB = ringA;
  } else if (y >= ringB[0]) {
    t = 1;
    ringA = ringB;
  } else {
    for (let i = 0; i < sampledRings.length - 1; i++) {
      const a = sampledRings[i];
      const b = sampledRings[i + 1];
      if (y >= a[0] && y <= b[0]) {
        ringA = a;
        ringB = b;
        const span = b[0] - a[0];
        t = span > 1e-5 ? (y - a[0]) / span : 0;
        break;
      }
    }
  }
  const zOff = ringA[1] + (ringB[1] - ringA[1]) * t;
  const rx = ringA[2] + (ringB[2] - ringA[2]) * t;
  const rzF = ringA[3] + (ringB[3] - ringA[3]) * t;
  const rzB = ringA[4] + (ringB[4] - ringA[4]) * t;
  const ca = Math.cos(phi);
  const sa = Math.sin(phi);
  const rz = ca >= 0 ? rzF : rzB;
  const mod = 1.0 + pinchAxis * Math.cos(phi * 2.0);
  outVec.set(
    sa * (rx * mod + radialOffset),
    y,
    zOff + ca * (rz * mod + radialOffset)
  );
  return outVec;
}

function sweetheartNecklineY(phi) {
  const heartDip = Math.exp(-(phi * phi) / 0.14);
  const sideRises = Math.exp(-Math.pow(Math.abs(phi) - 0.55, 2) / 0.18);
  return 1.245 + 0.028 * sideRises - 0.048 * heartDip;
}

/**
 * Construye una falda acampanada orgánica suave (48x20 por defecto) sin artefactos en sierra,
 * con UVs alineadas al frente (u=0.5 en +Z), normales verificadas hacia el exterior y Vertex AO suave.
 */
function createGownSkirtGeometry({
  profile,
  radialSegs = 48,
  verticalRings = 20,
  pleatCount = 10,
  pleatDepth = 0.024,
  hemWave = 0.008,
  phiStart = -Math.PI,
  phiLength = TAU,
  swayPower = 1.45,
  shadowTint = 0xdfa0be,
  axisCenterFn = defaultAxisCenter
}) {
  const sampled = resampleSkirtProfile(profile, verticalRings);
  const vCount = sampled.length;
  const cols = radialSegs + 1;
  const total = vCount * cols;
  const positions = new Float32Array(total * 3);
  const uvs = new Float32Array(total * 2);
  const sway = new Float32Array(total);
  const phase = new Float32Array(total);
  const indices = [];

  const yTop = sampled[0][1];
  const yBot = sampled[vCount - 1][1];
  const spanY = Math.max(0.05, yTop - yBot);
  const isFullCircle = Math.abs(phiLength - TAU) < 1e-4;

  for (let iv = 0; iv < vCount; iv++) {
    const vNorm = iv / (vCount - 1);
    const [baseR, baseY, zRatio = 1.0] = sampled[iv];
    const drop = (yTop - baseY) / spanY;
    const pleatEnv = Math.pow(drop, 1.15);

    for (let iu = 0; iu < cols; iu++) {
      const uNorm = iu / radialSegs;
      const phi = isFullCircle ? (uNorm - 0.5) * TAU : phiStart + uNorm * phiLength;
      const radialMod = 1.0 + Math.sin(phi * pleatCount) * pleatDepth * pleatEnv;
      const r = baseR * radialMod;

      const waveY = Math.cos(phi * pleatCount) * hemWave * Math.pow(drop, 1.8);
      const x = Math.sin(phi) * r;
      const z = Math.cos(phi) * r * zRatio;
      const y = baseY + waveY;

      const idx = iv * cols + iu;
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;
      // Para arcos abiertos en espalda (capa/amazona) evitamos mapear el panel frontal u=0.5 detrás
      uvs[idx * 2] = isFullCircle ? uNorm : 0.04 + uNorm * 0.34;
      uvs[idx * 2 + 1] = 1.0 - vNorm;
      sway[idx] = Math.pow(drop, swayPower);
      phase[idx] = phi;
    }
  }

  for (let iv = 0; iv < vCount - 1; iv++) {
    for (let iu = 0; iu < radialSegs; iu++) {
      const a0 = iv * cols + iu;
      const a1 = a0 + 1;
      const b0 = a0 + cols;
      const b1 = b0 + 1;
      indices.push(a0, b0, a1, a1, b0, b1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('aSwayWeight', new THREE.BufferAttribute(sway, 1));
  geo.setAttribute('aStrandPhase', new THREE.BufferAttribute(phase, 1));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  ensureOutwardWinding(geo, axisCenterFn);

  bakeProceduralVertexAO(geo, {
    aoStrength: 0.14,
    minAO: 0.78,
    shadowTint,
    shadowTintStrength: 0.22,
    ridgeHighlight: 0.0,
    noiseStrength: 0.0,
    cavityWeight: 0.25,
    baseWeight: 0.15,
    undersideWeight: 0.15
  });
  initCharacterVertexAttributes(geo, 0, 0);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Construye una sobrefalda peplum festoneada continua (48x10) ceñida +0.014m por fuera
 * de la falda principal, con 8 lóbulos redondeados y v=0 en el borde inferior festoneado.
 */
function createPeplumPetalGeometry(petalCount = 8, waistY = 1.044, skirtProfile = DEFAULT_BALLGOWN_PROFILE) {
  const radialSegs = 48;
  const verticalSegs = 10;
  const vCount = verticalSegs + 1;
  const cols = radialSegs + 1;
  const total = vCount * cols;
  const positions = new Float32Array(total * 3);
  const uvs = new Float32Array(total * 2);
  const sway = new Float32Array(total);
  const phase = new Float32Array(total);
  const indices = [];

  const sampledSkirt = resampleSkirtProfile(skirtProfile, 24);
  const radialOffset = 0.014;

  for (let iu = 0; iu < cols; iu++) {
    const uNorm = iu / radialSegs;
    const phi = (uNorm - 0.5) * TAU;
    const raw = Math.abs(Math.sin(phi * petalCount * 0.5));
    const roundedLobe = Math.pow(Math.sqrt(raw * raw + 0.012), 0.72);
    // Eleva suavemente el centro frontal (phi = 0) para lucir el panel marfil
    const frontLift = Math.exp(-(phi * phi) / 0.22);
    const petalDrop = (0.175 + 0.145 * roundedLobe) * (1.0 - 0.34 * frontLift);

    for (let iv = 0; iv < vCount; iv++) {
      const vr = iv / verticalSegs;
      const y = waistY - vr * petalDrop;
      const [skirtR, , zRatio] = sampleSkirtProfileAtY(sampledSkirt, y);
      const lobeFlare = Math.sin(vr * Math.PI) * 0.008 * roundedLobe;
      const r = skirtR + radialOffset + lobeFlare;
      const x = Math.sin(phi) * r;
      const z = Math.cos(phi) * r * zRatio;

      const idx = iv * cols + iu;
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;
      uvs[idx * 2] = uNorm;
      uvs[idx * 2 + 1] = 1.0 - vr;
      sway[idx] = Math.pow(vr, 1.35) * 0.65;
      phase[idx] = phi;
    }
  }

  for (let iv = 0; iv < verticalSegs; iv++) {
    for (let iu = 0; iu < radialSegs; iu++) {
      const a0 = iv * cols + iu;
      const a1 = a0 + 1;
      const b0 = a0 + cols;
      const b1 = b0 + 1;
      indices.push(a0, b0, a1, a1, b0, b1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('aSwayWeight', new THREE.BufferAttribute(sway, 1));
  geo.setAttribute('aStrandPhase', new THREE.BufferAttribute(phase, 1));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  ensureOutwardWinding(geo, defaultAxisCenter);

  bakeProceduralVertexAO(geo, {
    aoStrength: 0.14,
    minAO: 0.78,
    shadowTint: 0xdfa0be,
    shadowTintStrength: 0.22,
    ridgeHighlight: 0.0,
    noiseStrength: 0.0,
    cavityWeight: 0.25,
    baseWeight: 0.15,
    undersideWeight: 0.15
  });
  initCharacterVertexAttributes(geo, 0, 0);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Construye el corpiño ajustado moldeado +0.007m sobre el torso femenino
 * desde y=1.015 hasta un escote corazón limpio que deja cuello y clavículas al descubierto.
 */
function createFittedBodiceGeometry(yBottom = 1.015) {
  const radialSegs = 40;
  const vCount = 12;
  const cols = radialSegs + 1;
  const total = vCount * cols;
  const positions = new Float32Array(total * 3);
  const uvs = new Float32Array(total * 2);
  const sway = new Float32Array(total);
  const phase = new Float32Array(total);
  const indices = [];
  const tmp = new THREE.Vector3();

  for (let iv = 0; iv < vCount; iv++) {
    const vr = iv / (vCount - 1);
    for (let iu = 0; iu < cols; iu++) {
      const uNorm = iu / radialSegs;
      const phi = (uNorm - 0.5) * TAU;
      const yTop = sweetheartNecklineY(phi);
      const y = yTop - vr * (yTop - yBottom);
      sampleTorsoPoint(FEMALE_TORSO_SAMPLED, y, phi, 0.007, -0.035, tmp);

      const idx = iv * cols + iu;
      positions[idx * 3] = tmp.x;
      positions[idx * 3 + 1] = tmp.y;
      positions[idx * 3 + 2] = tmp.z;
      uvs[idx * 2] = uNorm;
      uvs[idx * 2 + 1] = 1.0 - vr;
      phase[idx] = phi;
    }
  }

  for (let iv = 0; iv < vCount - 1; iv++) {
    for (let iu = 0; iu < radialSegs; iu++) {
      const a0 = iv * cols + iu;
      const a1 = a0 + 1;
      const b0 = a0 + cols;
      const b1 = b0 + 1;
      indices.push(a0, b0, a1, a1, b0, b1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('aSwayWeight', new THREE.BufferAttribute(sway, 1));
  geo.setAttribute('aStrandPhase', new THREE.BufferAttribute(phase, 1));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  ensureOutwardWinding(geo, defaultAxisCenter);

  bakeProceduralVertexAO(geo, {
    aoStrength: 0.14,
    minAO: 0.78,
    shadowTint: 0xdfa0be,
    shadowTintStrength: 0.22,
    ridgeHighlight: 0.0,
    noiseStrength: 0.0,
    cavityWeight: 0.25,
    baseWeight: 0.15,
    undersideWeight: 0.15
  });
  initCharacterVertexAttributes(geo, 0, 0);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Construye una manga abullonada compacta en lágrima de seda mate.
 */
function createRomanticSleeveGeo(radius = 0.056, length = 0.105) {
  const profile = [
    [0.012, 0.012, 0.96],
    [radius * 0.84, -length * 0.14, 0.96],
    [radius * 1.00, -length * 0.42, 0.96],
    [radius * 0.92, -length * 0.68, 0.96],
    [radius * 0.70, -length * 0.88, 0.96],
    [0.036, -length, 1.0]
  ];
  return createGownSkirtGeometry({
    profile,
    radialSegs: 24,
    verticalRings: 14,
    pleatCount: 8,
    pleatDepth: 0.025,
    hemWave: 0.002,
    swayPower: 0.0
  });
}

function createSkirtHuggingRibbonGeo(skirtProfile, waistY, centerPhi, halfWidth = 0.055, radialOffset = 0.016) {
  const sampledSkirt = resampleSkirtProfile(skirtProfile, 16);
  const vCount = 12;
  const uCount = 5;
  const total = vCount * uCount;
  const positions = new Float32Array(total * 3);
  const uvs = new Float32Array(total * 2);
  const sway = new Float32Array(total);
  const phase = new Float32Array(total);
  const indices = [];

  const yTop = waistY - 0.010;
  const yBot = Math.max(sampledSkirt[sampledSkirt.length - 1][1] + 0.18, waistY - 0.44);
  const spanY = Math.max(0.05, yTop - yBot);

  for (let iv = 0; iv < vCount; iv++) {
    const vr = iv / (vCount - 1);
    const y = yTop - vr * spanY;
    const [skirtR, , zRatio] = sampleSkirtProfileAtY(sampledSkirt, y);
    const r = skirtR + radialOffset;
    const widthScale = 1.0 + vr * 0.32;

    for (let iu = 0; iu < uCount; iu++) {
      const uc = iu / (uCount - 1);
      const phi = centerPhi + (uc - 0.5) * 2.0 * halfWidth * widthScale;
      const idx = iv * uCount + iu;
      positions[idx * 3] = Math.sin(phi) * r;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = Math.cos(phi) * r * zRatio;
      uvs[idx * 2] = 0.1 + uc * 0.22;
      uvs[idx * 2 + 1] = 1.0 - vr;
      sway[idx] = Math.pow(vr, 1.35) * 0.85;
      phase[idx] = phi;
    }
  }

  for (let iv = 0; iv < vCount - 1; iv++) {
    for (let iu = 0; iu < uCount - 1; iu++) {
      const a0 = iv * uCount + iu;
      const a1 = a0 + 1;
      const b0 = a0 + uCount;
      const b1 = b0 + 1;
      indices.push(a0, b0, a1, a1, b0, b1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('aSwayWeight', new THREE.BufferAttribute(sway, 1));
  geo.setAttribute('aStrandPhase', new THREE.BufferAttribute(phase, 1));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  ensureOutwardWinding(geo, defaultAxisCenter);

  bakeProceduralVertexAO(geo, {
    aoStrength: 0.14,
    minAO: 0.78,
    shadowTint: 0xdfa0be,
    shadowTintStrength: 0.22,
    ridgeHighlight: 0.0,
    noiseStrength: 0.0,
    cavityWeight: 0.25,
    baseWeight: 0.15,
    undersideWeight: 0.15
  });
  initCharacterVertexAttributes(geo, 0, 0);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

function addSweetheartCorsetDetails(add, m, waistY, skirtProfile = DEFAULT_BALLGOWN_PROFILE) {
  const bodiceMat = m.bodice || m.primary;
  const bowMat = m.peplum || m.secondary;
  const tmp = new THREE.Vector3();

  // Corpiño ajustado con escote corazón limpio (+0.007m sobre torso)
  add(createFittedBodiceGeometry(1.015), bodiceMat);

  // Delicado ribete dorado siguiendo exactamente el escote corazón
  const neckPts = [];
  const neckSteps = 32;
  for (let i = 0; i < neckSteps; i++) {
    const phi = (i / neckSteps - 0.5) * TAU;
    const y = sweetheartNecklineY(phi);
    neckPts.push(sampleTorsoPoint(FEMALE_TORSO_SAMPLED, y, phi, 0.0085, -0.035, tmp).clone());
  }
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(neckPts, true), 40, 0.0042, 8, true), m.roseGold);

  // Cinturón delgado en V y gema central
  const beltPts = [];
  const beltSteps = 32;
  for (let i = 0; i < beltSteps; i++) {
    const phi = (i / beltSteps - 0.5) * TAU;
    const vDip = 0.022 * Math.exp(-(phi * phi) / 0.15);
    const y = waistY - 0.002 - vDip;
    beltPts.push(sampleTorsoPoint(FEMALE_TORSO_SAMPLED, y, phi, 0.010, -0.035, tmp).clone());
  }
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(beltPts, true), 36, 0.0055, 8, true), m.roseGold);

  sampleTorsoPoint(FEMALE_TORSO_SAMPLED, waistY - 0.024, 0, 0.014, -0.035, tmp);
  const waistGem = add(new THREE.OctahedronGeometry(0.013, 1), m.crystal, tmp.x, tmp.y, tmp.z);
  waistGem.scale.set(0.82, 1.15, 0.52);

  sampleTorsoPoint(FEMALE_TORSO_SAMPLED, sweetheartNecklineY(0), 0, 0.011, -0.035, tmp);
  const chestGem = add(new THREE.OctahedronGeometry(0.010, 1), m.crystal, tmp.x, tmp.y, tmp.z);
  chestGem.scale.set(0.82, 1.15, 0.52);

  // Lazo trasero compacto + 2 cintas ceñidas a la caída trasera de la falda (+0.016m)
  sampleTorsoPoint(FEMALE_TORSO_SAMPLED, waistY - 0.006, Math.PI, 0.012, -0.035, tmp);
  const knotZ = tmp.z;
  const knot = add(new THREE.SphereGeometry(0.014, 10, 8), bowMat, 0, waistY - 0.006, knotZ);
  knot.scale.set(1.15, 0.9, 0.72);

  for (const s of [-1, 1]) {
    const loopCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, waistY - 0.004, knotZ),
      new THREE.Vector3(s * 0.044, waistY + 0.016, knotZ - 0.022),
      new THREE.Vector3(s * 0.052, waistY - 0.020, knotZ - 0.026),
      new THREE.Vector3(0, waistY - 0.010, knotZ)
    ]);
    add(new THREE.TubeGeometry(loopCurve, 14, 0.0095, 8, false), bowMat);

    const ribbonGeo = createSkirtHuggingRibbonGeo(skirtProfile, waistY, Math.PI + s * 0.12, 0.052, 0.016);
    const ribMesh = add(ribbonGeo, bowMat);
    ribMesh.userData.skirtPart = true;
    ribMesh.userData.rideBias = 0.016;
    ribMesh.userData.noMerge = true;
  }
}

/**
 * Construye el vestuario femenino de Alta Costura Real (6 estilos del catálogo + siluetas de corte).
 *
 * @param {object} outfit
 * @param {object} materials
 * @param {object} metrics
 * @param {object} [options]
 * @returns {{ sleeveNodes: THREE.Group[], geometries: THREE.BufferGeometry[] }}
 */
export function buildPrincessGown(outfit, materials, metrics, options = {}) {
  const {
    outfitGroup,
    shoulderL = null,
    shoulderR = null
  } = options;
  const style = outfit?.style || 'ballgown';
  const waistY = metrics?.waistY ?? 1.04;
  const sleeveNodes = [];
  const geometries = [];

  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, target = outfitGroup) => {
    initCharacterVertexAttributes(geo);
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = mat !== materials.crystal && mat !== materials.tulle;
    mesh.receiveShadow = true;
    if (target) target.add(mesh);
    return mesh;
  };

  const addSkirt = (geo, mat, rideBias = 0.0, noMerge = false) => {
    const mesh = add(geo, mat);
    mesh.userData.skirtPart = true;
    mesh.userData.rideBias = rideBias;
    if (noMerge) mesh.userData.noMerge = true;
    return mesh;
  };

  // Mangas abullonadas compactas en lágrima de seda mate + puño dorado fino
  if (style === 'ballgown' || style === 'ice_gown' || style === 'tiered_gown' || style === 'starry_gown') {
    const puffGeo = createRomanticSleeveGeo(0.056, 0.105);
    const cuffGeo = new THREE.TorusGeometry(0.036, 0.0038, 8, 20);
    geometries.push(puffGeo, cuffGeo);
    const sleeveMat = materials.bodice || materials.primary;

    for (const [idx, sh] of [shoulderL, shoulderR].entries()) {
      if (!sh) continue;
      const side = idx === 0 ? 1 : -1;
      const sleeveGrp = new THREE.Group();
      sleeveGrp.userData.isSleeve = true;

      const inner = new THREE.Mesh(puffGeo, sleeveMat);
      inner.position.set(-side * 0.006, 0.002, 0);
      inner.castShadow = true;
      inner.receiveShadow = true;

      const cuff = new THREE.Mesh(cuffGeo, materials.roseGold);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.set(-side * 0.006, -0.103, 0);

      sleeveGrp.add(inner, cuff);
      sh.add(sleeveGrp);
      sleeveNodes.push(sleeveGrp);
    }
  }

  if (style === 'ballgown') {
    const mainProfile = [
      [0.108, waistY, 0.85],
      [0.22, 0.86, 0.92],
      [0.35, 0.60, 0.95],
      [0.47, 0.30, 0.97],
      [0.55, 0.045, 0.98]
    ];
    const tulleProfile = mainProfile.map(([r, y, zr], i) => [r + 0.022, i === mainProfile.length - 1 ? 0.035 : y, zr]);

    // 1. Enagua interior suave
    addSkirt(createGownSkirtGeometry({
      profile: [[0.098, waistY, 0.85], [0.205, 0.82, 0.90], [0.345, 0.44, 0.94], [0.45, 0.10, 0.96]],
      radialSegs: 36, verticalRings: 16, pleatCount: 10, pleatDepth: 0.022, hemWave: 0.006, swayPower: 1.25
    }), materials.secondary, -0.010, true);

    // 2. Falda acampanada principal suave (48x20)
    addSkirt(createGownSkirtGeometry({
      profile: mainProfile,
      radialSegs: 48, verticalRings: 20, pleatCount: 10, pleatDepth: 0.025, hemWave: 0.008, swayPower: 1.45
    }), materials.primary, 0.0);

    // 3. Sobrefalda peplum festoneada continua (+0.014m)
    addSkirt(
      createPeplumPetalGeometry(8, waistY + 0.004, mainProfile),
      materials.peplum || materials.secondary,
      0.014,
      true
    );

    // 4. Velo exterior de tul estelar estrictamente +0.022m fuera de la falda principal
    addSkirt(createGownSkirtGeometry({
      profile: tulleProfile,
      radialSegs: 48, verticalRings: 20, pleatCount: 10, pleatDepth: 0.022, hemWave: 0.008, swayPower: 1.55
    }), materials.tulle || materials.shawl, 0.022, true);

    addSweetheartCorsetDetails(add, materials, waistY, mainProfile);
  } else if (style === 'ice_gown') {
    const iceProfile = [
      [0.104, waistY, 0.86],
      [0.19, 0.84, 0.92],
      [0.31, 0.54, 0.95],
      [0.42, 0.26, 0.97],
      [0.50, 0.045, 0.98]
    ];
    addSkirt(createGownSkirtGeometry({
      profile: iceProfile,
      radialSegs: 48, verticalRings: 20, pleatCount: 10, pleatDepth: 0.024, hemWave: 0.008, swayPower: 1.45
    }), materials.primary, 0.0);
    // Capa estelar traslúcida desde los hombros (+0.022m en caída sobre falda)
    addSkirt(createGownSkirtGeometry({
      profile: [[0.145, 1.33, 0.78], [0.22, 1.05, 0.84], [0.34, 0.65, 0.92], [0.45, 0.16, 0.96]],
      radialSegs: 32, verticalRings: 18, pleatCount: 8, pleatDepth: 0.022, hemWave: 0.008,
      phiStart: Math.PI * 0.62, phiLength: Math.PI * 0.76, swayPower: 1.3
    }), materials.tulle || materials.shawl, 0.022, true);
    addSweetheartCorsetDetails(add, materials, waistY, iceProfile);
  } else if (style === 'tiered_gown') {
    const tierTop = [[0.118, waistY, 0.86], [0.222, 0.82, 0.92], [0.332, 0.66, 0.95]];
    addSkirt(createGownSkirtGeometry({
      profile: tierTop,
      radialSegs: 48, verticalRings: 14, pleatCount: 10, pleatDepth: 0.024, hemWave: 0.008, swayPower: 1.3
    }), materials.peplum || materials.secondary, 0.014, true);
    addSkirt(createGownSkirtGeometry({
      profile: [[0.20, 0.74, 0.90], [0.335, 0.48, 0.95], [0.435, 0.34, 0.97]],
      radialSegs: 48, verticalRings: 14, pleatCount: 10, pleatDepth: 0.025, hemWave: 0.008, swayPower: 1.4
    }), materials.primary, 0.007, true);
    addSkirt(createGownSkirtGeometry({
      profile: [[0.30, 0.44, 0.93], [0.44, 0.18, 0.97], [0.53, 0.045, 0.98]],
      radialSegs: 48, verticalRings: 14, pleatCount: 10, pleatDepth: 0.026, hemWave: 0.008, swayPower: 1.5
    }), materials.secondary, 0.0);
    addSweetheartCorsetDetails(add, materials, waistY, tierTop);
  } else if (style === 'starry_gown') {
    const starryProfile = [
      [0.108, waistY, 0.86],
      [0.21, 0.84, 0.92],
      [0.36, 0.52, 0.95],
      [0.48, 0.22, 0.97],
      [0.54, 0.045, 0.98]
    ];
    const starryTulle = starryProfile.map(([r, y, zr], i) => [r + 0.022, i === starryProfile.length - 1 ? 0.036 : y, zr]);

    addSkirt(createGownSkirtGeometry({
      profile: starryProfile,
      radialSegs: 48, verticalRings: 20, pleatCount: 10, pleatDepth: 0.025, hemWave: 0.008, swayPower: 1.45
    }), materials.primary, 0.0);
    addSkirt(
      createPeplumPetalGeometry(6, waistY + 0.004, starryProfile),
      materials.peplum || materials.secondary,
      0.014,
      true
    );
    addSkirt(createGownSkirtGeometry({
      profile: starryTulle,
      radialSegs: 48, verticalRings: 20, pleatCount: 10, pleatDepth: 0.022, hemWave: 0.008, swayPower: 1.55
    }), materials.tulle || materials.shawl, 0.022, true);
    addSweetheartCorsetDetails(add, materials, waistY, starryProfile);
  } else if (style === 'chic_midi') {
    const midiProfile = [
      [0.110, waistY, 0.86],
      [0.19, 0.84, 0.92],
      [0.27, 0.64, 0.95],
      [0.34, 0.44, 0.96]
    ];
    addSkirt(createGownSkirtGeometry({
      profile: midiProfile,
      radialSegs: 48, verticalRings: 20, pleatCount: 10, pleatDepth: 0.024, hemWave: 0.008, swayPower: 1.4
    }), materials.primary, 0.0);
    for (const s of [-1, 1]) {
      const lapel = new THREE.CatmullRomCurve3([
        new THREE.Vector3(s * 0.022, 1.07, 0.098),
        new THREE.Vector3(s * 0.062, 1.22, 0.112),
        new THREE.Vector3(s * 0.045, 1.35, 0.078)
      ]);
      add(new THREE.TubeGeometry(lapel, 14, 0.014, 6, false), materials.bodice || materials.primary);
    }
    addSweetheartCorsetDetails(add, materials, waistY, midiProfile);
  } else {
    // 'riding' — Amazona de Palacio: faldón ecuestre abierto delante con botonadura real y charreteras
    addSkirt(createGownSkirtGeometry({
      profile: [[0.110, waistY, 0.84], [0.165, 0.86, 0.88], [0.21, 0.70, 0.90]],
      radialSegs: 36, verticalRings: 14, pleatCount: 9, pleatDepth: 0.022, hemWave: 0.006,
      phiStart: 0.40, phiLength: TAU - 0.80, swayPower: 1.2
    }), materials.primary, 0.002, true);
    const collar = [];
    for (let i = 0; i <= 18; i++) {
      const a = (i / 18) * TAU;
      collar.push(new THREE.Vector3(Math.sin(a) * 0.056, 1.388, Math.cos(a) * 0.052));
    }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(collar, true), 22, 0.012, 8, true), materials.roseGold);
    for (const s of [-1, 1]) {
      const ep = new THREE.CatmullRomCurve3([
        new THREE.Vector3(s * 0.105, 1.37, 0.0),
        new THREE.Vector3(s * 0.165, 1.352, 0.0)
      ]);
      add(new THREE.TubeGeometry(ep, 8, 0.015, 6, false), materials.roseGold);
      for (let i = 0; i < 4; i++) {
        add(new THREE.SphereGeometry(0.009, 8, 8), materials.roseGold, s * 0.036, 1.29 - i * 0.058, 0.108);
      }
    }
    const beltCurve = [];
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * TAU;
      beltCurve.push(new THREE.Vector3(Math.sin(a) * 0.104, waistY + 0.008, Math.cos(a) * 0.085));
    }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(beltCurve, true), 24, 0.010, 8, true), materials.roseGold);
  }

  return { sleeveNodes, geometries };
}

function createPrinceJacketShellGeometry(waistY) {
  const yBot = waistY - 0.02;
  const yTop = 1.455;
  const vCount = 14;
  const radialSegs = 32;
  const cols = radialSegs + 1;
  const total = vCount * cols;
  const positions = new Float32Array(total * 3);
  const uvs = new Float32Array(total * 2);
  const sway = new Float32Array(total);
  const phase = new Float32Array(total);
  const indices = [];
  const tmp = new THREE.Vector3();

  for (let iv = 0; iv < vCount; iv++) {
    const vr = iv / (vCount - 1);
    const y = yTop - vr * (yTop - yBot);
    // Abertura limpia en V frontal: estrecha en cuello -> ancha en pecho/cintura para mostrar el chaleco
    const phiOpen = 0.22 + 0.18 * Math.sin(Math.min(1, vr * 1.15) * Math.PI * 0.5);
    const phiStart = phiOpen;
    const phiSpan = TAU - 2.0 * phiOpen;

    for (let iu = 0; iu < cols; iu++) {
      const uNorm = iu / radialSegs;
      const phi = phiStart + uNorm * phiSpan;
      sampleTorsoPoint(MALE_TORSO_SAMPLED, y, phi, 0.009, -0.02, tmp);
      const idx = iv * cols + iu;
      positions[idx * 3] = tmp.x;
      positions[idx * 3 + 1] = tmp.y;
      positions[idx * 3 + 2] = tmp.z;
      uvs[idx * 2] = 0.08 + uNorm * 0.84;
      uvs[idx * 2 + 1] = 1.0 - vr * 0.85;
      phase[idx] = phi;
    }
  }

  for (let iv = 0; iv < vCount - 1; iv++) {
    for (let iu = 0; iu < radialSegs; iu++) {
      const a0 = iv * cols + iu;
      const a1 = a0 + 1;
      const b0 = a0 + cols;
      const b1 = b0 + 1;
      indices.push(a0, b0, a1, a1, b0, b1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('aSwayWeight', new THREE.BufferAttribute(sway, 1));
  geo.setAttribute('aStrandPhase', new THREE.BufferAttribute(phase, 1));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  ensureOutwardWinding(geo, defaultAxisCenter);

  bakeProceduralVertexAO(geo, {
    aoStrength: 0.14,
    minAO: 0.78,
    shadowTint: 0x28345c,
    shadowTintStrength: 0.20,
    ridgeHighlight: 0.0,
    noiseStrength: 0.0,
    cavityWeight: 0.25,
    baseWeight: 0.15,
    undersideWeight: 0.15
  });
  initCharacterVertexAttributes(geo, 0, 0);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

function createPrinceIvoryVestGeometry(waistY) {
  const yBot = waistY - 0.01;
  const yTop = 1.445;
  const vCount = 12;
  const radialSegs = 14;
  const cols = radialSegs + 1;
  const total = vCount * cols;
  const positions = new Float32Array(total * 3);
  const uvs = new Float32Array(total * 2);
  const sway = new Float32Array(total);
  const phase = new Float32Array(total);
  const indices = [];
  const tmp = new THREE.Vector3();

  for (let iv = 0; iv < vCount; iv++) {
    const vr = iv / (vCount - 1);
    const y = yTop - vr * (yTop - yBot);
    for (let iu = 0; iu < cols; iu++) {
      const uNorm = iu / radialSegs;
      const phi = (uNorm - 0.5) * 0.92;
      sampleTorsoPoint(MALE_TORSO_SAMPLED, y, phi, 0.005, -0.02, tmp);
      const idx = iv * cols + iu;
      positions[idx * 3] = tmp.x;
      positions[idx * 3 + 1] = tmp.y;
      positions[idx * 3 + 2] = tmp.z;
      // Mapea estrictamente al panel central marfil de corset_lace (u in [0.43, 0.57])
      uvs[idx * 2] = 0.43 + uNorm * 0.14;
      uvs[idx * 2 + 1] = 1.0 - vr * 0.85;
      phase[idx] = phi;
    }
  }

  for (let iv = 0; iv < vCount - 1; iv++) {
    for (let iu = 0; iu < radialSegs; iu++) {
      const a0 = iv * cols + iu;
      const a1 = a0 + 1;
      const b0 = a0 + cols;
      const b1 = b0 + 1;
      indices.push(a0, b0, a1, a1, b0, b1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('aSwayWeight', new THREE.BufferAttribute(sway, 1));
  geo.setAttribute('aStrandPhase', new THREE.BufferAttribute(phase, 1));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  ensureOutwardWinding(geo, defaultAxisCenter);

  bakeProceduralVertexAO(geo, {
    aoStrength: 0.12,
    minAO: 0.82,
    shadowTint: 0xc8c0d4,
    shadowTintStrength: 0.18,
    ridgeHighlight: 0.0,
    noiseStrength: 0.0,
    cavityWeight: 0.20,
    baseWeight: 0.15,
    undersideWeight: 0.15
  });
  initCharacterVertexAttributes(geo, 0, 0);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Construye la Levita Real completa del Príncipe / Caballeros de la Corte:
 * chaqueta azul medianoche entallada abierta en V, chaleco marfil con botonadura dorada,
 * ascot marfil con zafiro, cuello Mao dorado, charreteras ceñidas al hombro, faldones traseros
 * rectos y puños dorados en antebrazos y botas.
 */
export function buildPrinceRegalia(outfit, materials, metrics, options = {}) {
  const {
    outfitGroup,
    forearmL = null,
    forearmR = null,
    shinL = null,
    shinR = null
  } = options;
  const waistY = metrics?.waistY ?? 1.08;
  const geometries = [];
  const cuffNodes = [];
  const tmp = new THREE.Vector3();

  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, target = outfitGroup) => {
    initCharacterVertexAttributes(geo);
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = mat !== materials.crystal;
    mesh.receiveShadow = true;
    if (target) target.add(mesh);
    return mesh;
  };

  // 1. Faldones traseros partidos casi rectos (r: 0.136 -> 0.148 -> 0.156, ~6 deg de vuelo)
  for (const s of [-1, 1]) {
    const phiStart = s > 0 ? Math.PI * 0.50 : Math.PI + 0.04;
    const phiLength = Math.PI * 0.46;
    const tailGeo = createGownSkirtGeometry({
      profile: [
        [0.136, waistY - 0.01, 0.80],
        [0.148, 0.86, 0.82],
        [0.156, 0.64, 0.84]
      ],
      radialSegs: 18,
      verticalRings: 14,
      pleatCount: 4,
      pleatDepth: 0.012,
      hemWave: 0.006,
      phiStart,
      phiLength,
      swayPower: 1.35,
      shadowTint: 0x28345c
    });
    const tail = add(tailGeo, materials.primary);
    tail.userData.skirtPart = true;
    tail.userData.rideBias = 0.005;
    tail.userData.noMerge = true;
  }

  // 2. Chaqueta azul medianoche entallada (+0.009m sobre torso) abierta en V + chaleco marfil
  add(createPrinceIvoryVestGeometry(waistY), materials.secondary);
  add(createPrinceJacketShellGeometry(waistY), materials.primary);

  // Ribete dorado limpio en los bordes de la abertura en V y botones dorados
  for (const s of [-1, 1]) {
    const trimPts = [];
    for (let i = 0; i <= 10; i++) {
      const vr = i / 10;
      const y = 1.455 - vr * (1.455 - (waistY - 0.02));
      const phiOpen = 0.22 + 0.18 * Math.sin(Math.min(1, vr * 1.15) * Math.PI * 0.5);
      trimPts.push(sampleTorsoPoint(MALE_TORSO_SAMPLED, y, s * phiOpen, 0.0105, -0.02, tmp).clone());
    }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(trimPts), 16, 0.0055, 8, false), materials.roseGold);

    for (let i = 0; i < 4; i++) {
      const by = 1.31 - i * 0.056;
      sampleTorsoPoint(MALE_TORSO_SAMPLED, by, s * 0.42, 0.012, -0.02, tmp);
      const btn = add(new THREE.SphereGeometry(0.0085, 8, 8), materials.roseGold, tmp.x, tmp.y, tmp.z);
      btn.scale.set(1.0, 1.0, 0.55);
    }
  }

  // Botonadura central discreta del chaleco marfil
  for (let i = 0; i < 3; i++) {
    const by = 1.24 - i * 0.052;
    sampleTorsoPoint(MALE_TORSO_SAMPLED, by, 0, 0.0085, -0.02, tmp);
    const vBtn = add(new THREE.SphereGeometry(0.0065, 8, 8), materials.roseGold, tmp.x, tmp.y, tmp.z);
    vBtn.scale.set(1.0, 1.0, 0.55);
  }

  // 3. Cuello Mao con ribete dorado + ascot marfil con broche zafiro
  const collarPts = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * TAU;
    collarPts.push(new THREE.Vector3(Math.sin(a) * 0.068, 1.466, Math.cos(a) * 0.062 - 0.006));
  }
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(collarPts, true), 26, 0.014, 8, true), materials.primary);
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(collarPts, true), 26, 0.005, 6, true), materials.roseGold, 0, 0.013, 0);

  const ascotCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 1.452, 0.062),
    new THREE.Vector3(0, 1.390, 0.098),
    new THREE.Vector3(0, 1.325, 0.114)
  ]);
  const ascotGeo = new THREE.TubeGeometry(ascotCurve, 12, 0.020, 8, false);
  // Mantiene las UVs del ascot en la zona marfil limpia
  const ascotUv = ascotGeo.attributes.uv;
  if (ascotUv) {
    for (let i = 0; i < ascotUv.count; i++) {
      ascotUv.setX(i, 0.46 + ascotUv.getX(i) * 0.08);
    }
  }
  add(ascotGeo, materials.secondary, 0, 0, 0, 0, 0, 0, 1.15, 1, 0.42);
  const ascotGem = add(new THREE.OctahedronGeometry(0.014, 1), materials.crystal, 0, 1.410, 0.102);
  ascotGem.scale.set(0.85, 1.25, 0.55);

  // 4. Charreteras ceñidas al contorno real del hombro (y = 1.438 -> 1.418) con flecos ordenados
  for (const s of [-1, 1]) {
    const epCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 0.105, 1.448, 0.0),
      new THREE.Vector3(s * 0.158, 1.438, 0.0),
      new THREE.Vector3(s * 0.206, 1.418, 0.0)
    ]);
    add(new THREE.TubeGeometry(epCurve, 10, 0.014, 8, false), materials.roseGold, 0, 0, 0, 0, 0, 0, 1.0, 0.42, 1.45);
    for (let f = -2; f <= 2; f++) {
      add(new THREE.CapsuleGeometry(0.0042, 0.024, 4, 6), materials.roseGold, s * 0.208, 1.396, f * 0.012);
    }
  }

  // Cordón trenzado dorado (aiguillette) ceñido al pecho derecho
  for (let c = 0; c < 2; c++) {
    const cordCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.175, 1.430, 0.016),
      new THREE.Vector3(-0.142, 1.305 + c * 0.018, 0.104 + c * 0.008),
      new THREE.Vector3(-0.072, 1.255 + c * 0.016, 0.124),
      new THREE.Vector3(-0.020, 1.345, 0.114)
    ]);
    add(new THREE.TubeGeometry(cordCurve, 18, 0.0045, 6, false), materials.roseGold);
  }

  // 5. Cinturón real con hebilla entallada
  const beltPts = [];
  for (let i = 0; i <= 24; i++) {
    const phi = (i / 24 - 0.5) * TAU;
    beltPts.push(sampleTorsoPoint(MALE_TORSO_SAMPLED, waistY, phi, 0.012, -0.02, tmp).clone());
  }
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(beltPts, true), 28, 0.011, 8, true), materials.roseGold);
  sampleTorsoPoint(MALE_TORSO_SAMPLED, waistY, 0, 0.016, -0.02, tmp);
  add(new THREE.BoxGeometry(0.042, 0.032, 0.014), materials.roseGold, tmp.x, tmp.y, tmp.z);

  // 6. Puños dorados en antebrazos y remates dorados en la parte superior de las botas
  const forearmCuffGeo = new THREE.TorusGeometry(0.031, 0.006, 8, 18);
  geometries.push(forearmCuffGeo);
  for (const fore of [forearmL, forearmR]) {
    if (!fore) continue;
    const cuffGrp = new THREE.Group();
    const cuff = new THREE.Mesh(forearmCuffGeo, materials.roseGold);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -(metrics?.forearmLen ?? 0.265) + 0.02;
    cuffGrp.add(cuff);
    fore.add(cuffGrp);
    cuffNodes.push(cuffGrp);
  }

  const bootCuffGeo = new THREE.TorusGeometry(0.054, 0.006, 8, 20);
  geometries.push(bootCuffGeo);
  for (const shin of [shinL, shinR]) {
    if (!shin) continue;
    const bootGrp = new THREE.Group();
    const bootCuff = new THREE.Mesh(bootCuffGeo, materials.roseGold);
    bootCuff.rotation.x = Math.PI / 2;
    bootCuff.position.y = -0.028;
    bootGrp.add(bootCuff);
    shin.add(bootGrp);
    cuffNodes.push(bootGrp);
  }

  return { cuffNodes, geometries };
}

/**
 * Construye vestuario modular para damas y caballeros de la Corte reutilizando constructores paramétricos.
 */
export function buildCourtOutfit(courtPreset, materials, metrics, options = {}) {
  const isMale = courtPreset?.gender === 'male' || courtPreset?.style === 'prince' || courtPreset?.style === 'noble_tailcoat';
  if (isMale) {
    return buildPrinceRegalia(courtPreset, materials, metrics, options);
  }
  const styleMap = {
    princess_light: 'ballgown',
    empire_shawl: 'ice_gown',
    court_tiered: 'tiered_gown',
    court_starry: 'starry_gown',
    court_chic: 'chic_midi'
  };
  const resolved = {
    ...courtPreset,
    style: styleMap[courtPreset?.style] || courtPreset?.style || 'ballgown'
  };
  return buildPrincessGown(resolved, materials, metrics, options);
}
