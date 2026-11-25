import * as THREE from 'three';

const BASE_RADIUS = 200;
const DISTANT_STAR_COUNT = 2500;
const BRIGHT_STAR_COUNT = 350;
const SHOOTING_POOL_SIZE = 3;
const RIBBON_SEGMENTS = 16;

const STAR_PALETTE = [
  [1.0, 1.0, 1.0],       // Blanco diamante (#ffffff)
  [0.749, 0.902, 1.0],   // Azul hielo (#bfe6ff)
  [1.0, 0.902, 0.659],   // Dorado cálido (#ffe6a8)
  [1.0, 0.820, 0.918]    // Rosa pálido (#ffd1ea)
];

const QUALITY_STAR_COUNTS = {
  low: 1650,
  medium: 2200,
  high: DISTANT_STAR_COUNT
};

// Semilla determinista Mulberry32 para que todos los jugadores vean el mismo firmamento
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

// Conversión aproximada sRGB -> Linear para atributos de color en shaders
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Sistema de bóveda celeste animada ("Noche Estrellada - Gala Imperial").
 * Incluye SkyDome con Vía Láctea pastel, Luna Creciente Imperial con halo,
 * 3 capas de estrellas GPU (lejanas, brillantes en cruz y 3 constelaciones reales)
 * y pool GC-Free de 3 estrellas fugaces.
 */
export class StarrySkySystem {
  #scene;
  #quality = 'medium';
  #pixelRatio = 1;
  #root = null;
  #celestialSpinner = null;
  #skyDome = null;
  #moonGroup = null;
  #moonMesh = null;
  #moonHalo = null;
  #moonTex = null;
  #haloTex = null;
  #distantStars = null;
  #brightStars = null;
  #constellationStars = null;
  #constellationLines = null;
  #shootingRibbonGeo = null;
  #shootingPool = [];

  #elapsed = 0;
  #starsOpacity = 0;
  #moonOpacity = 0;
  #nightMix = 0;
  #lastCameraScale = -1;
  #shootingCooldown = 5.2;

  // Vectores preasignados (GC-Free absoluto en update/render)
  #moonDir = new THREE.Vector3(0.556, 0.742, -0.451).normalize();
  #defaultTwilightMoonDir = new THREE.Vector3(0.556, 0.725, -0.451).normalize();
  #tmpMoonPos = new THREE.Vector3();
  #tmpOrigin = new THREE.Vector3(0, 0, 0);

