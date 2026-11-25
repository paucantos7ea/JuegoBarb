import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { WorldThemes } from '../world/WorldThemes.js';
import { StarrySkySystem } from '../world/StarrySkySystem.js';

const QUALITY_STORAGE_KEY = 'reino_rosa_quality_v1';

/**
 * Contrato reactivo compartido entre Engine, Cielo y Agua (100% GC-Free por frame).
 */
export const GraphicsSync = {
  uTime: { value: 0 },
  uMoonDir: { value: new THREE.Vector3(0.1827, 0.4772, -0.8596).normalize() },
  uMoonColor: { value: new THREE.Color(0xfff1d6) },
  uSkyZenith: { value: new THREE.Color(0x050414) },
  uSkyMid: { value: new THREE.Color(0x2a1452) },
  uSkyHorizon: { value: new THREE.Color(0x8e4276) },
  uFogColor: { value: new THREE.Color(0x1f133e) },
  uFogDensity: { value: 0.0022 },
  uNightFactor: { value: 1.0 },
  uWindDir: { value: new THREE.Vector2(0.82, 0.57).normalize() },
  uWindStrength: { value: 0.65 },
  uGrassActors: {
    value: [
      new THREE.Vector4(0, -100, 0, 0),
      new THREE.Vector4(0, -100, 0, 0),
      new THREE.Vector4(0, -100, 0, 0),
      new THREE.Vector4(0, -100, 0, 0)
    ]
  }
};

const IS_LOW_CORE_DEVICE =
  typeof navigator !== 'undefined' &&
  typeof navigator.hardwareConcurrency === 'number' &&
  navigator.hardwareConcurrency <= 4;

const DEFAULT_SHADOW_MAP_SIZE = IS_LOW_CORE_DEVICE ? 1024 : 2048;

const QUALITY_PROFILES = {
  low: {
    id: 'low',
    label: 'Bajo',
    maxPixelRatio: 1.0,
    shadows: false,
    shadowMapSize: 1024,
    shadowType: THREE.PCFSoftShadowMap,
    bloom: false,
    bloomScale: 0.5,
    autoDisableBloomBelowFps: 0,
    far: 900,
    fogBoost: 1.0,
    moteDrawCount: 80
  },
  medium: {
    id: 'medium',
    label: 'Medio',
    maxPixelRatio: 2.0,
    shadows: true,
    shadowMapSize: DEFAULT_SHADOW_MAP_SIZE,
    shadowType: THREE.PCFSoftShadowMap,
    bloom: true,
    bloomScale: 0.65,
    autoDisableBloomBelowFps: 30,
    far: 900,
    fogBoost: 1.0,
    moteDrawCount: 160
  },
  high: {
    id: 'high',
    label: 'Alto',
    maxPixelRatio: 2.0,
    shadows: true,
    shadowMapSize: DEFAULT_SHADOW_MAP_SIZE,
    shadowType: THREE.PCFSoftShadowMap,
    bloom: true,
    bloomScale: 0.75,
    autoDisableBloomBelowFps: 0,
    far: 900,
    fogBoost: 1.0,
    moteDrawCount: 240
  }
};

const ENV_THEME_PRESETS = {
  night: {
    zenith: 0x0a0826,
    equator: 0x4e266b,
    nadir: 0x12182b,
    keyColor: 0xfff4dc,
    keyIntensity: 3.4,
    fillColor: 0xd96ba8,
    fillIntensity: 1.65,
    rimColor: 0x56b8e6,
    rimIntensity: 1.45,
    bounceColor: 0xffb86c,
    bounceIntensity: 1.55,
    floorColor: 0x2b3256,
    floorIntensity: 0.85
  },
  sunset: {
    zenith: 0x4b2f73,
    equator: 0xe87aa8,
    nadir: 0x382038,
    keyColor: 0xffc694,
    keyIntensity: 3.2,
    fillColor: 0xff8bc4,
    fillIntensity: 1.55,
    rimColor: 0x90a8ff,
    rimIntensity: 1.25,
    bounceColor: 0xffb86c,
    bounceIntensity: 1.65,
    floorColor: 0x462d48,
    floorIntensity: 0.85
  },
  day: {
    zenith: 0x68a8f0,
    equator: 0xffd6ea,
    nadir: 0x84947e,
    keyColor: 0xfff6e5,
    keyIntensity: 3.6,
    fillColor: 0xffc4de,
    fillIntensity: 1.35,
    rimColor: 0x9ad8ff,
    rimIntensity: 1.25,
    bounceColor: 0xffdfab,
    bounceIntensity: 1.35,
    floorColor: 0x6c7d6b,
    floorIntensity: 0.9
  }
};

