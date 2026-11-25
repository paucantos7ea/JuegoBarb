import * as THREE from 'three';
import { GraphicsSync, createContactShadow } from '../core/Engine.js';

const FOUNTAIN_SPECS = [
  {
    id: 'central_imperial',
    x: 0.0,
    z: 0.0,
    tiers: 3,
    outerR: 5.6,
    colliderR: 5.65,
    exclusionR: 14.8,
    accentHex: 0x48f0ff,
    crystalHex: 0xf4a8ff,
    crystalEmissiveHex: 0xe866c4
  },
  {
    id: 'boulevard_north',
    x: 80.0,
    z: -10.5,
    tiers: 2,
    outerR: 2.75,
    colliderR: 2.85,
    exclusionR: 5.2,
    accentHex: 0xffd896,
    crystalHex: 0xffdff2,
    crystalEmissiveHex: 0xf078be
  },
  {
    id: 'boulevard_south',
    x: 80.0,
    z: 10.5,
    tiers: 2,
    outerR: 2.75,
    colliderR: 2.85,
    exclusionR: 5.2,
    accentHex: 0xffd896,
    crystalHex: 0xffdff2,
    crystalEmissiveHex: 0xf078be
  },
  {
    id: 'casino_vip_north',
    x: 162.0,
    z: -48.0,
    tiers: 3,
    outerR: 4.0,
    colliderR: 4.1,
    exclusionR: 9.4,
    accentHex: 0xff8ad8,
    crystalHex: 0xffdff2,
    crystalEmissiveHex: 0xf06eb8
  },
  {
    id: 'casino_vip_south',
    x: 162.0,
    z: 48.0,
    tiers: 3,
    outerR: 4.0,
    colliderR: 4.1,
    exclusionR: 9.4,
    accentHex: 0x48f0ff,
    crystalHex: 0xd4fbff,
    crystalEmissiveHex: 0x3ad1e8
  }
];

