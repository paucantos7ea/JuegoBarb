import * as THREE from 'three';
import { GraphicsSync } from '../core/Engine.js';

const SKY_RADIUS = 480;
const STAR_RADIUS = 455;
const CONSTELLATION_RADIUS = 450;
const SHOOTING_RADIUS = 430;
const MOON_DIST = 410;
const STAR_COUNT = 3200;
const SHOOTING_POOL_SIZE = 4;
const RIBBON_SEGMENTS = 16;

const STAR_PALETTE = [
  [1.0, 1.0, 1.0],         // Blanco diamante (#ffffff)
  [0.659, 0.831, 1.0],     // Azul zafiro (#a8d4ff)
  [1.0, 0.902, 0.690],     // Oro champán (#ffe6b0)
  [1.0, 0.761, 0.886]      // Rosa estrella (#ffc2e2)
];

const QUALITY_STAR_COUNTS = {
  low: 1800,
  medium: 2600,
  high: STAR_COUNT
};

// Semilla determinista Mulberry32 para que todos los jugadores compartan el mismo cielo
function createSeededRandom(seed = 0x524f5341) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstepJS(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Bóveda celeste nocturna cinematográfica:
 * - SkyDome GLSL de 4 paradas + scattering Mie lunar + Vía Láctea FBM 4 octavas + nubes cirrus + IGN dithering.
 * - Luna Creciente SDF monumental (410 u, plano 155x155) con mares lunares, luz cenicienta y corona multicapa.
 * - Campo estelar GPU (3.200 estrellas con picos en cruz para estrellas héroe) + 3 constelaciones reales.
 * - Pool GC-Free de 4 estrellas fugaces.
 */
export class StarrySkySystem {
  #scene;
  #quality = 'high';
  #pixelRatio = 1;
  #root = null;
  #celestialSpinner = null;
  #skyDome = null;
  #moonGroup = null;
  #moonDiscMesh = null;
  #moonCoronaMesh = null;
  #starsPoints = null;
  #constellationStars = null;
  #constellationLines = null;
  #shootingRibbonGeo = null;
  #shootingPool = [];

  #elapsed = 0;
  #starsOpacity = 1.0;
  #moonOpacity = 1.0;
  #nightMix = 1.0;
  #shootingCooldown = 3.8;

  // Scratchpads preasignados (100% GC-Free)
  #tmpMoonPos = new THREE.Vector3();
  #tmpOrigin = new THREE.Vector3(0, 0, 0);

  constructor(scene, { quality = 'high', pixelRatio = 1 } = {}) {
    this.#scene = scene;
    this.#quality = quality;
    this.#pixelRatio = pixelRatio;
  }

  init() {
    this.#root = new THREE.Group();
    this.#root.name = 'StarrySkySystem';
    this.#root.frustumCulled = false;

    this.#celestialSpinner = new THREE.Group();
    this.#celestialSpinner.frustumCulled = false;

    this.#buildSkyDome();
    this.#buildCrescentMoon();
    this.#buildStarfield();
    this.#buildConstellations();
    this.#buildShootingStarPool();

    this.#root.add(this.#celestialSpinner);
    this.#scene.add(this.#root);

    this.setQuality(this.#quality, this.#pixelRatio);
    this.#updateMoonPlacement();
    this.#syncVisibility();
  }

  #buildSkyDome() {
    const geo = new THREE.SphereGeometry(SKY_RADIUS, 48, 32);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
      uniforms: {
        uTime: GraphicsSync.uTime,
        uMoonDir: GraphicsSync.uMoonDir,
        uMoonColor: GraphicsSync.uMoonColor,
        uSkyZenith: GraphicsSync.uSkyZenith,
        uSkyMid: GraphicsSync.uSkyMid,
        uSkyHorizon: GraphicsSync.uSkyHorizon,
        uNightFactor: GraphicsSync.uNightFactor,
        uSkyMidHigh: { value: new THREE.Color(0x171042) },
        uMoonOpacity: { value: 1.0 },
        uSpinYaw: { value: 0.0 }
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldDir;
        void main() {
          vWorldDir = normalize(position);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uMoonDir;
        uniform vec3 uMoonColor;
        uniform vec3 uSkyZenith;
        uniform vec3 uSkyMid;
        uniform vec3 uSkyHorizon;
        uniform vec3 uSkyMidHigh;
        uniform float uNightFactor;
        uniform float uMoonOpacity;
        uniform float uSpinYaw;

        varying vec3 vWorldDir;

        float hash31(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }

        float noise3(vec3 x) {
          vec3 i = floor(x);
          vec3 f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(
              mix(hash31(i + vec3(0.0, 0.0, 0.0)), hash31(i + vec3(1.0, 0.0, 0.0)), f.x),
              mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x),
              f.y
            ),
            mix(
              mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x),
              mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x),
              f.y
            ),
            f.z
          );
        }

        // FBM 3D de 4 octavas con índice constante
        float fbm4(vec3 p) {
          float sum = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 4; i++) {
            sum += amp * noise3(p);
            p = p * 2.03 + vec3(11.3, 5.7, -8.1);
            amp *= 0.5;
          }
          return sum;
        }

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        float noise2(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        float fbm2(vec2 p) {
          float sum = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 4; i++) {
            sum += amp * noise2(p);
            p = p * 2.05 + vec2(7.3, -4.1);
            amp *= 0.5;
          }
          return sum;
        }

        // Interleaved Gradient Noise para anti-banding de 8 bits
        float ign(vec2 xy) {
          return fract(52.9829189 * fract(dot(xy, vec2(0.06711056, 0.00583715))));
        }

        void main() {
          vec3 dir = normalize(vWorldDir);
          float h = clamp(dir.y, 0.0, 1.0);

          // 1. Degradado Atmosférico Imperial de 4 Paradas
          vec3 horizonWarm = uSkyHorizon + vec3(0.055, 0.028, 0.014) * exp(-h * 22.0) * uNightFactor;
          vec3 col = mix(horizonWarm, uSkyMid, smoothstep(0.0, 0.18, h));
          col = mix(col, uSkyMidHigh, smoothstep(0.18, 0.48, h));
          col = mix(col, uSkyZenith, smoothstep(0.48, 0.92, h));

          // Oscurecimiento suave bajo la línea de horizonte
          float below = clamp(-dir.y, 0.0, 1.0);
          col = mix(col, uSkyZenith * 0.45, smoothstep(0.0, 0.25, below));

          // 2. Scattering Atmosférico (Mie) alrededor de la Luna
          float moonDot = max(dot(dir, normalize(uMoonDir)), 0.0);
          vec3 moonGlowColor = mix(vec3(0.55, 0.34, 0.72), uMoonColor, 0.48);
          float moonScatter = (pow(moonDot, 8.0) * 0.28 * length(moonGlowColor) * 0.58)
            + pow(moonDot, 64.0) * 0.45;
          col += (pow(moonDot, 8.0) * 0.28 * moonGlowColor + pow(moonDot, 64.0) * 0.45 * vec3(1.0, 0.95, 0.85))
            * max(uMoonOpacity, uNightFactor * 0.65);

          // 3. Vía Láctea y Nebulosa Pastel Procedural (GLSL FBM 4 octavas)
          if (uNightFactor > 0.005) {
            float cy = cos(uSpinYaw);
            float sy = sin(uSpinYaw);
            vec3 skyDir = vec3(dir.x * cy - dir.z * sy, dir.y, dir.x * sy + dir.z * cy);

            // Inclinación galáctica ~38° cruzando en diagonal tras Luna y Palacio
            mat3 galTilt = mat3(
              0.788, -0.456, 0.413,
              0.616,  0.583, -0.529,
              0.000,  0.672, 0.741
            );
            vec3 gDir = normalize(galTilt * skyDir);

            float band = exp(-abs(gDir.y) * 5.2) * smoothstep(0.02, 0.25, h);
            float nMain = fbm4(gDir * 3.5);
            float dustRift = smoothstep(0.35, 0.65, fbm4(gDir * 7.5 + vec3(4.2)));
            float fineDetail = fbm4(gDir * 6.2 - vec3(nMain * 0.9));

            vec3 nebPink = vec3(0.878, 0.416, 0.698);     // #e06ab2 magenta-rosa pastel
            vec3 nebCyan = vec3(0.408, 0.690, 1.000);     // #68b0ff cian etéreo
            vec3 nebLav  = vec3(0.557, 0.420, 1.000);     // #8e6bff lavanda

            vec3 nebCol = mix(nebLav, nebPink, smoothstep(0.28, 0.70, nMain));
            nebCol = mix(nebCol, nebCyan, smoothstep(0.45, 0.82, fineDetail) * 0.55);

            float riftMask = 1.0 - dustRift * 0.62 * exp(-abs(gDir.y) * 9.0);
            float nebStrength = band * (0.28 + 0.72 * smoothstep(0.22, 0.78, nMain)) * riftMask;
            col += nebCol * nebStrength * 0.22 * uNightFactor;
          }

          // 4. Nubes Cirrus Nocturnas Sutiles con silver lining lunar
          if (dir.y > 0.01) {
            vec2 cloudUV = dir.xz / (dir.y + 0.18) * 0.85 + vec2(uTime * 0.004, uTime * 0.002);
            float c1 = fbm2(cloudUV * 1.45);
            float c2 = fbm2(cloudUV * 2.9 - vec2(c1 * 0.55));
            float cirrus = smoothstep(0.48, 0.82, c1 * 0.65 + c2 * 0.35) * smoothstep(0.02, 0.24, dir.y);
            float silverLining = pow(moonDot, 4.0);
            vec3 cloudTint = mix(vec3(0.11, 0.07, 0.20), vec3(0.85, 0.76, 0.96), silverLining * 0.78);
            cloudTint = mix(vec3(0.88, 0.74, 0.86), cloudTint, uNightFactor);
            col = mix(col, col + cloudTint * (0.14 + 0.26 * silverLining), cirrus * 0.55);
          }

          // 5. Anti-Banding Dithering (IGN)
          col = max(vec3(0.0), col + (ign(gl_FragCoord.xy) - 0.5) / 255.0);

          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    });
    mat.userData = { isVfx: true };

    this.#skyDome = new THREE.Mesh(geo, mat);
    this.#skyDome.frustumCulled = false;
    this.#skyDome.renderOrder = -1000;
    this.#root.add(this.#skyDome);
  }

  #buildCrescentMoon() {
    this.#moonGroup = new THREE.Group();
    this.#moonGroup.frustumCulled = false;

    const planeGeo = new THREE.PlaneGeometry(155, 155);

    const moonVertex = /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    // Pasada 1: Disco lunar SDF con media luna, mares y luz cenicienta (NormalBlending)
    const discMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uOpacity: { value: 1.0 },
        uMoonColor: GraphicsSync.uMoonColor
      },
      vertexShader: moonVertex,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        uniform vec3 uMoonColor;
        varying vec2 vUv;

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

        float fbm3(vec2 p) {
          float sum = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 3; i++) {
            sum += amp * noise2(p);
            p = p * 2.07 + vec2(3.7, -5.2);
            amp *= 0.5;
          }
          return sum;
        }

        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          float rLen = length(p);
          float R_moon = 0.42;

          float disc = smoothstep(R_moon + 0.008, R_moon - 0.008, rLen);
          if (disc <= 0.001 || uOpacity <= 0.005) discard;

          // Recorte analítico de media luna con cuernos finos y afilados
          vec2 shadowOffset = vec2(0.18, 0.12);
          float shadowR = R_moon * 0.94;
          float shadowMask = smoothstep(shadowR - 0.035, shadowR + 0.02, length(p - shadowOffset));
          float crescent = disc * shadowMask;

          // Detalle de superficie lunar (mares y cráteres sutiles)
          float detail = fbm3(p * 6.5);
          float crater = fbm3(p * 14.0 + vec2(2.4, -1.7));
          float surfaceTex = 0.90 + 0.14 * detail - 0.05 * smoothstep(0.55, 0.85, crater);

          // Limbo exterior ligeramente más cálido y brillante (HDR > 1.0 para UnrealBloomPass)
          float limb = smoothstep(0.18, R_moon, rLen);
          vec3 litBase = vec3(1.28, 1.22, 1.08) * mix(vec3(1.0), uMoonColor + vec3(0.15), 0.35);
          vec3 litCol = mix(litBase * 0.94, litBase * vec3(1.06, 1.01, 0.90), limb) * surfaceTex;

          // Luz cenicienta azul-violeta sutil en la cara oscura
          vec3 earthshineCol = vec3(0.14, 0.12, 0.28) * (0.35 + 0.12 * detail);

          vec3 finalCol = mix(earthshineCol, litCol, shadowMask);
          float alpha = max(crescent, disc * 0.28) * uOpacity;

          gl_FragColor = vec4(finalCol, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    });
    discMat.userData = { isVfx: true };

    // Pasada 2: Corona interna cálida + aura externa lavanda-dorada (AdditiveBlending, sin bordes)
    const coronaMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: GraphicsSync.uTime,
        uOpacity: { value: 1.0 },
        uMoonColor: GraphicsSync.uMoonColor
      },
      vertexShader: moonVertex,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uOpacity;
        uniform vec3 uMoonColor;
        varying vec2 vUv;

        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          float rLen = length(p);
          if (rLen >= 0.96 || uOpacity <= 0.005) discard;

          float R_moon = 0.42;
          vec2 shadowOffset = vec2(0.18, 0.12);
          float shadowR = R_moon * 0.94;

          float dDisc = rLen - R_moon;
          float dShadow = shadowR - length(p - shadowOffset);
          float dGlow = max(max(dDisc, dShadow), 0.0);

          float edgeZero = smoothstep(0.95, 0.62, rLen);
          float shimmer = 0.96 + 0.04 * sin(uTime * 0.9);

          float innerCorona = exp(-dGlow * 7.5) * 0.75;
          float outerAura = exp(-dGlow * 2.4) * 0.32;

          vec3 warmCol = mix(vec3(1.0, 0.90, 0.72), uMoonColor, 0.5);
          vec3 auraCol = vec3(0.76, 0.60, 0.96);

          vec3 col = (warmCol * innerCorona + auraCol * outerAura) * edgeZero * shimmer * uOpacity;
          float a = clamp((innerCorona + outerAura) * edgeZero * uOpacity, 0.0, 1.0);
          if (a <= 0.002) discard;

          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    });
    coronaMat.userData = { isVfx: true };

    this.#moonCoronaMesh = new THREE.Mesh(planeGeo, coronaMat);
    this.#moonCoronaMesh.frustumCulled = false;
    this.#moonCoronaMesh.renderOrder = -991;

    this.#moonDiscMesh = new THREE.Mesh(planeGeo, discMat);
    this.#moonDiscMesh.frustumCulled = false;
    this.#moonDiscMesh.renderOrder = -990;

    this.#moonGroup.add(this.#moonCoronaMesh);
    this.#moonGroup.add(this.#moonDiscMesh);
    this.#root.add(this.#moonGroup);
  }

  #updateMoonPlacement() {
    if (!this.#moonDiscMesh || !this.#moonCoronaMesh) return;
    const dir = GraphicsSync.uMoonDir.value;

    this.#tmpMoonPos.copy(dir).multiplyScalar(MOON_DIST + 2.0);
    this.#moonCoronaMesh.position.copy(this.#tmpMoonPos);
    this.#moonCoronaMesh.lookAt(this.#tmpOrigin);

    this.#tmpMoonPos.copy(dir).multiplyScalar(MOON_DIST);
    this.#moonDiscMesh.position.copy(this.#tmpMoonPos);
    this.#moonDiscMesh.lookAt(this.#tmpOrigin);
  }

  #createStarShaderMaterial() {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: GraphicsSync.uTime,
        uMoonDir: GraphicsSync.uMoonDir,
        uPixelRatio: { value: this.#pixelRatio },
        uVisibility: { value: 1.0 },
        uSpinYaw: { value: 0.0 }
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute vec3 aColor;
        attribute float aPhase;
        attribute float aSpeed;
        attribute float aHero;

        uniform float uTime;
        uniform float uPixelRatio;
        uniform float uVisibility;
        uniform float uSpinYaw;
        uniform vec3 uMoonDir;

        varying vec3 vColor;
        varying float vAlpha;
        varying float vHero;

        void main() {
          vec3 unitDir = normalize(position);
          float horizonFade = smoothstep(0.025, 0.16, unitDir.y);

          float cy = cos(uSpinYaw);
          float sy = sin(uSpinYaw);
          vec3 worldDir = vec3(
            unitDir.x * cy + unitDir.z * sy,
            unitDir.y,
            -unitDir.x * sy + unitDir.z * cy
          );
          // Ocultación detrás del disco lunar monumental
          float moonOccult = smoothstep(0.9968, 0.9935, dot(worldDir, normalize(uMoonDir)));

          float twinkle = 0.65 + 0.35 * sin(uTime * aSpeed + aPhase);
          vColor = aColor;
          vHero = aHero;
          vAlpha = twinkle * horizonFade * moonOccult * uVisibility;

          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPos;
          gl_PointSize = max(1.0, aSize * (0.90 + 0.16 * twinkle) * uPixelRatio);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        varying float vHero;

        void main() {
          if (vAlpha <= 0.004) discard;
          vec2 uv = gl_PointCoord - 0.5;
          float r = length(uv);
          if (r > 0.5) discard;

          float edge = 1.0 - smoothstep(0.36, 0.5, r);
          float core = exp(-r * 9.0);
          float halo = exp(-r * 3.2) * 0.35;
          float shape = (core + halo) * edge;

          if (vHero > 0.5) {
            float crossSpike = exp(-abs(uv.x) * 28.0) * exp(-abs(uv.y) * 5.0)
              + exp(-abs(uv.y) * 28.0) * exp(-abs(uv.x) * 5.0);
            shape += crossSpike * 0.82 * edge;
          }

          float a = clamp(shape * vAlpha, 0.0, 1.0);
          if (a <= 0.003) discard;

          vec3 col = vColor * shape * vAlpha * (vHero > 0.5 ? 1.35 : 1.05);
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    });
    mat.userData = { isVfx: true };
    return mat;
  }

  #pickStarLinearColor(rand) {
    const roll = rand();
    let src;
    if (roll < 0.42) src = STAR_PALETTE[0];
    else if (roll < 0.66) src = STAR_PALETTE[1];
    else if (roll < 0.85) src = STAR_PALETTE[2];
    else src = STAR_PALETTE[3];

    return [
      srgbToLinear(src[0]),
      srgbToLinear(src[1]),
      srgbToLinear(src[2])
    ];
  }

  #buildStarfield() {
    const rand = createSeededRandom(0x47414c41);
    const galNormal = new THREE.Vector3(0.413, -0.529, 0.741).normalize();
    const tmpVec = new THREE.Vector3();

    const pos = new Float32Array(STAR_COUNT * 3);
    const size = new Float32Array(STAR_COUNT);
    const col = new Float32Array(STAR_COUNT * 3);
    const phase = new Float32Array(STAR_COUNT);
    const speed = new Float32Array(STAR_COUNT);
    const hero = new Float32Array(STAR_COUNT);

    for (let i = 0; i < STAR_COUNT; i++) {
      let x;
      let y;
      let z;
      if (i < STAR_COUNT * 0.30) {
        let attempts = 0;
        do {
          const theta = rand() * Math.PI * 2;
          const u = 0.035 + rand() * 0.965;
          const sinPhi = Math.sqrt(Math.max(0, 1 - u * u));
          tmpVec.set(sinPhi * Math.cos(theta), u, sinPhi * Math.sin(theta));
          attempts += 1;
        } while (Math.abs(tmpVec.dot(galNormal)) > 0.26 && attempts < 10);
        x = tmpVec.x * STAR_RADIUS;
        y = tmpVec.y * STAR_RADIUS;
        z = tmpVec.z * STAR_RADIUS;
      } else {
        const theta = rand() * Math.PI * 2;
        const u = 0.03 + rand() * 0.97;
        const sinPhi = Math.sqrt(Math.max(0, 1 - u * u));
        x = STAR_RADIUS * sinPhi * Math.cos(theta);
        y = STAR_RADIUS * u;
        z = STAR_RADIUS * sinPhi * Math.sin(theta);
      }

      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;

      const isHero = rand() < 0.06;
      hero[i] = isHero ? 1.0 : 0.0;
      size[i] = isHero ? (6.4 + rand() * 4.8) : (1.5 + Math.pow(rand(), 2.2) * 3.1);
      phase[i] = rand() * Math.PI * 2;
      speed[i] = 1.2 + rand() * 2.8;

      const [cr, cg, cb] = this.#pickStarLinearColor(rand);
      const brightness = isHero ? (1.05 + rand() * 0.35) : (0.72 + rand() * 0.42);
      col[i * 3] = cr * brightness;
      col[i * 3 + 1] = cg * brightness;
      col[i * 3 + 2] = cb * brightness;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
    geo.setAttribute('aHero', new THREE.BufferAttribute(hero, 1));

    const mat = this.#createStarShaderMaterial();
    this.#starsPoints = new THREE.Points(geo, mat);
    this.#starsPoints.frustumCulled = false;
    this.#starsPoints.renderOrder = -960;
    this.#celestialSpinner.add(this.#starsPoints);
  }

  #buildConstellations() {
    const definitions = [
      {
        name: 'Corona Imperial',
        azimuthDeg: -28,
        elevationDeg: 52,
        lineHex: 0xffe9b5,
        starHex: 0xfff1c9,
        stars: [
          [-0.145, -0.052, 8.2],
          [-0.050, -0.068, 7.6],
          [0.050, -0.068, 7.6],
          [0.145, -0.052, 8.2],
          [-0.168, 0.048, 9.2],
          [-0.076, 0.002, 7.4],
          [0.000, 0.105, 11.2],
          [0.076, 0.002, 7.4],
          [0.168, 0.048, 9.2]
        ],
        edges: [
          [0, 1], [1, 2], [2, 3],
          [0, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 3],
          [1, 5], [2, 7]
        ]
      },
      {
        name: 'Cisne Real',
        azimuthDeg: 142,
        elevationDeg: 49,
        lineHex: 0xcbe6ff,
        starHex: 0xdff2ff,
        stars: [
          [0.000, -0.118, 9.0],
          [0.000, -0.012, 10.2],
          [0.022, 0.068, 8.0],
          [0.062, 0.132, 9.4],
          [-0.098, 0.016, 8.6],
          [-0.192, -0.028, 8.2],
          [0.098, -0.018, 8.6],
          [0.192, -0.068, 8.2]
        ],
        edges: [
          [0, 1], [1, 2], [2, 3],
          [1, 4], [4, 5],
          [1, 6], [6, 7]
        ]
      },
      {
        name: 'Corazon Estelar',
        azimuthDeg: -124,
        elevationDeg: 48,
        lineHex: 0xffcce8,
        starHex: 0xffdff2,
        stars: [
          [0.000, -0.118, 9.8],
          [-0.088, -0.036, 8.2],
          [-0.120, 0.046, 8.8],
          [-0.058, 0.098, 9.4],
          [0.000, 0.046, 8.6],
          [0.058, 0.098, 9.4],
          [0.120, 0.046, 8.8],
          [0.088, -0.036, 8.2]
        ],
        edges: [
          [0, 1], [1, 2], [2, 3], [3, 4],
          [4, 5], [5, 6], [6, 7], [7, 0]
        ]
      }
    ];

    const rand = createSeededRandom(0x43524f57);
    const starPositions = [];
    const starSizes = [];
    const starPhases = [];
    const starSpeeds = [];
    const starColors = [];
    const starHero = [];

    const linePositions = [];
    const lineColors = [];

    const worldUp = new THREE.Vector3(0, 1, 0);
    const centerDir = new THREE.Vector3();
    const rightAxis = new THREE.Vector3();
    const upAxis = new THREE.Vector3();
    const starVec = new THREE.Vector3();
    const tmpStarCol = new THREE.Color();
    const tmpLineCol = new THREE.Color();

    const rLines = CONSTELLATION_RADIUS + 1.0;

    for (const def of definitions) {
      const az = THREE.MathUtils.degToRad(def.azimuthDeg);
      const el = THREE.MathUtils.degToRad(def.elevationDeg);
      const cosEl = Math.cos(el);
      centerDir.set(Math.sin(az) * cosEl, Math.sin(el), -Math.cos(az) * cosEl).normalize();

      rightAxis.crossVectors(centerDir, worldUp).normalize();
      upAxis.crossVectors(rightAxis, centerDir).normalize();

      tmpStarCol.setHex(def.starHex);
      tmpLineCol.setHex(def.lineHex);

      const resolvedDirs = [];
      for (const [u, v, sz] of def.stars) {
        starVec
          .copy(centerDir)
          .addScaledVector(rightAxis, u)
          .addScaledVector(upAxis, v)
          .normalize();
        resolvedDirs.push(starVec.clone());

        starPositions.push(starVec.x * CONSTELLATION_RADIUS, starVec.y * CONSTELLATION_RADIUS, starVec.z * CONSTELLATION_RADIUS);
        starSizes.push(sz);
        starPhases.push(rand() * Math.PI * 2);
        starSpeeds.push(1.4 + rand() * 1.3);
        starColors.push(tmpStarCol.r * 1.15, tmpStarCol.g * 1.15, tmpStarCol.b * 1.15);
        starHero.push(1.0);
      }

      for (const [a, b] of def.edges) {
        const da = resolvedDirs[a];
        const db = resolvedDirs[b];
        linePositions.push(
          da.x * rLines, da.y * rLines, da.z * rLines,
          db.x * rLines, db.y * rLines, db.z * rLines
        );
        lineColors.push(
          tmpLineCol.r, tmpLineCol.g, tmpLineCol.b,
          tmpLineCol.r, tmpLineCol.g, tmpLineCol.b
        );
      }
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    starGeo.setAttribute('aSize', new THREE.Float32BufferAttribute(starSizes, 1));
    starGeo.setAttribute('aColor', new THREE.Float32BufferAttribute(starColors, 3));
    starGeo.setAttribute('aPhase', new THREE.Float32BufferAttribute(starPhases, 1));
    starGeo.setAttribute('aSpeed', new THREE.Float32BufferAttribute(starSpeeds, 1));
    starGeo.setAttribute('aHero', new THREE.Float32BufferAttribute(starHero, 1));

    const starMat = this.#createStarShaderMaterial();
    this.#constellationStars = new THREE.Points(starGeo, starMat);
    this.#constellationStars.frustumCulled = false;
    this.#constellationStars.renderOrder = -955;
    this.#celestialSpinner.add(this.#constellationStars);

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));

    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.16,
      fog: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
    lineMat.userData = { isVfx: true };

    this.#constellationLines = new THREE.LineSegments(lineGeo, lineMat);
    this.#constellationLines.frustumCulled = false;
    this.#constellationLines.renderOrder = -965;
    this.#celestialSpinner.add(this.#constellationLines);
  }

  #buildShootingStarPool() {
    const vertCount = (RIBBON_SEGMENTS + 1) * 2;
    const dummyPos = new Float32Array(vertCount * 3);
    const aT = new Float32Array(vertCount);
    const aSide = new Float32Array(vertCount);
    const indices = [];

    for (let i = 0; i <= RIBBON_SEGMENTS; i++) {
      const t = i / RIBBON_SEGMENTS;
      const idx = i * 2;
      aT[idx] = t;
      aSide[idx] = -1;
      aT[idx + 1] = t;
      aSide[idx + 1] = 1;

      dummyPos[idx * 3 + 1] = SHOOTING_RADIUS;
      dummyPos[(idx + 1) * 3 + 1] = SHOOTING_RADIUS;

      if (i < RIBBON_SEGMENTS) {
        indices.push(idx, idx + 1, idx + 2);
        indices.push(idx + 1, idx + 3, idx + 2);
      }
    }

    const ribbonGeo = new THREE.BufferGeometry();
    ribbonGeo.setAttribute('position', new THREE.BufferAttribute(dummyPos, 3));
    ribbonGeo.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
    ribbonGeo.setAttribute('aSide', new THREE.BufferAttribute(aSide, 1));
    ribbonGeo.setIndex(indices);
    this.#shootingRibbonGeo = ribbonGeo;

    for (let i = 0; i < SHOOTING_POOL_SIZE; i++) {
      const headDir = new THREE.Vector3(0, 1, 0);
      const tailDir = new THREE.Vector3(0.1, 0.99, 0).normalize();
      const sideDir = new THREE.Vector3(0, 0, 1);

      const mat = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uHeadDir: { value: headDir },
          uTailDir: { value: tailDir },
          uSideDir: { value: sideDir },
          uRadius: { value: SHOOTING_RADIUS },
          uWidth: { value: 1.8 },
          uProgress: { value: 0.0 },
          uVisibility: { value: 1.0 }
        },
        vertexShader: /* glsl */ `
          attribute float aT;
          attribute float aSide;

          uniform vec3 uHeadDir;
          uniform vec3 uTailDir;
          uniform vec3 uSideDir;
          uniform float uRadius;
          uniform float uWidth;

          varying float vT;
          varying float vSide;

          void main() {
            vT = aT;
            vSide = aSide;

            vec3 spineDir = normalize(mix(uHeadDir, uTailDir, aT));
            float headRound = sin(clamp(aT * 8.0, 0.0, 1.5707963));
            float tailTaper = pow(1.0 - aT, 1.45);
            float halfW = uWidth * headRound * tailTaper;

            vec3 localPos = spineDir * uRadius + uSideDir * (aSide * halfW);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(localPos, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uProgress;
          uniform float uVisibility;
          varying float vT;
          varying float vSide;

          void main() {
            float fadeIn = smoothstep(0.0, 0.14, uProgress);
            float fadeOut = 1.0 - smoothstep(0.55, 1.0, uProgress);
            float lifeAlpha = fadeIn * fadeOut * uVisibility;
            if (lifeAlpha <= 0.003) discard;

            float across = exp(-vSide * vSide * 4.2) * (1.0 - vSide * vSide);
            float along = pow(1.0 - vT, 1.75);
            float headSpark = exp(-vT * 18.0) * 0.95;

            vec3 headCol = vec3(1.45, 1.32, 1.02);
            vec3 midCol = vec3(0.72, 0.92, 1.18);
            vec3 tailCol = vec3(0.96, 0.52, 0.84);

            vec3 col = mix(headCol, midCol, smoothstep(0.0, 0.35, vT));
            col = mix(col, tailCol, smoothstep(0.32, 0.95, vT));

            float alpha = clamp((along + headSpark) * across * lifeAlpha, 0.0, 1.0);
            if (alpha <= 0.002) discard;

            gl_FragColor = vec4(col * alpha, alpha);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `
      });
      mat.userData = { isVfx: true };

      const mesh = new THREE.Mesh(ribbonGeo, mat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = -940;
      this.#root.add(mesh);

      this.#shootingPool.push({
        mesh,
        mat,
        active: false,
        elapsed: 0,
        duration: 1.0,
        tailSpan: 0.32,
        startDir: new THREE.Vector3(),
        endDir: new THREE.Vector3(),
        headDir,
        tailDir,
        sideDir
      });
    }
  }

  #spawnShootingStar() {
    let slot = null;
    for (let i = 0; i < this.#shootingPool.length; i++) {
      if (!this.#shootingPool[i].active) {
        slot = this.#shootingPool[i];
        break;
      }
    }
    if (!slot) return;

    const startAz = Math.random() * Math.PI * 2;
    const startEl = 0.45 + Math.random() * 0.65;
    const dirSign = Math.random() < 0.5 ? -1 : 1;
    const deltaAz = dirSign * (0.38 + Math.random() * 0.38);
    const endEl = Math.max(0.18, startEl - (0.22 + Math.random() * 0.24));
    const endAz = startAz + deltaAz;

    const cosStart = Math.cos(startEl);
    slot.startDir.set(
      Math.sin(startAz) * cosStart,
      Math.sin(startEl),
      -Math.cos(startAz) * cosStart
    ).normalize();

    const cosEnd = Math.cos(endEl);
    slot.endDir.set(
      Math.sin(endAz) * cosEnd,
      Math.sin(endEl),
      -Math.cos(endAz) * cosEnd
    ).normalize();

    slot.active = true;
    slot.elapsed = 0;
    slot.duration = 0.78 + Math.random() * 0.52;
    slot.tailSpan = 0.28 + Math.random() * 0.14;
    slot.mat.uniforms.uWidth.value = 1.6 + Math.random() * 0.55;
    slot.mat.uniforms.uProgress.value = 0;
    slot.mesh.visible = true;
  }

  #updateShootingStars(dt) {
    if (this.#starsOpacity > 0.4) {
      this.#shootingCooldown -= dt;
      if (this.#shootingCooldown <= 0) {
        this.#shootingCooldown = 3.5 + Math.random() * 3.5; // Cada 3.5s - 7.0s
        this.#spawnShootingStar();
      }
    }

    for (let i = 0; i < this.#shootingPool.length; i++) {
      const s = this.#shootingPool[i];
      if (!s.active) continue;

      s.elapsed += dt;
      const p = s.elapsed / s.duration;
      if (p >= 1.0 || this.#starsOpacity <= 0.05) {
        s.active = false;
        s.mesh.visible = false;
        s.mat.uniforms.uProgress.value = 0;
        continue;
      }

      const travel = p * (1.0 + s.tailSpan);
      const headT = Math.min(1.0, travel);
      const tailT = Math.max(0.0, travel - s.tailSpan);

      s.headDir.lerpVectors(s.startDir, s.endDir, headT).normalize();
      s.tailDir.lerpVectors(s.startDir, s.endDir, Math.min(headT - 0.004, tailT)).normalize();
      s.sideDir.crossVectors(s.headDir, s.tailDir);
      const sideLenSq = s.sideDir.lengthSq();
      if (sideLenSq > 1e-8) {
        s.sideDir.multiplyScalar(1 / Math.sqrt(sideLenSq));
      } else {
        s.sideDir.set(1, 0, 0);
      }

      s.mat.uniforms.uProgress.value = p;
      s.mat.uniforms.uVisibility.value = this.#starsOpacity;
    }
  }

  #syncVisibility() {
    const starsVis = this.#starsOpacity;
    const moonVis = this.#moonOpacity;

    const showStars = starsVis > 0.01;
    if (this.#starsPoints) {
      this.#starsPoints.visible = showStars;
      this.#starsPoints.material.uniforms.uVisibility.value = starsVis;
    }
    if (this.#constellationStars) {
      this.#constellationStars.visible = showStars;
      this.#constellationStars.material.uniforms.uVisibility.value = starsVis;
    }
    if (this.#constellationLines) {
      this.#constellationLines.visible = starsVis > 0.02;
      this.#constellationLines.material.opacity = 0.16 * starsVis;
    }

    const showMoon = moonVis > 0.01;
    if (this.#moonGroup) {
      this.#moonGroup.visible = showMoon;
    }
    if (this.#moonDiscMesh) {
      this.#moonDiscMesh.material.uniforms.uOpacity.value = moonVis;
    }
    if (this.#moonCoronaMesh) {
      this.#moonCoronaMesh.material.uniforms.uOpacity.value = Math.max(moonVis, starsVis * 0.75);
    }
    if (this.#skyDome) {
      this.#skyDome.material.uniforms.uMoonOpacity.value = moonVis;
    }
  }

  applyTheme(theme) {
    if (!theme || !this.#skyDome) return;

    const skyU = this.#skyDome.material.uniforms;
    skyU.uSkyMidHigh.value.setHex(theme.skyMidHigh ?? 0x171042);

    const starsOpacity = THREE.MathUtils.clamp(theme.starsOpacity ?? 1.0, 0, 1);
    const nightMix = THREE.MathUtils.clamp(
      theme.nightMix ?? (starsOpacity > 0.6 ? 1.0 : starsOpacity * 0.8),
      0,
      1
    );
    const moonOpacity = THREE.MathUtils.clamp(
      theme.moonOpacity ?? starsOpacity,
      0,
      1
    );

    const wasNight = this.#starsOpacity > 0.45;
    this.#starsOpacity = starsOpacity;
    this.#nightMix = nightMix;
    this.#moonOpacity = moonOpacity;

    this.#updateMoonPlacement();

    if (!wasNight && starsOpacity > 0.45) {
      this.#shootingCooldown = 3.5 + Math.random() * 2.5;
    }

    this.#syncVisibility();
  }

  setQuality(quality, pixelRatio = this.#pixelRatio) {
    this.#quality = quality;
    this.setPixelRatio(pixelRatio);

    const drawCount = QUALITY_STAR_COUNTS[quality] ?? STAR_COUNT;
    this.#starsPoints?.geometry?.setDrawRange(0, drawCount);
  }

  setPixelRatio(pixelRatio) {
    if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) return;
    this.#pixelRatio = pixelRatio;
    if (this.#starsPoints) this.#starsPoints.material.uniforms.uPixelRatio.value = pixelRatio;
    if (this.#constellationStars) this.#constellationStars.material.uniforms.uPixelRatio.value = pixelRatio;
  }

  update(dt) {
    this.#elapsed += dt;

    if (this.#starsOpacity > 0.01 && this.#celestialSpinner) {
      this.#celestialSpinner.rotation.y = (this.#celestialSpinner.rotation.y + dt * 0.0042) % (Math.PI * 2);
      const spinYaw = this.#celestialSpinner.rotation.y;

      if (this.#skyDome) {
        this.#skyDome.material.uniforms.uSpinYaw.value = spinYaw;
      }
      if (this.#starsPoints) {
        this.#starsPoints.material.uniforms.uSpinYaw.value = spinYaw;
      }
      if (this.#constellationStars) {
        this.#constellationStars.material.uniforms.uSpinYaw.value = spinYaw;
      }
      if (this.#constellationLines) {
        const pulse = 0.92 + 0.08 * Math.sin(this.#elapsed * 0.85);
        this.#constellationLines.material.opacity = 0.16 * this.#starsOpacity * pulse;
      }
    }

    this.#updateShootingStars(dt);
  }

  syncToCamera(camera) {
    if (!camera || !this.#root) return;
    this.#root.position.copy(camera.position);
  }

  dispose() {
    if (this.#root?.parent) {
      this.#root.parent.remove(this.#root);
    }

    this.#skyDome?.geometry?.dispose();
    this.#skyDome?.material?.dispose();

    this.#moonDiscMesh?.geometry?.dispose();
    this.#moonDiscMesh?.material?.dispose();
    this.#moonCoronaMesh?.material?.dispose();

    this.#starsPoints?.geometry?.dispose();
    this.#starsPoints?.material?.dispose();

    this.#constellationStars?.geometry?.dispose();
    this.#constellationStars?.material?.dispose();

    this.#constellationLines?.geometry?.dispose();
    this.#constellationLines?.material?.dispose();

    this.#shootingRibbonGeo?.dispose();
    for (const s of this.#shootingPool) {
      s.mat?.dispose();
    }
    this.#shootingPool.length = 0;

    this.#skyDome = null;
    this.#moonGroup = null;
    this.#moonDiscMesh = null;
    this.#moonCoronaMesh = null;
    this.#starsPoints = null;
    this.#constellationStars = null;
    this.#constellationLines = null;
    this.#shootingRibbonGeo = null;
    this.#celestialSpinner = null;
    this.#root = null;
  }
}