let _sharedContactShadowTex = null;

export function getSharedContactShadowTexture() {
  if (_sharedContactShadowTex) return _sharedContactShadowTex;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size * 0.5;
  const img = ctx.createImageData(size, size);
  const data = img.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - half) / half;
      const dy = (y + 0.5 - half) / half;
      const rSq = dx * dx + dy * dy;
      if (rSq >= 1.0) continue;
      const edgeFade = 1.0 - rSq;
      const gaussian = Math.exp(-rSq * 3.8) * edgeFade * edgeFade;
      const idx = (y * size + x) * 4;
      data[idx] = 8;
      data[idx + 1] = 5;
      data[idx + 2] = 24;
      data[idx + 3] = Math.round(Math.min(1, gaussian) * 235);
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  _sharedContactShadowTex = tex;
  return tex;
}

/**
 * Crea una sombra de contacto suave compartiendo una única CanvasTexture Gaussiana.
 * @param {number} radius
 * @param {number} opacity
 * @returns {THREE.Mesh}
 */
export function createContactShadow(radius = 1.0, opacity = 0.45) {
  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: getSharedContactShadowTexture(),
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  mat.userData = { isVfx: true };

  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData = {
    isVfx: true,
    baseOpacity: opacity,
    baseRadius: radius
  };
  return mesh;
}

/**
 * Hornea un PMREM procedural nocturno/mágico o diurno sin dependencias externas ni fugas de VRAM.
 * @param {THREE.WebGLRenderer} renderer
 * @param {'night'|'sunset'|'day'} themeKey
 * @param {THREE.PMREMGenerator|null} pmremGenerator
 * @returns {THREE.WebGLRenderTarget}
 */
export function buildProceduralEnvironment(renderer, themeKey = 'night', pmremGenerator = null) {
  const ownsGen = !pmremGenerator;
  const generator = pmremGenerator || new THREE.PMREMGenerator(renderer);
  const preset = ENV_THEME_PRESETS[themeKey] || ENV_THEME_PRESETS.night;

  const envScene = new THREE.Scene();
  const tempGeos = [];
  const tempMats = [];

  const domeGeo = new THREE.SphereGeometry(50, 24, 16);
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uZenith: { value: new THREE.Color(preset.zenith) },
      uEquator: { value: new THREE.Color(preset.equator) },
      uNadir: { value: new THREE.Color(preset.nadir) }
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uEquator;
      uniform vec3 uNadir;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 col = h >= 0.0
          ? mix(uEquator, uZenith, smoothstep(0.0, 0.72, h))
          : mix(uEquator, uNadir, smoothstep(0.0, 0.55, -h));
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  tempGeos.push(domeGeo);
  tempMats.push(domeMat);
  envScene.add(new THREE.Mesh(domeGeo, domeMat));

  const addPanel = (w, h, hex, intensity, x, y, z) => {
    const geo = new THREE.PlaneGeometry(w, h);
    const col = new THREE.Color(hex).multiplyScalar(intensity);
    const mat = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide });
    tempGeos.push(geo);
    tempMats.push(mat);
    const panel = new THREE.Mesh(geo, mat);
    panel.position.set(x, y, z);
    panel.lookAt(0, 0, 0);
    envScene.add(panel);
  };

  // 1. Foco principal lunar/solar en dirección de GraphicsSync.uMoonDir
  const mDir = GraphicsSync.uMoonDir.value;
  addPanel(14, 14, preset.keyColor, preset.keyIntensity, mDir.x * 36, mDir.y * 36, mDir.z * 36);
  // 2. Relleno lateral rosa imperial suave
  addPanel(18, 12, preset.fillColor, preset.fillIntensity, -30, 12, 18);
  // 3. Contra cian-mágica suave
  addPanel(16, 12, preset.rimColor, preset.rimIntensity, 26, 14, 24);
  // 4. Rebote cálido dorado del palacio/casino
  addPanel(18, 10, preset.bounceColor, preset.bounceIntensity, 24, 6, -24);
  // 5. Reflejo suave inferior para que metales y mármol no caigan a negro puro
  addPanel(32, 32, preset.floorColor, preset.floorIntensity, 0, -28, 0);

  const envRT = generator.fromScene(envScene, 0.04);

  for (let i = 0; i < tempGeos.length; i++) tempGeos[i].dispose();
  for (let i = 0; i < tempMats.length; i++) tempMats[i].dispose();
  if (ownsGen) generator.dispose();

  return envRT;
}