function pseudoRand(seed) {
  const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Sistema de Fuentes Barrocas Monumentales:
 * - Escultura de revolución (LatheGeometry) con doble cornisa, pedestal estriado, copas festoneadas y boquillas doradas.
 * - Shader de agua GLSL conectado a GraphicsSync con ondas de impacto, cáusticas y luminiscencia subacuática HDR.
 * - Chorros parabólicos y gotas balísticas calculadas 100% en GPU (Vertex Shader) + velos de desbordamiento + bruma.
 * - 0 luces dinámicas extra (solo emisivo HDR + UnrealBloomPass + PMREM).
 */
export class FountainSystem {
  #scene;
  #collision;
  #root = null;
  #geometries = [];
  #materials = [];
  #ownedTextures = [];
  #contactShadows = [];
  #finials = [];
  #exclusionZones = [];
  #elapsed = 0;

  #veilMat = null;
  #dropletInst = null;
  #mistPoints = null;
  #crystalMats = [];

  constructor(scene, collisionSystem) {
    this.#scene = scene;
    this.#collision = collisionSystem;
  }

  init() {
    this.#root = new THREE.Group();
    this.#root.name = 'BaroqueFountainSystem';

    const marbleTex = this.#createBaroqueMarbleTexture();
    const goldTex = this.#createAgedGoldTexture();
    const mosaicTex = this.#createUnderwaterMosaicTexture();

    const marbleMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: marbleTex,
        color: 0xffffff,
        roughness: 0.28,
        metalness: 0.05
      })
    );

    const goldMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: goldTex,
        color: 0xe8be6b,
        roughness: 0.24,
        metalness: 0.88
      })
    );

    const mosaicMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: mosaicTex,
        color: 0xffffff,
        roughness: 0.36,
        metalness: 0.14
      })
    );

    this.#veilMat = this.#createOverflowVeilMaterial();

    const dropletSpecs = [];
    const mistSpecs = [];

    for (let i = 0; i < FOUNTAIN_SPECS.length; i++) {
      this.#buildBaroqueFountain(
        FOUNTAIN_SPECS[i],
        i,
        { marbleMat, goldMat, mosaicMat },
        dropletSpecs,
        mistSpecs
      );
    }

    this.#buildBallisticDropletsGPU(dropletSpecs);
    this.#buildImpactMistGPU(mistSpecs);

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

  // ---------------------------------------------------------------------------
  // Texturas procedurales PBR 512x512 compartidas
  // ---------------------------------------------------------------------------

  #createBaroqueMarbleTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, '#faf3f6');
    grad.addColorStop(0.65, '#f2e6ec');
    grad.addColorStop(1, '#d8ccd4'); // Leve oscurecimiento húmedo en la base
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 110; i++) {
      const x = pseudoRand(i * 3.7) * size;
      const y = pseudoRand(i * 7.1) * size;
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(205, 172, 188, 0.22)' : 'rgba(255, 255, 255, 0.30)';
      ctx.lineWidth = 1.0 + pseudoRand(i * 2.1) * 2.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + 48, y - 22, x + 96, y + 28, x + 152, y + 10);
      ctx.stroke();
    }

    const tex = this.#trackTex(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }

  #createAgedGoldTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#f3d488');
    grad.addColorStop(0.5, '#e8be6b');
    grad.addColorStop(1, '#c99b44');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 240; i++) {
      const x = pseudoRand(i * 5.3) * size;
      const y = pseudoRand(i * 8.9) * size;
      const r = 4 + pseudoRand(i * 2.7) * 16;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 245, 200, 0.14)' : 'rgba(130, 92, 32, 0.12)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = this.#trackTex(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  #createUnderwaterMosaicTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const c = size * 0.5;

    const grad = ctx.createRadialGradient(c, c, 8, c, c, c);
    grad.addColorStop(0, '#2bb8cc');
    grad.addColorStop(0.55, '#196982');
    grad.addColorStop(1, '#0f3b52');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Teselas radiales turquesa y oro
    const rings = 10;
    for (let r = 1; r <= rings; r++) {
      const rad = (r / rings) * (c * 0.94);
      const tiles = Math.max(8, Math.round(r * 7));
      for (let t = 0; t < tiles; t++) {
        const a = (t / tiles) * Math.PI * 2;
        const tx = c + Math.cos(a) * rad;
        const ty = c + Math.sin(a) * rad;
        ctx.save();
        ctx.translate(tx, ty);
        ctx.rotate(a);
        ctx.fillStyle = (r + t) % 5 === 0
          ? 'rgba(236, 194, 108, 0.52)'
          : ((r + t) % 2 === 0 ? 'rgba(84, 224, 242, 0.34)' : 'rgba(24, 114, 144, 0.45)');
        ctx.fillRect(-7, -7, 14, 14);
        ctx.restore();
      }
    }

    const tex = this.#trackTex(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  // ---------------------------------------------------------------------------
  // Shaders GLSL de agua de estanque + velos de desbordamiento
  // ---------------------------------------------------------------------------

  #createFountainWaterMaterial(outerRadius, impactRadius, accentHex) {
    const mat = this.#trackMat(
      new THREE.ShaderMaterial({
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
          uOuterRadius: { value: outerRadius },
          uImpactRadius: { value: impactRadius },
          uGlowColor: { value: new THREE.Color(accentHex) }
        },
        vertexShader: /* glsl */ `
          varying vec2 vLocalXZ;
          varying vec3 vWorldPos;
          void main() {
            vLocalXZ = position.xz;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
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
          uniform vec3 uFogColor;
          uniform float uFogDensity;
          uniform float uNightFactor;
          uniform float uOuterRadius;
          uniform float uImpactRadius;
          uniform vec3 uGlowColor;

          varying vec2 vLocalXZ;
          varying vec3 vWorldPos;

          void main() {
            float r = length(vLocalXZ);
            float rn = clamp(r / max(uOuterRadius, 0.01), 0.0, 1.0);

            // Ondas concéntricas desde el centro y anillo de impacto de chorros parabólicos
            float wCenter = sin(r * 14.0 - uTime * 4.4) * exp(-r * 0.35);
            float distImpact = abs(r - uImpactRadius);
            float wImpact = sin(distImpact * 18.0 - uTime * 6.2) * exp(-distImpact * 1.45);
            float wave = wCenter * 0.55 + wImpact * 0.85;

            vec2 radialDir = r > 0.001 ? vLocalXZ / r : vec2(0.0, 1.0);
            float dWave = cos(r * 14.0 - uTime * 4.4) * 0.14 + cos(distImpact * 18.0 - uTime * 6.2) * exp(-distImpact * 1.45) * 0.22;
            vec3 N = normalize(vec3(-radialDir.x * dWave, 1.0, -radialDir.y * dWave));
            vec3 V = normalize(cameraPosition - vWorldPos);
            vec3 L = normalize(uMoonDir);

            // Cáusticas animadas sobre el mosaico subacuático
            float c1 = abs(sin(vLocalXZ.x * 3.8 + uTime * 1.6 + sin(vLocalXZ.y * 3.4 - uTime * 1.2)));
            float c2 = abs(cos(vLocalXZ.y * 4.2 - uTime * 1.9 + cos(vLocalXZ.x * 3.1 + uTime * 1.1)));
            float caustics = pow(1.0 - smoothstep(0.0, 0.6, min(c1, c2)), 2.0);

            vec3 shallowCol = mix(vec3(0.22, 0.78, 0.86), vec3(0.10, 0.44, 0.60), uNightFactor);
            vec3 deepCol = mix(vec3(0.08, 0.34, 0.52), vec3(0.04, 0.14, 0.30), uNightFactor);
            vec3 baseCol = mix(deepCol, shallowCol, smoothstep(0.35, 0.96, rn));
            baseCol += vec3(0.38, 0.88, 0.98) * caustics * 0.42;

            // Fresnel de Schlick + cielo reflejado
            float NdotV = max(dot(N, V), 0.0);
            float fresnel = 0.04 + 0.96 * pow(1.0 - NdotV, 4.2);
            vec3 R = reflect(-V, N);
            float rUp = clamp(R.y, 0.0, 1.0);
            vec3 skyRefl = mix(uSkyHorizon, uSkyMid, smoothstep(0.0, 0.35, rUp));
            skyRefl = mix(skyRefl, uSkyZenith, smoothstep(0.35, 0.85, rUp));
            vec3 col = mix(baseCol, skyRefl, clamp(fresnel * 0.82, 0.0, 0.90));

            // Destello especular lunar
            vec3 H = normalize(L + V);
            float NdotH = max(dot(N, H), 0.0);
            col += uMoonColor * (pow(NdotH, 140.0) * 2.1 + pow(NdotH, 24.0) * 0.28);

            // Luminiscencia subacuática HDR en anillo interior del estanque (0 PointLights)
            float rimGlow = exp(-pow((rn - 0.82) / 0.18, 2.0));
            float impactRing = exp(-distImpact * 2.2) * (0.65 + 0.35 * sin(uTime * 3.0));
            float nightBoost = mix(0.28, 1.38, uNightFactor);
            col += uGlowColor * (rimGlow * 0.95 + impactRing * 0.85) * nightBoost;

            // Espuma suave en zona de impacto de chorros
            float splashFoam = smoothstep(0.45, 0.0, distImpact) * (0.45 + 0.55 * abs(wave));
            col = mix(col, vec3(0.92, 0.98, 1.0), splashFoam * 0.55);

            float distToCam = length(cameraPosition - vWorldPos);
            float fogFactor = 1.0 - exp(-pow(uFogDensity * distToCam, 2.0));
            col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));

            float alpha = clamp(0.76 + splashFoam * 0.18 + rimGlow * 0.12, 0.0, 0.94);
            gl_FragColor = vec4(col, alpha);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `
      })
    );
    mat.userData = { isVfx: true };
    return mat;
  }

  #createOverflowVeilMaterial() {
    const mat = this.#trackMat(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: GraphicsSync.uTime,
          uNightFactor: GraphicsSync.uNightFactor
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform float uNightFactor;
          varying vec2 vUv;
          void main() {
            float flow = vUv.y + uTime * 1.85;
            float streak1 = sin(vUv.x * 48.0 + sin(flow * 4.0) * 1.4) * 0.5 + 0.5;
            float streak2 = cos(vUv.x * 84.0 - flow * 9.0) * 0.5 + 0.5;
            float foam = smoothstep(0.35, 0.95, streak1 * 0.6 + streak2 * 0.4);
            float edge = sin(vUv.y * 3.14159265);
            vec3 col = mix(vec3(0.68, 0.94, 1.0), vec3(1.18, 1.24, 1.32), foam) * mix(0.95, 0.85, uNightFactor);
            float alpha = clamp((0.28 + foam * 0.45) * (0.45 + 0.55 * edge), 0.0, 0.78);
            gl_FragColor = vec4(col, alpha);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `
      })
    );
    mat.userData = { isVfx: true };
    return mat;
  }

  // ---------------------------------------------------------------------------
  // Escultura de cada fuente barroca + registro de chorros GPU
  // ---------------------------------------------------------------------------

  #buildBaroqueFountain(spec, index, mats, dropletSpecs, mistSpecs) {
    const { x, z, tiers, outerR, colliderR, exclusionR, accentHex, crystalHex, crystalEmissiveHex } = spec;
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const scale = outerR / 5.6;

    // 1. Estanque con doble cornisa moldurada (LatheGeometry de 44 segmentos)
    const rimH = 0.72 * Math.max(0.75, scale * 0.92);
    const basinProfile = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(outerR + 0.44 * scale, 0.0),
      new THREE.Vector2(outerR + 0.44 * scale, 0.12),
      new THREE.Vector2(outerR + 0.24 * scale, 0.16),
      new THREE.Vector2(outerR + 0.16 * scale, rimH * 0.48),
      new THREE.Vector2(outerR + 0.06 * scale, rimH * 0.78),
      new THREE.Vector2(outerR + 0.20 * scale, rimH * 0.90),
      new THREE.Vector2(outerR + 0.16 * scale, rimH),
      new THREE.Vector2(outerR - 0.18 * scale, rimH),
      new THREE.Vector2(outerR - 0.24 * scale, rimH * 0.22),
      new THREE.Vector2(0.0, rimH * 0.20)
    ];
    const basinGeo = this.#trackGeo(new THREE.LatheGeometry(basinProfile, 44));
    const basinMesh = new THREE.Mesh(basinGeo, mats.marbleMat);
    basinMesh.castShadow = true;
    basinMesh.receiveShadow = true;
    group.add(basinMesh);

    // Cornisa dorada perimetral del estanque
    const rimRingGeo = this.#trackGeo(new THREE.TorusGeometry(outerR + 0.04 * scale, 0.095 * Math.max(0.78, scale), 10, 48));
    rimRingGeo.rotateX(Math.PI / 2);
    const rimRing = new THREE.Mesh(rimRingGeo, mats.goldMat);
    rimRing.position.y = rimH;
    rimRing.castShadow = true;
    group.add(rimRing);

    // Mosaico subacuático en el fondo del estanque
    const innerR = outerR - 0.26 * scale;
    const mosaicGeo = this.#trackGeo(new THREE.CircleGeometry(innerR, 40));
    mosaicGeo.rotateX(-Math.PI / 2);
    const mosaicMesh = new THREE.Mesh(mosaicGeo, mats.mosaicMat);
    mosaicMesh.position.y = rimH * 0.23;
    mosaicMesh.receiveShadow = true;
    group.add(mosaicMesh);

    // Superficie de agua GLSL del vaso inferior
    const waterY = rimH * 0.84;
    const impactR = outerR * 0.62;
    const basinWaterGeo = this.#trackGeo(new THREE.CircleGeometry(innerR * 0.99, 44));
    basinWaterGeo.rotateX(-Math.PI / 2);
    const basinWaterMat = this.#createFountainWaterMaterial(innerR, impactR, accentHex);
    const basinWaterMesh = new THREE.Mesh(basinWaterGeo, basinWaterMat);
    basinWaterMesh.position.y = waterY;
    basinWaterMesh.renderOrder = -4;
    group.add(basinWaterMesh);

    // 2. Pedestal barroco estriado y copas escalonadas (2 o 3 niveles)
    const tierRadii = tiers === 3
      ? [outerR * 0.56, outerR * 0.31]
      : [outerR * 0.45];
    const tierHeights = tiers === 3
      ? [rimH + 1.85 * Math.max(0.78, scale), rimH + 3.65 * Math.max(0.78, scale)]
      : [rimH + 1.45 * Math.max(0.78, scale)];

    // Columna central esculpida
    const topTierH = tierHeights[tierHeights.length - 1];
    const spireH = topTierH + 1.18 * Math.max(0.82, scale);
    const colProfile = [
      new THREE.Vector2(0.0, rimH * 0.22),
      new THREE.Vector2(0.82 * scale, rimH * 0.22),
      new THREE.Vector2(0.68 * scale, rimH + 0.35),
      new THREE.Vector2(0.46 * scale, rimH + 0.95),
      new THREE.Vector2(0.60 * scale, tierHeights[0] - 0.25),
      new THREE.Vector2(0.36 * scale, topTierH - 0.15),
      new THREE.Vector2(0.24 * scale, spireH),
      new THREE.Vector2(0.0, spireH)
    ];
    const colGeo = this.#trackGeo(new THREE.LatheGeometry(colProfile, 36));
    const colMesh = new THREE.Mesh(colGeo, mats.marbleMat);
    colMesh.castShadow = true;
    colMesh.receiveShadow = true;
    group.add(colMesh);

    let prevBowlY = waterY;
    for (let t = 0; t < tierRadii.length; t++) {
      const br = tierRadii[t];
      const by = tierHeights[t];
      const bowlH = 0.46 * Math.max(0.76, scale);

      const bowlProfile = [
        new THREE.Vector2(0.18 * scale, by - bowlH),
        new THREE.Vector2(br * 0.48, by - bowlH * 0.62),
        new THREE.Vector2(br * 0.88, by - bowlH * 0.18),
        new THREE.Vector2(br, by),
        new THREE.Vector2(br * 0.91, by + 0.04),
        new THREE.Vector2(br * 0.82, by - bowlH * 0.25),
        new THREE.Vector2(0.20 * scale, by - bowlH * 0.28)
      ];
      const bowlGeo = this.#trackGeo(new THREE.LatheGeometry(bowlProfile, 36));
      const bowlMesh = new THREE.Mesh(bowlGeo, mats.marbleMat);
      bowlMesh.castShadow = true;
      bowlMesh.receiveShadow = true;
      group.add(bowlMesh);

      const bowlTrimGeo = this.#trackGeo(new THREE.TorusGeometry(br, 0.065 * Math.max(0.8, scale), 8, 36));
      bowlTrimGeo.rotateX(Math.PI / 2);
      const bowlTrim = new THREE.Mesh(bowlTrimGeo, mats.goldMat);
      bowlTrim.position.y = by + 0.02;
      group.add(bowlTrim);

      const bWaterGeo = this.#trackGeo(new THREE.CircleGeometry(br * 0.87, 32));
      bWaterGeo.rotateX(-Math.PI / 2);
      const bWaterMesh = new THREE.Mesh(bWaterGeo, this.#createFountainWaterMaterial(br * 0.87, br * 0.48, accentHex));
      bWaterMesh.position.y = by - 0.02;
      bWaterMesh.renderOrder = -4;
      group.add(bWaterMesh);

      // Velo de desbordamiento curvo cayendo de esta copa hacia la inferior
      const veilPts = [
        new THREE.Vector2(br * 0.96, by + 0.01),
        new THREE.Vector2(br * 1.03, by - 0.22),
        new THREE.Vector2(br * 1.06, (by + prevBowlY) * 0.5),
        new THREE.Vector2(br * 1.08, prevBowlY)
      ];
      const veilGeo = this.#trackGeo(new THREE.LatheGeometry(veilPts, 32));
      const veilMesh = new THREE.Mesh(veilGeo, this.#veilMat);
      veilMesh.renderOrder = -3;
      group.add(veilMesh);

      prevBowlY = by;
    }

    // 3. Boquillas doradas ornamentales y chorros parabólicos hacia el estanque
    const spoutCount = tiers === 3 ? 8 : 4;
    const spoutR = tierRadii[0] * 0.92;
    const spoutY = tierHeights[0] - 0.06;
    const spoutCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.22 * scale, 0.08 * scale, 0),
      new THREE.Vector3(0.34 * scale, 0.14 * scale, 0)
    ]);
    const spoutGeo = this.#trackGeo(new THREE.TubeGeometry(spoutCurve, 8, 0.055 * Math.max(0.8, scale), 7, false));

    for (let s = 0; s < spoutCount; s++) {
      const ang = (s / spoutCount) * Math.PI * 2;
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);

      const spout = new THREE.Mesh(spoutGeo, mats.goldMat);
      spout.position.set(cosA * spoutR, spoutY, sinA * spoutR);
      spout.rotation.y = -ang;
      group.add(spout);

      // Arcos parabólicos balísticos desde la boquilla hasta impactR en el vaso inferior
      const startX = x + cosA * (spoutR + 0.34 * scale);
      const startY = spoutY + 0.14 * scale;
      const startZ = z + sinA * (spoutR + 0.34 * scale);
      const endX = x + cosA * impactR;
      const endZ = z + sinA * impactR;
      const flightT = 0.86;
      const vy0 = (waterY - startY + 0.5 * 9.8 * flightT * flightT) / flightT;
      const vx0 = (endX - startX) / flightT;
      const vz0 = (endZ - startZ) / flightT;

      const dropsPerSpout = 26;
      for (let d = 0; d < dropsPerSpout; d++) {
        dropletSpecs.push({
          ox: startX,
          oy: startY,
          oz: startZ,
          vx: vx0 + (pseudoRand(s * 31 + d + index * 7) - 0.5) * 0.16,
          vy: vy0 + (pseudoRand(s * 17 + d + index * 11) - 0.5) * 0.22,
          vz: vz0 + (pseudoRand(s * 23 + d + index * 13) - 0.5) * 0.16,
          phase: d / dropsPerSpout,
          speed: 1.0 / flightT,
          scale: 0.85 + pseudoRand(d * 7.3 + s) * 0.55
        });
      }

      mistSpecs.push({
        x: endX,
        y: waterY + 0.12,
        z: endZ,
        phase: (s / spoutCount) + index * 0.21,
        accentHex
      });
    }

    // Penacho central vertical desde el remate hasta la copa superior
    const plumeDrops = 48;
    const plumeBaseY = spireH + 0.08;
    const plumeFlight = 0.78;
    const topBowlTargetY = topTierH;
    const plumeVy = (topBowlTargetY - plumeBaseY + 0.5 * 9.8 * plumeFlight * plumeFlight) / plumeFlight;
    for (let d = 0; d < plumeDrops; d++) {
      const ang = pseudoRand(d * 13.7 + index * 19) * Math.PI * 2;
      const spread = 0.35 + pseudoRand(d * 5.9 + index) * (tierRadii[tierRadii.length - 1] * 0.45);
      dropletSpecs.push({
        ox: x,
        oy: plumeBaseY,
        oz: z,
        vx: Math.cos(ang) * spread / plumeFlight,
        vy: plumeVy + pseudoRand(d * 3.1) * 0.85,
        vz: Math.sin(ang) * spread / plumeFlight,
        phase: d / plumeDrops,
        speed: 1.0 / plumeFlight,
        scale: 0.90 + pseudoRand(d * 4.7) * 0.5
      });
    }

    // 4. Remate de corona / cristal imperial HDR giratorio (0 PointLights)
    const crownRingGeo = this.#trackGeo(new THREE.TorusGeometry(0.45 * Math.max(0.8, scale), 0.045, 8, 24));
    const crownRing = new THREE.Mesh(crownRingGeo, mats.goldMat);
    crownRing.position.y = spireH + 0.48 * Math.max(0.85, scale);
    group.add(crownRing);

    const crystalMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: crystalHex,
        emissive: crystalEmissiveHex,
        emissiveIntensity: 1.55,
        roughness: 0.14,
        metalness: 0.25,
        transparent: true,
        opacity: 0.90
      })
    );
    crystalMat.userData.preserveRoughness = true;
    this.#crystalMats.push(crystalMat);

    const crystalGeo = this.#trackGeo(new THREE.OctahedronGeometry(0.38 * Math.max(0.8, scale), 0));
    const crystal = new THREE.Mesh(crystalGeo, crystalMat);
    crystal.scale.set(0.92, 1.38, 0.92);
    crystal.position.y = crownRing.position.y;
    group.add(crystal);

    this.#finials.push({
      crystal,
      ring: crownRing,
      baseY: crownRing.position.y,
      phase: index * 1.4
    });

    // 5. Sombra de contacto en base de mármol
    const shadow = createContactShadow(outerR * 1.14, 0.42);
    shadow.position.set(x, 0.022, z);
    this.#contactShadows.push(shadow);
    this.#root.add(shadow);

    // 6. Colisionador y zona de exclusión para FoliageSystem
    this.#collision?.addCylinderCollider(x, z, colliderR, 0, spireH + 1.0);
    this.#exclusionZones.push({ x, z, radius: exclusionR });

    this.#root.add(group);
  }

  // ---------------------------------------------------------------------------
  // Gotas parabólicas GPU (Vertex Shader balístico) y bruma de impacto
  // ---------------------------------------------------------------------------

  #buildBallisticDropletsGPU(specs) {
    if (specs.length === 0) return;
    const count = specs.length;
    const geo = this.#trackGeo(new THREE.SphereGeometry(0.055, 6, 5));

    const origins = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const speeds = new Float32Array(count);
    const scales = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const s = specs[i];
      origins[i * 3] = s.ox;
      origins[i * 3 + 1] = s.oy;
      origins[i * 3 + 2] = s.oz;
      velocities[i * 3] = s.vx;
      velocities[i * 3 + 1] = s.vy;
      velocities[i * 3 + 2] = s.vz;
      phases[i] = s.phase;
      speeds[i] = s.speed;
      scales[i] = s.scale;
    }

    geo.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(origins, 3));
    geo.setAttribute('aVelocity', new THREE.InstancedBufferAttribute(velocities, 3));
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    geo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(speeds, 1));
    geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(scales, 1));

    const mat = this.#trackMat(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: GraphicsSync.uTime,
          uNightFactor: GraphicsSync.uNightFactor,
          uMoonColor: GraphicsSync.uMoonColor
        },
        vertexShader: /* glsl */ `
          attribute vec3 aOrigin;
          attribute vec3 aVelocity;
          attribute float aPhase;
          attribute float aSpeed;
          attribute float aScale;

          uniform float uTime;
          varying float vAlpha;

          void main() {
            float life = fract(uTime * aSpeed + aPhase);
            float tSec = life / max(aSpeed, 0.01);
            vec3 worldCenter = aOrigin + aVelocity * tSec + vec3(0.0, -4.9 * tSec * tSec, 0.0);

            // Estiramiento sutil en dirección de velocidad balística
            vec3 velNow = aVelocity + vec3(0.0, -9.8 * tSec, 0.0);
            float stretch = 1.0 + min(1.4, length(velNow) * 0.14);
            vec3 local = position * vec3(aScale, aScale * stretch, aScale);

            vAlpha = sin(life * 3.14159265);
            gl_Position = projectionMatrix * viewMatrix * vec4(worldCenter + local, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uNightFactor;
          uniform vec3 uMoonColor;
          varying float vAlpha;

          void main() {
            vec3 col = mix(vec3(0.88, 0.98, 1.05), vec3(0.82, 0.96, 1.18) * mix(vec3(1.0), uMoonColor, 0.35), uNightFactor);
            float a = clamp(vAlpha * 0.85, 0.0, 0.92);
            if (a <= 0.01) discard;
            gl_FragColor = vec4(col, a);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `
      })
    );
    mat.userData = { isVfx: true };

    this.#dropletInst = new THREE.InstancedMesh(geo, mat, count);
    this.#dropletInst.frustumCulled = false;
    this.#dropletInst.castShadow = false;
    this.#dropletInst.receiveShadow = false;
    const identity = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      this.#dropletInst.setMatrixAt(i, identity);
    }
    this.#dropletInst.instanceMatrix.needsUpdate = true;
    this.#root.add(this.#dropletInst);
  }

  #buildImpactMistGPU(specs) {
    if (specs.length === 0) return;
    const perZone = 6;
    const total = specs.length * perZone;
    const pos = new Float32Array(total * 3);
    const phase = new Float32Array(total);
    const col = new Float32Array(total * 3);
    const tmpCol = new THREE.Color();

    let idx = 0;
    for (let i = 0; i < specs.length; i++) {
      const s = specs[i];
      tmpCol.setHex(s.accentHex);
      for (let k = 0; k < perZone; k++) {
        const ang = (k / perZone) * Math.PI * 2;
        pos[idx * 3] = s.x + Math.cos(ang) * 0.25;
        pos[idx * 3 + 1] = s.y;
        pos[idx * 3 + 2] = s.z + Math.sin(ang) * 0.25;
        phase[idx] = s.phase + k * 0.17;
        col[idx * 3] = 0.72 + tmpCol.r * 0.35;
        col[idx * 3 + 1] = 0.88 + tmpCol.g * 0.25;
        col[idx * 3 + 2] = 0.98 + tmpCol.b * 0.22;
        idx++;
      }
    }

    const geo = this.#trackGeo(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));

    const mat = this.#trackMat(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: GraphicsSync.uTime,
          uNightFactor: GraphicsSync.uNightFactor
        },
        vertexShader: /* glsl */ `
          attribute float aPhase;
          attribute vec3 aColor;
          uniform float uTime;
          varying vec3 vColor;
          varying float vAlpha;

          void main() {
            float life = fract(uTime * 0.65 + aPhase);
            vec3 p = position + vec3(sin(uTime * 1.4 + aPhase * 6.28) * 0.16, life * 0.55, cos(uTime * 1.2 + aPhase * 6.28) * 0.16);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = clamp(240.0 / max(1.0, -mv.z), 4.0, 22.0);
            vColor = aColor;
            vAlpha = sin(life * 3.14159265) * 0.34;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uNightFactor;
          varying vec3 vColor;
          varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            if (d > 0.5) discard;
            float soft = exp(-d * d * 12.0);
            float a = soft * vAlpha * mix(0.65, 1.0, uNightFactor);
            if (a <= 0.004) discard;
            gl_FragColor = vec4(vColor * a, a);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `
      })
    );
    mat.userData = { isVfx: true };

    this.#mistPoints = new THREE.Points(geo, mat);
    this.#mistPoints.frustumCulled = false;
    this.#root.add(this.#mistPoints);
  }

  getFountainExclusionZones() {
    return this.#exclusionZones;
  }

  applyTheme(theme) {
    if (!theme) return;
    const cryEm = theme.crystalEmissive ?? 0.65;
    for (let i = 0; i < this.#crystalMats.length; i++) {
      this.#crystalMats[i].emissiveIntensity = 0.65 + cryEm * 0.72;
    }
  }

  update(delta, elapsed) {
    const dt = Math.min(delta, 0.1);
    this.#elapsed = elapsed !== undefined ? elapsed : this.#elapsed + dt;
    const t = this.#elapsed;

    for (let i = 0; i < this.#finials.length; i++) {
      const f = this.#finials[i];
      f.crystal.rotation.y += dt * 1.25;
      f.crystal.position.y = f.baseY + Math.sin(t * 2.2 + f.phase) * 0.08;
      f.ring.rotation.y -= dt * 0.85;
      f.ring.rotation.x = Math.sin(t * 1.1 + f.phase) * 0.35;
      f.ring.position.y = f.crystal.position.y;
    }
  }

  dispose() {
    if (this.#root) {
      this.#scene?.remove(this.#root);
      this.#root = null;
    }
    this.#dropletInst?.dispose?.();
    this.#dropletInst = null;
    this.#mistPoints = null;
    for (let i = 0; i < this.#contactShadows.length; i++) {
      this.#contactShadows[i].geometry?.dispose();
      this.#contactShadows[i].material?.dispose();
    }
    for (let i = 0; i < this.#geometries.length; i++) this.#geometries[i].dispose();
    for (let i = 0; i < this.#materials.length; i++) this.#materials[i].dispose();
    for (let i = 0; i < this.#ownedTextures.length; i++) this.#ownedTextures[i].dispose();

    this.#contactShadows.length = 0;
    this.#geometries.length = 0;
    this.#materials.length = 0;
    this.#ownedTextures.length = 0;
    this.#finials.length = 0;
    this.#exclusionZones.length = 0;
    this.#crystalMats.length = 0;
    this.#veilMat = null;
  }
}