  constructor(scene, { quality = 'medium', pixelRatio = 1 } = {}) {
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
    this.#buildMoon();
    this.#buildStarLayers();
    this.#buildConstellations();
    this.#buildShootingStarPool();

    this.#root.add(this.#celestialSpinner);
    this.#scene.add(this.#root);

    this.setQuality(this.#quality, this.#pixelRatio);
    this.#syncVisibility();
  }

  #buildSkyDome() {
    const geo = new THREE.SphereGeometry(BASE_RADIUS, 36, 24);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTopColor: { value: new THREE.Color(0x7cb2f8) },
        uMidColor: { value: new THREE.Color(0xffd2e5) },
        uBottomColor: { value: new THREE.Color(0xfff3d8) },
        uNightMix: { value: 0.0 },
        uTime: { value: 0.0 },
        uSpinYaw: { value: 0.0 }
      },
      vertexShader: /* glsl */ `
        varying vec3 vLocalPos;
        void main() {
          vLocalPos = position;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTopColor;
        uniform vec3 uMidColor;
        uniform vec3 uBottomColor;
        uniform float uNightMix;
        uniform float uTime;
        uniform float uSpinYaw;
        varying vec3 vLocalPos;

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

        float fbm3(vec3 p) {
          float v = 0.52 * noise3(p);
          p = p * 2.07 + vec3(11.3, 5.7, -8.1);
          v += 0.31 * noise3(p);
          p = p * 2.03 + vec3(-4.9, 13.1, 7.4);
          v += 0.17 * noise3(p);
          return v;
        }

        void main() {
          vec3 dir = normalize(vLocalPos);
          float h = dir.y;

          vec3 col = mix(uBottomColor, uMidColor, smoothstep(-0.08, 0.28, h));
          col = mix(col, uTopColor, smoothstep(0.22, 0.88, h));

          if (uNightMix > 0.005) {
            float cy = cos(uSpinYaw);
            float sy = sin(uSpinYaw);
            vec3 skyDir = vec3(dir.x * cy - dir.z * sy, dir.y, dir.x * sy + dir.z * cy);

            // Plano inclinado de la Vía Láctea Imperial cruzando el arco celeste
            vec3 galNormal = normalize(vec3(0.41, 0.38, -0.829));
            float galDist = dot(skyDir, galNormal);

            float n1 = fbm3(skyDir * 2.75 + vec3(0.0, uTime * 0.0025, 0.0));
            float n2 = fbm3(skyDir * 5.6 - vec3(n1 * 0.75));
            float warpedDist = galDist + (n1 - 0.5) * 0.16;

            float mainBand = exp(-warpedDist * warpedDist * 13.5);
            float wideVeil = exp(-warpedDist * warpedDist * 4.2) * 0.42;
            float dustRift = smoothstep(0.42, 0.76, n2) * exp(-warpedDist * warpedDist * 52.0);
            float horizonFade = smoothstep(0.02, 0.30, h);

            // Tonos lavanda real, rosa pálido y polvo estelar azulado (en espacio lineal suave)
            vec3 lavenderCol = vec3(0.058, 0.036, 0.135);
            vec3 roseNebulaCol = vec3(0.098, 0.034, 0.086);
            vec3 stardustBlueCol = vec3(0.042, 0.068, 0.148);

            vec3 nebCol = mix(lavenderCol, roseNebulaCol, smoothstep(0.28, 0.72, n1));
            nebCol = mix(nebCol, stardustBlueCol, smoothstep(0.42, 0.85, n2) * 0.68);

            float bandIntensity = (mainBand * (0.52 + 0.68 * n1) + wideVeil * n2) * (1.0 - 0.40 * dustRift);
            col += nebCol * bandIntensity * horizonFade * uNightMix;

            // Resplandor sedoso rosado-dorado junto al horizonte nocturno
            float horizonGlow = exp(-max(0.0, h + 0.02) * 8.5) * smoothstep(-0.18, 0.02, h);
            col += vec3(0.055, 0.024, 0.048) * horizonGlow * uNightMix;
          }

          // Micro-dithering sutil para evitar bandas de color de 8 bits en el cielo nocturno
          float dither = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
          col = max(vec3(0.0), col + dither);

          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    });
    mat.userData = { isVfx: true };

    this.#skyDome = new THREE.Mesh(geo, mat);
    this.#skyDome.frustumCulled = false;
    this.#skyDome.renderOrder = -100;
    this.#root.add(this.#skyDome);
  }

  #createMoonCrescentTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const data = img.data;

    const cx = 128;
    const cy = 128;
    const outerR = 84;
    // Círculo de sombra desplazado arriba-izquierda para esculpir una creciente elegante
    const sx = cx - 29;
    const sy = cy - 18;
    const shadowR = 76.5;

    for (let y = 0; y < size; y++) {
      const dy = y + 0.5 - cy;
      const sdy = y + 0.5 - sy;
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - cx;
        const sdx = x + 0.5 - sx;

        const distOuter = Math.hypot(dx, dy);
        const distShadow = Math.hypot(sdx, sdy);

        const dOuter = distOuter - outerR;
        const dShadow = distShadow - shadowR;

        // Silueta anti-aliased de la Luna Creciente
        const outerCov = smoothstepJS(1.25, -1.25, dOuter);
        const innerCov = smoothstepJS(-2.4, 3.2, dShadow);
        const crescentAlpha = outerCov * innerCov;

        // Suave aureola perlada pegada al creciente (se extingue antes del borde del lienzo)
        const sdfCrescent = Math.max(dOuter, -dShadow);
        const canvasEdgeFade = smoothstepJS(124, 92, distOuter);
        const innerBloom = Math.exp(-Math.max(0, sdfCrescent) * 0.16) * 0.24 * canvasEdgeFade;

        const alpha = Math.min(1, crescentAlpha + innerBloom * (1 - crescentAlpha * 0.65));
        if (alpha <= 0.002) continue;

        // Textura lunar sutil (mares perlados muy delicados)
        const nx = dx / outerR;
        const ny = dy / outerR;
        const mare =
          0.5 +
          0.25 * Math.sin(nx * 5.2 + ny * 3.4) +
          0.25 * Math.cos(nx * 8.6 - ny * 6.8 + 1.1);
        const surfaceDetail = 0.965 + 0.035 * mare;

        // Degradado blanco-perlado en el limbo exterior hacia champán/rosa suave interior
        const limbFactor = smoothstepJS(26, 0, Math.max(0, -dOuter));
        const termFactor = smoothstepJS(0, 22, Math.max(0, dShadow));

        let r = 247 + 8 * limbFactor;
        let g = 228 + 20 * termFactor * 0.6 + 16 * limbFactor * 0.55;
        let b = 224 + 22 * limbFactor - 12 * (1 - termFactor) * 0.4;

        r = Math.min(255, Math.round(r * surfaceDetail));
        g = Math.min(255, Math.round(g * surfaceDetail));
        b = Math.min(255, Math.round(b * surfaceDetail));

        const idx = (y * size + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = Math.round(alpha * 255);
      }
    }

    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  #createMoonHaloTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const data = img.data;
    const half = size * 0.5;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (x + 0.5 - half) / half;
        const dy = (y + 0.5 - half) / half;
        const r = Math.hypot(dx, dy);
        if (r >= 1.0) continue;

        const edgeZero = (1 - r * r) * (1 - r * r);
        const innerCore = Math.exp(-r * r * 6.8) * 0.62;
        const outerCorona = Math.exp(-r * r * 2.4) * 0.34;
        const a = Math.min(1, (innerCore + outerCorona) * edgeZero);

        // De champán perlado en el centro a lavanda/rosa imperial hacia fuera
        const tLav = smoothstepJS(0.08, 0.55, r);
        const tRose = smoothstepJS(0.45, 0.92, r);

        let cr = 255 * (1 - tLav) + 216 * tLav;
        let cg = 244 * (1 - tLav) + 198 * tLav;
        let cb = 222 * (1 - tLav) + 255 * tLav;

        cr = cr * (1 - tRose * 0.35) + 245 * (tRose * 0.35);
        cg = cg * (1 - tRose * 0.35) + 178 * (tRose * 0.35);
        cb = cb * (1 - tRose * 0.35) + 228 * (tRose * 0.35);

        const idx = (y * size + x) * 4;
        data[idx] = Math.round(cr);
        data[idx + 1] = Math.round(cg);
        data[idx + 2] = Math.round(cb);
        data[idx + 3] = Math.round(a * 255);
      }
    }

    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  #buildMoon() {
    this.#moonGroup = new THREE.Group();
    this.#moonGroup.frustumCulled = false;

    this.#moonTex = this.#createMoonCrescentTexture();
    this.#haloTex = this.#createMoonHaloTexture();

    const haloMat = new THREE.SpriteMaterial({
      map: this.#haloTex,
      color: 0xf2eaff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      fog: false,
      depthWrite: false,
      toneMapped: false
    });
    haloMat.userData = { isVfx: true };

    this.#moonHalo = new THREE.Sprite(haloMat);
    this.#moonHalo.scale.set(62, 62, 1);
    this.#moonHalo.frustumCulled = false;
    this.#moonHalo.renderOrder = -25;

    const moonGeo = new THREE.PlaneGeometry(19.5, 19.5);
    const moonMat = new THREE.MeshBasicMaterial({
      map: this.#moonTex,
      color: 0xfff9ee,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
      toneMapped: false
    });
    moonMat.userData = { isVfx: true };

    this.#moonMesh = new THREE.Mesh(moonGeo, moonMat);
    this.#moonMesh.frustumCulled = false;
    this.#moonMesh.renderOrder = -24;

    this.#moonGroup.add(this.#moonHalo);
    this.#moonGroup.add(this.#moonMesh);
    this.#root.add(this.#moonGroup);

    this.#updateMoonPlacement();
  }

  #updateMoonPlacement() {
    if (!this.#moonMesh || !this.#moonHalo) return;

    this.#tmpMoonPos.copy(this.#moonDir).multiplyScalar(BASE_RADIUS * 0.922);
    this.#moonHalo.position.copy(this.#tmpMoonPos);

    this.#tmpMoonPos.copy(this.#moonDir).multiplyScalar(BASE_RADIUS * 0.916);
    this.#moonMesh.position.copy(this.#tmpMoonPos);
    this.#moonMesh.lookAt(this.#tmpOrigin);

    if (this.#distantStars) {
      this.#distantStars.material.uniforms.uMoonDir.value.copy(this.#moonDir);
    }
    if (this.#brightStars) {
      this.#brightStars.material.uniforms.uMoonDir.value.copy(this.#moonDir);
    }
    if (this.#constellationStars) {
      this.#constellationStars.material.uniforms.uMoonDir.value.copy(this.#moonDir);
    }
  }

  #createStarShaderMaterial({ crossFlare = false, intensityBoost = 1.0 } = {}) {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0.0 },
        uPixelRatio: { value: this.#pixelRatio },
        uVisibility: { value: 0.0 },
        uSpinYaw: { value: 0.0 },
        uMoonDir: { value: this.#moonDir.clone() },
        uIntensity: { value: intensityBoost }
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aPhase;
        attribute float aFreq;
        attribute vec3 aColor;

        uniform float uTime;
        uniform float uPixelRatio;
        uniform float uVisibility;
        uniform float uSpinYaw;
        uniform vec3 uMoonDir;

        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vec3 unitDir = normalize(position);
          float horizonFade = smoothstep(0.025, 0.15, unitDir.y);

          // Ocultación limpia detrás del disco lunar sólido al girar la bóveda
          float cy = cos(uSpinYaw);
          float sy = sin(uSpinYaw);
          vec3 worldDir = vec3(
            unitDir.x * cy + unitDir.z * sy,
            unitDir.y,
            -unitDir.x * sy + unitDir.z * cy
          );
          float moonOccult = smoothstep(0.9988, 0.9974, dot(worldDir, uMoonDir));

          float twinkle = 0.62 + 0.38 * sin(uTime * aFreq + aPhase);
          vColor = aColor;
          vAlpha = twinkle * horizonFade * moonOccult * uVisibility;

          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPos;
          gl_PointSize = max(1.0, aSize * (0.88 + 0.18 * twinkle) * uPixelRatio);
        }
      `,
      fragmentShader: crossFlare
        ? /* glsl */ `
          uniform float uIntensity;
          varying vec3 vColor;
          varying float vAlpha;

          void main() {
            if (vAlpha <= 0.004) discard;
            vec2 uv = gl_PointCoord - 0.5;
            float d = length(uv);
            if (d > 0.5) discard;

            float edge = 1.0 - smoothstep(0.36, 0.5, d);
            float core = exp(-d * d * 54.0);
            float halo = exp(-d * d * 13.0) * 0.36;

            // Destello en cruz estelar de 4 puntas suave
            float rayX = exp(-abs(uv.y) * 28.0) * exp(-abs(uv.x) * 4.6);
            float rayY = exp(-abs(uv.x) * 28.0) * exp(-abs(uv.y) * 4.6);
            float crossGlow = (rayX + rayY) * 0.68;

            float shape = (core * 1.25 + halo + crossGlow) * edge;
            float a = clamp(shape * vAlpha, 0.0, 1.0);
            if (a <= 0.003) discard;

            vec3 col = vColor * (uIntensity * (0.85 + 0.55 * core)) * shape * vAlpha;
            gl_FragColor = vec4(col, a);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `
        : /* glsl */ `
          uniform float uIntensity;
          varying vec3 vColor;
          varying float vAlpha;

          void main() {
            if (vAlpha <= 0.004) discard;
            vec2 uv = gl_PointCoord - 0.5;
            float d = length(uv);
            if (d > 0.5) discard;

            float edge = 1.0 - smoothstep(0.32, 0.5, d);
            float core = exp(-d * d * 24.0);
            float shape = core * edge;
            float a = clamp(shape * vAlpha, 0.0, 1.0);
            if (a <= 0.003) discard;

            vec3 col = vColor * uIntensity * shape * vAlpha;
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
    if (roll < 0.42) src = STAR_PALETTE[0];      // Blanco diamante
    else if (roll < 0.66) src = STAR_PALETTE[1]; // Azul hielo
    else if (roll < 0.85) src = STAR_PALETTE[2]; // Dorado cálido
    else src = STAR_PALETTE[3];                  // Rosa pálido

    return [
      srgbToLinear(src[0]),
      srgbToLinear(src[1]),
      srgbToLinear(src[2])
    ];
  }

  #buildStarLayers() {
    const rand = createSeededRandom(0x47414c41);
    const galNormal = new THREE.Vector3(0.41, 0.38, -0.829).normalize();
    const tmpVec = new THREE.Vector3();

    // --- Capa 1: ~2.500 estrellas lejanas ---
    const pos1 = new Float32Array(DISTANT_STAR_COUNT * 3);
    const size1 = new Float32Array(DISTANT_STAR_COUNT);
    const phase1 = new Float32Array(DISTANT_STAR_COUNT);
    const freq1 = new Float32Array(DISTANT_STAR_COUNT);
    const col1 = new Float32Array(DISTANT_STAR_COUNT * 3);
    const r1 = BASE_RADIUS * 0.96;

    for (let i = 0; i < DISTANT_STAR_COUNT; i++) {
      // 28% concentradas sutilmente cerca de la banda de la Vía Láctea, 72% en todo el hemisferio
      let x;
      let y;
      let z;
      if (i < DISTANT_STAR_COUNT * 0.28) {
        let attempts = 0;
        do {
          const theta = rand() * Math.PI * 2;
          const u = 0.035 + rand() * 0.965;
          const sinPhi = Math.sqrt(Math.max(0, 1 - u * u));
          tmpVec.set(sinPhi * Math.cos(theta), u, sinPhi * Math.sin(theta));
          attempts += 1;
        } while (Math.abs(tmpVec.dot(galNormal)) > 0.24 && attempts < 10);
        x = tmpVec.x * r1;
        y = tmpVec.y * r1;
        z = tmpVec.z * r1;
      } else {
        const theta = rand() * Math.PI * 2;
        const u = 0.032 + rand() * 0.968; // y > 0.03 * R
        const sinPhi = Math.sqrt(Math.max(0, 1 - u * u));
        x = r1 * sinPhi * Math.cos(theta);
        y = r1 * u;
        z = r1 * sinPhi * Math.sin(theta);
      }

      pos1[i * 3] = x;
      pos1[i * 3 + 1] = y;
      pos1[i * 3 + 2] = z;

      size1[i] = 1.35 + Math.pow(rand(), 1.7) * 2.15;
      phase1[i] = rand() * Math.PI * 2;
      freq1[i] = 1.15 + rand() * 2.85;

      const [cr, cg, cb] = this.#pickStarLinearColor(rand);
      const brightness = 0.72 + rand() * 0.42;
      col1[i * 3] = cr * brightness;
      col1[i * 3 + 1] = cg * brightness;
      col1[i * 3 + 2] = cb * brightness;
    }

    const geo1 = new THREE.BufferGeometry();
    geo1.setAttribute('position', new THREE.BufferAttribute(pos1, 3));
    geo1.setAttribute('aSize', new THREE.BufferAttribute(size1, 1));
    geo1.setAttribute('aPhase', new THREE.BufferAttribute(phase1, 1));
    geo1.setAttribute('aFreq', new THREE.BufferAttribute(freq1, 1));
    geo1.setAttribute('aColor', new THREE.BufferAttribute(col1, 3));

    const mat1 = this.#createStarShaderMaterial({ crossFlare: false, intensityBoost: 1.05 });
    this.#distantStars = new THREE.Points(geo1, mat1);
    this.#distantStars.frustumCulled = false;
    this.#distantStars.renderOrder = -35;
    this.#celestialSpinner.add(this.#distantStars);

    // --- Capa 2: ~350 estrellas brillantes principales con cruz estelar ---
    const pos2 = new Float32Array(BRIGHT_STAR_COUNT * 3);
    const size2 = new Float32Array(BRIGHT_STAR_COUNT);
    const phase2 = new Float32Array(BRIGHT_STAR_COUNT);
    const freq2 = new Float32Array(BRIGHT_STAR_COUNT);
    const col2 = new Float32Array(BRIGHT_STAR_COUNT * 3);
    const r2 = BASE_RADIUS * 0.95;

    for (let i = 0; i < BRIGHT_STAR_COUNT; i++) {
      const theta = rand() * Math.PI * 2;
      const u = 0.06 + rand() * 0.94;
      const sinPhi = Math.sqrt(Math.max(0, 1 - u * u));

      pos2[i * 3] = r2 * sinPhi * Math.cos(theta);
      pos2[i * 3 + 1] = r2 * u;
      pos2[i * 3 + 2] = r2 * sinPhi * Math.sin(theta);

      size2[i] = 4.6 + Math.pow(rand(), 1.45) * 4.4;
      phase2[i] = rand() * Math.PI * 2;
      freq2[i] = 1.35 + rand() * 2.45;

      const [cr, cg, cb] = this.#pickStarLinearColor(rand);
      const brightness = 0.92 + rand() * 0.35;
      col2[i * 3] = cr * brightness;
      col2[i * 3 + 1] = cg * brightness;
      col2[i * 3 + 2] = cb * brightness;
    }

    const geo2 = new THREE.BufferGeometry();
    geo2.setAttribute('position', new THREE.BufferAttribute(pos2, 3));
    geo2.setAttribute('aSize', new THREE.BufferAttribute(size2, 1));
    geo2.setAttribute('aPhase', new THREE.BufferAttribute(phase2, 1));
    geo2.setAttribute('aFreq', new THREE.BufferAttribute(freq2, 1));
    geo2.setAttribute('aColor', new THREE.BufferAttribute(col2, 3));

    const mat2 = this.#createStarShaderMaterial({ crossFlare: true, intensityBoost: 1.18 });
    this.#brightStars = new THREE.Points(geo2, mat2);
    this.#brightStars.frustumCulled = false;
    this.#brightStars.renderOrder = -31;
    this.#celestialSpinner.add(this.#brightStars);
  }

  #buildConstellations() {
    // 3 Constelaciones Reales bien distribuidas en el cielo:
    // 1. Corona Imperial (Norte-Noroeste, sobre las agujas del Palacio de Cristal)
    // 2. Cisne Real (Sureste, sobre el Lago Sur y el Paseo del Casino)
    // 3. Corazón Estelar (Suroeste, sobre la Pasarela y los Jardines de Perla)
    const definitions = [
      {
        name: 'Corona Imperial',
        azimuthDeg: -26,
        elevationDeg: 53,
        lineHex: 0xffe9b5,
        starHex: 0xfff1c9,
        stars: [
          [-0.145, -0.052, 7.6], // 0: base izq
          [-0.050, -0.068, 7.2], // 1: base centro-izq
          [0.050, -0.068, 7.2],  // 2: base centro-der
          [0.145, -0.052, 7.6],  // 3: base der
          [-0.168, 0.048, 8.8],  // 4: punta izq
          [-0.076, 0.002, 7.0],  // 5: valle izq
          [0.000, 0.105, 10.6],  // 6: joya cumbre central
          [0.076, 0.002, 7.0],   // 7: valle der
          [0.168, 0.048, 8.8]    // 8: punta der
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
          [0.000, -0.118, 8.6],  // 0: cola (Deneb real)
          [0.000, -0.012, 9.8],  // 1: pecho del cisne (Sadr)
          [0.022, 0.068, 7.6],   // 2: cuello arqueado
          [0.062, 0.132, 9.0],   // 3: cabeza coronada (Albireo)
          [-0.098, 0.016, 8.2],  // 4: ala izq interior
          [-0.192, -0.028, 7.8], // 5: punta ala izq
          [0.098, -0.018, 8.2],  // 6: ala der interior
          [0.192, -0.068, 7.8]   // 7: punta ala der
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
          [0.000, -0.118, 9.4],  // 0: punta inferior del corazón
          [-0.088, -0.036, 7.8], // 1: flanco inf izq
          [-0.120, 0.046, 8.4],  // 2: lóbulo ext izq
          [-0.058, 0.098, 9.0],  // 3: cumbre izq
          [0.000, 0.046, 8.2],   // 4: hendidura central
          [0.058, 0.098, 9.0],   // 5: cumbre der
          [0.120, 0.046, 8.4],   // 6: lóbulo ext der
          [0.088, -0.036, 7.8]   // 7: flanco inf der
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
    const starFreqs = [];
    const starColors = [];

    const linePositions = [];
    const lineColors = [];

    const worldUp = new THREE.Vector3(0, 1, 0);
    const centerDir = new THREE.Vector3();
    const rightAxis = new THREE.Vector3();
    const upAxis = new THREE.Vector3();
    const starVec = new THREE.Vector3();
    const tmpStarCol = new THREE.Color();
    const tmpLineCol = new THREE.Color();

    const rStars = BASE_RADIUS * 0.946;
    const rLines = BASE_RADIUS * 0.948;

    for (const def of definitions) {
      const az = THREE.MathUtils.degToRad(def.azimuthDeg);
      const el = THREE.MathUtils.degToRad(def.elevationDeg);
      const cosEl = Math.cos(el);
      // Mirando hacia -Z como Norte del Reino
      centerDir.set(Math.sin(az) * cosEl, Math.sin(el), -Math.cos(az) * cosEl).normalize();

      // Base ortonormal vista desde el interior de la cúpula: +right a la derecha, +up hacia el cenit
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

        starPositions.push(starVec.x * rStars, starVec.y * rStars, starVec.z * rStars);
        starSizes.push(sz);
        starPhases.push(rand() * Math.PI * 2);
        starFreqs.push(1.4 + rand() * 1.3);
        starColors.push(tmpStarCol.r * 1.12, tmpStarCol.g * 1.12, tmpStarCol.b * 1.12);
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
    starGeo.setAttribute('aPhase', new THREE.Float32BufferAttribute(starPhases, 1));
    starGeo.setAttribute('aFreq', new THREE.Float32BufferAttribute(starFreqs, 1));
    starGeo.setAttribute('aColor', new THREE.Float32BufferAttribute(starColors, 3));

    const starMat = this.#createStarShaderMaterial({ crossFlare: true, intensityBoost: 1.32 });
    this.#constellationStars = new THREE.Points(starGeo, starMat);
    this.#constellationStars.frustumCulled = false;
    this.#constellationStars.renderOrder = -30;
    this.#celestialSpinner.add(this.#constellationStars);

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));

    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
    lineMat.userData = { isVfx: true };

    this.#constellationLines = new THREE.LineSegments(lineGeo, lineMat);
    this.#constellationLines.frustumCulled = false;
    this.#constellationLines.renderOrder = -40;
    this.#celestialSpinner.add(this.#constellationLines);
  }

  #buildShootingStarPool() {
    // Geometría compartida de cinta segmentada proyectada sobre el arco esférico en GPU
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

      // Posiciones base no nulas para boundingSphere válido
      dummyPos[idx * 3 + 1] = BASE_RADIUS * 0.9;
      dummyPos[(idx + 1) * 3 + 1] = BASE_RADIUS * 0.9;

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
          uRadius: { value: BASE_RADIUS * 0.905 },
          uWidth: { value: 0.88 },
          uOpacity: { value: 0.0 }
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
            // Cabeza redondeada brillante y estela ahusada sedosa hacia la cola
            float headRound = sin(clamp(aT * 8.0, 0.0, 1.5707963));
            float tailTaper = pow(1.0 - aT, 1.45);
            float halfW = uWidth * headRound * tailTaper;

            vec3 localPos = spineDir * uRadius + uSideDir * (aSide * halfW);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(localPos, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uOpacity;
          varying float vT;
          varying float vSide;

          void main() {
            if (uOpacity <= 0.003) discard;

            float across = exp(-vSide * vSide * 4.2) * (1.0 - vSide * vSide);
            float along = pow(1.0 - vT, 1.75);
            float headSpark = exp(-vT * 18.0) * 0.85;

            // Degradado perlado/dorado imperial en la cabeza hacia rosa pálido en la estela
            vec3 headCol = vec3(1.28, 1.16, 0.92);
            vec3 midCol = vec3(1.02, 0.78, 0.52);
            vec3 tailCol = vec3(0.94, 0.54, 0.80);

            vec3 col = mix(headCol, midCol, smoothstep(0.0, 0.35, vT));
            col = mix(col, tailCol, smoothstep(0.32, 0.95, vT));

            float alpha = clamp((along + headSpark) * across * uOpacity, 0.0, 1.0);
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
      mesh.renderOrder = -20;
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

    // Trayectoria diagonal alta en la bóveda celeste (sin asignar objetos)
    const startAz = Math.random() * Math.PI * 2;
    const startEl = 0.56 + Math.random() * 0.62; // ~32° a ~68° de elevación
    const dirSign = Math.random() < 0.5 ? -1 : 1;
    const deltaAz = dirSign * (0.42 + Math.random() * 0.36);
    const endEl = Math.max(0.20, startEl - (0.24 + Math.random() * 0.24));
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
    slot.duration = 0.75 + Math.random() * 0.50; // 0.75s - 1.25s
    slot.tailSpan = 0.28 + Math.random() * 0.12;
    slot.mat.uniforms.uWidth.value = 0.78 + Math.random() * 0.28;
    slot.mat.uniforms.uOpacity.value = 0;
    slot.mesh.visible = true;
  }

  #updateShootingStars(dt) {
    if (this.#starsOpacity > 0.5) {
      this.#shootingCooldown -= dt;
      if (this.#shootingCooldown <= 0) {
        this.#shootingCooldown = 4.0 + Math.random() * 4.0; // Cada 4 a 8 segundos
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
        s.mat.uniforms.uOpacity.value = 0;
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

      const fadeIn = smoothstepJS(0.0, 0.14, p);
      const fadeOut = 1.0 - smoothstepJS(0.55, 1.0, p);
      s.mat.uniforms.uOpacity.value = fadeIn * fadeOut * this.#starsOpacity;
    }
  }

  #syncVisibility() {
    const starsVis = this.#starsOpacity;
    const moonVis = this.#moonOpacity;

    const showStars = starsVis > 0.01;
    if (this.#distantStars) {
      this.#distantStars.visible = showStars;
      this.#distantStars.material.uniforms.uVisibility.value = starsVis;
    }
    if (this.#brightStars) {
      this.#brightStars.visible = showStars;
      this.#brightStars.material.uniforms.uVisibility.value = starsVis;
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
    if (this.#moonMesh) {
      this.#moonMesh.material.opacity = moonVis;
    }
    if (this.#moonHalo) {
      const haloMix = Math.max(moonVis, starsVis * 0.85);
      this.#moonHalo.material.opacity = haloMix * 0.64;
    }
  }

  applyTheme(theme) {
    if (!theme || !this.#skyDome) return;

    const skyU = this.#skyDome.material.uniforms;
    skyU.uTopColor.value.setHex(theme.skyTop ?? 0x7cb2f8);
    skyU.uMidColor.value.setHex(theme.skyMid ?? 0xffd2e5);
    skyU.uBottomColor.value.setHex(theme.skyBottom ?? 0xfff3d8);

    const starsOpacity = THREE.MathUtils.clamp(theme.starsOpacity ?? 0, 0, 1);
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

    const wasNight = this.#starsOpacity > 0.5;
    this.#starsOpacity = starsOpacity;
    this.#nightMix = nightMix;
    this.#moonOpacity = moonOpacity;
    skyU.uNightMix.value = nightMix;

    // Alinear la Luna con la DirectionalLight nocturna en Gala Imperial
    if (nightMix >= 0.5 && Array.isArray(theme.sunPosition) && theme.sunPosition.length === 3) {
      this.#moonDir.set(theme.sunPosition[0], theme.sunPosition[1], theme.sunPosition[2]);
      if (this.#moonDir.y < 8) this.#moonDir.y = 28;
      this.#moonDir.normalize();
    } else {
      this.#moonDir.copy(this.#defaultTwilightMoonDir);
    }
    this.#updateMoonPlacement();

    if (!wasNight && starsOpacity > 0.5) {
      // Primera estrella fugaz pronta pero dentro del rango natural de 4-8s
      this.#shootingCooldown = 4.0 + Math.random() * 2.2;
    }

    this.#syncVisibility();
  }

  setQuality(quality, pixelRatio = this.#pixelRatio) {
    this.#quality = quality;
    this.setPixelRatio(pixelRatio);

    const drawCount = QUALITY_STAR_COUNTS[quality] ?? DISTANT_STAR_COUNTS_FALLBACK(quality);
    this.#distantStars?.geometry?.setDrawRange(0, drawCount);
  }

  setPixelRatio(pixelRatio) {
    if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) return;
    this.#pixelRatio = pixelRatio;
    if (this.#distantStars) this.#distantStars.material.uniforms.uPixelRatio.value = pixelRatio;
    if (this.#brightStars) this.#brightStars.material.uniforms.uPixelRatio.value = pixelRatio;
    if (this.#constellationStars) this.#constellationStars.material.uniforms.uPixelRatio.value = pixelRatio;
  }

  update(dt) {
    this.#elapsed += dt;

    if (this.#skyDome) {
      this.#skyDome.material.uniforms.uTime.value = this.#elapsed;
    }

    if (this.#starsOpacity > 0.01 && this.#celestialSpinner) {
      this.#celestialSpinner.rotation.y = (this.#celestialSpinner.rotation.y + dt * 0.0045) % (Math.PI * 2);
      const spinYaw = this.#celestialSpinner.rotation.y;

      if (this.#skyDome) {
        this.#skyDome.material.uniforms.uSpinYaw.value = spinYaw;
      }
      if (this.#distantStars) {
        const u = this.#distantStars.material.uniforms;
        u.uTime.value = this.#elapsed;
        u.uSpinYaw.value = spinYaw;
      }
      if (this.#brightStars) {
        const u = this.#brightStars.material.uniforms;
        u.uTime.value = this.#elapsed;
        u.uSpinYaw.value = spinYaw;
      }
      if (this.#constellationStars) {
        const u = this.#constellationStars.material.uniforms;
        u.uTime.value = this.#elapsed;
        u.uSpinYaw.value = spinYaw;
      }
      if (this.#constellationLines) {
        const pulse = 0.92 + 0.08 * Math.sin(this.#elapsed * 0.85);
        this.#constellationLines.material.opacity = 0.16 * this.#starsOpacity * pulse;
      }
    }

    if (this.#moonOpacity > 0.01 && this.#moonHalo) {
      const haloMix = Math.max(this.#moonOpacity, this.#starsOpacity * 0.85);
      const shimmer = 0.95 + 0.05 * Math.sin(this.#elapsed * 1.1);
      this.#moonHalo.material.opacity = haloMix * 0.64 * shimmer;
    }

    this.#updateShootingStars(dt);
  }

  syncToCamera(camera) {
    if (!camera || !this.#root) return;
    this.#root.position.copy(camera.position);
    const scale = (camera.far * 0.86) / BASE_RADIUS;
    if (Math.abs(scale - this.#lastCameraScale) > 1e-4) {
      this.#lastCameraScale = scale;
      this.#root.scale.setScalar(scale);
    }
  }

  dispose() {
    if (this.#root?.parent) {
      this.#root.parent.remove(this.#root);
    }

    this.#skyDome?.geometry?.dispose();
    this.#skyDome?.material?.dispose();

    this.#moonMesh?.geometry?.dispose();
    this.#moonMesh?.material?.dispose();
    this.#moonHalo?.material?.dispose();
    this.#moonTex?.dispose();
    this.#haloTex?.dispose();

    this.#distantStars?.geometry?.dispose();
    this.#distantStars?.material?.dispose();

    this.#brightStars?.geometry?.dispose();
    this.#brightStars?.material?.dispose();

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
    this.#moonMesh = null;
    this.#moonHalo = null;
    this.#moonTex = null;
    this.#haloTex = null;
    this.#distantStars = null;
    this.#brightStars = null;
    this.#constellationStars = null;
    this.#constellationLines = null;
    this.#shootingRibbonGeo = null;
    this.#celestialSpinner = null;
    this.#root = null;
  }
}

function DISTANT_STAR_COUNTS_FALLBACK() {
  return DISTANT_STAR_COUNT;
}