/**
 * Motor 3D principal: WebGLRenderer HDR/MSAA, PMREM procedural, sombras texel-snapped y postprocesado.
 */
export class Engine {
  #container;
  #renderer = null;
  #scene = null;
  #camera = null;
  #composer = null;
  #composerRT = null;
  #bloomPass = null;
  #pmremGenerator = null;
  #envRT = null;
  #currentEnvKey = 'night';
  #hemiLight = null;
  #sunLight = null;
  #starrySky = null;
  #motes = null;
  #moteVelocities = null;
  #moteDrawCount = 240;
  #elapsed = 0;
  #onResizeBound = null;
  #onQualityEventBound = null;
  #envIntensity = 0.85;
  #marbleRoughness = 0.42;
  #currentTheme = null;
  #quality = 'high';
  #calibrationVersion = 1;
  #sceneCheckTimer = 0;
  #lastSceneChildCount = 0;
  #bloomAutoDisabled = false;
  #warmupElapsed = 0;
  #lowFpsElapsed = 0;
  #fps = 60;
  #frameMs = 16.7;
  #frameCount = 0;
  #lastStatsSampleMs = 0;
  #lastRenderNowMs = 0;
  #statsListener = null;
  #statsPayload = { fps: 60, frameMs: 16.7, drawCalls: 0, quality: 'high', bloomActive: true };

  // Scratchpads preasignados para texel-snapping de sombras (100% GC-Free)
  #themeSunDir = new THREE.Vector3(0.1827, 0.4772, -0.8596).normalize();
  #shadowLightDir = new THREE.Vector3();
  #shadowRight = new THREE.Vector3();
  #shadowUp = new THREE.Vector3();
  #shadowSnapped = new THREE.Vector3();
  #worldUp = new THREE.Vector3(0, 1, 0);

  constructor(container) {
    this.#container = container;
  }

