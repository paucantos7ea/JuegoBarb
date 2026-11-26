import * as THREE from 'three';
import { GraphicsSync } from './Engine.js';

// Scratchpads preasignados para horneado geométrico sin presión de GC
const _bboxCenter = new THREE.Vector3();
const _bboxSize = new THREE.Vector3();
const _baseColor = new THREE.Color();
const _topColor = new THREE.Color();
const _gradColor = new THREE.Color();
const _shadowTint = new THREE.Color();
const _haloMatrix = new THREE.Matrix4();
const _haloColor = new THREE.Color();

function smoothstepJS(edge0, edge1, x) {
  const denom = edge1 - edge0;
  if (Math.abs(denom) < 1e-8) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / denom));
  return t * t * (3 - 2 * t);
}

function h3(i, j, k) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * PRNG determinista Mulberry32 en [0, 1).
 * @param {number} seed
 * @returns {() => number}
 */
export function createSeededRng(seed = 90210) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Ruido de valor tridimensional determinista en [0, 1).
 */
export function valueNoise3(x, y, z) {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const k = Math.floor(z);
  let u = x - i;
  let v = y - j;
  let w = z - k;
  u = u * u * (3 - 2 * u);
  v = v * v * (3 - 2 * v);
  w = w * w * (3 - 2 * w);

  const a = h3(i, j, k);
  const b = h3(i + 1, j, k);
  const c = h3(i, j + 1, k);
  const d = h3(i + 1, j + 1, k);
  const e = h3(i, j, k + 1);
  const f = h3(i + 1, j, k + 1);
  const g = h3(i, j + 1, k + 1);
  const h = h3(i + 1, j + 1, k + 1);

  const lo = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  const hi = e + (f - e) * u + (g - e) * v + (e - f - g + h) * u * v;
  return lo + (hi - lo) * w;
}

/**
 * FBM 3D determinista traducido de ref_lumen_isles.html.
 */
export function fbm3(x, y, z, octaves = 3) {
  let s = 0;
  let a = 0.5;
  for (let i = 0; i < octaves; i++) {
    s += a * valueNoise3(x, y, z);
    x = x * 2.03 + 5.1;
    y = y * 2.03 + 1.7;
    z = z * 2.03 + 9.2;
    a *= 0.5;
  }
  return s;
}

/**
 * Esculpe una BufferGeometry orgánicamente mediante FBM 3D, ruido ridge, terrazas y anclaje inferior.
 * @param {THREE.BufferGeometry} geometry
 * @param {object} options
 * @returns {THREE.BufferGeometry}
 */
