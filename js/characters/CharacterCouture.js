import * as THREE from 'three';
import { bakeProceduralVertexAO } from '../core/LumenArtPipeline.js';
import { initCharacterVertexAttributes } from './CharacterAnatomy.js';

const TAU = Math.PI * 2;
const _coutureTexCache = new Map();

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

/**
 * Genera y cachea texturas PBR procedurales de alta costura en Canvas2D:
 * 'silk_embroidery', 'corset_lace', 'starlight_tulle', 'royal_velvet'.
 *
 * @param {'silk_embroidery'|'corset_lace'|'starlight_tulle'|'royal_velvet'} styleKey
 * @param {object} palette
 * @returns {{ map: THREE.CanvasTexture, bumpMap: THREE.CanvasTexture, roughnessMap: THREE.CanvasTexture, alphaMap?: THREE.CanvasTexture }}
 */
export function getCoutureTextures(styleKey = 'silk_embroidery', palette = {}) {
  const primary = palette.primary ?? 0xf5a6c6;
  const secondary = palette.secondary ?? 0xfff2f6;
  const accent = palette.accent ?? 0xebbf6e;
  const deep = palette.deep ?? primary;
  const key = `${styleKey}|${primary.toString(16)}|${secondary.toString(16)}|${accent.toString(16)}`;
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

  let alphaMap = null;

  if (styleKey === 'silk_embroidery') {
    // Gradiente de seda: tono pastel luminoso arriba -> tono pétalo/profundo hacia el bajo (v=0 en UV es bottom!)
    // Canvas y=0 es v=1 (cintura) y Canvas y=size es v=0 (dobladillo)
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0.0, hexCss(secondary));
    grad.addColorStop(0.28, hexCss(primary));
    grad.addColorStop(0.84, mixHexCss(primary, deep, 0.35));
    grad.addColorStop(1.0, mixHexCss(primary, deep, 0.58));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Micro-trama diagonal satinada
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.5;
    for (let x = -size; x < size * 2; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + size * 0.45, size);
      ctx.stroke();
    }

    rCtx.fillStyle = '#707070';
    rCtx.fillRect(0, 0, bSize, bSize);

    // Doble banda de bordado dorado imperial y arabescos florales cerca del bajo (y ∈ [0.76..0.97])
    const goldCss = hexCss(accent);
    const goldLight = mixHexCss(accent, 0xffffff, 0.42);
    ctx.strokeStyle = goldCss;
    bCtx.strokeStyle = '#ffffff';
    rCtx.strokeStyle = '#383838';

    for (const [bandY, lw] of [[size * 0.80, 4.5], [size * 0.945, 7.0], [size * 0.962, 3.0]]) {
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(0, bandY);
      ctx.lineTo(size, bandY);
      ctx.stroke();

      const by = (bandY / size) * bSize;
      bCtx.lineWidth = Math.max(2, lw * 0.6);
      bCtx.beginPath();
      bCtx.moveTo(0, by);
      bCtx.lineTo(bSize, by);
      bCtx.stroke();

      rCtx.lineWidth = Math.max(2, lw * 0.7);
      rCtx.beginPath();
      rCtx.moveTo(0, by);
      rCtx.lineTo(bSize, by);
      rCtx.stroke();
    }

    // Arabescos, volutas y rosas imperiales repetidas en 8 módulos horizontales
    const repeats = 8;
    const step = size / repeats;
    for (let i = 0; i < repeats; i++) {
      const cx = (i + 0.5) * step;
      const cy = size * 0.872;
      ctx.strokeStyle = goldCss;
      ctx.lineWidth = 3.6;
      ctx.beginPath();
      ctx.moveTo(cx - step * 0.48, cy + 28);
      ctx.bezierCurveTo(cx - step * 0.25, cy - 42, cx + step * 0.25, cy - 42, cx + step * 0.48, cy + 28);
      ctx.stroke();

      // Flor estilizada central
      ctx.fillStyle = goldLight;
      ctx.beginPath();
      ctx.arc(cx, cy - 6, 9, 0, TAU);
      ctx.fill();
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * TAU - Math.PI / 2;
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(a) * 16, cy - 6 + Math.sin(a) * 16, 7, 11, a, 0, TAU);
        ctx.stroke();
      }
      // Festones en el borde
      ctx.beginPath();
      ctx.arc(cx, size * 0.945, step * 0.24, Math.PI, TAU);
      ctx.stroke();

      // Bump y roughness espejo en 512px
      const bcx = (cx / size) * bSize;
      const bcy = (cy / size) * bSize;
      const bStep = bSize / repeats;
      bCtx.lineWidth = 2.5;
      bCtx.beginPath();
      bCtx.arc(bcx, bcy - 3, 10, 0, TAU);
      bCtx.stroke();
      rCtx.fillStyle = '#363636';
      rCtx.beginPath();
      rCtx.arc(bcx, bcy - 3, 12, 0, TAU);
      rCtx.fill();
    }
  } else if (styleKey === 'corset_lace') {
    ctx.fillStyle = hexCss(secondary);
    ctx.fillRect(0, 0, size, size);
    rCtx.fillStyle = '#787878';
    rCtx.fillRect(0, 0, bSize, bSize);

    // Paneles con costuras de ballenas (boning) y filigrana dorada en escote
    const cols = 6;
    const step = size / cols;
    ctx.strokeStyle = mixHexCss(primary, 0xffffff, 0.35);
    ctx.lineWidth = 2.5;
    for (let i = 0; i <= cols; i++) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step, size);
      ctx.stroke();
    }
    // Encaje festoneado superior (escote) e inferior (cintura)
    ctx.strokeStyle = hexCss(accent);
    ctx.lineWidth = 3.2;
    for (let i = 0; i < 12; i++) {
      const lx = (i + 0.5) * (size / 12);
      ctx.beginPath();
      ctx.arc(lx, 42, size / 24, 0, Math.PI);
      ctx.stroke();
      bCtx.strokeStyle = '#ececec';
      bCtx.lineWidth = 2.2;
      bCtx.beginPath();
      bCtx.arc(lx, 42, size / 24, 0, Math.PI);
      bCtx.stroke();
    }
  } else if (styleKey === 'starlight_tulle') {
    ctx.fillStyle = hexCss(palette.tulle ?? secondary);
    ctx.fillRect(0, 0, size, size);
    rCtx.fillStyle = '#484848';
    rCtx.fillRect(0, 0, bSize, bSize);

    // Trama ultrafina en red romboidal
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.0;
    for (let i = -size; i < size * 2; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + size, size);
      ctx.moveTo(i + size, 0);
      ctx.lineTo(i, size);
      ctx.stroke();
    }

    // Mapa alfa suave con degradado hacia la cintura y borde inferior festoneado
    const cAlpha = document.createElement('canvas');
    cAlpha.width = size;
    cAlpha.height = size;
    const aCtx = cAlpha.getContext('2d');
    const aGrad = aCtx.createLinearGradient(0, 0, 0, size);
    aGrad.addColorStop(0.0, '#787878');
    aGrad.addColorStop(0.55, '#b8b8b8');
    aGrad.addColorStop(0.92, '#dedede');
    aGrad.addColorStop(1.0, '#ffffff');
    aCtx.fillStyle = aGrad;
    aCtx.fillRect(0, 0, size, size);

    // Puntos de micro-brillos en el tul
    for (let i = 0; i < 42; i++) {
      const sx = ((i * 137) % 480) + 16;
      const sy = ((i * 223) % 440) + 32;
      ctx.fillStyle = 'rgba(255, 250, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(sx, sy, (i % 3 === 0) ? 2.4 : 1.4, 0, TAU);
      ctx.fill();
    }

    alphaMap = new THREE.CanvasTexture(cAlpha);
    alphaMap.wrapS = THREE.RepeatWrapping;
    alphaMap.wrapT = THREE.ClampToEdgeWrapping;
    alphaMap.needsUpdate = true;
  } else {
    // 'royal_velvet': paño imperial profundo con micro-fibra y galones dorados en bajo
    const vGrad = ctx.createLinearGradient(0, 0, 0, size);
    vGrad.addColorStop(0.0, hexCss(primary));
    vGrad.addColorStop(1.0, mixHexCss(primary, deep, 0.45));
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, size, size);
    rCtx.fillStyle = '#a8a8a8';
    rCtx.fillRect(0, 0, bSize, bSize);

    ctx.strokeStyle = hexCss(accent);
    ctx.lineWidth = 6.0;
    ctx.beginPath();
    ctx.moveTo(0, size * 0.93);
    ctx.lineTo(size, size * 0.93);
    ctx.stroke();
    rCtx.strokeStyle = '#404040';
    rCtx.lineWidth = 6.0;
    rCtx.beginPath();
    rCtx.moveTo(0, size * 0.93);
    rCtx.lineTo(size, size * 0.93);
    rCtx.stroke();
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