  #readSavedQuality() {
    try {
      const saved = localStorage.getItem(QUALITY_STORAGE_KEY);
      if (saved && Object.hasOwn(QUALITY_PROFILES, saved)) return saved;
    } catch {
      // Sin acceso a localStorage
    }
    return 'high';
  }

  #saveQuality(quality) {
    try {
      localStorage.setItem(QUALITY_STORAGE_KEY, quality);
    } catch {
      // Sin acceso a localStorage
    }
  }

  init() {
    const width = this.#container.clientWidth || window.innerWidth;
    const height = this.#container.clientHeight || window.innerHeight;
    this.#quality = this.#readSavedQuality();
    const profile = QUALITY_PROFILES[this.#quality];
    this.#moteDrawCount = profile.moteDrawCount;

    this.#renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false
    });
    const pixelRatio = Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio);
    this.#renderer.setPixelRatio(pixelRatio);
    this.#renderer.setSize(width, height);
    this.#renderer.shadowMap.enabled = profile.shadows;
    this.#renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.#renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.#renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = 1.10;
    this.#container.appendChild(this.#renderer.domElement);
    this.#container.__engine = this;

    this.#scene = new THREE.Scene();
    this.#scene.fog = new THREE.FogExp2(0x1f133e, 0.0022);

    this.#camera = new THREE.PerspectiveCamera(58, width / height, 0.25, 900);
    this.#camera.position.set(0, 1.8, 22.8);

    // Entorno PBR procedural nocturno/mágico
    this.#pmremGenerator = new THREE.PMREMGenerator(this.#renderer);
    this.#pmremGenerator.compileEquirectangularShader?.();
    this.#rebuildEnvironment('night');

    this.#setupLights(profile);
    this.#setupSkyAndParticles(profile);
    this.#setupPostProcessing(width, height, profile, pixelRatio);

    this.#onResizeBound = () => this.#handleResize();
    this.#onQualityEventBound = (e) => {
      const q = e?.detail?.quality;
      if (q) this.setQuality(q);
    };
    window.addEventListener('resize', this.#onResizeBound);
    window.addEventListener('reino:set-quality', this.#onQualityEventBound);
  }

  #rebuildEnvironment(themeKey) {
    if (!this.#pmremGenerator || !this.#scene) return;
    const nextEnv = buildProceduralEnvironment(this.#renderer, themeKey, this.#pmremGenerator);
    const prevEnv = this.#envRT;
    this.#envRT = nextEnv;
    this.#currentEnvKey = themeKey;
    this.#scene.environment = this.#envRT.texture;
    if ('environmentIntensity' in this.#scene) {
      this.#scene.environmentIntensity = this.#envIntensity;
    }
    if (prevEnv && prevEnv !== nextEnv) {
      prevEnv.dispose();
    }
  }

  #setupLights(profile) {
    this.#hemiLight = new THREE.HemisphereLight(0x8a72c8, 0x1e2438, 0.65);
    this.#scene.add(this.#hemiLight);

    this.#sunLight = new THREE.DirectionalLight(0xdce6ff, 1.18);
    this.#sunLight.position.copy(GraphicsSync.uMoonDir.value).multiplyScalar(95);
    this.#sunLight.castShadow = profile.shadows;
    this.#sunLight.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
    this.#sunLight.shadow.camera.near = 10;
    this.#sunLight.shadow.camera.far = 220;
    const d = 55;
    this.#sunLight.shadow.camera.left = -d;
    this.#sunLight.shadow.camera.right = d;
    this.#sunLight.shadow.camera.top = d;
    this.#sunLight.shadow.camera.bottom = -d;
    this.#sunLight.shadow.bias = -0.0004;
    this.#sunLight.shadow.normalBias = 0.035;
    this.#sunLight.target.position.set(0, 0, 0);
    this.#scene.add(this.#sunLight.target);
    this.#scene.add(this.#sunLight);
  }

  #setupSkyAndParticles(profile) {
    this.#starrySky = new StarrySkySystem(this.#scene, {
      quality: this.#quality,
      pixelRatio: this.#renderer.getPixelRatio()
    });
    this.#starrySky.init();

    // Motas mágicas ambientales flotantes
    const moteCount = 240;
    const motePos = new Float32Array(moteCount * 3);
    this.#moteVelocities = new Float32Array(moteCount * 3);
    for (let i = 0; i < moteCount; i++) {
      motePos[i * 3] = Math.random() * 305 - 85;
      motePos[i * 3 + 1] = 1 + Math.random() * 20;
      motePos[i * 3 + 2] = (Math.random() - 0.5) * 160 - 8;
      this.#moteVelocities[i * 3] = (Math.random() - 0.5) * 0.45;
      this.#moteVelocities[i * 3 + 1] = 0.15 + Math.random() * 0.35;
      this.#moteVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.45;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
    moteGeo.setDrawRange(0, profile.moteDrawCount);
    const moteMat = new THREE.PointsMaterial({
      color: 0xffe8a3,
      size: 0.34,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.#motes = new THREE.Points(moteGeo, moteMat);
    this.#scene.add(this.#motes);
  }

  #setupPostProcessing(width, height, profile, pixelRatio) {
    const isWebGL2 = this.#renderer.capabilities.isWebGL2;
    const supportsHalfFloat =
      isWebGL2 || Boolean(this.#renderer.extensions?.get?.('EXT_color_buffer_half_float'));
    const rtType = supportsHalfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const maxSamples = isWebGL2 ? Math.min(4, this.#renderer.capabilities.maxSamples || 4) : 0;
    const samples = this.#quality !== 'low' ? maxSamples : 0;

    this.#composerRT = new THREE.WebGLRenderTarget(
      Math.max(1, Math.floor(width * pixelRatio)),
      Math.max(1, Math.floor(height * pixelRatio)),
      {
        type: rtType,
        samples,
        depthBuffer: true,
        stencilBuffer: false
      }
    );

    this.#composer = new EffectComposer(this.#renderer, this.#composerRT);
    this.#composer.setPixelRatio(pixelRatio);
    this.#composer.setSize(width, height);

    this.#composer.addPass(new RenderPass(this.#scene, this.#camera));

    const bloomW = Math.max(1, Math.floor(width * profile.bloomScale));
    const bloomH = Math.max(1, Math.floor(height * profile.bloomScale));
    this.#bloomPass = new UnrealBloomPass(
      new THREE.Vector2(bloomW, bloomH),
      0.46,
      0.62,
      0.82
    );
    this.#bloomPass.threshold = 0.82;
    this.#bloomPass.strength = 0.46;
    this.#bloomPass.radius = 0.62;
    this.#composer.addPass(this.#bloomPass);
    this.#composer.addPass(new OutputPass());
  }

  #updateBloomSize(width, height) {
    if (!this.#bloomPass) return;
    const profile = QUALITY_PROFILES[this.#quality];
    const bloomW = Math.max(1, Math.floor(width * profile.bloomScale));
    const bloomH = Math.max(1, Math.floor(height * profile.bloomScale));
    this.#bloomPass.setSize(bloomW, bloomH);
  }

  #isBloomActive() {
    const profile = QUALITY_PROFILES[this.#quality];
    return Boolean(profile.bloom && !this.#bloomAutoDisabled);
  }

  /**
   * Mueve la DirectionalLight y su target siguiendo focusPos con Texel-Snapping
   * para eliminar cualquier vibración/shimmering en los bordes de las sombras.
   * 100% GC-Free.
   * @param {THREE.Vector3} focusPos
   */
  updateShadowTarget(focusPos) {
    if (!this.#sunLight || !focusPos) return;

    if (GraphicsSync.uNightFactor.value >= 0.45) {
      this.#shadowLightDir.copy(GraphicsSync.uMoonDir.value);
    } else {
      this.#shadowLightDir.copy(this.#themeSunDir);
    }

    this.#shadowRight.crossVectors(this.#worldUp, this.#shadowLightDir);
    if (this.#shadowRight.lengthSq() < 1e-6) {
      this.#shadowRight.set(1, 0, 0);
    } else {
      this.#shadowRight.normalize();
    }
    this.#shadowUp.crossVectors(this.#shadowLightDir, this.#shadowRight).normalize();

    const shadowCam = this.#sunLight.shadow.camera;
    const frustumW = shadowCam.right - shadowCam.left;
    const mapW = Math.max(1, this.#sunLight.shadow.mapSize.x);
    const texelSize = frustumW / mapW;

    const snappedX = Math.floor(focusPos.dot(this.#shadowRight) / texelSize) * texelSize;
    const snappedY = Math.floor(focusPos.dot(this.#shadowUp) / texelSize) * texelSize;
    const projZ = focusPos.dot(this.#shadowLightDir);

    this.#shadowSnapped
      .set(0, 0, 0)
      .addScaledVector(this.#shadowRight, snappedX)
      .addScaledVector(this.#shadowUp, snappedY)
      .addScaledVector(this.#shadowLightDir, projZ);

    this.#sunLight.target.position.copy(this.#shadowSnapped);
    this.#sunLight.target.updateMatrixWorld();
    this.#sunLight.position.copy(this.#shadowSnapped).addScaledVector(this.#shadowLightDir, 95);
  }

  /**
   * Cambia el perfil de calidad gráfica ('low' | 'medium' | 'high') sin recrear el canvas.
   */
  setQuality(quality) {
    if (!Object.hasOwn(QUALITY_PROFILES, quality)) return;
    const prevQuality = this.#quality;
    this.#quality = quality;
    this.#saveQuality(quality);
    this.#bloomAutoDisabled = false;
    this.#lowFpsElapsed = 0;
    this.#warmupElapsed = 0;

    if (!this.#renderer || !this.#camera || !this.#scene) return;
    const profile = QUALITY_PROFILES[quality];
    const width = this.#container.clientWidth || window.innerWidth;
    const height = this.#container.clientHeight || window.innerHeight;

    const pixelRatio = Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio);
    this.#renderer.setPixelRatio(pixelRatio);
    this.#renderer.setSize(width, height);
    this.#composer?.setPixelRatio(pixelRatio);
    this.#composer?.setSize(width, height);
    this.#updateBloomSize(width, height);

    if (this.#camera.far !== profile.far) {
      this.#camera.far = profile.far;
      this.#camera.updateProjectionMatrix();
    }

    this.#starrySky?.setQuality(quality, pixelRatio);
    this.#starrySky?.syncToCamera(this.#camera);

    if (this.#scene.fog) {
      const baseDensity = this.#currentTheme?.fogDensity ?? GraphicsSync.uFogDensity.value;
      const density = baseDensity * profile.fogBoost;
      this.#scene.fog.density = density;
      GraphicsSync.uFogDensity.value = density;
    }

    this.#moteDrawCount = profile.moteDrawCount;
    this.#motes?.geometry?.setDrawRange(0, profile.moteDrawCount);

    const prevShadowsEnabled = this.#renderer.shadowMap.enabled;
    const prevMapSize = this.#sunLight ? this.#sunLight.shadow.mapSize.x : profile.shadowMapSize;
    const shadowToggleChanged = prevShadowsEnabled !== profile.shadows;
    const mapSizeChanged = prevMapSize !== profile.shadowMapSize;

    if (shadowToggleChanged || mapSizeChanged) {
      if (this.#sunLight?.shadow?.map) {
        this.#sunLight.shadow.map.dispose();
        this.#sunLight.shadow.map = null;
      }
      this.#renderer.shadowMap.enabled = profile.shadows;
      this.#renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      if (this.#sunLight) {
        this.#sunLight.castShadow = profile.shadows;
        this.#sunLight.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
        this.#sunLight.shadow.needsUpdate = true;
      }
      if (shadowToggleChanged) {
        this.#scene.traverse((obj) => {
          const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
          for (const mat of mats) {
            mat.needsUpdate = true;
          }
        });
      }
    }

    if (prevQuality !== quality) {
      this.#calibrationVersion += 1;
      this.#calibrateSceneMaterials();
    }

    this.#emitStats(this.#renderer.info.render.calls);
  }

  getQuality() {
    return this.#quality;
  }

  getFps() {
    return this.#fps;
  }

  setStatsListener(fn) {
    this.#statsListener = typeof fn === 'function' ? fn : null;
    if (this.#statsListener && this.#renderer) {
      this.#emitStats(this.#renderer.info.render.calls);
    }
  }

  #emitStats(drawCalls) {
    this.#statsPayload.fps = this.#fps;
    this.#statsPayload.frameMs = this.#frameMs;
    this.#statsPayload.drawCalls = drawCalls;
    this.#statsPayload.quality = this.#quality;
    this.#statsPayload.bloomActive = this.#isBloomActive();
    this.#statsListener?.(this.#statsPayload);
  }

  /**
   * Aplica un tema visual sincronizando GraphicsSync, PMREM, luces, exposición, bloom y niebla.
   */
  applyTheme(theme) {
    if (!theme) return;
    this.#currentTheme = theme;
    const profile = QUALITY_PROFILES[this.#quality];

    WorldThemes.syncGraphics(theme, this.#sunLight);
    if (Array.isArray(theme.sunPosition) && theme.sunPosition.length === 3) {
      this.#themeSunDir.set(theme.sunPosition[0], theme.sunPosition[1], theme.sunPosition[2]).normalize();
    } else {
      this.#themeSunDir.copy(GraphicsSync.uMoonDir.value);
    }

    const envKey = theme.envThemeKey || (theme.isNight ? 'night' : (theme.nightMix > 0.2 ? 'sunset' : 'day'));
    if (envKey !== this.#currentEnvKey) {
      this.#rebuildEnvironment(envKey);
    }

    this.#starrySky?.applyTheme(theme);

    const fogDensity = (theme.fogDensity ?? 0.0022) * profile.fogBoost;
    this.#scene.fog.color.setHex(theme.fogColor ?? 0x1f133e);
    this.#scene.fog.density = fogDensity;
    GraphicsSync.uFogDensity.value = fogDensity;

    this.#hemiLight.color.setHex(theme.hemiSky ?? 0x8a72c8);
    this.#hemiLight.groundColor.setHex(theme.hemiGround ?? 0x1e2438);
    this.#hemiLight.intensity = (theme.hemiIntensity ?? 0.65) + (theme.fillIntensity ?? 0.0) * 0.25;

    this.#sunLight.color.setHex(theme.sunColor ?? 0xdce6ff);
    this.#sunLight.intensity = theme.sunIntensity ?? 1.18;

    this.#renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = THREE.MathUtils.clamp(theme.exposure ?? 1.10, 0.85, 1.30);

    this.#envIntensity = THREE.MathUtils.clamp(theme.envIntensity ?? 0.85, 0.35, 1.0);
    if ('environmentIntensity' in this.#scene) {
      this.#scene.environmentIntensity = this.#envIntensity;
    }
    this.#marbleRoughness = Math.max(0.38, theme.marbleRoughness ?? 0.42);

    this.#calibrationVersion += 1;
    this.#lastSceneChildCount = this.#scene.children.length;
    this.#calibrateSceneMaterials();

    this.#bloomPass.threshold = THREE.MathUtils.clamp(theme.bloomThreshold ?? 0.82, 0.72, 0.96);
    this.#bloomPass.strength = THREE.MathUtils.clamp(theme.bloomStrength ?? 0.46, 0.15, 0.68);
    this.#bloomPass.radius = THREE.MathUtils.clamp(theme.bloomRadius ?? 0.62, 0.25, 0.80);

    this.#motes.material.color.setHex(theme.moteColor ?? 0xffe8a3);
    this.#motes.material.size = theme.moteSize ?? 0.34;
  }

  #isInsideCharacter(obj) {
    let cur = obj;
    while (cur) {
      if (cur.userData?.isCharacter === true) return true;
      cur = cur.parent;
    }
    return false;
  }

  #calibrateSceneMaterials() {
    if (!this.#scene) return;
    const labelDefaults = WorldThemes.getLabelDefaults();
    const minRoughness = Math.max(0.38, this.#marbleRoughness);
    const envValue = this.#envIntensity;
    const version = this.#calibrationVersion;

    this.#scene.traverse((obj) => {
      if (obj.userData?.__shadowCalibratedVersion !== version) {
        if (obj.userData) obj.userData.__shadowCalibratedVersion = version;
        if (obj.isPoints || obj.isSprite) {
          obj.castShadow = false;
        } else if (obj.isMesh && obj.castShadow && !this.#isInsideCharacter(obj)) {
          if (obj.geometry && !obj.geometry.boundingSphere) {
            obj.geometry.computeBoundingSphere();
          }
          const radius = obj.geometry?.boundingSphere?.radius ?? 1;
          if (
            radius < 0.45 ||
            (obj.isInstancedMesh && (obj.userData?.isCoin || obj.userData?.isFlower || obj.userData?.isParticle))
          ) {
            obj.castShadow = false;
          }
        }
      }

      const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
      for (const mat of mats) {
        if (!mat || mat.userData?.__calibratedVersion === version) continue;
        if (mat.userData) mat.userData.__calibratedVersion = version;

        if ('envMapIntensity' in mat) {
          const target = mat.isMeshPhysicalMaterial ? Math.min(1.0, envValue * 1.1) : envValue;
          if (mat.envMapIntensity !== target) mat.envMapIntensity = target;
        }

        if (mat.userData?.isVfx) {
          if (obj.isInstancedMesh) obj.castShadow = false;
          continue;
        }
        if (obj.isSprite || mat.isSpriteMaterial) {
          if (mat.toneMapped !== labelDefaults.toneMapped) {
            mat.toneMapped = labelDefaults.toneMapped;
            mat.needsUpdate = true;
          }
          if (mat.color) {
            const maxCh = labelDefaults.maxChannel;
            mat.color.r = Math.min(mat.color.r, maxCh);
            mat.color.g = Math.min(mat.color.g, maxCh);
            mat.color.b = Math.min(mat.color.b, maxCh);
          }
          continue;
        }
        if (mat.isMeshPhysicalMaterial) {
          mat.envMapIntensity = Math.min(1.0, envValue * 1.1);
        } else if (
          mat.isMeshStandardMaterial &&
          !mat.userData?.preserveRoughness &&
          mat.metalness < 0.35 &&
          (!mat.emissiveIntensity || mat.emissiveIntensity < 0.2)
        ) {
          mat.roughness = Math.max(mat.roughness, minRoughness);
        }
      }
    });
  }

  update(dt) {
    this.#elapsed += dt;
    GraphicsSync.uTime.value = this.#elapsed;

    this.#sceneCheckTimer += dt;
    if (this.#sceneCheckTimer >= 2.5) {
      this.#sceneCheckTimer = 0;
      const count = this.#scene ? this.#scene.children.length : 0;
      if (count !== this.#lastSceneChildCount) {
        this.#lastSceneChildCount = count;
        this.#calibrateSceneMaterials();
      }
    }
    if (this.#motes) {
      const pos = this.#motes.geometry.attributes.position;
      const activeCount = Math.min(this.#moteDrawCount, pos.count);
      for (let i = 0; i < activeCount; i++) {
        let x = pos.getX(i) + Math.sin(this.#elapsed * 0.7 + i) * 0.008 + this.#moteVelocities[i * 3] * dt;
        let y = pos.getY(i) + this.#moteVelocities[i * 3 + 1] * dt;
        let z = pos.getZ(i) + this.#moteVelocities[i * 3 + 2] * dt;
        if (y > 22) y = 0.8;
        if (x > 220) x = -85;
        if (x < -85) x = 220;
        if (z > 72) z = -88;
        if (z < -88) z = 72;
        pos.setXYZ(i, x, y, z);
      }
      pos.needsUpdate = true;
    }
    this.#starrySky?.update(dt);
  }

  render() {
    if (this.#camera) {
      this.#starrySky?.syncToCamera(this.#camera);
    }

    const bloomActive = this.#isBloomActive();
    if (bloomActive) {
      this.#composer.render();
    } else {
      this.#renderer.render(this.#scene, this.#camera);
    }

    const now = performance.now();
    const frameDeltaSec = this.#lastRenderNowMs > 0 ? (now - this.#lastRenderNowMs) / 1000 : 0;
    this.#lastRenderNowMs = now;

    if (document.hidden || frameDeltaSec > 0.5) {
      this.#lastStatsSampleMs = now;
      this.#frameCount = 0;
      this.#lowFpsElapsed = 0;
      return;
    }

    if (this.#lastStatsSampleMs === 0) {
      this.#lastStatsSampleMs = now;
    }
    this.#frameCount += 1;
    const elapsedMs = now - this.#lastStatsSampleMs;
    if (elapsedMs >= 400) {
      const intervalSec = elapsedMs / 1000;
      this.#fps = Math.round(this.#frameCount / intervalSec);
      this.#frameMs = elapsedMs / this.#frameCount;
      this.#frameCount = 0;
      this.#lastStatsSampleMs = now;

      const threshold = QUALITY_PROFILES[this.#quality].autoDisableBloomBelowFps;
      if (threshold > 0 && !this.#bloomAutoDisabled) {
        this.#warmupElapsed += intervalSec;
        if (this.#warmupElapsed >= 3.5) {
          if (this.#fps < threshold) {
            this.#lowFpsElapsed += intervalSec;
            if (this.#lowFpsElapsed >= 2.2) {
              this.#bloomAutoDisabled = true;
            }
          } else {
            this.#lowFpsElapsed = 0;
          }
        }
      }

      this.#emitStats(this.#renderer.info.render.calls);
    }
  }

  getScene() {
    return this.#scene;
  }

  getCamera() {
    return this.#camera;
  }

  getRenderer() {
    return this.#renderer;
  }

  getDomElement() {
    return this.#renderer?.domElement ?? null;
  }

  getElapsed() {
    return this.#elapsed;
  }

  #handleResize() {
    const width = this.#container.clientWidth || window.innerWidth;
    const height = this.#container.clientHeight || window.innerHeight;
    const profile = QUALITY_PROFILES[this.#quality];
    const pixelRatio = Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio);
    this.#renderer.setPixelRatio(pixelRatio);
    this.#starrySky?.setPixelRatio(pixelRatio);
    this.#camera.aspect = width / height;
    this.#camera.updateProjectionMatrix();
    this.#renderer.setSize(width, height);
    this.#composer.setPixelRatio(pixelRatio);
    this.#composer.setSize(width, height);
    this.#updateBloomSize(width, height);
  }

  dispose() {
    if (this.#onResizeBound) {
      window.removeEventListener('resize', this.#onResizeBound);
    }
    if (this.#onQualityEventBound) {
      window.removeEventListener('reino:set-quality', this.#onQualityEventBound);
    }
    if (this.#container?.__engine === this) {
      delete this.#container.__engine;
    }
    this.#statsListener = null;
    this.#starrySky?.dispose();
    this.#starrySky = null;
    this.#motes?.geometry.dispose();
    this.#motes?.material.dispose();
    this.#envRT?.dispose();
    this.#envRT = null;
    this.#composerRT?.dispose();
    this.#composerRT = null;
    this.#pmremGenerator?.dispose();
    this.#composer?.dispose();
    this.#renderer?.dispose();
    if (this.#renderer?.domElement?.parentNode) {
      this.#renderer.domElement.parentNode.removeChild(this.#renderer.domElement);
    }
  }
}