export function sculptOrganicGeometry(geometry, options = {}) {
  if (!geometry || !geometry.attributes?.position) return geometry;

  const {
    seed = 1,
    ampX = 0.12,
    ampY = 0.12,
    ampZ = 0.12,
    frequency = 1.6,
    octaves = 3,
    ridgeStrength = 0.0,
    terraceSteps = 0,
    terraceStrength = 0.0,
    pinBottom = true,
    pinFalloff = 0.22,
    radial = false
  } = options;

  if (!geometry.boundingBox) {
    geometry.computeBoundingBox();
  }
  const bbox = geometry.boundingBox;
  bbox.getCenter(_bboxCenter);
  bbox.getSize(_bboxSize);

  const cx = _bboxCenter.x;
  const cy = _bboxCenter.y;
  const cz = _bboxCenter.z;
  const minY = bbox.min.y;
  const height = Math.max(_bboxSize.y, 1e-5);

  const rng = createSeededRng(seed);
  const ox = rng() * 120.0;
  const oy = rng() * 120.0;
  const oz = rng() * 120.0;

  const maxAmp = Math.max(1e-5, 1.0 - Math.pow(0.5, Math.max(1, octaves)));
  const pos = geometry.attributes.position;
  const count = pos.count;

  for (let i = 0; i < count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const normY = THREE.MathUtils.clamp((y - minY) / height, 0, 1);
    const pin = pinBottom ? smoothstepJS(0, Math.max(pinFalloff, 1e-4), normY) : 1.0;

    const sx = x * frequency + ox;
    const sy = y * frequency + oy;
    const sz = z * frequency + oz;

    if (radial) {
      const dx = x - cx;
      const dy = y - cy;
      const dz = z - cz;
      const len = Math.hypot(dx, dy, dz);
      const ux = len > 1e-6 ? dx / len : 0;
      const uy = len > 1e-6 ? dy / len : 1;
      const uz = len > 1e-6 ? dz / len : 0;

      let disp = (fbm3(sx, sy, sz, octaves) / maxAmp) * 2.0 - 1.0;
      if (ridgeStrength > 0) {
        const ridge = Math.abs(2.0 * valueNoise3(sx * 1.4, sy * 1.4, sz * 1.4) - 1.0) * 2.0 - 1.0;
        disp = THREE.MathUtils.lerp(disp, ridge, Math.min(1, ridgeStrength));
      }
      const d = disp * pin;
      x += ux * ampX * d;
      y += uy * ampY * d;
      z += uz * ampZ * d;
    } else {
      let fx = (fbm3(sx, sy, sz, octaves) / maxAmp) * 2.0 - 1.0;
      let fy = (fbm3(sx + 31.7, sy + 17.3, sz + 43.1, octaves) / maxAmp) * 2.0 - 1.0;
      let fz = (fbm3(sx + 67.3, sy + 53.9, sz + 19.7, octaves) / maxAmp) * 2.0 - 1.0;

      if (ridgeStrength > 0) {
        const rs = Math.min(1, ridgeStrength);
        const rx = Math.abs(2.0 * valueNoise3(sx * 1.4, sy * 1.4, sz * 1.4) - 1.0) * 2.0 - 1.0;
        const ry = Math.abs(2.0 * valueNoise3(sx * 1.4 + 21.3, sy * 1.4 + 9.7, sz * 1.4 + 13.1) - 1.0) * 2.0 - 1.0;
        const rz = Math.abs(2.0 * valueNoise3(sx * 1.4 + 47.1, sy * 1.4 + 37.9, sz * 1.4 + 5.3) - 1.0) * 2.0 - 1.0;
        fx = THREE.MathUtils.lerp(fx, rx, rs);
        fy = THREE.MathUtils.lerp(fy, ry, rs);
        fz = THREE.MathUtils.lerp(fz, rz, rs);
      }

      x += fx * ampX * pin;
      y += fy * ampY * pin;
      z += fz * ampZ * pin;
    }

    if (terraceSteps > 0 && terraceStrength > 0) {
      const tNormY = THREE.MathUtils.clamp((y - minY) / height, 0, 1);
      const stepCoord = tNormY * terraceSteps;
      const stepIdx = Math.floor(stepCoord);
      const stepFrac = stepCoord - stepIdx;
      const smoothFrac = smoothstepJS(0.22, 0.78, stepFrac);
      const terracedY = minY + ((stepIdx + smoothFrac) / terraceSteps) * height;
      y = THREE.MathUtils.lerp(y, terracedY, Math.min(1, terraceStrength) * pin);
    }

    pos.setXYZ(i, x, y, z);
  }

  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Hornea oclusión ambiental procedural y gradiente cromático lineal en el atributo 'color'.
 * @param {THREE.BufferGeometry} geometry
 * @param {object} options
 * @returns {THREE.BufferGeometry}
 */
export function bakeProceduralVertexAO(geometry, options = {}) {
  if (!geometry || !geometry.attributes?.position) return geometry;

  const {
    baseColor = 0xffffff,
    topColor = 0xffffff,
    aoStrength = 0.36,
    minAO = 0.42,
    shadowTint = 0x261b48,
    shadowTintStrength = 0.45,
    ridgeHighlight = 0.08,
    noiseStrength = 0.06,
    noiseScale = 1.8,
    baseWeight = 0.52,
    cavityWeight = 0.30,
    undersideWeight = 0.28,
    multiplyExisting = false
  } = options;

  if (!geometry.attributes.normal) {
    geometry.computeVertexNormals();
  }
  if (!geometry.boundingBox) {
    geometry.computeBoundingBox();
  }

  const bbox = geometry.boundingBox;
  bbox.getCenter(_bboxCenter);
  bbox.getSize(_bboxSize);

  const cx = _bboxCenter.x;
  const cy = _bboxCenter.y;
  const cz = _bboxCenter.z;
  const minY = bbox.min.y;
  const height = Math.max(_bboxSize.y, 1e-5);
  const halfR = Math.max(Math.hypot(_bboxSize.x, _bboxSize.y, _bboxSize.z) * 0.5, 1e-5);

  _baseColor.set(baseColor);
  _topColor.set(topColor);
  _shadowTint.set(shadowTint);

  const pos = geometry.attributes.position;
  const norm = geometry.attributes.normal;
  const existingCol = multiplyExisting ? geometry.attributes.color : null;
  const count = pos.count;
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    let ny = norm ? norm.getY(i) : 1.0;
    if (norm) {
      const nx = norm.getX(i);
      const nz = norm.getZ(i);
      const nLen = Math.hypot(nx, ny, nz);
      if (nLen > 1e-6) ny /= nLen;
    }

    const normY = THREE.MathUtils.clamp((y - minY) / height, 0, 1);
    const upFactor = THREE.MathUtils.clamp(ny * 0.5 + 0.5, 0, 1);
    const radialExposure = THREE.MathUtils.clamp(Math.hypot(x - cx, y - cy, z - cz) / halfR, 0, 1);

    const baseOcc = 1.0 - smoothstepJS(0.0, 0.45, normY);
    const cavityOcc = 1.0 - radialExposure;
    const undersideOcc = 1.0 - upFactor;
    const combinedOcc = THREE.MathUtils.clamp(
      baseOcc * baseWeight + cavityOcc * cavityWeight + undersideOcc * undersideWeight,
      0,
      1
    );

    const ao = Math.max(minAO, 1.0 - combinedOcc * aoStrength);
    const microNoise = (valueNoise3(x * noiseScale, y * noiseScale, z * noiseScale) - 0.5) * 2.0 * noiseStrength;
    const crestFactor =
      smoothstepJS(0.45, 0.98, radialExposure * 0.55 + normY * 0.45) * (0.4 + 0.6 * upFactor);
    const highlight = crestFactor * ridgeHighlight;

    _gradColor.copy(_baseColor).lerp(_topColor, normY);
    const mult = Math.max(0.05, ao + microNoise + highlight);

    let r = _gradColor.r * mult;
    let g = _gradColor.g * mult;
    let b = _gradColor.b * mult;

    if (shadowTintStrength > 0) {
      const tintMix = THREE.MathUtils.clamp((1.0 - ao) * shadowTintStrength, 0, 1);
      r = r * (1.0 - tintMix) + _shadowTint.r * ao * tintMix;
      g = g * (1.0 - tintMix) + _shadowTint.g * ao * tintMix;
      b = b * (1.0 - tintMix) + _shadowTint.b * ao * tintMix;
    }

    if (existingCol) {
      r *= existingCol.getX(i);
      g *= existingCol.getY(i);
      b *= existingCol.getZ(i);
    }

    const idx = i * 3;
    colors[idx] = Math.max(0, r);
    colors[idx + 1] = Math.max(0, g);
    colors[idx + 2] = Math.max(0, b);
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

/**
 * Recorre un subárbol 3D y hornea vertex AO donde el material requiera vertexColors sin atributo 'color'.
 * @param {THREE.Object3D} root
 * @param {object} options
 */
export function ensureVertexColors(root, options = {}) {
  if (!root || typeof root.traverse !== 'function') return;

  root.traverse((obj) => {
    if ((!obj.isMesh && !obj.isInstancedMesh) || !obj.geometry || obj.geometry.attributes?.color) {
      return;
    }
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    for (let i = 0; i < mats.length; i++) {
      if (mats[i]?.vertexColors === true) {
        bakeProceduralVertexAO(obj.geometry, options);
        break;
      }
    }
  });
}

/**
 * Crea un MeshStandardMaterial mejorado con rim lunar, lift de sombras nocturnas,
 * niebla de altura, subsuperficie foliar y ventanas cálidas sincronizados con GraphicsSync.
 * @param {object} baseParams
 * @param {object} lumenOptions
 * @returns {THREE.MeshStandardMaterial}
 */
export function createLumenMaterial(baseParams = {}, lumenOptions = {}) {
  const { preserveRoughness: basePreserveRoughness, ...stdParams } = baseParams;
  const mat = new THREE.MeshStandardMaterial(stdParams);

  const rimStrength = lumenOptions.rimStrength ?? 0.26;
  const rimPower = lumenOptions.rimPower ?? 3.2;
  const rimTintCol = new THREE.Color(lumenOptions.rimTint ?? 0xb8d4ff);

  const shadowLiftCol = new THREE.Color(lumenOptions.shadowLiftColor ?? 0x221644);
  const shadowLiftStrength = lumenOptions.shadowLiftStrength ?? 0.14;

  const heightFog = lumenOptions.heightFog ?? true;
  const heightFogStrength = lumenOptions.heightFogStrength ?? 0.22;
  const heightFogHeight = lumenOptions.heightFogHeight ?? 8.0;
  const heightFogFalloff = lumenOptions.heightFogFalloff ?? 0.30;
  const heightFogStartDist = lumenOptions.heightFogStartDist ?? 28.0;
  const heightFogEndDist = lumenOptions.heightFogEndDist ?? 165.0;

  const subsurfaceStrength = lumenOptions.subsurfaceStrength ?? 0.0;
  const subsurfaceCol = new THREE.Color(lumenOptions.subsurfaceTint ?? 0xc8a4ff);

  const warmWindow = lumenOptions.warmWindow ?? false;
  const windowGlowStrength = lumenOptions.windowGlowStrength ?? 0.95;
  const windowCoreCol = new THREE.Color(lumenOptions.windowCoreColor ?? 0xffcb78);
  const windowEdgeCol = new THREE.Color(lumenOptions.windowEdgeColor ?? 0xf078b4);

  const preserveRoughness = Boolean(basePreserveRoughness || lumenOptions.preserveRoughness);
  const cacheTag = lumenOptions.cacheTag ?? '';

  if (preserveRoughness) {
    mat.userData.preserveRoughness = true;
  }

  const cacheKey = [
    'lumen',
    cacheTag,
    rimStrength.toFixed(3),
    rimPower.toFixed(2),
    rimTintCol.getHexString(),
    shadowLiftCol.getHexString(),
    shadowLiftStrength.toFixed(3),
    heightFog ? 1 : 0,
    heightFogStrength.toFixed(3),
    heightFogHeight.toFixed(2),
    heightFogFalloff.toFixed(3),
    heightFogStartDist.toFixed(1),
    heightFogEndDist.toFixed(1),
    subsurfaceStrength.toFixed(3),
    subsurfaceCol.getHexString(),
    warmWindow ? 1 : 0,
    windowGlowStrength.toFixed(3),
    windowCoreCol.getHexString(),
    windowEdgeCol.getHexString()
  ].join('|');

  mat.customProgramCacheKey = () => cacheKey;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = GraphicsSync.uTime;
    shader.uniforms.uMoonDir = GraphicsSync.uMoonDir;
    shader.uniforms.uMoonColor = GraphicsSync.uMoonColor;
    shader.uniforms.uFogColor = GraphicsSync.uFogColor;
    shader.uniforms.uSkyHorizon = GraphicsSync.uSkyHorizon;
    shader.uniforms.uNightFactor = GraphicsSync.uNightFactor;

    shader.uniforms.uLumenRimStrength = { value: rimStrength };
    shader.uniforms.uLumenRimPower = { value: rimPower };
    shader.uniforms.uLumenRimTint = { value: rimTintCol };
    shader.uniforms.uLumenShadowLift = { value: shadowLiftCol };
    shader.uniforms.uLumenShadowLiftStrength = { value: shadowLiftStrength };
    shader.uniforms.uLumenHeightFogEnabled = { value: heightFog ? 1.0 : 0.0 };
    shader.uniforms.uLumenHeightFogStrength = { value: heightFogStrength };
    shader.uniforms.uLumenHeightFogHeight = { value: heightFogHeight };
    shader.uniforms.uLumenHeightFogFalloff = { value: heightFogFalloff };
    shader.uniforms.uLumenHeightFogStartDist = { value: heightFogStartDist };
    shader.uniforms.uLumenHeightFogEndDist = { value: heightFogEndDist };
    shader.uniforms.uLumenSubsurfaceStrength = { value: subsurfaceStrength };
    shader.uniforms.uLumenSubsurfaceTint = { value: subsurfaceCol };
    shader.uniforms.uLumenWarmWindow = { value: warmWindow ? 1.0 : 0.0 };
    shader.uniforms.uLumenWindowGlowStrength = { value: windowGlowStrength };
    shader.uniforms.uLumenWindowCoreColor = { value: windowCoreCol };
    shader.uniforms.uLumenWindowEdgeColor = { value: windowEdgeCol };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vLumenWorldPos;
        varying vec3 vLumenWorldNormal;
        varying vec2 vLumenUv;
        `
      )
      .replace(
        '#include <project_vertex>',
        /* glsl */ `
        #include <project_vertex>
        vec4 lumenWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          lumenWp = instanceMatrix * lumenWp;
        #endif
        lumenWp = modelMatrix * lumenWp;
        vLumenWorldPos = lumenWp.xyz;

        vec3 lumenLocalN = objectNormal;
        #ifdef USE_INSTANCING
          lumenLocalN = mat3(instanceMatrix) * lumenLocalN;
        #endif
        vLumenWorldNormal = normalize(mat3(modelMatrix) * lumenLocalN);

        #ifdef USE_UV
          vLumenUv = uv;
        #else
          vLumenUv = vec2(0.5);
        #endif
        `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform float uTime;
        uniform vec3 uMoonDir;
        uniform vec3 uMoonColor;
        uniform vec3 uFogColor;
        uniform vec3 uSkyHorizon;
        uniform float uNightFactor;

        uniform float uLumenRimStrength;
        uniform float uLumenRimPower;
        uniform vec3 uLumenRimTint;
        uniform vec3 uLumenShadowLift;
        uniform float uLumenShadowLiftStrength;
        uniform float uLumenHeightFogEnabled;
        uniform float uLumenHeightFogStrength;
        uniform float uLumenHeightFogHeight;
        uniform float uLumenHeightFogFalloff;
        uniform float uLumenHeightFogStartDist;
        uniform float uLumenHeightFogEndDist;
        uniform float uLumenSubsurfaceStrength;
        uniform vec3 uLumenSubsurfaceTint;
        uniform float uLumenWarmWindow;
        uniform float uLumenWindowGlowStrength;
        uniform vec3 uLumenWindowCoreColor;
        uniform vec3 uLumenWindowEdgeColor;

        varying vec3 vLumenWorldPos;
        varying vec3 vLumenWorldNormal;
        varying vec2 vLumenUv;
        `
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        vec3 lumenV = normalize(cameraPosition - vLumenWorldPos);
        vec3 lumenN = normalize(vLumenWorldNormal);
        if (!gl_FrontFacing) lumenN = -lumenN;
        vec3 lumenMoonDir = normalize(uMoonDir);

        // Lift de sombras en noche hacia índigo profundo
        float lumenLum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
        float lumenDarkMask = 1.0 - smoothstep(0.02, 0.42, lumenLum);
        vec3 lumenLiftTarget = uLumenShadowLift * diffuseColor.rgb;
        outgoingLight = mix(
          outgoingLight,
          max(outgoingLight, lumenLiftTarget * 1.35),
          uLumenShadowLiftStrength * uNightFactor * lumenDarkMask
        );

        // Rim light lunar
        if (uLumenRimStrength > 0.001) {
          float lumenFresnel = pow(1.0 - max(dot(lumenN, lumenV), 0.0), uLumenRimPower);
          float lumenMoonFace = 0.35 + 0.65 * max(dot(lumenN, lumenMoonDir), 0.0);
          outgoingLight += lumenFresnel * lumenMoonFace * uLumenRimStrength * (0.25 + 0.75 * uNightFactor) * uLumenRimTint;
        }

        // Subsuperficie foliar opcional
        if (uLumenSubsurfaceStrength > 0.001) {
          float lumenBackLit = max(dot(-lumenN, lumenMoonDir), 0.0);
          float lumenViewAlign = pow(max(dot(lumenV, -lumenMoonDir), 0.0) * 0.6 + 0.4, 2.0);
          outgoingLight += lumenBackLit * lumenViewAlign * uLumenSubsurfaceStrength * uLumenSubsurfaceTint * diffuseColor.rgb;
        }

        // Ventana cálida interior opcional (HDR 1.25 - 1.55)
        if (uLumenWarmWindow > 0.5) {
          vec2 wUv = fract(vLumenUv) - 0.5;
          float wDist = length(wUv * vec2(1.15, 0.95));
          float wCore = 1.0 - smoothstep(0.08, 0.52, wDist);
          vec3 wCol = mix(uLumenWindowEdgeColor * 1.1, uLumenWindowCoreColor * 1.42, smoothstep(0.15, 0.85, wCore));
          outgoingLight += wCol * wCore * uLumenWindowGlowStrength * (0.20 + 0.80 * uNightFactor);
        }

        // Niebla de altura nocturna opcional
        if (uLumenHeightFogEnabled > 0.5) {
          float lumenCamDist = length(cameraPosition - vLumenWorldPos);
          float lumenDistFade = smoothstep(uLumenHeightFogStartDist, uLumenHeightFogEndDist, lumenCamDist);
          float lumenHeightFade = exp(-max(vLumenWorldPos.y, 0.0) * uLumenHeightFogFalloff)
            * smoothstep(uLumenHeightFogHeight * 2.2, 0.0, max(vLumenWorldPos.y, 0.0));
          float lumenHfMix = clamp(lumenDistFade * lumenHeightFade * uLumenHeightFogStrength, 0.0, 0.85);
          vec3 lumenHfCol = mix(uFogColor, uSkyHorizon, 0.32 * uNightFactor);
          outgoingLight = mix(outgoingLight, lumenHfCol, lumenHfMix);
        }

        #include <opaque_fragment>
        `
      );
  };

  return mat;
}

/**
 * Crea un halo volumétrico billboard en espacio de vista sin luces dinámicas.
 * @param {object} options
 * @returns {THREE.Mesh}
 */
export function createVolumetricHalo(options = {}) {
  const {
    color = 0xffd28e,
    size = 1.8,
    opacity = 0.55,
    nightBoost = 1.0,
    pulseSpeed = 1.6,
    pulseAmp = 0.08,
    fadeNear = 4.0,
    fadeFar = 140.0
  } = options;

  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: GraphicsSync.uTime,
      uNightFactor: GraphicsSync.uNightFactor,
      uColor: { value: new THREE.Color(color) },
      uSize: { value: size },
      uOpacity: { value: opacity },
      uNightBoost: { value: nightBoost },
      uPulseSpeed: { value: pulseSpeed },
      uPulseAmp: { value: pulseAmp },
      uFadeNear: { value: fadeNear },
      uFadeFar: { value: fadeFar }
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uNightFactor;
      uniform float uSize;
      uniform float uNightBoost;
      uniform float uPulseSpeed;
      uniform float uPulseAmp;

      varying vec2 vUv;
      varying float vCamDist;

      void main() {
        vUv = uv;
        float pulse = 1.0 + uPulseAmp * sin(uTime * uPulseSpeed);
        float scale = uSize * pulse * (1.0 + 0.15 * uNightBoost * uNightFactor);
        vec4 worldCenter = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec4 mvCenter = viewMatrix * worldCenter;
        vCamDist = -mvCenter.z;
        mvCenter.xy += position.xy * scale;
        gl_Position = projectionMatrix * mvCenter;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uNightFactor;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uNightBoost;
      uniform float uFadeNear;
      uniform float uFadeFar;

      varying vec2 vUv;
      varying float vCamDist;

      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        if (r >= 1.0) discard;

        float edge = 1.0 - smoothstep(0.65, 1.0, r);
        float core = exp(-r * r * 7.5);
        float aura = exp(-r * 2.8) * 0.42;
        float glow = (core + aura) * edge;

        float distFade = smoothstep(uFadeNear * 0.4, uFadeNear, vCamDist)
          * (1.0 - smoothstep(uFadeFar * 0.7, uFadeFar, vCamDist));
        float nightScale = mix(0.35, 1.0 + 0.35 * uNightBoost, uNightFactor);

        float alpha = clamp(glow * uOpacity * distFade * nightScale, 0.0, 1.0);
        if (alpha <= 0.002) discard;

        vec3 col = uColor * glow * uOpacity * distFade * nightScale;
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  mat.userData.isVfx = true;

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

/**
 * Crea un único InstancedMesh de halos volumétricos (1 draw call, GPU billboard).
 * @param {Array<{x:number,y:number,z:number,size?:number,color?:number,phase?:number,opacity?:number}>} specs
 * @param {object} options
 * @returns {THREE.InstancedMesh}
 */
export function createInstancedVolumetricHalos(specs = [], options = {}) {
  const {
    color = 0xffd28e,
    size = 1.8,
    opacity = 0.55,
    nightBoost = 1.0,
    pulseSpeed = 1.6,
    pulseAmp = 0.08,
    fadeNear = 4.0,
    fadeFar = 140.0
  } = options;

  const count = specs.length;
  const allocCount = Math.max(1, count);

  const geo = new THREE.PlaneGeometry(1, 1);
  const haloData = new Float32Array(allocCount * 3);
  for (let i = 0; i < count; i++) {
    const s = specs[i];
    haloData[i * 3] = s.size ?? size;
    haloData[i * 3 + 1] = s.phase ?? (i * 1.6180339) % (Math.PI * 2);
    haloData[i * 3 + 2] = s.opacity ?? opacity;
  }
  geo.setAttribute('aHaloData', new THREE.InstancedBufferAttribute(haloData, 3));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: GraphicsSync.uTime,
      uNightFactor: GraphicsSync.uNightFactor,
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 1.0 },
      uNightBoost: { value: nightBoost },
      uPulseSpeed: { value: pulseSpeed },
      uPulseAmp: { value: pulseAmp },
      uFadeNear: { value: fadeNear },
      uFadeFar: { value: fadeFar }
    },
    vertexShader: /* glsl */ `
      attribute vec3 aHaloData;

      uniform float uTime;
      uniform float uNightFactor;
      uniform vec3 uColor;
      uniform float uNightBoost;
      uniform float uPulseSpeed;
      uniform float uPulseAmp;

      varying vec2 vUv;
      varying vec3 vColor;
      varying float vOpacity;
      varying float vCamDist;

      void main() {
        vUv = uv;
        vOpacity = aHaloData.z;
        #ifdef USE_INSTANCING_COLOR
          vColor = instanceColor;
        #else
          vColor = uColor;
        #endif

        #ifdef USE_INSTANCING
          vec4 worldCenter = modelMatrix * vec4(instanceMatrix[3].xyz, 1.0);
        #else
          vec4 worldCenter = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #endif

        vec4 mvCenter = viewMatrix * worldCenter;
        vCamDist = -mvCenter.z;

        float pulse = 1.0 + uPulseAmp * sin(uTime * uPulseSpeed + aHaloData.y);
        float scale = aHaloData.x * pulse * (1.0 + 0.15 * uNightBoost * uNightFactor);
        mvCenter.xy += position.xy * scale;
        gl_Position = projectionMatrix * mvCenter;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uNightFactor;
      uniform float uOpacity;
      uniform float uNightBoost;
      uniform float uFadeNear;
      uniform float uFadeFar;

      varying vec2 vUv;
      varying vec3 vColor;
      varying float vOpacity;
      varying float vCamDist;

      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        if (r >= 1.0) discard;

        float edge = 1.0 - smoothstep(0.65, 1.0, r);
        float core = exp(-r * r * 7.5);
        float aura = exp(-r * 2.8) * 0.42;
        float glow = (core + aura) * edge;

        float distFade = smoothstep(uFadeNear * 0.4, uFadeNear, vCamDist)
          * (1.0 - smoothstep(uFadeFar * 0.7, uFadeFar, vCamDist));
        float nightScale = mix(0.35, 1.0 + 0.35 * uNightBoost, uNightFactor);

        float alpha = clamp(glow * vOpacity * uOpacity * distFade * nightScale, 0.0, 1.0);
        if (alpha <= 0.002) discard;

        vec3 col = vColor * glow * vOpacity * uOpacity * distFade * nightScale;
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  mat.userData.isVfx = true;

  const mesh = new THREE.InstancedMesh(geo, mat, allocCount);
  mesh.count = count;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;

  if (count === 0) {
    _haloMatrix.identity();
    mesh.setMatrixAt(0, _haloMatrix);
    _haloColor.set(color);
    mesh.setColorAt(0, _haloColor);
  } else {
    for (let i = 0; i < count; i++) {
      const s = specs[i];
      _haloMatrix.makeTranslation(s.x ?? 0, s.y ?? 0, s.z ?? 0);
      mesh.setMatrixAt(i, _haloMatrix);
      _haloColor.set(s.color ?? color);
      mesh.setColorAt(i, _haloColor);
    }
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.updateMatrix();
  return mesh;
}