/**
 * Construye una falda acampanada orgánica por loft radial con pliegues multi-armónicos,
 * bajo ondulado asimétrico (cero conos rígidos), Vertex AO en valles y atributo aSwayWeight.
 */
function createGownSkirtGeometry({
  profile,
  radialSegs = 56,
  pleatCount = 16,
  pleatDepth = 0.068,
  hemWave = 0.022,
  phiStart = 0,
  phiLength = TAU,
  swayPower = 1.45,
  shadowTint = 0x542856
}) {
  const vCount = profile.length;
  const cols = radialSegs + 1;
  const total = vCount * cols;
  const positions = new Float32Array(total * 3);
  const uvs = new Float32Array(total * 2);
  const sway = new Float32Array(total);
  const phase = new Float32Array(total);
  const indices = [];

  const yTop = profile[0][1];
  const yBot = profile[profile.length - 1][1];
  const spanY = Math.max(0.05, yTop - yBot);

  for (let iv = 0; iv < vCount; iv++) {
    const vNorm = iv / (vCount - 1);
    const [baseR, baseY, zRatio = 1.0] = profile[iv];
    const drop = (yTop - baseY) / spanY;
    const pleatEnv = Math.pow(drop, 1.15);

    for (let iu = 0; iu < cols; iu++) {
      const uNorm = iu / radialSegs;
      const phi = phiStart + uNorm * phiLength;
      // Pliegues orgánicos multi-armónicos (primario + secundario asimétrico)
      const p1 = Math.sin(phi * pleatCount + Math.sin(phi * 3.0) * 0.4);
      const p2 = Math.sin(phi * (pleatCount * 2.0) + 0.7) * 0.25;
      const radialMod = 1.0 + (p1 + p2) * pleatDepth * pleatEnv;
      const r = baseR * radialMod;

      // Bajo suavemente ondulado, nunca un círculo plano rígido
      const waveY = (Math.sin(phi * pleatCount * 0.5) * 0.55 + Math.cos(phi * 3.0) * 0.45) * hemWave * Math.pow(drop, 1.8);
      const x = Math.sin(phi) * r;
      const z = Math.cos(phi) * r * zRatio;
      const y = baseY + waveY;

      const idx = iv * cols + iu;
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;
      uvs[idx * 2] = uNorm * 2.0;
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

  bakeProceduralVertexAO(geo, {
    aoStrength: 0.34,
    minAO: 0.48,
    shadowTint,
    shadowTintStrength: 0.44,
    ridgeHighlight: 0.10,
    noiseStrength: 0.02,
    baseWeight: 0.20,
    cavityWeight: 0.48,
    undersideWeight: 0.22
  });
  initCharacterVertexAttributes(geo, 0, 0);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Construye los 8 pétalos festoneados superpuestos de la sobrefalda Peplum.
 */
function createPeplumPetalGeometry(petalCount = 8, waistY = 1.04) {
  const geos = [];
  for (let p = 0; p < petalCount; p++) {
    const aCenter = (p / petalCount) * TAU;
    const span = (TAU / petalCount) * 1.24;
    const rows = 9;
    const cols = 10;
    const total = rows * cols;
    const pos = new Float32Array(total * 3);
    const uvs = new Float32Array(total * 2);
    const sway = new Float32Array(total);
    const phase = new Float32Array(total);
    const idx = [];

    const layerOut = (p % 2) * 0.008;
    for (let r = 0; r < rows; r++) {
      const vr = r / (rows - 1);
      for (let c = 0; c < cols; c++) {
        const uc = c / (cols - 1);
        const edge = Math.sin(uc * Math.PI);
        const ang = aCenter + (uc - 0.5) * span;
        // Silueta en pétalo redondeado en el bajo
        const drop = (0.38 + 0.62 * Math.pow(edge, 0.55)) * 0.36;
        const y = waistY - vr * drop;
        const rad = 0.118 + layerOut + vr * 0.255 + Math.sin(vr * Math.PI) * 0.032;
        const x = Math.sin(ang) * rad;
        const z = Math.cos(ang) * rad * 0.94;
        const vi = r * cols + c;
        pos[vi * 3] = x;
        pos[vi * 3 + 1] = y;
        pos[vi * 3 + 2] = z;
        uvs[vi * 2] = uc;
        uvs[vi * 2 + 1] = 1.0 - vr;
        sway[vi] = Math.pow(vr, 1.35) * 0.72;
        phase[vi] = aCenter;
      }
    }
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a0 = r * cols + c;
        const a1 = a0 + 1;
        const b0 = a0 + cols;
        const b1 = b0 + 1;
        idx.push(a0, b0, a1, a1, b0, b1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setAttribute('aSwayWeight', new THREE.BufferAttribute(sway, 1));
    g.setAttribute('aStrandPhase', new THREE.BufferAttribute(phase, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    bakeProceduralVertexAO(g, {
      aoStrength: 0.28,
      minAO: 0.56,
      shadowTint: 0x5c2b56,
      shadowTintStrength: 0.42,
      ridgeHighlight: 0.08
    });
    geos.push(g);
  }
  return mergeLocalGeometries(geos);
}

/**
 * Construye una manga abullonada romántica con dos volúmenes y puño de encaje.
 */
function createRomanticSleeveGeo(radius = 0.072, length = 0.135) {
  const profile = [
    [0.015, 0.015, 1.0],
    [radius * 0.95, -length * 0.18, 0.96],
    [radius * 1.12, -length * 0.48, 0.96],
    [radius * 0.88, -length * 0.82, 0.96],
    [0.036, -length, 1.0]
  ];
  return createGownSkirtGeometry({
    profile,
    radialSegs: 20,
    pleatCount: 8,
    pleatDepth: 0.06,
    hemWave: 0.004,
    swayPower: 0.0
  });
}

function mergeLocalGeometries(geos) {
  let vTotal = 0;
  let iTotal = 0;
  for (const g of geos) {
    if (!g.attributes.normal) g.computeVertexNormals();
    initCharacterVertexAttributes(g);
    vTotal += g.attributes.position.count;
    iTotal += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vTotal * 3);
  const nrm = new Float32Array(vTotal * 3);
  const uv = new Float32Array(vTotal * 2);
  const col = new Float32Array(vTotal * 3);
  const smooth = new Float32Array(vTotal * 3);
  const sway = new Float32Array(vTotal);
  const phase = new Float32Array(vTotal);
  const idx = new Uint32Array(iTotal);

  let vo = 0;
  let io = 0;
  for (const g of geos) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array.subarray(0, c * 3), vo * 3);
    nrm.set(g.attributes.normal.array.subarray(0, c * 3), vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array.subarray(0, c * 2), vo * 2);
    if (g.attributes.color) col.set(g.attributes.color.array.subarray(0, c * 3), vo * 3);
    else col.fill(1, vo * 3, (vo + c) * 3);
    smooth.set(g.attributes.aSmoothNormal.array.subarray(0, c * 3), vo * 3);
    sway.set(g.attributes.aSwayWeight.array.subarray(0, c), vo);
    phase.set(g.attributes.aStrandPhase.array.subarray(0, c), vo);
    if (g.index) {
      const arr = g.index.array;
      for (let k = 0; k < arr.length; k++) idx[io++] = arr[k] + vo;
    } else {
      for (let k = 0; k < c; k++) idx[io++] = vo + k;
    }
    vo += c;
    g.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
  merged.setAttribute('aSmoothNormal', new THREE.BufferAttribute(smooth, 3));
  merged.setAttribute('aSwayWeight', new THREE.BufferAttribute(sway, 1));
  merged.setAttribute('aStrandPhase', new THREE.BufferAttribute(phase, 1));
  merged.setIndex(new THREE.BufferAttribute(idx, 1));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function addSweetheartCorsetDetails(add, m, waistY) {
  // Escote corazón esculpido con tubos curvos de filigrana dorada
  for (const s of [-1, 1]) {
    const sweetCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 1.215, 0.114),
      new THREE.Vector3(s * 0.048, 1.265, 0.110),
      new THREE.Vector3(s * 0.115, 1.275, 0.068),
      new THREE.Vector3(s * 0.126, 1.262, -0.025),
      new THREE.Vector3(s * 0.065, 1.245, -0.082),
      new THREE.Vector3(0, 1.235, -0.088)
    ]);
    add(new THREE.TubeGeometry(sweetCurve, 22, 0.0075, 8, false), m.roseGold);

    // Ballenas / costuras bordadas del corsé
    const boneCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 0.036, 1.235, 0.108),
      new THREE.Vector3(s * 0.032, 1.135, 0.095),
      new THREE.Vector3(s * 0.042, waistY + 0.005, 0.086)
    ]);
    add(new THREE.TubeGeometry(boneCurve, 10, 0.0045, 6, false), m.roseGold);

    // Tirante fino dorado / encaje sobre hombro
    const strapCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 0.095, 1.272, 0.072),
      new THREE.Vector3(s * 0.125, 1.355, 0.015),
      new THREE.Vector3(s * 0.085, 1.275, -0.068)
    ]);
    add(new THREE.TubeGeometry(strapCurve, 12, 0.0045, 6, false), m.roseGold);
  }

  // Cinturón joya entallado
  const beltCurve = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * TAU;
    beltCurve.push(new THREE.Vector3(Math.sin(a) * 0.104, waistY + 0.008, Math.cos(a) * 0.085));
  }
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(beltCurve, true), 28, 0.011, 8, true), m.roseGold);

  // Broches de cristal en escote y cintura
  const chestGem = add(new THREE.OctahedronGeometry(0.018, 1), m.crystal, 0, 1.222, 0.118);
  chestGem.scale.set(0.85, 1.25, 0.55);
  const waistGem = add(new THREE.OctahedronGeometry(0.024, 1), m.crystal, 0, waistY + 0.008, 0.092);
  waistGem.scale.set(0.9, 1.2, 0.6);

  // Lazo trasero de seda con cintas largas ondeantes (aSwayWeight en GPU)
  for (const s of [-1, 1]) {
    const loopCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, waistY, -0.086),
      new THREE.Vector3(s * 0.068, waistY + 0.032, -0.118),
      new THREE.Vector3(s * 0.082, waistY - 0.024, -0.128),
      new THREE.Vector3(0, waistY - 0.006, -0.088)
    ]);
    add(new THREE.TubeGeometry(loopCurve, 16, 0.016, 8, false), m.secondary);

    // Cintas largas del lazo trasero hacia la falda
    const ribbonGeo = createGownSkirtGeometry({
      profile: [
        [0.012, waistY - 0.008, 1.0],
        [0.022, waistY - 0.18, 1.0],
        [0.026, waistY - 0.42, 1.0]
      ],
      radialSegs: 4,
      pleatCount: 2,
      pleatDepth: 0.04,
      hemWave: 0.008,
      phiStart: Math.PI - 0.16 + s * 0.12,
      phiLength: 0.22,
      swayPower: 1.2
    });
    ribbonGeo.translate(0, 0, -0.085);
    const ribMesh = add(ribbonGeo, m.secondary);
    ribMesh.userData.skirtPart = true;
    ribMesh.userData.rideBias = 0.014;
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

  const addSkirt = (geo, mat, rideBias = 0.0) => {
    const mesh = add(geo, mat);
    mesh.userData.skirtPart = true;
    mesh.userData.rideBias = rideBias;
    return mesh;
  };

  // Mangas románticas abullonadas de dos capas (seda + organza translúcida) en pivotes de hombro
  if (style === 'ballgown' || style === 'ice_gown' || style === 'tiered_gown' || style === 'starry_gown') {
    const puffGeo = createRomanticSleeveGeo(0.068, 0.125);
    const organzaGeo = createRomanticSleeveGeo(0.075, 0.145);
    geometries.push(puffGeo, organzaGeo);
    for (const [idx, sh] of [shoulderL, shoulderR].entries()) {
      if (!sh) continue;
      const side = idx === 0 ? 1 : -1;
      const sleeveGrp = new THREE.Group();
      sleeveGrp.userData.isSleeve = true;
      const inner = new THREE.Mesh(puffGeo, materials.secondary);
      inner.position.set(side * 0.012, -0.018, 0);
      inner.castShadow = true;
      const outer = new THREE.Mesh(organzaGeo, materials.tulle || materials.shawl);
      outer.position.set(side * 0.012, -0.016, 0);
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.0055, 8, 18), materials.roseGold);
      geometries.push(cuff.geometry);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.set(side * 0.010, -0.142, 0);
      sleeveGrp.add(inner, outer, cuff);
      sh.add(sleeveGrp);
      sleeveNodes.push(sleeveGrp);
    }
  }

  if (style === 'ballgown') {
    // 1. Enagua interior suave (evita huecos desde abajo / galope)
    addSkirt(createGownSkirtGeometry({
      profile: [[0.100, waistY, 0.85], [0.21, 0.82, 0.90], [0.36, 0.44, 0.94], [0.46, 0.10, 0.96]],
      radialSegs: 28, pleatCount: 10, pleatDepth: 0.035, hemWave: 0.008, swayPower: 1.25
    }), materials.secondary, -0.010);

    // 2. Falda principal de gala (16 pliegues profundos + bajo ondulado orgánico)
    addSkirt(createGownSkirtGeometry({
      profile: [[0.108, waistY, 0.85], [0.22, 0.86, 0.92], [0.35, 0.60, 0.95], [0.47, 0.30, 0.97], [0.55, 0.045, 0.98]],
      radialSegs: 56, pleatCount: 16, pleatDepth: 0.068, hemWave: 0.022, swayPower: 1.45
    }), materials.primary, 0.0);

    // 3. Sobrefalda peplum de 8 pétalos festoneados con borde en relieve
    addSkirt(createPeplumPetalGeometry(8, waistY + 0.004), materials.secondary, 0.009);

    // 4. Velo exterior de tul estelar translúcido ligeramente desplazado
    addSkirt(createGownSkirtGeometry({
      profile: [[0.114, waistY + 0.006, 0.86], [0.24, 0.84, 0.93], [0.39, 0.56, 0.96], [0.51, 0.24, 0.98], [0.57, 0.032, 0.99]],
      radialSegs: 48, pleatCount: 14, pleatDepth: 0.055, hemWave: 0.026, swayPower: 1.55
    }), materials.tulle || materials.shawl, 0.018);

    addSweetheartCorsetDetails(add, materials, waistY);
  } else if (style === 'ice_gown') {
    addSkirt(createGownSkirtGeometry({
      profile: [[0.104, waistY, 0.86], [0.19, 0.84, 0.92], [0.31, 0.54, 0.95], [0.42, 0.26, 0.97], [0.50, 0.045, 0.98]],
      radialSegs: 52, pleatCount: 14, pleatDepth: 0.065, hemWave: 0.020, swayPower: 1.45
    }), materials.primary, 0.0);
    // Capa estelar traslúcida desde los hombros
    addSkirt(createGownSkirtGeometry({
      profile: [[0.145, 1.33, 0.78], [0.22, 1.05, 0.84], [0.34, 0.65, 0.92], [0.45, 0.16, 0.96]],
      radialSegs: 28, pleatCount: 8, pleatDepth: 0.045, hemWave: 0.024, phiStart: Math.PI * 0.62, phiLength: Math.PI * 0.76, swayPower: 1.3
    }), materials.tulle || materials.shawl, 0.018);
    addSweetheartCorsetDetails(add, materials, waistY);
  } else if (style === 'tiered_gown') {
    addSkirt(createGownSkirtGeometry({
      profile: [[0.106, waistY, 0.86], [0.21, 0.82, 0.92], [0.32, 0.66, 0.95]],
      radialSegs: 44, pleatCount: 16, pleatDepth: 0.075, hemWave: 0.018, swayPower: 1.3
    }), materials.secondary, 0.008);
    addSkirt(createGownSkirtGeometry({
      profile: [[0.19, 0.74, 0.90], [0.33, 0.48, 0.95], [0.43, 0.34, 0.97]],
      radialSegs: 48, pleatCount: 18, pleatDepth: 0.080, hemWave: 0.020, swayPower: 1.4
    }), materials.primary, 0.004);
    addSkirt(createGownSkirtGeometry({
      profile: [[0.30, 0.44, 0.93], [0.44, 0.18, 0.97], [0.53, 0.045, 0.98]],
      radialSegs: 52, pleatCount: 20, pleatDepth: 0.084, hemWave: 0.024, swayPower: 1.5
    }), materials.secondary, 0.0);
    addSweetheartCorsetDetails(add, materials, waistY);
  } else if (style === 'starry_gown') {
    addSkirt(createGownSkirtGeometry({
      profile: [[0.108, waistY, 0.86], [0.21, 0.84, 0.92], [0.36, 0.52, 0.95], [0.48, 0.22, 0.97], [0.54, 0.045, 0.98]],
      radialSegs: 54, pleatCount: 16, pleatDepth: 0.072, hemWave: 0.022, swayPower: 1.45
    }), materials.primary, 0.0);
    addSkirt(createPeplumPetalGeometry(6, waistY + 0.004), materials.secondary, 0.009);
    addSkirt(createGownSkirtGeometry({
      profile: [[0.114, waistY + 0.005, 0.86], [0.23, 0.85, 0.93], [0.38, 0.54, 0.96], [0.50, 0.20, 0.98], [0.56, 0.036, 0.99]],
      radialSegs: 46, pleatCount: 14, pleatDepth: 0.056, hemWave: 0.026, swayPower: 1.55
    }), materials.tulle || materials.shawl, 0.018);
    addSweetheartCorsetDetails(add, materials, waistY);
  } else if (style === 'chic_midi') {
    addSkirt(createGownSkirtGeometry({
      profile: [[0.110, waistY, 0.86], [0.19, 0.84, 0.92], [0.27, 0.64, 0.95], [0.34, 0.44, 0.96]],
      radialSegs: 48, pleatCount: 18, pleatDepth: 0.068, hemWave: 0.014, swayPower: 1.4
    }), materials.primary, 0.0);
    // Solapas entalladas y lazo de blusa
    for (const s of [-1, 1]) {
      const lapel = new THREE.CatmullRomCurve3([
        new THREE.Vector3(s * 0.022, 1.07, 0.098),
        new THREE.Vector3(s * 0.062, 1.22, 0.112),
        new THREE.Vector3(s * 0.045, 1.35, 0.078)
      ]);
      add(new THREE.TubeGeometry(lapel, 14, 0.018, 6, false), materials.bodice || materials.primary);
    }
    addSweetheartCorsetDetails(add, materials, waistY);
  } else {
    // 'riding' — Amazona de Palacio: faldón ecuestre abierto delante con botonadura real y charreteras
    addSkirt(createGownSkirtGeometry({
      profile: [[0.110, waistY, 0.84], [0.165, 0.86, 0.88], [0.21, 0.70, 0.90]],
      radialSegs: 36, pleatCount: 10, pleatDepth: 0.040, hemWave: 0.010,
      phiStart: 0.40, phiLength: TAU - 0.80, swayPower: 1.2
    }), materials.primary, 0.002);
    // Cuello alto mao con ribete dorado + doble botonadura + charreteras
    const collar = [];
    for (let i = 0; i <= 18; i++) {
      const a = (i / 18) * TAU;
      collar.push(new THREE.Vector3(Math.sin(a) * 0.056, 1.388, Math.cos(a) * 0.052));
    }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(collar, true), 22, 0.012, 8, true), materials.roseGold);
    for (const s of [-1, 1]) {
      const ep = new THREE.CatmullRomCurve3([
        new THREE.Vector3(s * 0.105, 1.37, 0.0),
        new THREE.Vector3(s * 0.175, 1.355, 0.0)
      ]);
      add(new THREE.TubeGeometry(ep, 8, 0.018, 6, false), materials.roseGold);
      for (let i = 0; i < 4; i++) {
        add(new THREE.SphereGeometry(0.010, 8, 8), materials.roseGold, s * 0.036, 1.29 - i * 0.058, 0.108);
      }
    }
    const beltCurve = [];
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * TAU;
      beltCurve.push(new THREE.Vector3(Math.sin(a) * 0.104, waistY + 0.008, Math.cos(a) * 0.085));
    }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(beltCurve, true), 24, 0.012, 8, true), materials.roseGold);
  }

  return { sleeveNodes, geometries };
}

