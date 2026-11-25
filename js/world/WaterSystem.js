import * as THREE from 'three';
import { GraphicsSync } from '../core/Engine.js';

export const WATER_SURFACE_Y = -0.04;
const RIPPLE_COUNT = 10;
const PIER_COUNT = 16;
const SPLASH_DROP_COUNT = 120;

/**
 * Fórmula compartida del eje X central del Río Cristalino Real para z ∈ [-78.2, 39.4].
 * @param {number} z
 * @returns {number}
 */
export function getRiverCenterX(z) {
  const t = Math.min(1, (z * z) / 144);
  return 97.5 + Math.sin(z * 0.07) * 7.5 * t;
}

function getRiverTangentXZ(z, out) {
  const dz = 0.25;
  const x0 = getRiverCenterX(z - dz);
  const x1 = getRiverCenterX(z + dz);
  const dx = x1 - x0;
  const spanZ = dz * 2;
  const len = Math.hypot(dx, spanZ) || 1;
  out.x = dx / len;
  out.z = spanZ / len;
}

function pseudoRand(seed) {
  const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function smoothstepJS(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Evaluación de altura de puente parabólico C1 con rampas suaves de entrada/salida
function evalBridgeArchY(x, spec) {
  const span = spec.maxX - spec.minX;
  const t = Math.max(0, Math.min(1, (x - spec.minX) / span));
  const parabola = 4 * t * (1 - t);
  const ramp = smoothstepJS(0.0, 0.16, t) * smoothstepJS(0.0, 0.16, 1 - t);
  return spec.baseY + spec.archHeight * parabola * (0.28 + 0.72 * ramp);
}

// Onda Gerstner/trocoidal principal compartida exactamente entre Vertex Shader y sampleWater()
function evalPrimaryWaveY(wx, wz, flowX, flowZ, depth, time) {
  const damp = smoothstepJS(0.0, 0.18, depth);
  const phase1 = (wx * flowX + wz * flowZ) * 0.85 - time * 1.95;
  const phase2 = (wx * 0.72 - wz * 0.69) * 1.35 + time * 1.42;
  const phase3 = (wx * -0.45 + wz * 0.89) * 1.9 - time * 1.65;
  return damp * (Math.sin(phase1) * 0.024 + Math.sin(phase2) * 0.011 + Math.sin(phase3) * 0.007);
}

function swapAttr3(attr, a, b) {
  const x = attr.getX(a);
  const y = attr.getY(a);
  const z = attr.getZ(a);
  attr.setXYZ(a, attr.getX(b), attr.getY(b), attr.getZ(b));
  attr.setXYZ(b, x, y, z);
}

function swapAttr2(attr, a, b) {
  const x = attr.getX(a);
  const y = attr.getY(a);
  attr.setXY(a, attr.getX(b), attr.getY(b));
  attr.setXY(b, x, y);
}

function mergeGeometries(pieces) {
  if (!pieces || pieces.length === 0) return null;
  const normalized = [];
  let totalVerts = 0;

  for (let i = 0; i < pieces.length; i++) {
    const { geometry, matrix } = pieces[i];
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    if (matrix) {
      g.applyMatrix4(matrix);
      if (matrix.determinant() < 0) {
        const pos = g.attributes.position;
        const norm = g.attributes.normal;
        const uv = g.attributes.uv;
        for (let v = 0; v < pos.count; v += 3) {
          swapAttr3(pos, v + 1, v + 2);
          if (norm) swapAttr3(norm, v + 1, v + 2);
          if (uv) swapAttr2(uv, v + 1, v + 2);
        }
      }
    }
    totalVerts += g.attributes.position.count;
    normalized.push(g);
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);

  let offset = 0;
  for (let i = 0; i < normalized.length; i++) {
    const g = normalized[i];
    const pos = g.attributes.position;
    const norm = g.attributes.normal;
    const uv = g.attributes.uv;
    const count = pos.count;

    for (let v = 0; v < count; v++) {
      const i3 = (offset + v) * 3;
      const i2 = (offset + v) * 2;
      positions[i3] = pos.getX(v);
      positions[i3 + 1] = pos.getY(v);
      positions[i3 + 2] = pos.getZ(v);
      if (norm) {
        normals[i3] = norm.getX(v);
        normals[i3 + 1] = norm.getY(v);
        normals[i3 + 2] = norm.getZ(v);
      }
      if (uv) {
        uvs[i2] = uv.getX(v);
        uvs[i2 + 1] = uv.getY(v);
      }
    }
    offset += count;
    g.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

/**
 * Sistema Hidrológico AAA:
 * - Shader GLSL físicamente inspirado (Gerstner, Beer-Lambert, cáusticas, Fresnel, GGX lunar, espuma celular).
 * - Física dinámica 100% GC-Free (sampleWater, spawnRipple, pool de salpicaduras, flotabilidad, vadeo/empuje).
 * - Orillas orgánicas instanciadas (rocas musgosas, juncos al viento, nenúfares y lotos luminosos).
 * - 5 Puentes Barrocos Arqueados de Mármol y Oro con arcos huecos reales, faroles HDR y física C1 exacta.
 */
export class WaterSystem {
  #scene;
  #textures;
  #collision;
  #root = null;
  #geometries = [];
  #materials = [];
  #ownedTextures = [];
  #instancedMeshes = [];
  #staticBuckets = new Map();
  #tempGeos = [];
  #dummy = new THREE.Object3D();
  #elapsed = 0;

  // Shader del agua e interacción
  #waterMat = null;
  #ripples = [];
  #rippleCursor = 0;
  #pierPositions = [];
  #pierCount = 0;

  // Puentes barrocos
  #bridges = [];

  // Cascada Norte
  #waterfallTex = null;
  #waterfallMat = null;
  #crystalPinkMat = null;
  #crystalTurquoiseMat = null;
  #waterfallSpray = null;
  #waterfallSprayData = null;
  #foamInst = null;
  #foamData = null;
  #foamCount = 0;
  #rippleInst = null;
  #rippleData = null;
  #rippleCount = 0;

  // Pool de 120 gotas de salpicadura con gravedad real
  #splashInst = null;
  #splashActive = new Uint8Array(SPLASH_DROP_COUNT);
  #splashPos = new Float32Array(SPLASH_DROP_COUNT * 3);
  #splashVel = new Float32Array(SPLASH_DROP_COUNT * 3);
  #splashLife = new Float32Array(SPLASH_DROP_COUNT);
  #splashMaxLife = new Float32Array(SPLASH_DROP_COUNT);
  #splashCursor = 0;
  #lastPlayerRippleTime = -10;

  // Nenúfares y lotos con flotabilidad dinámica
  #lilyInst = null;
  #lotusInst = null;
  #lilyCoords = [];
  #lotusCoords = [];

  // Scratchpads preasignados (100% GC-Free)
  #tmpTangent = { x: 0, z: 1 };
  #tmpBuoy = { y: 0, pitch: 0, roll: 0 };
  #tmpWaterSample = { inWater: false, surfaceY: WATER_SURFACE_Y, depth: 0, flowX: 0, flowZ: 0, distToBank: 99 };
  #tmpUp = new THREE.Vector3(0, 1, 0);

  constructor(scene, textureFactory, collisionSystem) {
    this.#scene = scene;
    this.#textures = textureFactory;
    this.#collision = collisionSystem;

    for (let i = 0; i < RIPPLE_COUNT; i++) {
      this.#ripples.push(new THREE.Vector4(0, 0, -999, 0));
    }
    for (let i = 0; i < PIER_COUNT; i++) {
      this.#pierPositions.push(new THREE.Vector3(0, 0, 0));
    }
  }

  init() {
    this.#root = new THREE.Group();
    this.#root.name = 'RoyalWaterSystem';

    const mats = this.#createMaterials();
    const shoreStones = [];
    const foamSpecs = [];
    const rippleEmitters = [];

    this.#buildAllBridges(mats, foamSpecs);
    this.#buildRoyalRiverAndWaterfall(mats, shoreStones, foamSpecs, rippleEmitters);
    this.#buildSwanLake(mats, shoreStones, foamSpecs, rippleEmitters);
    this.#buildLegacyPondsStreamsAndSouthLake(mats, shoreStones);

    this.#flushStaticBuckets();
    this.#buildOrganicBanksInstanced(mats, shoreStones);
    this.#buildSplashDropPool(mats);
    this.#buildFoamInstanced(mats, foamSpecs);
    this.#buildRippleRingsInstanced(mats, rippleEmitters);

    this.#root.matrixAutoUpdate = false;
    this.#root.updateMatrix();
    this.#scene.add(this.#root);
  }

  #trackGeo(geo) {
    this.#geometries.push(geo);
    return geo;
  }

  #trackMat(mat) {
    this.#materials.push(mat);
    return mat;
  }

  #trackTex(tex) {
    this.#ownedTextures.push(tex);
    return tex;
  }

  #addMesh(geo, mat, x, y, z, castShadow = false, receiveShadow = false) {
    this.#trackGeo(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = castShadow;
    m.receiveShadow = receiveShadow;
    this.#root.add(m);
    return m;
  }

  #addStaticMesh(
    geo,
    mat,
    x,
    y,
    z,
    castShadow = true,
    receiveShadow = true,
    rotX = 0,
    rotY = 0,
    rotZ = 0,
    sx = 1,
    sy = 1,
    sz = 1,
    sharedGeo = false
  ) {
    if (!sharedGeo) this.#tempGeos.push(geo);
    const key = `${mat.id}_${castShadow ? 1 : 0}_${receiveShadow ? 1 : 0}`;
    let bucket = this.#staticBuckets.get(key);
    if (!bucket) {
      bucket = { mat, castShadow, receiveShadow, pieces: [] };
      this.#staticBuckets.set(key, bucket);
    }
    this.#dummy.position.set(x, y, z);
    this.#dummy.rotation.set(rotX, rotY, rotZ);
    this.#dummy.scale.set(sx, sy, sz);
    this.#dummy.updateMatrix();
    bucket.pieces.push({ geometry: geo, matrix: this.#dummy.matrix.clone() });
  }

  #flushStaticBuckets() {
    for (const bucket of this.#staticBuckets.values()) {
      const merged = mergeGeometries(bucket.pieces);
      if (!merged) continue;
      this.#trackGeo(merged);
      const mesh = new THREE.Mesh(merged, bucket.mat);
      mesh.castShadow = bucket.castShadow;
      mesh.receiveShadow = bucket.receiveShadow;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.#root.add(mesh);
    }
    this.#staticBuckets.clear();
    for (const g of this.#tempGeos) g.dispose();
    this.#tempGeos.length = 0;
  }

  #createInstanced(geo, mat, count, castShadow = false, receiveShadow = true) {
    this.#trackGeo(geo);
    const im = new THREE.InstancedMesh(geo, mat, count);
    im.castShadow = castShadow;
    im.receiveShadow = receiveShadow;
    this.#instancedMeshes.push(im);
    this.#root.add(im);
    return im;
  }

  #finalizeStaticInstanced(im) {
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    im.matrixAutoUpdate = false;
    im.updateMatrix();
  }

  // ---------------------------------------------------------------------------
  // Texturas procedurales (512x512 lecho, 512x512 calzada de mármol, piedra+musgo, nenúfar)
  // ---------------------------------------------------------------------------

  #createPebbleBedTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1b313a';
    ctx.fillRect(0, 0, size, size);

    // Arena oscura y manchas de musgo subacuático
    for (let i = 0; i < 420; i++) {
      const x = pseudoRand(i * 3.1 + 1.4) * size;
      const y = pseudoRand(i * 7.3 + 2.9) * size;
      const r = 10 + pseudoRand(i * 5.7) * 26;
      const isMoss = i % 3 === 0;
      ctx.fillStyle = isMoss ? 'rgba(34, 78, 56, 0.24)' : 'rgba(18, 34, 44, 0.30)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Guijarros húmedos redondeados
    for (let i = 0; i < 650; i++) {
      const x = pseudoRand(i * 11.7 + 4.1) * size;
      const y = pseudoRand(i * 13.3 + 8.7) * size;
      const rx = 4 + pseudoRand(i * 2.9) * 11;
      const ry = rx * (0.65 + pseudoRand(i * 6.1) * 0.4);
      const rot = pseudoRand(i * 4.3) * Math.PI;
      const tone = 38 + Math.round(pseudoRand(i * 9.7) * 52);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = `rgb(${tone}, ${tone + 14}, ${tone + 20})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(180, 225, 235, 0.14)';
      ctx.beginPath();
      ctx.ellipse(-rx * 0.2, -ry * 0.25, rx * 0.5, ry * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const tex = this.#trackTex(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 18);
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }

  #createBridgeDeckTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f5eef2';
    ctx.fillRect(0, 0, size, size);

    // Vetas de mármol crema
    for (let i = 0; i < 90; i++) {
      const x0 = pseudoRand(i * 4.1) * size;
      const y0 = pseudoRand(i * 7.7) * size;
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(218, 194, 208, 0.24)' : 'rgba(255, 255, 255, 0.32)';
      ctx.lineWidth = 1 + pseudoRand(i * 2.3) * 2.2;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.bezierCurveTo(x0 + 40, y0 - 20, x0 + 80, y0 + 25, x0 + 130, y0 + 8);
      ctx.stroke();
    }

    // Junta de losas transversales y longitudinales
    ctx.strokeStyle = 'rgba(188, 156, 174, 0.42)';
    ctx.lineWidth = 2;
    const cols = 6;
    const rows = 8;
    for (let r = 0; r <= rows; r++) {
      const y = (r / rows) * size;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
    for (let c = 0; c <= cols; c++) {
      const x = (c / cols) * size;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }

    // Cenefas laterales rosadas y filigranas doradas
    ctx.fillStyle = 'rgba(222, 134, 176, 0.36)';
    ctx.fillRect(0, 14, size, 28);
    ctx.fillRect(0, size - 42, size, 28);

    ctx.strokeStyle = '#d4a654';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 12, size - 8, 32);
    ctx.strokeRect(4, size - 44, size - 8, 32);

    ctx.fillStyle = '#e2b968';
    for (let x = 24; x < size; x += 48) {
      ctx.beginPath();
      ctx.arc(x, 28, 4.5, 0, Math.PI * 2);
      ctx.arc(x, size - 28, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = this.#trackTex(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }

  #createShoreRockTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, '#3a6c44');   // Musgo húmedo en cara superior
    grad.addColorStop(0.42, '#62736d');
    grad.addColorStop(1, '#3d4550');   // Piedra húmeda oscura abajo
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 360; i++) {
      const x = pseudoRand(i * 5.1) * size;
      const y = pseudoRand(i * 9.3) * size;
      const r = 2 + pseudoRand(i * 3.7) * 9;
      ctx.fillStyle = y < size * 0.48
        ? 'rgba(56, 124, 66, 0.28)'
        : 'rgba(28, 34, 44, 0.28)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = this.#trackTex(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  #createLilyPadTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const c = size * 0.5;

    const grad = ctx.createRadialGradient(c, c, 4, c, c, c);
    grad.addColorStop(0, '#62b35e');
    grad.addColorStop(0.75, '#3b8848');
    grad.addColorStop(1, '#2a6938');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(170, 232, 145, 0.35)';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(c + Math.cos(a) * c * 0.92, c + Math.sin(a) * c * 0.92);
      ctx.stroke();
    }

    const tex = this.#trackTex(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  #createWaterfallCanvas() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, size, 0);
    grad.addColorStop(0, '#7de4fa');
    grad.addColorStop(0.25, '#c7f5ff');
    grad.addColorStop(0.5, '#f2fdff');
    grad.addColorStop(0.75, '#c7f5ff');
    grad.addColorStop(1, '#7de4fa');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const tau = Math.PI * 2;
    for (let i = 0; i < 48; i++) {
      const x = (i / 48) * size;
      const w = 3 + pseudoRand(i * 4.3) * 7;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.42)' : 'rgba(92,202,232,0.34)';
      for (let y = 0; y < size; y += 8) {
        const waveX = x + Math.sin((y / size) * tau * 2 + i) * 3.5;
        ctx.fillRect(waveX, y, w, 9);
      }
    }
    return canvas;
  }

  // ---------------------------------------------------------------------------
  // WaterShaderMaterial GLSL + Materiales del sistema
  // ---------------------------------------------------------------------------

  #createWaterShaderMaterial() {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: GraphicsSync.uTime,
        uMoonDir: GraphicsSync.uMoonDir,
        uMoonColor: GraphicsSync.uMoonColor,
        uSkyZenith: GraphicsSync.uSkyZenith,
        uSkyMid: GraphicsSync.uSkyMid,
        uSkyHorizon: GraphicsSync.uSkyHorizon,
        uFogColor: GraphicsSync.uFogColor,
        uFogDensity: GraphicsSync.uFogDensity,
        uNightFactor: GraphicsSync.uNightFactor,
        uRipples: { value: this.#ripples },
        uPierPositions: { value: this.#pierPositions }
      },
      vertexShader: /* glsl */ `
        attribute float aDepth;
        attribute vec2 aFlowDir;

        uniform float uTime;
        uniform vec4 uRipples[10];

        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying float vDepth;
        varying vec2 vUv;
        varying vec2 vFlowDir;
        varying float vWaveCrest;

        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          float damp = smoothstep(0.0, 0.18, aDepth);

          // 3 trenes de ondas Gerstner/trocoidales suaves
          float p1 = dot(worldPos.xz, aFlowDir) * 0.85 - uTime * 1.95;
          float p2 = dot(worldPos.xz, vec2(0.72, -0.69)) * 1.35 + uTime * 1.42;
          float p3 = dot(worldPos.xz, vec2(-0.45, 0.89)) * 1.90 - uTime * 1.65;

          float h1 = sin(p1) * 0.024;
          float h2 = sin(p2) * 0.011;
          float h3 = sin(p3) * 0.007;
          float waveY = (h1 + h2 + h3) * damp;

          // Leve desplazamiento horizontal trocoidal + pendientes analíticas
          worldPos.x += (cos(p1) * aFlowDir.x * 0.018 + cos(p2) * 0.008) * damp;
          worldPos.z += (cos(p1) * aFlowDir.y * 0.018 - cos(p2) * 0.008) * damp;

          float dHx = (cos(p1) * aFlowDir.x * 0.020 + cos(p2) * 0.011 - cos(p3) * 0.006) * damp;
          float dHz = (cos(p1) * aFlowDir.y * 0.020 - cos(p2) * 0.010 + cos(p3) * 0.012) * damp;

          // Ondas concéntricas interactivas uRipples[10]
          float rippleDisp = 0.0;
          for (int i = 0; i < 10; i++) {
            vec4 rp = uRipples[i];
            if (rp.w > 0.001) {
              float age = uTime - rp.z;
              if (age >= 0.0 && age < 4.5) {
                float dist = length(worldPos.xz - rp.xy);
                float env = exp(-dist * 0.45) * exp(-age * 1.4) * rp.w;
                float rWave = sin(dist * 7.5 - age * 8.0) * env;
                rippleDisp += rWave * 0.055;
              }
            }
          }

          worldPos.y += waveY + rippleDisp * (0.35 + 0.65 * damp);

          vWorldPos = worldPos.xyz;
          vNormal = normalize(vec3(-dHx, 1.0, -dHz));
          vDepth = aDepth;
          vUv = uv;
          vFlowDir = aFlowDir;
          vWaveCrest = clamp((waveY / 0.042) * 0.5 + 0.5, 0.0, 1.0);

          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uMoonDir;
        uniform vec3 uMoonColor;
        uniform vec3 uSkyZenith;
        uniform vec3 uSkyMid;
        uniform vec3 uSkyHorizon;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        uniform float uNightFactor;
        uniform vec4 uRipples[10];
        uniform vec3 uPierPositions[16];

        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying float vDepth;
        varying vec2 vUv;
        varying vec2 vFlowDir;
        varying float vWaveCrest;

        float hash21(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 34.23);
          return fract(p.x * p.y);
        }

        float noise2(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
            mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }

        float fbm2(vec2 p) {
          float sum = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 3; i++) {
            sum += amp * noise2(p);
            p = p * 2.04 + vec2(5.2, -3.7);
            amp *= 0.5;
          }
          return sum;
        }

        // Altura analítica dual de micro-ondas fluyendo corriente abajo
        float waveHeightDetail(vec2 flowUV) {
          vec2 uvA = flowUV * 1.45 - vec2(0.0, uTime * 0.85);
          vec2 uvB = flowUV * 3.10 - vec2(uTime * 0.16, uTime * 1.38);
          float wA = sin(uvA.x * 3.1 + uvA.y * 2.4 + fbm2(uvA) * 2.6);
          float wB = cos(uvB.x * 4.7 - uvB.y * 3.2 + noise2(uvB) * 2.2);
          return wA * 0.55 + wB * 0.45;
        }

        // Cáusticas de interferencia tipo Voronoi/ondas
        float evalCaustics(vec2 uvFlow) {
          vec2 p1 = uvFlow * 1.65 - vec2(0.0, uTime * 0.55);
          vec2 p2 = uvFlow * 2.35 + vec2(uTime * 0.22, -uTime * 0.72);
          float c1 = abs(sin(p1.x * 2.6 + sin(p1.y * 2.1)) + cos(p1.y * 2.9 + cos(p1.x * 1.8)));
          float c2 = abs(sin(p2.x * 3.1 - cos(p2.y * 2.4)) + cos(p2.y * 2.7 + sin(p2.x * 2.3)));
          float net = 1.0 - smoothstep(0.0, 0.55, min(c1, c2));
          return net * net;
        }

        void main() {
          vec2 flowUV = vec2(vUv.x * 4.5, vUv.y * 0.55);
          float eps = 0.06;
          float hC = waveHeightDetail(flowUV);
          float hX = waveHeightDetail(flowUV + vec2(eps, 0.0));
          float hY = waveHeightDetail(flowUV + vec2(0.0, eps));

          vec2 gradN = vec2(hX - hC, hY - hC) / eps;
          float detailScale = 0.085 * smoothstep(0.0, 0.12, vDepth + 0.04);

          // Perturbación radial de normales por impactos uRipples[10]
          vec2 rippleGrad = vec2(0.0);
          float rippleFoam = 0.0;
          for (int i = 0; i < 10; i++) {
            vec4 rp = uRipples[i];
            if (rp.w > 0.001) {
              float age = uTime - rp.z;
              if (age >= 0.0 && age < 4.5) {
                vec2 toP = vWorldPos.xz - rp.xy;
                float dist = length(toP);
                vec2 dir = dist > 0.001 ? toP / dist : vec2(0.0);
                float env = exp(-dist * 0.45) * exp(-age * 1.4) * rp.w;
                float dWave = cos(dist * 7.5 - age * 8.0) * env;
                rippleGrad += dir * dWave * 0.42;
                rippleFoam += max(0.0, sin(dist * 7.5 - age * 8.0)) * env * 0.35;
              }
            }
          }

          vec3 N = normalize(vNormal + vec3(-gradN.x * detailScale - rippleGrad.x, 0.0, -gradN.y * detailScale - rippleGrad.y));
          vec3 V = normalize(cameraPosition - vWorldPos);
          vec3 L = normalize(uMoonDir);

          // 1. Absorción óptica Beer-Lambert según profundidad
          vec3 shallowColor = mix(vec3(0.18, 0.72, 0.80), vec3(0.12, 0.48, 0.62), uNightFactor);
          vec3 deepColor = mix(vec3(0.05, 0.25, 0.48), vec3(0.04, 0.07, 0.22), uNightFactor);
          float absorb = exp(-vDepth * 2.8);
          vec3 waterBody = mix(deepColor, shallowColor, absorb);

          // 2. Cáusticas subacuáticas animadas
          float caustics = evalCaustics(flowUV);
          float causticMask = (1.0 - smoothstep(0.15, 0.85, vDepth)) * smoothstep(0.0, 0.08, vDepth);
          vec3 causticCol = mix(vec3(0.45, 0.92, 1.0), vec3(0.38, 0.82, 0.96), uNightFactor);
          waterBody += causticCol * caustics * causticMask * 0.42;

          // 3. Fresnel de Schlick + reflejo del cielo y centelleo estelar
          float NdotV = max(dot(N, V), 0.0);
          float fresnel = 0.03 + 0.97 * pow(1.0 - NdotV, 4.5);
          vec3 R = reflect(-V, N);
          float rUp = clamp(R.y, 0.0, 1.0);
          vec3 skyRefl = mix(uSkyHorizon, uSkyMid, smoothstep(0.0, 0.28, rUp));
          skyRefl = mix(skyRefl, uSkyZenith, smoothstep(0.28, 0.75, rUp));

          // Centelleo estelar reflejado en crestas nocturnas
          float starNoise = hash21(floor(R.xz * 42.0 + vec2(floor(uTime * 1.5))));
          float starGlint = step(0.986, starNoise) * uNightFactor * smoothstep(0.05, 0.35, rUp);
          skyRefl += vec3(0.95, 0.92, 1.15) * starGlint * 0.65;

          vec3 col = mix(waterBody, skyRefl, clamp(fresnel * 0.88, 0.0, 0.94));

          // 4. Sendero de brillo lunar (GGX Specular Glitter) con picos HDR > 1.0 para Bloom
          vec3 H = normalize(L + V);
          float NdotH = max(dot(N, H), 0.0);
          float specSharp = pow(NdotH, 180.0) * 2.4;
          float specSoft = pow(NdotH, 28.0) * 0.35;
          col += uMoonColor * (specSharp + specSoft) * (0.75 + 0.45 * uNightFactor);

          // 5. Espuma celular animada (orillas, pilares de puentes y ripples)
          float foamNoise = fbm2(vWorldPos.xz * 1.15 - vFlowDir * (uTime * 0.65));
          float shoreWave = 0.5 + 0.5 * sin(uTime * 2.2 - vDepth * 18.0);
          float shoreFoam = smoothstep(0.16, 0.0, vDepth + (foamNoise - 0.5) * 0.09) * (0.45 + 0.55 * shoreWave);

          // Espuma alrededor de los 16 pilares de puente sumergidos
          float pierFoam = 0.0;
          for (int i = 0; i < 16; i++) {
            vec3 pier = uPierPositions[i];
            if (pier.z > 0.01) {
              vec2 dPier = vWorldPos.xz - pier.xy;
              float distP = length(dPier);
              float ring = smoothstep(pier.z + 1.25, pier.z + 0.05, distP) * (0.55 + 0.45 * foamNoise);
              // Estela aguas abajo siguiendo vFlowDir
              float downstream = dot(dPier, vFlowDir);
              float wake = exp(-max(0.0, downstream) * 0.55) * step(-0.2, downstream)
                * exp(-abs(dot(dPier, vec2(-vFlowDir.y, vFlowDir.x))) * 1.6);
              pierFoam = max(pierFoam, clamp(ring + wake * foamNoise * 0.85, 0.0, 1.0));
            }
          }

          float crestFoam = smoothstep(0.84, 0.98, vWaveCrest) * foamNoise * 0.25;
          float totalFoam = clamp(shoreFoam * 0.85 + pierFoam * 0.92 + rippleFoam + crestFoam, 0.0, 1.0);
          vec3 foamColor = mix(vec3(0.95, 0.98, 1.0), vec3(0.76, 0.86, 0.98), uNightFactor * 0.55);
          col = mix(col, foamColor, totalFoam * 0.82);

          // 6. Alpha de borde suave + profundidad transparente en orillas
          float edgeAlpha = smoothstep(0.0, 0.045, vDepth);
          float bodyAlpha = mix(0.66, 0.94, smoothstep(0.05, 0.65, vDepth));
          float alpha = clamp(max(bodyAlpha, totalFoam * 0.92) * edgeAlpha, 0.0, 0.97);
          if (alpha <= 0.004) discard;

          // 7. Niebla exponencial FogExp2 idéntica a scene.fog
          float distToCam = length(cameraPosition - vWorldPos);
          float fogFactor = 1.0 - exp(-pow(uFogDensity * distToCam, 2.0));
          col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));

          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    });
    mat.userData = { isVfx: true };
    return mat;
  }

  #createMaterials() {
    this.#waterMat = this.#trackMat(this.#createWaterShaderMaterial());

    const wfCanvas = this.#createWaterfallCanvas();
    this.#waterfallTex = this.#trackTex(new THREE.CanvasTexture(wfCanvas));
    this.#waterfallTex.colorSpace = THREE.SRGBColorSpace;
    this.#waterfallTex.wrapS = THREE.RepeatWrapping;
    this.#waterfallTex.wrapT = THREE.RepeatWrapping;
    this.#waterfallTex.repeat.set(2, 3);
    this.#waterfallTex.needsUpdate = true;

    const waterfall = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: this.#waterfallTex,
        color: 0xdff9ff,
        emissive: 0x5bc6e8,
        emissiveIntensity: 0.42,
        roughness: 0.18,
        metalness: 0.1,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide
      })
    );
    waterfall.userData.preserveRoughness = true;
    this.#waterfallMat = waterfall;

    const pondBed = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: this.#createPebbleBedTexture(),
        color: 0xffffff,
        roughness: 0.88,
        metalness: 0.04
      })
    );

    const bridgeDeckTex = this.#createBridgeDeckTexture();
    const bridgeDeckMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: bridgeDeckTex,
        color: 0xffffff,
        roughness: 0.30,
        metalness: 0.08
      })
    );

    const marble = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: this.#textures.getTexture('marble', 2, 2),
        color: 0xf7f2f6,
        roughness: 0.28,
        metalness: 0.08
      })
    );

    const roseGold = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: this.#textures.getTexture('roseGold', 1, 1),
        color: 0xf0b5a4,
        metalness: 0.88,
        roughness: 0.18
      })
    );

    const carpet = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: this.#textures.getTexture('carpet', 6, 1),
        color: 0xf4dce6,
        roughness: 0.72,
        metalness: 0.04
      })
    );

    const lanternGlass = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfff0d4,
        emissive: 0xffd28a,
        emissiveIntensity: 2.2,
        roughness: 0.15,
        metalness: 0.1
      })
    );
    lanternGlass.userData.preserveRoughness = true;

    const shoreRockMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: this.#createShoreRockTexture(),
        color: 0xffffff,
        roughness: 0.84,
        metalness: 0.05
      })
    );

    const reedMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x457d47,
        roughness: 0.82,
        metalness: 0.02,
        side: THREE.DoubleSide
      })
    );
    reedMat.customProgramCacheKey = () => 'royal_reed_wind_v1';
    reedMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = GraphicsSync.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float reedSway = clamp(position.y, 0.0, 1.5);
          vec4 instWorld = vec4(0.0);
          #ifdef USE_INSTANCING
            instWorld = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          #endif
          float windPhase = uTime * 1.85 + instWorld.x * 0.45 + instWorld.z * 0.35;
          transformed.x += sin(windPhase) * 0.09 * reedSway * reedSway;
          transformed.z += cos(windPhase * 0.83) * 0.06 * reedSway * reedSway;`
        );
    };

    const cattailMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x5c3a24,
        roughness: 0.90,
        metalness: 0.02
      })
    );

    const grottoRock = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: this.#textures.getTexture('marble', 2, 2),
        color: 0xc9c2cb,
        roughness: 0.78,
        metalness: 0.04
      })
    );

    const moss = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3b8f54,
        roughness: 0.86,
        metalness: 0.02
      })
    );

    const lilyPad = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: this.#createLilyPadTexture(),
        color: 0xffffff,
        roughness: 0.62,
        metalness: 0.04
      })
    );

    const lotusPetal = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffc8e2,
        emissive: 0xf47bb8,
        emissiveIntensity: 0.65,
        roughness: 0.35,
        metalness: 0.04
      })
    );

    const lotusCore = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffe4a8,
        emissive: 0xff9ec8,
        emissiveIntensity: 1.45,
        roughness: 0.25,
        metalness: 0.05
      })
    );
    lotusCore.userData.preserveRoughness = true;

    const crystalPink = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffdff2,
        emissive: 0xf06eb8,
        emissiveIntensity: 1.2,
        roughness: 0.14,
        metalness: 0.28,
        transparent: true,
        opacity: 0.88
      })
    );
    crystalPink.userData.preserveRoughness = true;
    this.#crystalPinkMat = crystalPink;

    const crystalTurquoise = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd4fbff,
        emissive: 0x3ad1e8,
        emissiveIntensity: 1.2,
        roughness: 0.14,
        metalness: 0.28,
        transparent: true,
        opacity: 0.88
      })
    );
    crystalTurquoise.userData.preserveRoughness = true;
    this.#crystalTurquoiseMat = crystalTurquoise;

    const foam = this.#trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xe8fbff,
        transparent: true,
        opacity: 0.44,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      })
    );
    foam.userData.isVfx = true;

    const ripple = this.#trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xd9f8ff,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
      })
    );
    ripple.userData.isVfx = true;

    const splashMat = this.#trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xe6f8ff,
        transparent: true,
        opacity: 0.86,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    splashMat.userData.isVfx = true;

    return {
      water: this.#waterMat,
      waterfall,
      pondBed,
      bridgeDeckMat,
      marble,
      roseGold,
      carpet,
      lanternGlass,
      shoreRockMat,
      reedMat,
      cattailMat,
      grottoRock,
      moss,
      lilyPad,
      lotusPetal,
      lotusCore,
      crystalPink,
      crystalTurquoise,
      foam,
      ripple,
      splashMat
    };
  }

  // ---------------------------------------------------------------------------
  // Geometría hidrológica de alta densidad + lechos esculpidos
  // ---------------------------------------------------------------------------

  #buildRiverSurfaceGeometry(zStart, zEnd, zSteps, halfWidth) {
    const pts = [];
    const ctrlCount = 28;
    for (let i = 0; i <= ctrlCount; i++) {
      const z = zStart + (i / ctrlCount) * (zEnd - zStart);
      pts.push(new THREE.Vector3(getRiverCenterX(z), WATER_SURFACE_Y, z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);

    const cols = 16;
    const vertCount = (zSteps + 1) * (cols + 1);
    const positions = new Float32Array(vertCount * 3);
    const normals = new Float32Array(vertCount * 3);
    const uvs = new Float32Array(vertCount * 2);
    const depths = new Float32Array(vertCount);
    const flowDirs = new Float32Array(vertCount * 2);
    const indices = [];

    const pt = new THREE.Vector3();
    const tang = new THREE.Vector3();
    let accumLen = 0;
    let prevX = 0;
    let prevZ = 0;

    for (let iz = 0; iz <= zSteps; iz++) {
      const tz = iz / zSteps;
      curve.getPoint(tz, pt);
      curve.getTangent(tz, tang);
      const tLen = Math.hypot(tang.x, tang.z) || 1;
      const fx = tang.x / tLen;
      const fz = tang.z / tLen;
      const nx = -fz;
      const nz = fx;

      if (iz > 0) {
        accumLen += Math.hypot(pt.x - prevX, pt.z - prevZ);
      }
      prevX = pt.x;
      prevZ = pt.z;

      for (let ix = 0; ix <= cols; ix++) {
        const u = ix / cols;
        const s = u * 2 - 1;
        const idx = iz * (cols + 1) + ix;
        positions[idx * 3] = pt.x + nx * s * halfWidth;
        positions[idx * 3 + 1] = WATER_SURFACE_Y;
        positions[idx * 3 + 2] = pt.z + nz * s * halfWidth;

        normals[idx * 3] = 0;
        normals[idx * 3 + 1] = 1;
        normals[idx * 3 + 2] = 0;

        uvs[idx * 2] = u;
        uvs[idx * 2 + 1] = accumLen;

        depths[idx] = Math.pow(Math.max(0, 1 - s * s), 0.72);
        flowDirs[idx * 2] = fx;
        flowDirs[idx * 2 + 1] = fz;
      }
    }

    for (let iz = 0; iz < zSteps; iz++) {
      for (let ix = 0; ix < cols; ix++) {
        const a = iz * (cols + 1) + ix;
        const b = a + 1;
        const c = a + (cols + 1);
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('aDepth', new THREE.BufferAttribute(depths, 1));
    geo.setAttribute('aFlowDir', new THREE.BufferAttribute(flowDirs, 2));
    geo.setIndex(indices);
    geo.computeBoundingSphere();
    return geo;
  }

  #buildRiverBedGeometry(zStart, zEnd, zSteps, bedHalfWidth) {
    const cols = 12;
    const vertCount = (zSteps + 1) * (cols + 1);
    const positions = new Float32Array(vertCount * 3);
    const uvs = new Float32Array(vertCount * 2);
    const indices = [];

    for (let iz = 0; iz <= zSteps; iz++) {
      const tz = iz / zSteps;
      const z = zStart + tz * (zEnd - zStart);
      const cx = getRiverCenterX(z);
      for (let ix = 0; ix <= cols; ix++) {
        const u = ix / cols;
        const s = u * 2 - 1;
        const absS = Math.abs(s);
        // Perfil esculpido: -0.025m en borde exterior bajo hierba -> -0.20m orilla -> -1.35m centro
        const profile = absS > 0.88
          ? -0.025 - ((1.0 - absS) / 0.12) * 0.175
          : -0.20 - Math.pow(Math.max(0, 1 - (absS / 0.88) * (absS / 0.88)), 0.8) * 1.15;
        const idx = iz * (cols + 1) + ix;
        positions[idx * 3] = cx + s * bedHalfWidth;
        positions[idx * 3 + 1] = profile;
        positions[idx * 3 + 2] = z;
        uvs[idx * 2] = u;
        uvs[idx * 2 + 1] = tz;
      }
    }

    for (let iz = 0; iz < zSteps; iz++) {
      for (let ix = 0; ix < cols; ix++) {
        const a = iz * (cols + 1) + ix;
        const b = a + 1;
        const c = a + (cols + 1);
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }

  #buildRadialWaterGeometry(cx, cz, rx, rz, radialSegs = 64, ringSegs = 16, yBase = WATER_SURFACE_Y, isBed = false) {
    const vertCount = 1 + radialSegs * ringSegs;
    const positions = new Float32Array(vertCount * 3);
    const normals = new Float32Array(vertCount * 3);
    const uvs = new Float32Array(vertCount * 2);
    const depths = new Float32Array(vertCount);
    const flowDirs = new Float32Array(vertCount * 2);
    const indices = [];

    positions[0] = cx;
    positions[1] = isBed ? -1.35 : yBase;
    positions[2] = cz;
    normals[1] = 1;
    uvs[0] = 0.5;
    uvs[1] = 0.5;
    depths[0] = 1.0;
    flowDirs[0] = 0.3;
    flowDirs[1] = 0.95;

    let vIdx = 1;
    for (let r = 1; r <= ringSegs; r++) {
      const rf = r / ringSegs;
      const bedY = rf > 0.92
        ? -0.025 - ((1.0 - rf) / 0.08) * 0.175
        : -0.20 - Math.pow(Math.max(0, 1 - (rf / 0.92) * (rf / 0.92)), 0.85) * 1.15;
      const depthVal = Math.pow(Math.max(0, 1 - rf * rf), 0.72);

      for (let a = 0; a < radialSegs; a++) {
        const ang = (a / radialSegs) * Math.PI * 2;
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);
        const px = cx + cosA * rx * rf;
        const pz = cz + sinA * rz * rf;

        positions[vIdx * 3] = px;
        positions[vIdx * 3 + 1] = isBed ? bedY : yBase;
        positions[vIdx * 3 + 2] = pz;

        normals[vIdx * 3 + 1] = 1;
        uvs[vIdx * 2] = 0.5 + cosA * rf * 0.5;
        uvs[vIdx * 2 + 1] = (px + pz) * 0.25;
        depths[vIdx] = depthVal;
        flowDirs[vIdx * 2] = -sinA * 0.35;
        flowDirs[vIdx * 2 + 1] = cosA * 0.35;
        vIdx++;
      }
    }

    for (let a = 0; a < radialSegs; a++) {
      const nextA = (a + 1) % radialSegs;
      indices.push(0, 1 + nextA, 1 + a);
    }
    for (let r = 1; r < ringSegs; r++) {
      const ringA = 1 + (r - 1) * radialSegs;
      const ringB = 1 + r * radialSegs;
      for (let a = 0; a < radialSegs; a++) {
        const nextA = (a + 1) % radialSegs;
        const p0 = ringA + a;
        const p1 = ringA + nextA;
        const p2 = ringB + a;
        const p3 = ringB + nextA;
        indices.push(p0, p1, p2, p1, p3, p2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    if (!isBed) {
      geo.setAttribute('aDepth', new THREE.BufferAttribute(depths, 1));
      geo.setAttribute('aFlowDir', new THREE.BufferAttribute(flowDirs, 2));
    }
    geo.setIndex(indices);
    if (isBed) geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }

  #buildRectWaterGeometry(cx, cz, width, length, segX = 12, segZ = 24, flowX = 0, flowZ = 1, isBed = false) {
    const vertCount = (segZ + 1) * (segX + 1);
    const positions = new Float32Array(vertCount * 3);
    const normals = new Float32Array(vertCount * 3);
    const uvs = new Float32Array(vertCount * 2);
    const depths = new Float32Array(vertCount);
    const flowDirs = new Float32Array(vertCount * 2);
    const indices = [];

    for (let iz = 0; iz <= segZ; iz++) {
      const tz = iz / segZ;
      const z = cz + (tz - 0.5) * length;
      const edgeZ = Math.min(tz, 1 - tz) * 2;
      for (let ix = 0; ix <= segX; ix++) {
        const tx = ix / segX;
        const x = cx + (tx - 0.5) * width;
        const edgeX = Math.min(tx, 1 - tx) * 2;
        const edge = Math.min(edgeX, Math.min(1, edgeZ * 2.2));
        const depthVal = Math.pow(Math.max(0, Math.min(1, edge)), 0.72);

        const idx = iz * (segX + 1) + ix;
        positions[idx * 3] = x;
        positions[idx * 3 + 1] = isBed ? (-0.025 - depthVal * 1.15) : WATER_SURFACE_Y;
        positions[idx * 3 + 2] = z;

        normals[idx * 3 + 1] = 1;
        uvs[idx * 2] = tx;
        uvs[idx * 2 + 1] = tz * length;
        depths[idx] = depthVal;
        flowDirs[idx * 2] = flowX;
        flowDirs[idx * 2 + 1] = flowZ;
      }
    }

    for (let iz = 0; iz < segZ; iz++) {
      for (let ix = 0; ix < segX; ix++) {
        const a = iz * (segX + 1) + ix;
        const b = a + 1;
        const c = a + (segX + 1);
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    if (!isBed) {
      geo.setAttribute('aDepth', new THREE.BufferAttribute(depths, 1));
      geo.setAttribute('aFlowDir', new THREE.BufferAttribute(flowDirs, 2));
    }
    geo.setIndex(indices);
    if (isBed) geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }

  #addWaterMesh(geo, mats) {
    const mesh = this.#addMesh(geo, mats.water, 0, 0, 0, false, false);
    mesh.renderOrder = -5;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }

  #buildRoyalRiverAndWaterfall(mats, shoreStones, foamSpecs, rippleEmitters) {
    const bedGeo = this.#buildRiverBedGeometry(-78.5, 39.6, 115, 3.85);
    const bedMesh = this.#addMesh(bedGeo, mats.pondBed, 0, 0, 0, false, true);
    bedMesh.matrixAutoUpdate = false;
    bedMesh.updateMatrix();

    const riverGeo = this.#buildRiverSurfaceGeometry(-78.2, 39.4, 115, 3.48);
    this.#addWaterMesh(riverGeo, mats);

    const isNearRiverBridge = (z) =>
      (z >= -41.0 && z <= -35.0) ||
      (z >= -5.6 && z <= 5.6) ||
      (z >= 24.0 && z <= 30.0);

    for (let z = -75.0; z <= 35.2; z += 1.45) {
      if (isNearRiverBridge(z)) continue;
      const cx = getRiverCenterX(z);
      const jitterL = (pseudoRand(z * 2.7 + 1.1) - 0.5) * 0.35;
      const jitterR = (pseudoRand(z * 3.1 + 9.4) - 0.5) * 0.35;
      shoreStones.push(
        [cx - 3.65 + jitterL, z, 0.52 + pseudoRand(z * 1.9) * 0.32, z * 0.8],
        [cx + 3.65 + jitterR, z, 0.52 + pseudoRand(z * 2.3 + 4) * 0.32, z * 1.1 + 1.5]
      );
    }

    // Gruta y Cascada Rocosa Real en el nacimiento Norte (getRiverCenterX(-78), -78)
    const gx = getRiverCenterX(-78);
    const gz = -78.0;
    const rockGeo = new THREE.DodecahedronGeometry(1.0, 1);
    const mossCapGeo = new THREE.SphereGeometry(1.0, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.52);
    const quartzGeo = new THREE.OctahedronGeometry(0.45, 0);
    this.#tempGeos.push(rockGeo, mossCapGeo, quartzGeo);

    const grottoBlocks = [
      [gx, 2.5, gz - 3.2, 4.6, 3.2, 2.4, 0.1, 0.2],
      [gx, 5.4, gz - 3.8, 3.8, 2.6, 2.2, -0.08, 0.5],
      [gx - 4.2, 2.1, gz - 1.4, 2.6, 2.6, 2.5, 0.15, 0.8],
      [gx - 3.5, 4.7, gz - 2.0, 2.2, 2.3, 2.1, -0.1, 1.4],
      [gx - 5.4, 1.2, gz + 0.6, 2.1, 1.5, 2.0, 0.08, 2.1],
      [gx + 4.2, 2.2, gz - 1.4, 2.6, 2.7, 2.5, -0.12, 0.4],
      [gx + 3.5, 4.8, gz - 2.0, 2.2, 2.4, 2.1, 0.12, 1.9],
      [gx + 5.4, 1.25, gz + 0.6, 2.1, 1.5, 2.0, -0.06, 2.7],
      [gx - 1.7, 6.9, gz - 2.6, 2.1, 1.4, 1.8, 0.1, 0.6],
      [gx + 1.7, 6.9, gz - 2.6, 2.1, 1.4, 1.8, -0.1, 1.2],
      [gx, 7.5, gz - 2.8, 2.4, 1.3, 1.9, 0.04, 0.3]
    ];

    for (const [rx, ry, rz, sx, sy, sz, tilt, yaw] of grottoBlocks) {
      this.#addStaticMesh(rockGeo, mats.grottoRock, rx, ry, rz, true, true, tilt, yaw, 0, sx, sy, sz, true);
      this.#addStaticMesh(mossCapGeo, mats.moss, rx, ry + sy * 0.45, rz, false, true, 0, yaw, 0, sx * 0.92, sy * 0.55, sz * 0.92, true);
    }

    const grottoCrystals = [
      [gx - 2.9, 3.6, gz - 0.5, 0.85, -0.25, 0.3, mats.crystalPink],
      [gx + 2.9, 3.7, gz - 0.5, 0.85, 0.25, -0.3, mats.crystalTurquoise],
      [gx, 8.35, gz - 2.5, 1.15, 0, 0, mats.crystalPink],
      [gx - 4.4, 1.8, gz + 1.1, 0.68, 0.2, 0.35, mats.crystalTurquoise],
      [gx + 4.4, 1.8, gz + 1.1, 0.68, -0.2, -0.35, mats.crystalPink]
    ];
    for (const [qx, qy, qz, sc, rx, rz, cMat] of grottoCrystals) {
      this.#addStaticMesh(quartzGeo, cMat, qx, qy, qz, false, false, rx, 0.4, rz, sc * 0.8, sc * 1.45, sc * 0.8, true);
    }

    const wfSegs = 22;
    const wfCols = 5;
    const wfPos = new Float32Array((wfSegs + 1) * wfCols * 3);
    const wfNorm = new Float32Array((wfSegs + 1) * wfCols * 3);
    const wfUv = new Float32Array((wfSegs + 1) * wfCols * 2);
    const wfIdx = [];
    for (let iy = 0; iy <= wfSegs; iy++) {
      const t = iy / wfSegs;
      const y = 5.42 * (1 - t) + WATER_SURFACE_Y * t + Math.sin(t * Math.PI * 2) * 0.16;
      const z = (gz - 1.85) + t * 3.25 + Math.sin(t * Math.PI) * 0.38;
      const halfW = 1.95 + t * 0.85;
      for (let ix = 0; ix < wfCols; ix++) {
        const u = ix / (wfCols - 1);
        const x = gx + (u * 2 - 1) * halfW;
        const vIdx = iy * wfCols + ix;
        wfPos[vIdx * 3] = x;
        wfPos[vIdx * 3 + 1] = y;
        wfPos[vIdx * 3 + 2] = z;
        wfNorm[vIdx * 3] = 0;
        wfNorm[vIdx * 3 + 1] = 0.35;
        wfNorm[vIdx * 3 + 2] = 0.94;
        wfUv[vIdx * 2] = u;
        wfUv[vIdx * 2 + 1] = t * 2.2;
      }
    }
    for (let iy = 0; iy < wfSegs; iy++) {
      for (let ix = 0; ix < wfCols - 1; ix++) {
        const a = iy * wfCols + ix;
        const b = a + 1;
        const c = a + wfCols;
        const d = c + 1;
        wfIdx.push(a, c, b, b, c, d);
      }
    }
    const wfGeo = new THREE.BufferGeometry();
    wfGeo.setAttribute('position', new THREE.BufferAttribute(wfPos, 3));
    wfGeo.setAttribute('normal', new THREE.BufferAttribute(wfNorm, 3));
    wfGeo.setAttribute('uv', new THREE.BufferAttribute(wfUv, 2));
    wfGeo.setIndex(wfIdx);
    wfGeo.computeBoundingSphere();
    const wfMesh = this.#addMesh(wfGeo, mats.waterfall, 0, 0, 0, false, false);
    wfMesh.matrixAutoUpdate = false;
    wfMesh.updateMatrix();

    this.#collision.addCylinderCollider(gx, gz - 1.2, 5.4, 0, 8.2);

    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const rad = 0.8 + (i % 4) * 0.65;
      foamSpecs.push({
        x: gx + Math.cos(a) * rad,
        y: 0.02 + (i % 3) * 0.01,
        z: gz + 1.5 + Math.sin(a) * rad * 0.75,
        dx: Math.cos(a) * 0.25,
        dz: 0.85,
        scale: 1.15 + (i % 3) * 0.35,
        speed: 1.35
      });
    }

    rippleEmitters.push(
      { x: gx, y: 0.01, z: gz + 1.6, minR: 0.85, maxR: 3.35, speed: 0.62 },
      { x: getRiverCenterX(-72.5), y: 0.01, z: -72.5, minR: 0.65, maxR: 2.6, speed: 0.46 }
    );

    const sprayCount = 72;
    const sprayPos = new Float32Array(sprayCount * 3);
    this.#waterfallSprayData = new Float32Array(sprayCount * 4);
    for (let i = 0; i < sprayCount; i++) {
      this.#waterfallSprayData[i * 4] = gx + (pseudoRand(i * 3.1) - 0.5) * 4.4;
      this.#waterfallSprayData[i * 4 + 1] = gz + 0.9 + pseudoRand(i * 5.7) * 2.2;
      this.#waterfallSprayData[i * 4 + 2] = pseudoRand(i * 8.3);
      this.#waterfallSprayData[i * 4 + 3] = 0.65 + pseudoRand(i * 11.9) * 0.65;
    }
    const sprayGeo = this.#trackGeo(new THREE.BufferGeometry());
    sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
    const sprayMat = this.#trackMat(
      new THREE.PointsMaterial({
        color: 0xe6fbff,
        size: 0.26,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    this.#waterfallSpray = new THREE.Points(sprayGeo, sprayMat);
    this.#waterfallSpray.matrixAutoUpdate = false;
    this.#waterfallSpray.updateMatrix();
    this.#root.add(this.#waterfallSpray);
  }

  #buildSwanLake(mats, shoreStones, foamSpecs, rippleEmitters) {
    const cx = 106.0;
    const cz = 45.0;
    const rx = 21.0;
    const rz = 12.5;

    const bedGeo = this.#buildRadialWaterGeometry(cx, cz, rx + 0.65, rz + 0.65, 56, 12, WATER_SURFACE_Y, true);
    const bedMesh = this.#addMesh(bedGeo, mats.pondBed, 0, 0, 0, false, true);
    bedMesh.matrixAutoUpdate = false;
    bedMesh.updateMatrix();

    const waterGeo = this.#buildRadialWaterGeometry(cx, cz, rx, rz, 64, 16, WATER_SURFACE_Y, false);
    this.#addWaterMesh(waterGeo, mats);

    const mouthX = getRiverCenterX(35.0);
    const stoneCount = 68;
    for (let i = 0; i < stoneCount; i++) {
      const a = (i / stoneCount) * Math.PI * 2;
      const sx = cx + Math.cos(a) * (rx + 0.28);
      const sz = cz + Math.sin(a) * (rz + 0.28);
      if (sz < 36.4 && Math.abs(sx - mouthX) < 4.6) continue;
      shoreStones.push([sx, sz, 0.58 + (i % 3) * 0.18, a + 0.4]);

      if (i % 4 === 0) {
        foamSpecs.push({
          x: cx + Math.cos(a) * (rx - 0.65),
          y: 0.0,
          z: cz + Math.sin(a) * (rz - 0.65),
          dx: -Math.cos(a) * 0.22,
          dz: -Math.sin(a) * 0.22,
          scale: 0.78 + (i % 2) * 0.25,
          speed: 0.55
        });
      }
    }

    rippleEmitters.push({
      x: getRiverCenterX(37.2),
      y: 0.0,
      z: 38.8,
      minR: 1.1,
      maxR: 4.5,
      speed: 0.36
    });
  }

  #buildLegacyPondsStreamsAndSouthLake(mats, shoreStones) {
    // 1. Estanque Este: (46, 26), rx = 10.8, rz = 8.3 + Canal X ∈ [31, 36], Z ∈ [18, 30]
    const pondBedGeo = this.#buildRadialWaterGeometry(46, 26, 11.4, 8.9, 44, 10, WATER_SURFACE_Y, true);
    const pondBedMesh = this.#addMesh(pondBedGeo, mats.pondBed, 0, 0, 0, false, true);
    pondBedMesh.matrixAutoUpdate = false;
    pondBedMesh.updateMatrix();
    this.#addWaterMesh(this.#buildRadialWaterGeometry(46, 26, 10.8, 8.3, 48, 12, WATER_SURFACE_Y, false), mats);

    const chanBedGeo = this.#buildRectWaterGeometry(33.5, 24.0, 5.6, 12.6, 8, 16, 0, 1, true);
    this.#addMesh(chanBedGeo, mats.pondBed, 0, 0, 0, false, true).matrixAutoUpdate = false;
    this.#addWaterMesh(this.#buildRectWaterGeometry(33.5, 24.0, 5.0, 12.2, 10, 20, 0, 1, false), mats);
    this.#addWaterMesh(this.#buildRectWaterGeometry(37.2, 25.0, 4.4, 9.2, 8, 14, 1, 0, false), mats);

    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const sx = 46 + Math.cos(a) * 10.9;
      const sz = 26 + Math.sin(a) * 8.4;
      if (sx < 38.2 && sz > 21.4 && sz < 26.8) continue;
      shoreStones.push([sx, sz, 0.58 + (i % 3) * 0.16, a]);
    }
    for (let z = 18.2; z <= 29.8; z += 1.3) {
      if (z >= 21.6 && z <= 26.4) continue;
      shoreStones.push([31.0, z, 0.52, z], [36.0, z, 0.52, z + 1.0]);
    }

    // 2. Arroyo Sur-Oeste: X ∈ [-23.6, -18.4], Z ∈ [28, 55.2]
    this.#addMesh(this.#buildRectWaterGeometry(-21, 41.6, 5.8, 27.8, 8, 22, 0, 1, true), mats.pondBed, 0, 0, 0, false, true).matrixAutoUpdate = false;
    this.#addWaterMesh(this.#buildRectWaterGeometry(-21, 41.6, 5.2, 27.4, 10, 26, 0, 1, false), mats);

    for (let z = 28.2; z <= 53.5; z += 1.35) {
      if (z >= 31.6 && z <= 36.4) continue;
      shoreStones.push([-23.8, z, 0.52, z * 0.7], [-18.2, z, 0.52, z * 1.1]);
    }

    // 3. Gran Lago Imperial Sur: X ∈ [-95, 95], Z ∈ [55, 108]
    this.#addMesh(this.#buildRectWaterGeometry(0, 81.5, 191, 54, 32, 16, 0.4, 0.2, true), mats.pondBed, 0, 0, 0, false, true).matrixAutoUpdate = false;
    this.#addWaterMesh(this.#buildRectWaterGeometry(0, 81.5, 190, 53, 64, 24, 0.4, 0.2, false), mats);

    for (let x = -84; x <= 84; x += 3.8) {
      if (Math.abs(x) < 10.5) continue;
      shoreStones.push([x + Math.sin(x) * 0.5, 55.0 + Math.cos(x * 0.4) * 0.5, 0.78 + (Math.abs(x) % 3) * 0.14, x * 0.4]);
    }
  }

  // ---------------------------------------------------------------------------
  // Orillas orgánicas instanciadas (rocas musgosas, juncos al viento, nenúfares & lotos)
  // ---------------------------------------------------------------------------

  #createDeformedRockGeometry(seedOffset) {
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const n =
        Math.sin(vx * 3.1 + seedOffset) * 0.16 +
        Math.cos(vy * 3.7 - seedOffset * 1.3) * 0.14 +
        Math.sin(vz * 4.3 + vx * 2.1) * 0.12;
      const scale = 0.85 + n;
      pos.setXYZ(i, vx * scale, vy * scale * 0.62, vz * scale);
    }
    geo.computeVertexNormals();
    return geo;
  }

  #buildOrganicBanksInstanced(mats, shoreStones) {
    // 1. Rocas de ribera musgosas (2 variantes orgánicas en InstancedMesh)
    if (shoreStones.length > 0) {
      const rockGeoA = this.#createDeformedRockGeometry(1.7);
      const rockGeoB = this.#createDeformedRockGeometry(5.9);
      const countA = Math.ceil(shoreStones.length / 2);
      const countB = shoreStones.length - countA;
      const instA = this.#createInstanced(rockGeoA, mats.shoreRockMat, countA, false, true);
      const instB = this.#createInstanced(rockGeoB, mats.shoreRockMat, countB, false, true);
      const dummy = this.#dummy;
      let idxA = 0;
      let idxB = 0;

      for (let i = 0; i < shoreStones.length; i++) {
        const [sx, sz, sc, rot] = shoreStones[i];
        dummy.position.set(sx, 0.04, sz);
        dummy.rotation.set(0.08 * Math.sin(i), rot, 0.08 * Math.cos(i));
        dummy.scale.set(sc * 1.15, sc * 0.68, sc * 0.92);
        dummy.updateMatrix();
        if (i % 2 === 0) instA.setMatrixAt(idxA++, dummy.matrix);
        else instB.setMatrixAt(idxB++, dummy.matrix);
      }
      this.#finalizeStaticInstanced(instA);
      this.#finalizeStaticInstanced(instB);
    }

    // 2. Juncos curvos y espadañas cerca de las orillas (animados por viento en GPU)
    const reedClusters = [];
    const cattailSpots = [];
    for (let z = -72; z <= 34; z += 4.2) {
      if ((z >= -42 && z <= -34) || (z >= -7 && z <= 7) || (z >= 23 && z <= 31)) continue;
      const rcx = getRiverCenterX(z);
      const side = Math.sin(z * 1.3) > 0 ? 1 : -1;
      const bx = rcx + side * 3.15;
      for (let k = 0; k < 5; k++) {
        const ox = (pseudoRand(z * 7.1 + k) - 0.5) * 0.65;
        const oz = (pseudoRand(z * 3.3 + k * 2) - 0.5) * 0.75;
        reedClusters.push([bx + ox, z + oz, 0.78 + pseudoRand(k * 9 + z) * 0.55, pseudoRand(k + z) * Math.PI * 2]);
        if (k === 0 || k === 2) {
          cattailSpots.push([bx + ox, z + oz, 0.78 + pseudoRand(k * 9 + z) * 0.55, pseudoRand(k + z) * Math.PI * 2]);
        }
      }
    }
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const bx = 106 + Math.cos(a) * 20.4;
      const bz = 45 + Math.sin(a) * 12.1;
      if (bz < 36.5 && Math.abs(bx - getRiverCenterX(35)) < 5.0) continue;
      for (let k = 0; k < 4; k++) {
        const ox = (pseudoRand(i * 5 + k) - 0.5) * 0.7;
        const oz = (pseudoRand(i * 8 + k) - 0.5) * 0.7;
        reedClusters.push([bx + ox, bz + oz, 0.85 + pseudoRand(i + k) * 0.45, a + k]);
        if (k === 1) cattailSpots.push([bx + ox, bz + oz, 0.85 + pseudoRand(i + k) * 0.45, a + k]);
      }
    }

    if (reedClusters.length > 0) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.04, 0.48, 0.02),
        new THREE.Vector3(0.11, 0.96, 0.05),
        new THREE.Vector3(0.20, 1.32, 0.08)
      ]);
      const reedGeo = new THREE.TubeGeometry(curve, 6, 0.026, 5, false);
      const reedInst = this.#createInstanced(reedGeo, mats.reedMat, reedClusters.length, false, false);
      const dummy = this.#dummy;
      for (let i = 0; i < reedClusters.length; i++) {
        const [rx, rz, sc, yaw] = reedClusters[i];
        dummy.position.set(rx, -0.14, rz);
        dummy.rotation.set(0.08 * Math.sin(i), yaw, 0);
        dummy.scale.set(sc, sc, sc);
        dummy.updateMatrix();
        reedInst.setMatrixAt(i, dummy.matrix);
      }
      this.#finalizeStaticInstanced(reedInst);

      if (cattailSpots.length > 0) {
        const catGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.28, 7);
        const catInst = this.#createInstanced(catGeo, mats.cattailMat, cattailSpots.length, false, false);
        for (let i = 0; i < cattailSpots.length; i++) {
          const [cx, cz, sc, yaw] = cattailSpots[i];
          dummy.position.set(cx + Math.cos(yaw) * 0.08 * sc, -0.14 + 0.92 * sc, cz - Math.sin(yaw) * 0.08 * sc);
          dummy.rotation.set(0.12, yaw, -0.14);
          dummy.scale.setScalar(sc);
          dummy.updateMatrix();
          catInst.setMatrixAt(i, dummy.matrix);
        }
        this.#finalizeStaticInstanced(catInst);
      }
    }

    // 3. Nenúfares y flores de loto mágicas con núcleo emisivo HDR (flotando con applyBuoyancy)
    this.#lilyCoords = [
      [42.5, 22.0], [43.3, 21.4], [49.5, 29.2], [50.4, 28.5],
      [47.0, 21.0], [41.0, 29.8], [52.2, 24.0],
      [118.0, 39.5], [119.2, 40.4], [121.5, 46.2], [120.2, 47.4],
      [113.5, 53.2], [112.0, 53.8], [94.0, 50.5], [95.4, 51.4],
      [91.5, 42.0], [103.5, 54.6], [96.5, 16.5], [99.2, -16.0]
    ];
    this.#lotusCoords = [];
    for (let i = 0; i < this.#lilyCoords.length; i++) {
      if (i % 2 === 0) this.#lotusCoords.push(this.#lilyCoords[i]);
    }

    const lilyGeo = new THREE.CylinderGeometry(0.50, 0.50, 0.03, 14, 1, false, 0.25, Math.PI * 1.82);
    this.#lilyInst = this.#createInstanced(lilyGeo, mats.lilyPad, this.#lilyCoords.length, false, true);

    const outerPetal = new THREE.ConeGeometry(0.14, 0.19, 6);
    const innerCore = new THREE.SphereGeometry(0.08, 8, 6);
    const lotusPieces = [];
    const m = new THREE.Matrix4();
    const rot = new THREE.Matrix4();
    const tr = new THREE.Matrix4();
    for (let p = 0; p < 6; p++) {
      const a = (p / 6) * Math.PI * 2;
      rot.makeRotationY(a);
      m.makeRotationX(Math.PI * 0.62);
      tr.makeTranslation(Math.sin(a) * 0.09, 0.08, Math.cos(a) * 0.09);
      const comb = tr.clone().multiply(rot).multiply(m);
      lotusPieces.push({ geometry: outerPetal, matrix: comb });
    }
    const lotusGeo = mergeGeometries(lotusPieces);
    outerPetal.dispose();

    this.#lotusInst = this.#createInstanced(lotusGeo, mats.lotusPetal, this.#lotusCoords.length, false, false);
    const lotusCoreInst = this.#createInstanced(innerCore, mats.lotusCore, this.#lotusCoords.length, false, false);
    this.#lotusCoreInst = lotusCoreInst;
  }

  #lotusCoreInst = null;

  // ---------------------------------------------------------------------------
  // Puentes Barrocos Arqueados de Mármol y Oro (Arcos Huecos + Balustradas + Faroles HDR)
  // ---------------------------------------------------------------------------

  #buildBaroqueBridgeStructure(mats, spec, foamSpecs) {
    const {
      cx,
      cz,
      minX,
      maxX,
      halfWidthZ,
      baseY = 0.0,
      archHeight = 0.95,
      hasRoyalCarpet = false
    } = spec;

    const span = maxX - minX;
    const halfSpan = span * 0.5;
    const archClearance = archHeight * 0.88;
    const archInnerHalf = halfSpan * 0.74;

    // 1. Arcos parabólicos huecos laterales (ExtrudeGeometry con bevel)
    const spandrelShape = new THREE.Shape();
    spandrelShape.moveTo(-halfSpan, baseY - 0.25);
    const deckSteps = 20;
    for (let i = 0; i <= deckSteps; i++) {
      const t = i / deckSteps;
      const lx = -halfSpan + t * span;
      const ly = evalBridgeArchY(minX + t * span, spec) - 0.02;
      spandrelShape.lineTo(lx, ly);
    }
    spandrelShape.lineTo(halfSpan, baseY - 0.25);
    spandrelShape.lineTo(archInnerHalf, baseY - 0.25);
    const archSteps = 18;
    for (let i = archSteps; i >= 0; i--) {
      const u = i / archSteps;
      const lx = -archInnerHalf + u * (archInnerHalf * 2);
      const norm = lx / archInnerHalf;
      const ly = (baseY - 0.25) + archClearance * (1 - norm * norm);
      spandrelShape.lineTo(lx, ly);
    }
    spandrelShape.closePath();

    const spandrelGeo = new THREE.ExtrudeGeometry(spandrelShape, {
      depth: 0.34,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.035,
      bevelSegments: 2
    });
    spandrelGeo.translate(0, 0, -0.17);
    this.#tempGeos.push(spandrelGeo);

    for (const side of [-1, 1]) {
      this.#addStaticMesh(spandrelGeo, mats.marble, cx, 0, cz + side * (halfWidthZ - 0.14), true, true, 0, 0, 0, 1, 1, 1, true);
    }

    // Clave central esculpida (keystone) + molduras doradas del arco
    const keystoneGeo = new THREE.BoxGeometry(0.46, 0.38, 0.44);
    const archTrimCurvePts = [];
    for (let i = 0; i <= 16; i++) {
      const u = i / 16;
      const lx = -archInnerHalf + u * (archInnerHalf * 2);
      const norm = lx / archInnerHalf;
      const ly = (baseY - 0.22) + archClearance * (1 - norm * norm);
      archTrimCurvePts.push(new THREE.Vector3(lx, ly, 0));
    }
    const archTrimGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(archTrimCurvePts), 20, 0.065, 8, false);
    this.#tempGeos.push(keystoneGeo, archTrimGeo);

    for (const side of [-1, 1]) {
      const sz = cz + side * (halfWidthZ - 0.12);
      this.#addStaticMesh(keystoneGeo, mats.roseGold, cx, (baseY - 0.25) + archClearance + 0.12, sz, true, true, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(archTrimGeo, mats.roseGold, cx, 0, sz + side * 0.14, false, false, 0, 0, 0, 1, 1, 1, true);
    }

    // Pilares de piedra sumergidos en las bases del arco (registrados en uPierPositions[16])
    const pierGeo = new THREE.CylinderGeometry(0.42, 0.56, 1.85, 12);
    const pierCapGeo = new THREE.BoxGeometry(1.12, 0.22, 1.12);
    this.#tempGeos.push(pierGeo, pierCapGeo);

    for (const endSign of [-1, 1]) {
      const px = cx + endSign * (archInnerHalf + 0.35);
      for (const side of [-1, 1]) {
        const pz = cz + side * (halfWidthZ - 0.24);
        this.#addStaticMesh(pierGeo, mats.marble, px, -0.55, pz, true, true, 0, 0, 0, 1, 1, 1, true);
        this.#addStaticMesh(pierCapGeo, mats.roseGold, px, 0.02, pz, true, true, 0, 0, 0, 1, 1, 1, true);

        if (this.#pierCount < PIER_COUNT) {
          this.#pierPositions[this.#pierCount].set(px, pz, 0.65);
          this.#pierCount++;
        }
        foamSpecs.push({ x: px, y: 0.0, z: pz, dx: 0.05, dz: 0.9, scale: 0.95, speed: 0.95 });
      }
    }

    // 2. Calzada arqueada continua con textura procedural de losas de mármol
    const segs = 28;
    const deckWidth = halfWidthZ * 2 + 0.18;
    const deckPos = new Float32Array((segs + 1) * 2 * 3);
    const deckUv = new Float32Array((segs + 1) * 2 * 2);
    const deckIdx = [];

    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const wx = minX + t * span;
      const wy = evalBridgeArchY(wx, spec);
      const vIdx = i * 2;

      deckPos[vIdx * 3] = wx;
      deckPos[vIdx * 3 + 1] = wy;
      deckPos[vIdx * 3 + 2] = cz - deckWidth * 0.5;
      deckUv[vIdx * 2] = t * 4.0;
      deckUv[vIdx * 2 + 1] = 0.0;

      deckPos[(vIdx + 1) * 3] = wx;
      deckPos[(vIdx + 1) * 3 + 1] = wy;
      deckPos[(vIdx + 1) * 3 + 2] = cz + deckWidth * 0.5;
      deckUv[(vIdx + 1) * 2] = t * 4.0;
      deckUv[(vIdx + 1) * 2 + 1] = 1.0;

      if (i < segs) {
        deckIdx.push(vIdx, vIdx + 1, vIdx + 2, vIdx + 1, vIdx + 3, vIdx + 2);
      }
    }
    const deckGeo = new THREE.BufferGeometry();
    deckGeo.setAttribute('position', new THREE.BufferAttribute(deckPos, 3));
    deckGeo.setAttribute('uv', new THREE.BufferAttribute(deckUv, 2));
    deckGeo.setIndex(deckIdx);
    deckGeo.computeVertexNormals();
    this.#addStaticMesh(deckGeo, mats.bridgeDeckMat, 0, 0, 0, true, true, 0, 0, 0, 1, 1, 1, false);

    if (hasRoyalCarpet) {
      const cPos = new Float32Array((segs + 1) * 2 * 3);
      const cUv = new Float32Array((segs + 1) * 2 * 2);
      const cIdx = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const wx = minX + t * span;
        const wy = evalBridgeArchY(wx, spec) + 0.025;
        const vIdx = i * 2;
        cPos[vIdx * 3] = wx;
        cPos[vIdx * 3 + 1] = wy;
        cPos[vIdx * 3 + 2] = cz - 1.58;
        cUv[vIdx * 2] = t * 6.0;
        cUv[vIdx * 2 + 1] = 0.0;
        cPos[(vIdx + 1) * 3] = wx;
        cPos[(vIdx + 1) * 3 + 1] = wy;
        cPos[(vIdx + 1) * 3 + 2] = cz + 1.58;
        cUv[(vIdx + 1) * 2] = t * 6.0;
        cUv[(vIdx + 1) * 2 + 1] = 1.0;
        if (i < segs) cIdx.push(vIdx, vIdx + 1, vIdx + 2, vIdx + 1, vIdx + 3, vIdx + 2);
      }
      const carpetGeo = new THREE.BufferGeometry();
      carpetGeo.setAttribute('position', new THREE.BufferAttribute(cPos, 3));
      carpetGeo.setAttribute('uv', new THREE.BufferAttribute(cUv, 2));
      carpetGeo.setIndex(cIdx);
      carpetGeo.computeVertexNormals();
      this.#addStaticMesh(carpetGeo, mats.carpet, 0, 0, 0, false, true, 0, 0, 0, 1, 1, 1, false);
    }

    // 3. Barandillas torneadas (LatheGeometry instanciados) + pasamanos curvo continuo (TubeGeometry) + 4 faroles HDR
    const balProfile = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.11, 0.0),
      new THREE.Vector2(0.11, 0.10),
      new THREE.Vector2(0.055, 0.18),
      new THREE.Vector2(0.095, 0.34),
      new THREE.Vector2(0.085, 0.50),
      new THREE.Vector2(0.048, 0.66),
      new THREE.Vector2(0.095, 0.78),
      new THREE.Vector2(0.095, 0.86),
      new THREE.Vector2(0.0, 0.86)
    ];
    const balGeo = new THREE.LatheGeometry(balProfile, 10);
    const pedProfile = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.34, 0.0),
      new THREE.Vector2(0.32, 0.20),
      new THREE.Vector2(0.24, 0.34),
      new THREE.Vector2(0.22, 1.05),
      new THREE.Vector2(0.30, 1.22),
      new THREE.Vector2(0.30, 1.32),
      new THREE.Vector2(0.0, 1.32)
    ];
    const pedGeo = new THREE.LatheGeometry(pedProfile, 12);
    const lanternPostGeo = new THREE.CylinderGeometry(0.045, 0.06, 0.42, 8);
    const lanternGlassGeo = new THREE.OctahedronGeometry(0.19, 1);
    const lanternCapGeo = new THREE.ConeGeometry(0.26, 0.24, 6);
    const lanternRingGeo = new THREE.TorusGeometry(0.22, 0.025, 6, 16);
    this.#tempGeos.push(balGeo, pedGeo, lanternPostGeo, lanternGlassGeo, lanternCapGeo, lanternRingGeo);

    const railZOffset = halfWidthZ + 0.04;
    const balCountPerSide = 9;

    for (const side of [-1, 1]) {
      const rz = cz + side * railZOffset;

      // Balustres torneados siguiendo la pendiente parabólica
      for (let b = 0; b < balCountPerSide; b++) {
        const frac = (b + 1) / (balCountPerSide + 1);
        const bx = minX + 0.35 + frac * (span - 0.70);
        const by = evalBridgeArchY(bx, spec);
        this.#addStaticMesh(balGeo, mats.marble, bx, by, rz, true, true, 0, 0, 0, 1, 1, 1, true);
      }

      // Pasamanos continuo curvo de mármol y oro
      const railPts = [];
      for (let r = 0; r <= 18; r++) {
        const t = r / 18;
        const rx = minX + 0.25 + t * (span - 0.50);
        const ry = evalBridgeArchY(rx, spec) + 0.89;
        railPts.push(new THREE.Vector3(rx, ry, rz));
      }
      const railCurve = new THREE.CatmullRomCurve3(railPts);
      const railGeo = new THREE.TubeGeometry(railCurve, 24, 0.085, 8, false);
      const goldTrimPts = railPts.map((p) => new THREE.Vector3(p.x, p.y - 0.08, p.z));
      const goldRailGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(goldTrimPts), 24, 0.042, 6, false);
      this.#addStaticMesh(railGeo, mats.marble, 0, 0, 0, true, true);
      this.#addStaticMesh(goldRailGeo, mats.roseGold, 0, 0, 0, false, true);

      // 2 Pilares de entrada por lado (4 por puente) con Faroles Barrocos HDR (0 PointLights)
      for (const endX of [minX + 0.24, maxX - 0.24]) {
        const py = evalBridgeArchY(endX, spec);
        this.#addStaticMesh(pedGeo, mats.marble, endX, py, rz, true, true, 0, 0, 0, 1, 1, 1, true);
        this.#addStaticMesh(lanternPostGeo, mats.roseGold, endX, py + 1.52, rz, false, false, 0, 0, 0, 1, 1, 1, true);
        this.#addStaticMesh(lanternGlassGeo, mats.lanternGlass, endX, py + 1.84, rz, false, false, 0, Math.PI / 4, 0, 1, 1.25, 1, true);
        this.#addStaticMesh(lanternRingGeo, mats.roseGold, endX, py + 1.84, rz, false, false, Math.PI / 2, 0, 0, 1, 1, 1, true);
        this.#addStaticMesh(lanternCapGeo, mats.roseGold, endX, py + 2.12, rz, false, false, 0, 0, 0, 1, 1, 1, true);
      }

      // Colisionadores laterales limpios SOLO en las barandillas
      this.#collision.addBox(minX, maxX, 0, 2.4, rz - 0.16, rz + 0.16);
    }

    // Registrar superficie parabólica exacta en CollisionSystem y en #bridges
    this.#bridges.push(spec);
    this.#collision.addCustomSurface(
      minX - 0.25,
      maxX + 0.25,
      cz - halfWidthZ,
      cz + halfWidthZ,
      (x) => evalBridgeArchY(x, spec)
    );
  }

  #buildAllBridges(mats, foamSpecs) {
    const bridgeSpecs = [
      // 1. Puente Imperial del Bulevar
      { cx: 97.5, cz: 0.0, minX: 92.2, maxX: 102.8, halfWidthZ: 4.5, baseY: 0.0, archHeight: 1.05, hasRoyalCarpet: true },
      // 2. Puente Norte de los Cerezos
      { cx: 94.0, cz: -38.0, minX: 88.8, maxX: 99.2, halfWidthZ: 2.0, baseY: 0.0, archHeight: 0.92, hasRoyalCarpet: false },
      // 3. Puente Sur de los Cisnes
      { cx: 104.5, cz: 27.0, minX: 99.3, maxX: 109.7, halfWidthZ: 2.0, baseY: 0.0, archHeight: 0.92, hasRoyalCarpet: false },
      // 4. Puente Este (Canal)
      { cx: 33.5, cz: 24.0, minX: 29.5, maxX: 37.5, halfWidthZ: 1.75, baseY: 0.0, archHeight: 0.85, hasRoyalCarpet: false },
      // 5. Puente Sur-Oeste (Arroyo)
      { cx: -21.0, cz: 34.0, minX: -25.0, maxX: -17.0, halfWidthZ: 1.75, baseY: 0.0, archHeight: 0.85, hasRoyalCarpet: false }
    ];

    for (let i = 0; i < bridgeSpecs.length; i++) {
      this.#buildBaroqueBridgeStructure(mats, bridgeSpecs[i], foamSpecs);
    }
  }

  #buildSplashDropPool(mats) {
    const geo = new THREE.SphereGeometry(0.045, 6, 5);
    this.#splashInst = this.#createInstanced(geo, mats.splashMat, SPLASH_DROP_COUNT, false, false);
    this.#splashInst.frustumCulled = false;
    this.#splashInst.matrixAutoUpdate = false;
    this.#splashInst.updateMatrix();

    this.#dummy.scale.setScalar(0.0001);
    this.#dummy.updateMatrix();
    for (let i = 0; i < SPLASH_DROP_COUNT; i++) {
      this.#splashInst.setMatrixAt(i, this.#dummy.matrix);
    }
    this.#splashInst.instanceMatrix.needsUpdate = true;
  }

  #buildFoamInstanced(mats, foamSpecs) {
    this.#foamCount = foamSpecs.length;
    if (this.#foamCount === 0) return;

    const foamGeo = new THREE.CircleGeometry(0.52, 10);
    foamGeo.rotateX(-Math.PI / 2);
    this.#foamInst = this.#createInstanced(foamGeo, mats.foam, this.#foamCount, false, false);
    this.#foamInst.frustumCulled = false;
    this.#foamInst.matrixAutoUpdate = false;
    this.#foamInst.updateMatrix();

    this.#foamData = new Float32Array(this.#foamCount * 8);
    for (let i = 0; i < this.#foamCount; i++) {
      const f = foamSpecs[i];
      const base = i * 8;
      this.#foamData[base] = f.x;
      this.#foamData[base + 1] = f.y;
      this.#foamData[base + 2] = f.z;
      this.#foamData[base + 3] = f.dx;
      this.#foamData[base + 4] = f.dz;
      this.#foamData[base + 5] = pseudoRand(i * 6.3 + 2.1);
      this.#foamData[base + 6] = f.speed;
      this.#foamData[base + 7] = f.scale;
    }
  }

  #buildRippleRingsInstanced(mats, rippleEmitters) {
    const ringsPerEmitter = 3;
    this.#rippleCount = rippleEmitters.length * ringsPerEmitter;
    if (this.#rippleCount === 0) return;

    const ringGeo = new THREE.RingGeometry(0.88, 1.0, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.#rippleInst = this.#createInstanced(ringGeo, mats.ripple, this.#rippleCount, false, false);
    this.#rippleInst.frustumCulled = false;
    this.#rippleInst.matrixAutoUpdate = false;
    this.#rippleInst.updateMatrix();

    this.#rippleData = new Float32Array(this.#rippleCount * 7);
    let idx = 0;
    for (let e = 0; e < rippleEmitters.length; e++) {
      const em = rippleEmitters[e];
      for (let k = 0; k < ringsPerEmitter; k++) {
        const base = idx * 7;
        this.#rippleData[base] = em.x;
        this.#rippleData[base + 1] = em.y;
        this.#rippleData[base + 2] = em.z;
        this.#rippleData[base + 3] = em.minR;
        this.#rippleData[base + 4] = em.maxR;
        this.#rippleData[base + 5] = k / ringsPerEmitter;
        this.#rippleData[base + 6] = em.speed;
        idx++;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // API Pública Determinista y 100% GC-Free de Física del Agua y Puentes
  // ---------------------------------------------------------------------------

  /**
   * Devuelve la altura exacta del tablero parabólico del puente si (x, z) está dentro
   * de la calzada útil de cualquiera de los 5 puentes barrocos, o null fuera de ellos.
   * 100% GC-Free.
   * @param {number} x
   * @param {number} z
   * @returns {number|null}
   */
  getBridgeHeightAt(x, z) {
    for (let i = 0; i < this.#bridges.length; i++) {
      const b = this.#bridges[i];
      if (x >= b.minX - 0.2 && x <= b.maxX + 0.2 && Math.abs(z - b.cz) <= b.halfWidthZ) {
        return evalBridgeArchY(x, b);
      }
    }
    return null;
  }

  /**
   * Consulta determinista y GC-Free de agua en (x, z).
   * Rellena outResult = { inWater, surfaceY, depth, flowX, flowZ, distToBank }.
   */
  sampleWater(x, z, outResult = this.#tmpWaterSample) {
    let inWater = false;
    let depth = 0;
    let flowX = 0;
    let flowZ = 0;
    let distToBank = 99;

    // 1. Río Cristalino Real
    if (z >= -78.2 && z <= 39.4) {
      const rcx = getRiverCenterX(z);
      const dx = Math.abs(x - rcx);
      const halfW = 3.48;
      if (dx < halfW) {
        inWater = true;
        const s = dx / halfW;
        depth = Math.pow(Math.max(0, 1 - s * s), 0.72);
        getRiverTangentXZ(z, this.#tmpTangent);
        flowX = this.#tmpTangent.x;
        flowZ = this.#tmpTangent.z;
        distToBank = halfW - dx;
      }
    }

    // 2. Lago de los Cisnes
    const dxS = (x - 106.0) / 21.0;
    const dzS = (z - 45.0) / 12.5;
    const rSqS = dxS * dxS + dzS * dzS;
    if (rSqS < 1.0) {
      inWater = true;
      const d = Math.pow(Math.max(0, 1 - rSqS), 0.72);
      if (d > depth) {
        depth = d;
        flowX = -dzS * 0.25;
        flowZ = dxS * 0.25;
        distToBank = (1 - Math.sqrt(rSqS)) * 12.5;
      }
    }

    // 3. Estanque Este y Canal
    const dxP = (x - 46.0) / 10.8;
    const dzP = (z - 26.0) / 8.3;
    const rSqP = dxP * dxP + dzP * dzP;
    if (rSqP < 1.0) {
      inWater = true;
      const d = Math.pow(Math.max(0, 1 - rSqP), 0.72);
      if (d > depth) {
        depth = d;
        flowX = 0.08;
        flowZ = 0.12;
        distToBank = (1 - Math.sqrt(rSqP)) * 8.3;
      }
    }
    if (x >= 31.0 && x <= 36.0 && z >= 18.0 && z <= 30.0) {
      inWater = true;
      const ex = Math.min(x - 31.0, 36.0 - x) / 2.5;
      const d = Math.pow(Math.max(0, Math.min(1, ex)), 0.72);
      if (d > depth) {
        depth = d;
        flowX = 0;
        flowZ = 0.45;
        distToBank = Math.min(x - 31.0, 36.0 - x);
      }
    }

    // 4. Arroyo SW
    if (x >= -23.6 && x <= -18.4 && z >= 28.0 && z <= 55.2) {
      inWater = true;
      const ex = Math.min(x + 23.6, -18.4 - x) / 2.6;
      const d = Math.pow(Math.max(0, Math.min(1, ex)), 0.72);
      if (d > depth) {
        depth = d;
        flowX = 0;
        flowZ = 0.55;
        distToBank = Math.min(x + 23.6, -18.4 - x);
      }
    }

    // 5. Gran Lago Imperial Sur
    if (x >= -95.0 && x <= 95.0 && z >= 55.0 && z <= 108.0) {
      inWater = true;
      const ez = Math.min(z - 55.0, 108.0 - z) / 12.0;
      const d = Math.pow(Math.max(0, Math.min(1, ez)), 0.72);
      if (d > depth) {
        depth = d;
        flowX = 0.2;
        flowZ = 0.1;
        distToBank = Math.min(z - 55.0, 108.0 - z);
      }
    }

    const waveY = inWater ? evalPrimaryWaveY(x, z, flowX, flowZ, depth, this.#elapsed) : 0;
    outResult.inWater = inWater;
    outResult.surfaceY = WATER_SURFACE_Y + waveY;
    outResult.depth = depth;
    outResult.flowX = flowX;
    outResult.flowZ = flowZ;
    outResult.distToBank = distToBank;
    return outResult;
  }

  /**
   * Emite una onda concéntrica en uRipples[10] (buffer circular GC-Free) + gotas de salpicadura.
   */
  spawnRipple(x, z, strength = 1.0) {
    const slot = this.#ripples[this.#rippleCursor];
    this.#rippleCursor = (this.#rippleCursor + 1) % RIPPLE_COUNT;
    slot.set(x, z, this.#elapsed, Math.max(0.15, Math.min(1.6, strength)));

    const dropCount = strength > 0.7 ? 10 : 5;
    for (let i = 0; i < dropCount; i++) {
      const idx = this.#splashCursor;
      this.#splashCursor = (this.#splashCursor + 1) % SPLASH_DROP_COUNT;
      const ang = (i / dropCount) * Math.PI * 2 + (this.#elapsed * 3.7);
      const spd = (0.7 + ((i * 19) % 7) * 0.14) * strength;
      this.#splashActive[idx] = 1;
      this.#splashPos[idx * 3] = x + Math.cos(ang) * 0.18;
      this.#splashPos[idx * 3 + 1] = WATER_SURFACE_Y + 0.04;
      this.#splashPos[idx * 3 + 2] = z + Math.sin(ang) * 0.18;
      this.#splashVel[idx * 3] = Math.cos(ang) * spd;
      this.#splashVel[idx * 3 + 1] = (1.75 + ((i * 13) % 5) * 0.32) * Math.min(1.25, strength);
      this.#splashVel[idx * 3 + 2] = Math.sin(ang) * spd;
      this.#splashLife[idx] = 0;
      this.#splashMaxLife[idx] = 0.42 + ((i * 7) % 4) * 0.08;
    }
  }

  /**
   * Calcula elevación vertical e inclinación pitch/roll siguiendo las olas (100% GC-Free).
   * Acepta un Object3D o un objeto plano { y, pitch, roll }.
   */
  applyBuoyancy(target, x, z, time = this.#elapsed, bobScale = 1.0) {
    const sample = this.sampleWater(x, z, this.#tmpWaterSample);
    const fx = sample.inWater ? sample.flowX : 0;
    const fz = sample.inWater ? sample.flowZ : 1;
    const d = sample.inWater ? sample.depth : 0.65;

    const eps = 0.35;
    const hC = evalPrimaryWaveY(x, z, fx, fz, d, time) * bobScale;
    const hX = evalPrimaryWaveY(x + eps, z, fx, fz, d, time) * bobScale;
    const hZ = evalPrimaryWaveY(x, z + eps, fx, fz, d, time) * bobScale;

    const pitch = Math.atan2(hZ - hC, eps) * 0.85;
    const roll = -Math.atan2(hX - hC, eps) * 0.85;
    const y = WATER_SURFACE_Y + hC;

    if (target) {
      if (target.isObject3D) {
        target.position.y = y;
        target.rotation.x = pitch;
        target.rotation.z = roll;
      } else {
        target.y = y;
        target.pitch = pitch;
        target.roll = roll;
      }
    }
    return y;
  }

  /**
   * Física de vadeo, corriente, ripples periódicos y empuje de seguridad en aguas profundas (GC-Free).
   */
  applyPlayerWaterPhysics(pos, isMoving, isMounted, dt, outResult) {
    outResult.inWater = false;
    outResult.speedScale = 1.0;
    outResult.pushX = 0;
    outResult.pushZ = 0;
    outResult.surfaceY = WATER_SURFACE_Y;

    if (this.getBridgeHeightAt(pos.x, pos.z) !== null) return outResult;
    if (pos.y > 0.35) return outResult;

    const sample = this.sampleWater(pos.x, pos.z, this.#tmpWaterSample);
    if (!sample.inWater) return outResult;

    outResult.inWater = true;
    outResult.surfaceY = sample.surfaceY;

    if (sample.depth < 0.45) {
      // Vadeo en aguas poco profundas: frenado físico (~15%) + arrastre suave + ripples cada 0.22s
      outResult.speedScale = 0.85;
      outResult.pushX = sample.flowX * 0.52 * dt;
      outResult.pushZ = sample.flowZ * 0.52 * dt;

      if (isMoving && this.#elapsed - this.#lastPlayerRippleTime >= 0.22) {
        this.#lastPlayerRippleTime = this.#elapsed;
        this.spawnRipple(pos.x, pos.z, isMounted ? 1.15 : 0.78);
      }
    } else {
      // Aguas profundas (>= 0.45): empuje suave hacia aguas vadeables (orilla más cercana)
      outResult.speedScale = 0.62;
      const eps = 0.35;
      const dC = sample.depth;
      const dX = this.sampleWater(pos.x + eps, pos.z, this.#tmpWaterSample).depth;
      const dZ = this.sampleWater(pos.x, pos.z + eps, this.#tmpWaterSample).depth;
      let gx = dC - dX;
      let gz = dC - dZ;
      const glen = Math.hypot(gx, gz);
      if (glen > 1e-4) {
        gx /= glen;
        gz /= glen;
      } else {
        gx = 0;
        gz = -1;
      }
      const force = (5.5 + (sample.depth - 0.45) * 9.0) * dt;
      outResult.pushX = gx * force;
      outResult.pushZ = gz * force;

      if (this.#elapsed - this.#lastPlayerRippleTime >= 0.22) {
        this.#lastPlayerRippleTime = this.#elapsed;
        this.spawnRipple(pos.x, pos.z, isMounted ? 1.25 : 0.92);
      }
    }
    return outResult;
  }

  applyTheme(theme) {
    if (!theme) return;
    const cryEm = theme.crystalEmissive ?? 0.65;
    if (this.#crystalPinkMat) this.#crystalPinkMat.emissiveIntensity = 0.55 + cryEm * 0.55;
    if (this.#crystalTurquoiseMat) this.#crystalTurquoiseMat.emissiveIntensity = 0.55 + cryEm * 0.55;
  }

  update(delta, elapsed) {
    const dt = Math.min(delta, 0.1);
    this.#elapsed = elapsed !== undefined ? elapsed : this.#elapsed + dt;
    const t = this.#elapsed;

    if (this.#waterfallTex) {
      this.#waterfallTex.offset.y = (t * 1.45) % 1;
    }

    if (this.#waterfallSpray && this.#waterfallSprayData) {
      const pos = this.#waterfallSpray.geometry.attributes.position;
      const count = pos.count;
      for (let i = 0; i < count; i++) {
        const base = i * 4;
        const bx = this.#waterfallSprayData[base];
        const bz = this.#waterfallSprayData[base + 1];
        const speed = this.#waterfallSprayData[base + 3];
        const phase = (this.#waterfallSprayData[base + 2] + dt * speed) % 1;
        this.#waterfallSprayData[base + 2] = phase;

        const arcY = 0.08 + Math.sin(phase * Math.PI) * 1.45;
        const driftZ = bz + phase * 1.1;
        pos.setXYZ(i, bx + Math.sin(t * 2.0 + i) * 0.15, arcY, driftZ);
      }
      pos.needsUpdate = true;
    }

    const dummy = this.#dummy;

    // Flotabilidad de nenúfares y lotos (GC-Free)
    if (this.#lilyInst && this.#lilyCoords.length > 0) {
      for (let i = 0; i < this.#lilyCoords.length; i++) {
        const [lx, lz] = this.#lilyCoords[i];
        this.applyBuoyancy(this.#tmpBuoy, lx, lz, t, 1.0);
        dummy.position.set(lx, this.#tmpBuoy.y + 0.012, lz);
        dummy.rotation.set(this.#tmpBuoy.pitch, i * 1.37, this.#tmpBuoy.roll);
        dummy.scale.setScalar(0.88 + (i % 3) * 0.22);
        dummy.updateMatrix();
        this.#lilyInst.setMatrixAt(i, dummy.matrix);
      }
      this.#lilyInst.instanceMatrix.needsUpdate = true;
    }

    if (this.#lotusInst && this.#lotusCoreInst && this.#lotusCoords.length > 0) {
      for (let i = 0; i < this.#lotusCoords.length; i++) {
        const [lx, lz] = this.#lotusCoords[i];
        this.applyBuoyancy(this.#tmpBuoy, lx, lz, t, 1.0);
        dummy.position.set(lx, this.#tmpBuoy.y + 0.03, lz);
        dummy.rotation.set(this.#tmpBuoy.pitch, i * 0.9, this.#tmpBuoy.roll);
        dummy.scale.setScalar(1.0);
        dummy.updateMatrix();
        this.#lotusInst.setMatrixAt(i, dummy.matrix);
        this.#lotusCoreInst.setMatrixAt(i, dummy.matrix);
      }
      this.#lotusInst.instanceMatrix.needsUpdate = true;
      this.#lotusCoreInst.instanceMatrix.needsUpdate = true;
    }

    // Pool de 120 gotas de salpicadura con gravedad real (GC-Free)
    if (this.#splashInst) {
      let dirty = false;
      for (let i = 0; i < SPLASH_DROP_COUNT; i++) {
        if (!this.#splashActive[i]) continue;
        dirty = true;
        this.#splashLife[i] += dt;
        const p = this.#splashLife[i] / this.#splashMaxLife[i];
        if (p >= 1.0) {
          this.#splashActive[i] = 0;
          dummy.position.set(0, -10, 0);
          dummy.scale.setScalar(0.0001);
          dummy.updateMatrix();
          this.#splashInst.setMatrixAt(i, dummy.matrix);
          continue;
        }
        const i3 = i * 3;
        this.#splashVel[i3 + 1] -= 9.8 * dt;
        this.#splashPos[i3] += this.#splashVel[i3] * dt;
        this.#splashPos[i3 + 1] += this.#splashVel[i3 + 1] * dt;
        this.#splashPos[i3 + 2] += this.#splashVel[i3 + 2] * dt;

        const sc = Math.max(0.01, (1.0 - p) * 1.15);
        dummy.position.set(this.#splashPos[i3], this.#splashPos[i3 + 1], this.#splashPos[i3 + 2]);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(sc);
        dummy.updateMatrix();
        this.#splashInst.setMatrixAt(i, dummy.matrix);
      }
      if (dirty) this.#splashInst.instanceMatrix.needsUpdate = true;
    }

    if (this.#foamInst && this.#foamData) {
      dummy.rotation.set(0, 0, 0);
      for (let i = 0; i < this.#foamCount; i++) {
        const base = i * 8;
        const phase = (this.#foamData[base + 5] + dt * this.#foamData[base + 6] * 0.45) % 1;
        this.#foamData[base + 5] = phase;
        const env = Math.sin(phase * Math.PI);
        const s = this.#foamData[base + 7] * (0.35 + env * 0.85);
        const travel = (phase - 0.5) * 0.9;
        dummy.position.set(
          this.#foamData[base] + this.#foamData[base + 3] * travel,
          this.#foamData[base + 1],
          this.#foamData[base + 2] + this.#foamData[base + 4] * travel
        );
        dummy.rotation.y = phase * 1.4 + i * 0.3;
        dummy.scale.set(s * 0.85, 1, s * 1.25);
        dummy.updateMatrix();
        this.#foamInst.setMatrixAt(i, dummy.matrix);
      }
      this.#foamInst.instanceMatrix.needsUpdate = true;
    }

    if (this.#rippleInst && this.#rippleData) {
      dummy.rotation.set(0, 0, 0);
      for (let i = 0; i < this.#rippleCount; i++) {
        const base = i * 7;
        const phase = (this.#rippleData[base + 5] + dt * this.#rippleData[base + 6]) % 1;
        this.#rippleData[base + 5] = phase;
        const minR = this.#rippleData[base + 3];
        const maxR = this.#rippleData[base + 4];
        const fade = Math.sin(phase * Math.PI);
        const r = fade > 0.02 ? minR + (maxR - minR) * phase : 0.0001;
        dummy.position.set(this.#rippleData[base], this.#rippleData[base + 1], this.#rippleData[base + 2]);
        dummy.scale.set(r, 1, r);
        dummy.updateMatrix();
        this.#rippleInst.setMatrixAt(i, dummy.matrix);
      }
      this.#rippleInst.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    if (this.#root) {
      this.#scene.remove(this.#root);
      this.#root = null;
    }
    for (const im of this.#instancedMeshes) {
      if (typeof im.dispose === 'function') im.dispose();
    }
    for (const g of this.#geometries) g.dispose();
    for (const g of this.#tempGeos) g.dispose();
    for (const m of this.#materials) m.dispose();
    for (const tex of this.#ownedTextures) tex.dispose();

    this.#instancedMeshes.length = 0;
    this.#geometries.length = 0;
    this.#tempGeos.length = 0;
    this.#materials.length = 0;
    this.#ownedTextures.length = 0;
    this.#staticBuckets.clear();
    this.#bridges.length = 0;

    this.#waterfallSpray = null;
    this.#waterfallSprayData = null;
    this.#foamInst = null;
    this.#foamData = null;
    this.#rippleInst = null;
    this.#rippleData = null;
    this.#splashInst = null;
    this.#lilyInst = null;
    this.#lotusInst = null;
    this.#lotusCoreInst = null;
    this.#waterMat = null;
    this.#waterfallTex = null;
    this.#waterfallMat = null;
    this.#crystalPinkMat = null;
    this.#crystalTurquoiseMat = null;
  }
}