/**
 * Construye la Levita Real completa del Príncipe / Caballeros de la Corte:
 * cuello Mao dorado, chaleco marfil, corbatín de seda con zafiro, charreteras con flecos,
 * cordón trenzado (aiguillette) y faldones partidos traseros (coattails) con ondeo GPU.
 */
export function buildPrinceRegalia(outfit, materials, metrics, options = {}) {
  const { outfitGroup, forearmL = null, forearmR = null } = options;
  const waistY = metrics?.waistY ?? 1.08;
  const geometries = [];
  const cuffNodes = [];

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

  // 1. Faldones traseros partidos (coattails) que ondean en GPU al caminar
  for (const s of [-1, 1]) {
    const phi0 = s > 0 ? Math.PI + 0.04 : Math.PI * 0.42;
    const phiLen = Math.PI * 0.54;
    const tailGeo = createGownSkirtGeometry({
      profile: [
        [0.140, waistY - 0.01, 0.80],
        [0.168, 0.86, 0.84],
        [0.194, 0.64, 0.88]
      ],
      radialSegs: 16,
      pleatCount: 6,
      pleatDepth: 0.032,
      hemWave: 0.012,
      phiStart: phi0,
      phiLength: phiLen,
      swayPower: 1.35,
      shadowTint: 0x161436
    });
    const tail = add(tailGeo, materials.primary);
    tail.userData.skirtPart = true;
    tail.userData.rideBias = 0.005;
  }

  // 2. Chaleco marfil frontal en V + botonadura dorada
  const vestPts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const y = waistY + t * 0.34;
    const w = 0.072 - Math.abs(t - 0.5) * 0.018;
    vestPts.push([w, y, 0.082]);
  }
  const vestGeo = createGownSkirtGeometry({
    profile: [
      [0.095, 1.40, 0.85],
      [0.125, 1.24, 0.88],
      [0.118, waistY, 0.86]
    ],
    radialSegs: 14,
    pleatCount: 2,
    pleatDepth: 0.01,
    hemWave: 0.0,
    phiStart: -0.44,
    phiLength: 0.88,
    swayPower: 0.0
  });
  vestGeo.translate(0, 0, 0.012);
  add(vestGeo, materials.secondary);

  // Solapas abiertas de la levita enmarcando el chaleco marfil
  for (const s of [-1, 1]) {
    const lapelCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 0.032, waistY + 0.04, 0.105),
      new THREE.Vector3(s * 0.088, 1.27, 0.122),
      new THREE.Vector3(s * 0.074, 1.43, 0.088)
    ]);
    add(new THREE.TubeGeometry(lapelCurve, 14, 0.020, 8, false), materials.bodice || materials.primary);
    // Galón dorado de solapa
    add(new THREE.TubeGeometry(lapelCurve, 14, 0.006, 6, false), materials.roseGold, s * 0.004, 0, 0.014);

    // Doble botonadura dorada
    for (let i = 0; i < 4; i++) {
      add(new THREE.SphereGeometry(0.010, 8, 8), materials.roseGold, s * 0.056, 1.33 - i * 0.062, 0.122);
    }
  }

  // 3. Cuello Mao alto con ribete dorado + corbatín/ascot de seda con broche zafiro
  const collarPts = [];
  for (let i = 0; i <= 22; i++) {
    const a = (i / 22) * TAU;
    collarPts.push(new THREE.Vector3(Math.sin(a) * 0.068, 1.468, Math.cos(a) * 0.062));
  }
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(collarPts, true), 26, 0.016, 8, true), materials.bodice || materials.primary);
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(collarPts, true), 26, 0.006, 6, true), materials.roseGold, 0, 0.014, 0);

  // Ascot de seda + broche zafiro
  const ascotCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 1.448, 0.074),
    new THREE.Vector3(0, 1.385, 0.104),
    new THREE.Vector3(0, 1.315, 0.112)
  ]);
  add(new THREE.TubeGeometry(ascotCurve, 12, 0.024, 8, false), materials.secondary, 0, 0, 0, 0, 0, 0, 1.25, 1, 0.45);
  const ascotGem = add(new THREE.OctahedronGeometry(0.015, 1), materials.crystal, 0, 1.412, 0.112);
  ascotGem.scale.set(0.85, 1.25, 0.55);

  // 4. Charreteras doradas esculpidas con flecos + cordón trenzado (aiguillette)
  for (const s of [-1, 1]) {
    const epCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 0.125, 1.448, 0.0),
      new THREE.Vector3(s * 0.195, 1.438, 0.0),
      new THREE.Vector3(s * 0.240, 1.418, 0.0)
    ]);
    add(new THREE.TubeGeometry(epCurve, 10, 0.022, 8, false), materials.roseGold, 0, 0, 0, 0, 0, 0, 1.0, 0.48, 1.45);
    for (let f = -2; f <= 2; f++) {
      add(new THREE.CapsuleGeometry(0.0055, 0.036, 4, 6), materials.roseGold, s * 0.242, 1.392, f * 0.015);
    }
  }

  // Cordón trenzado dorado (aiguillette) del hombro derecho (-X) hacia el centro del pecho
  for (let c = 0; c < 2; c++) {
    const cordCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.195, 1.432, 0.018),
      new THREE.Vector3(-0.155, 1.295 + c * 0.022, 0.105 + c * 0.010),
      new THREE.Vector3(-0.075, 1.245 + c * 0.020, 0.128),
      new THREE.Vector3(-0.018, 1.335, 0.118)
    ]);
    add(new THREE.TubeGeometry(cordCurve, 18, 0.0055, 6, false), materials.roseGold);
  }

  // 5. Cinturón real con hebilla
  const beltPts = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * TAU;
    beltPts.push(new THREE.Vector3(Math.sin(a) * 0.138, waistY, Math.cos(a) * 0.102));
  }
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(beltPts, true), 28, 0.014, 8, true), materials.roseGold);
  add(new THREE.BoxGeometry(0.048, 0.038, 0.018), materials.roseGold, 0, waistY, 0.108);

  // Puños vueltos con galón dorado en antebrazos
  for (const fore of [forearmL, forearmR]) {
    if (!fore) continue;
    const cuffGrp = new THREE.Group();
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.007, 8, 16), materials.roseGold);
    geometries.push(cuff.geometry);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -(metrics?.forearmLen ?? 0.265) + 0.02;
    cuffGrp.add(cuff);
    fore.add(cuffGrp);
    cuffNodes.push(cuffGrp);
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
