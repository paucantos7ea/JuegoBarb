import * as THREE from 'three';
import { GraphicsSync, getSharedContactShadowTexture } from '../core/Engine.js';

const IS_LOW_CORE =
  typeof navigator !== 'undefined' &&
  typeof navigator.hardwareConcurrency === 'number' &&
  navigator.hardwareConcurrency <= 4;

const GRASS_TARGET_COUNT = IS_LOW_CORE ? 10000 : 20000;
const FLOWER_TARGET_COUNT = IS_LOW_CORE ? 900 : 1500;
const FIREFLY_COUNT = 180;

function pseudoRand(seed) {
  const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Pradera viva instanciada en GPU:
 * - Césped esculpido de 3 briznas curvadas (10.000–20.000 instancias) con viento sincronizado,
 *   doblado interactivo por actores (uGrassActors[4]), translucidez lunar y distance fade (58m–82m).
 * - Flores silvestres imperiales (~900–1.500) con pistilos lunares HDR.
 * - Luciérnagas / polen luminoso nocturno 100% en GPU (THREE.Points).
 * - Sombras de contacto instanciadas (1 draw call) bajo árboles, farolas de jardín y rocas.
 */
export class FoliageSystem {
  #scene;
  #decor;
  #waterSystem;
  #fountainSystem;
  #flora;

  #root = null;
  #geometries = [];
  #materials = [];
  #instancedMeshes = [];
  #grassMat = null;
  #flowerMat = null;
  #fireflyPoints = null;

  #waterSample = { inWater: false, surfaceY: 0, depth: 0, flowX: 0, flowZ: 0, distToBank: 99 };

  constructor(scene, { worldDecor, waterSystem, fountainSystem, flora }) {
    this.#scene = scene;
    this.#decor = worldDecor;
    this.#waterSystem = waterSystem;
    this.#fountainSystem = fountainSystem;
    this.#flora = flora;
  }

  init() {
    this.#root = new THREE.Group();
    this.#root.name = 'ImperialFoliageSystem';

    this.#buildGrassInstanced();
    this.#buildWildflowersInstanced();
    this.#buildFirefliesGPU();
    this.#buildWorldContactShadows();

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

  #isValidMeadowPoint(x, z, margin = 0.65) {
    if (this.#decor?.isExcludedZone?.(x, z, margin)) return false;
    if (this.#decor?.isNearStonePath?.(x, z)) return false;

    if (this.#waterSystem) {
      this.#waterSystem.sampleWater(x, z, this.#waterSample);
      if (this.#waterSample.inWater || this.#waterSample.distToBank <= 0.65) return false;
      if (this.#waterSystem.getBridgeHeightAt(x, z) !== null) return false;
    }

    const fountains = this.#fountainSystem?.getFountainExclusionZones?.();
    if (fountains) {
      for (let i = 0; i < fountains.length; i++) {
        const f = fountains[i];
        const dx = x - f.x;
        const dz = z - f.z;
        if (dx * dx + dz * dz < (f.radius + margin) * (f.radius + margin)) return false;
      }
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // 1. Geometría esculpida de clump de 3 briznas curvadas (15 triángulos/clump)
  // ---------------------------------------------------------------------------

  #createSculptedGrassClumpGeometry() {
    const blades = 3;
    const segs = 3; // 2 quads + 1 triángulo punta = 5 tris por brizna
    const vertsPerBlade = 7;
    const totalVerts = blades * vertsPerBlade;
    const positions = new Float32Array(totalVerts * 3);
    const normals = new Float32Array(totalVerts * 3);
    const heights = new Float32Array(totalVerts);
    const indices = [];

    for (let b = 0; b < blades; b++) {
      const ang = (b / blades) * Math.PI * 2 + 0.35;
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);
      const perpX = -sinA;
      const perpZ = cosA;

      const baseOff = 0.025;
      const lean = 0.12 + (b % 2) * 0.05;
      const hMax = 0.36 + (b % 3) * 0.07;
      const baseW = 0.036;
      const vBase = b * vertsPerBlade;

      // 3 filas de 2 vértices + 1 punta
      for (let s = 0; s < segs; s++) {
        const t = s / segs;
        const y = t * hMax;
        const curveOut = baseOff + t * t * lean;
        const hw = baseW * (1.0 - t * 0.62);
        const cx = cosA * curveOut;
        const cz = sinA * curveOut;

        const iL = vBase + s * 2;
        const iR = iL + 1;

        positions[iL * 3] = cx - perpX * hw;
        positions[iL * 3 + 1] = y;
        positions[iL * 3 + 2] = cz - perpZ * hw;

        positions[iR * 3] = cx + perpX * hw;
        positions[iR * 3 + 1] = y;
        positions[iR * 3 + 2] = cz + perpZ * hw;

        // Normales suavizadas hacia arriba para evitar sombras duras artificiales
        normals[iL * 3] = cosA * 0.25;
        normals[iL * 3 + 1] = 0.96;
        normals[iL * 3 + 2] = sinA * 0.25;
        normals[iR * 3] = cosA * 0.25;
        normals[iR * 3 + 1] = 0.96;
        normals[iR * 3 + 2] = sinA * 0.25;

        heights[iL] = t;
        heights[iR] = t;
      }

      const tip = vBase + 6;
      positions[tip * 3] = cosA * (baseOff + lean);
      positions[tip * 3 + 1] = hMax;
      positions[tip * 3 + 2] = sinA * (baseOff + lean);
      normals[tip * 3] = cosA * 0.25;
      normals[tip * 3 + 1] = 0.96;
      normals[tip * 3 + 2] = sinA * 0.25;
      heights[tip] = 1.0;

      // Triángulos (doble cara en material)
      indices.push(
        vBase + 0, vBase + 1, vBase + 2,
        vBase + 1, vBase + 3, vBase + 2,
        vBase + 2, vBase + 3, vBase + 4,
        vBase + 3, vBase + 5, vBase + 4,
        vBase + 4, vBase + 5, tip
      );
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('aHeight', new THREE.BufferAttribute(heights, 1));
    geo.setIndex(indices);
    geo.computeBoundingSphere();
    return geo;
  }

  #buildGrassInstanced() {
    const geo = this.#trackGeo(this.#createSculptedGrassClumpGeometry());
    const trees = this.#flora?.getTreeRecords?.() || [];

    const positionsX = [];
    const positionsZ = [];
    const scales = [];
    const yaws = [];

    // Sembrado en cuadrícula jittered + refuerzo alrededor de árboles y claras
    const step = IS_LOW_CORE ? 1.82 : 1.26;
    let seed = 41.3;

    for (let x = -85; x <= 218 && positionsX.length < GRASS_TARGET_COUNT; x += step) {
      for (let z = -80; z <= 60 && positionsX.length < GRASS_TARGET_COUNT; z += step) {
        seed += 1.73;
        const jx = x + (pseudoRand(seed) - 0.5) * step * 0.96;
        const jz = z + (pseudoRand(seed + 4.9) - 0.5) * step * 0.96;
        if (!this.#isValidMeadowPoint(jx, jz, 0.55)) continue;

        positionsX.push(jx);
        positionsZ.push(jz);
        scales.push(0.75 + pseudoRand(seed + 9.7) * 0.72);
        yaws.push(pseudoRand(seed + 13.1) * Math.PI * 2);
      }
    }

    // Parches más densos alrededor de los árboles (respetando tronco)
    for (let t = 0; t < trees.length && positionsX.length < GRASS_TARGET_COUNT; t++) {
      const tr = trees[t];
      for (let k = 0; k < 10 && positionsX.length < GRASS_TARGET_COUNT; k++) {
        seed += 2.17;
        const ang = pseudoRand(seed) * Math.PI * 2;
        const rad = 1.05 + pseudoRand(seed + 3.3) * 3.4;
        const gx = tr.x + Math.cos(ang) * rad;
        const gz = tr.z + Math.sin(ang) * rad;
        if (!this.#isValidMeadowPoint(gx, gz, 0.55)) continue;
        positionsX.push(gx);
        positionsZ.push(gz);
        scales.push(0.85 + pseudoRand(seed + 7.1) * 0.65);
        yaws.push(pseudoRand(seed + 11.9) * Math.PI * 2);
      }
    }

    const count = positionsX.length;
    if (count === 0) return;

    const tints = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const palette = [
      [0.36, 0.78, 0.48],
      [0.44, 0.84, 0.52],
      [0.32, 0.68, 0.54],
      [0.48, 0.80, 0.44],
      [0.38, 0.74, 0.62]
    ];

    const mat = this.#trackMat(
      new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: {
          uTime: GraphicsSync.uTime,
          uWindDir: GraphicsSync.uWindDir,
          uWindStrength: GraphicsSync.uWindStrength,
          uGrassActors: GraphicsSync.uGrassActors,
          uMoonDir: GraphicsSync.uMoonDir,
          uMoonColor: GraphicsSync.uMoonColor,
          uSkyHorizon: GraphicsSync.uSkyHorizon,
          uFogColor: GraphicsSync.uFogColor,
          uFogDensity: GraphicsSync.uFogDensity,
          uNightFactor: GraphicsSync.uNightFactor
        },
        vertexShader: /* glsl */ `
          attribute float aHeight;
          attribute vec3 aTint;
          attribute float aPhase;

          uniform float uTime;
          uniform vec2 uWindDir;
          uniform float uWindStrength;
          uniform vec4 uGrassActors[4];

          varying float vHeight;
          varying vec3 vTint;
          varying vec3 vNormal;
          varying vec3 vWorldPos;

          void main() {
            vec3 rootWorld = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
            float camDist = length(cameraPosition - rootWorld);
            float distFade = 1.0 - smoothstep(58.0, 82.0, camDist);

            vec3 localPos = position * distFade;
            vec4 worldPos = instanceMatrix * vec4(localPos, 1.0);

            if (distFade > 0.001) {
              float h2 = aHeight * aHeight;
              float w1 = sin(dot(rootWorld.xz, uWindDir) * 0.24 - uTime * 2.1 + aPhase);
              float w2 = sin(dot(rootWorld.xz, vec2(-uWindDir.y, uWindDir.x)) * 0.42 - uTime * 3.1 + aPhase * 1.7);
              float gust = (w1 * 0.72 + w2 * 0.28) * uWindStrength * 0.26 * h2;
              worldPos.xz += uWindDir * gust;
              worldPos.y -= abs(gust) * 0.14;

              // Doblado interactivo al paso de jugador, caballos, compañero y ciervos
              for (int i = 0; i < 4; i++) {
                vec4 actor = uGrassActors[i];
                if (actor.w > 0.01) {
                  vec2 toBlade = worldPos.xz - actor.xz;
                  float d = length(toBlade);
                  if (d < actor.w && abs(worldPos.y - actor.y) < 1.8) {
                    float push = (1.0 - smoothstep(0.10, actor.w, d)) * aHeight;
                    vec2 pushDir = d > 0.001 ? toBlade / d : vec2(1.0, 0.0);
                    worldPos.xz += pushDir * push * 0.46;
                    worldPos.y -= push * 0.20;
                  }
                }
              }
            }

            vHeight = aHeight;
            vTint = aTint;
            vNormal = normalize(mat3(instanceMatrix) * normal);
            vWorldPos = worldPos.xyz;

            gl_Position = projectionMatrix * viewMatrix * worldPos;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uMoonDir;
          uniform vec3 uMoonColor;
          uniform vec3 uSkyHorizon;
          uniform vec3 uFogColor;
          uniform float uFogDensity;
          uniform float uNightFactor;

          varying float vHeight;
          varying vec3 vTint;
          varying vec3 vNormal;
          varying vec3 vWorldPos;

          void main() {
            vec3 N = normalize(vNormal);
            vec3 V = normalize(cameraPosition - vWorldPos);
            vec3 L = normalize(uMoonDir);

            float ao = mix(0.32, 1.0, vHeight);
            float NdotL = max(dot(N, L), 0.0);
            float rim = pow(1.0 - max(dot(N, V), 0.0), 2.4) * vHeight;

            vec3 dayCol = vTint * vec3(0.54, 0.86, 0.42) * (0.58 + 0.42 * NdotL)
              + vec3(0.95, 0.96, 0.62) * rim * 0.18;
            vec3 nightCol = vTint * mix(vec3(0.22, 0.46, 0.42), uSkyHorizon * 0.65, 0.18) * (0.48 + 0.52 * NdotL)
              + uMoonColor * rim * 0.26;

            vec3 col = mix(dayCol, nightCol, uNightFactor) * ao;

            float distToCam = length(cameraPosition - vWorldPos);
            float fogFactor = 1.0 - exp(-pow(uFogDensity * distToCam, 2.0));
            col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));

            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `
      })
    );
    mat.userData = { isVfx: true };
    this.#grassMat = mat;

    const inst = new THREE.InstancedMesh(geo, mat, count);
    inst.castShadow = false;
    inst.receiveShadow = false;
    inst.frustumCulled = false;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      dummy.position.set(positionsX[i], 0.0, positionsZ[i]);
      dummy.rotation.set(0, yaws[i], 0);
      dummy.scale.setScalar(scales[i]);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);

      const p = palette[i % palette.length];
      tints[i * 3] = p[0];
      tints[i * 3 + 1] = p[1];
      tints[i * 3 + 2] = p[2];
      phases[i] = pseudoRand(i * 4.3 + 2.1) * Math.PI * 2;
    }

    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 3));
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    inst.instanceMatrix.needsUpdate = true;
    inst.matrixAutoUpdate = false;
    inst.updateMatrix();

    this.#instancedMeshes.push(inst);
    this.#root.add(inst);
  }

  // ---------------------------------------------------------------------------
  // 2. Flores silvestres imperiales con pistilos lunares HDR
  // ---------------------------------------------------------------------------

  #createWildflowerGeometry() {
    const positions = [];
    const normals = [];
    const heights = [];
    const isCenter = [];
    const indices = [];

    const pushVert = (x, y, z, nx, ny, nz, h, c) => {
      const idx = positions.length / 3;
      positions.push(x, y, z);
      normals.push(nx, ny, nz);
      heights.push(h);
      isCenter.push(c);
      return idx;
    };

    // Tallo fino (2 triángulos cruzados)
    const s0 = pushVert(-0.014, 0.0, 0.0, 0, 0, 1, 0.0, 0.0);
    const s1 = pushVert(0.014, 0.0, 0.0, 0, 0, 1, 0.0, 0.0);
    const s2 = pushVert(-0.010, 0.34, 0.01, 0, 0.4, 0.9, 0.85, 0.0);
    const s3 = pushVert(0.010, 0.34, 0.01, 0, 0.4, 0.9, 0.85, 0.0);
    indices.push(s0, s1, s2, s1, s3, s2);

    // Corola de 5 pétalos en abanico + pistilo central
    const petals = 5;
    const centerIdx = pushVert(0, 0.355, 0.01, 0, 1, 0, 1.0, 1.0);
    for (let p = 0; p < petals; p++) {
      const a = (p / petals) * Math.PI * 2;
      const aL = a - 0.36;
      const aR = a + 0.36;
      const rMid = 0.095;
      const rTip = 0.135;
      const pL = pushVert(Math.cos(aL) * rMid, 0.365, Math.sin(aL) * rMid + 0.01, 0, 1, 0, 1.0, 0.25);
      const pT = pushVert(Math.cos(a) * rTip, 0.382, Math.sin(a) * rTip + 0.01, 0, 1, 0, 1.0, 0.0);
      const pR = pushVert(Math.cos(aR) * rMid, 0.365, Math.sin(aR) * rMid + 0.01, 0, 1, 0, 1.0, 0.25);
      indices.push(centerIdx, pL, pT, centerIdx, pT, pR);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('aHeight', new THREE.Float32BufferAttribute(heights, 1));
    geo.setAttribute('aCenter', new THREE.Float32BufferAttribute(isCenter, 1));
    geo.setIndex(indices);
    geo.computeBoundingSphere();
    return geo;
  }

  #buildWildflowersInstanced() {
    const geo = this.#trackGeo(this.#createWildflowerGeometry());
    const fx = [];
    const fz = [];
    const fScale = [];
    const fYaw = [];

    let seed = 881.7;
    for (let i = 0; i < FLOWER_TARGET_COUNT * 4 && fx.length < FLOWER_TARGET_COUNT; i++) {
      seed += 2.31;
      const x = -82 + pseudoRand(seed) * 298;
      const z = -78 + pseudoRand(seed + 5.1) * 136;
      if (!this.#isValidMeadowPoint(x, z, 0.7)) continue;

      fx.push(x);
      fz.push(z);
      fScale.push(0.72 + pseudoRand(seed + 9.3) * 0.55);
      fYaw.push(pseudoRand(seed + 13.7) * Math.PI * 2);
    }

    const count = fx.length;
    if (count === 0) return;

    const petalCols = new Float32Array(count * 3);
    const glows = new Float32Array(count);
    const phases = new Float32Array(count);

    const palette = [
      [1.0, 0.52, 0.75],   // Rosa pastel (#ff85c0)
      [0.77, 0.61, 1.0],   // Lavanda (#c49bff)
      [1.0, 0.96, 0.98],   // Blanco perlado (#fff6fa)
      [1.0, 0.88, 0.54]    // Dorado suave (#ffe08a)
    ];

    const mat = this.#trackMat(
      new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: {
          uTime: GraphicsSync.uTime,
          uWindDir: GraphicsSync.uWindDir,
          uWindStrength: GraphicsSync.uWindStrength,
          uGrassActors: GraphicsSync.uGrassActors,
          uMoonDir: GraphicsSync.uMoonDir,
          uFogColor: GraphicsSync.uFogColor,
          uFogDensity: GraphicsSync.uFogDensity,
          uNightFactor: GraphicsSync.uNightFactor
        },
        vertexShader: /* glsl */ `
          attribute float aHeight;
          attribute float aCenter;
          attribute vec3 aPetalColor;
          attribute float aGlow;
          attribute float aPhase;

          uniform float uTime;
          uniform vec2 uWindDir;
          uniform float uWindStrength;
          uniform vec4 uGrassActors[4];

          varying float vHeight;
          varying float vCenter;
          varying vec3 vPetalColor;
          varying float vGlow;
          varying vec3 vWorldPos;

          void main() {
            vec3 rootWorld = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
            float camDist = length(cameraPosition - rootWorld);
            float distFade = 1.0 - smoothstep(58.0, 82.0, camDist);

            vec4 worldPos = instanceMatrix * vec4(position * distFade, 1.0);
            if (distFade > 0.001) {
              float h2 = aHeight * aHeight;
              float w1 = sin(dot(rootWorld.xz, uWindDir) * 0.24 - uTime * 2.1 + aPhase);
              worldPos.xz += uWindDir * (w1 * uWindStrength * 0.22 * h2);

              for (int i = 0; i < 4; i++) {
                vec4 actor = uGrassActors[i];
                if (actor.w > 0.01) {
                  vec2 toF = worldPos.xz - actor.xz;
                  float d = length(toF);
                  if (d < actor.w && abs(worldPos.y - actor.y) < 1.8) {
                    float push = (1.0 - smoothstep(0.10, actor.w, d)) * aHeight;
                    vec2 pushDir = d > 0.001 ? toF / d : vec2(1.0, 0.0);
                    worldPos.xz += pushDir * push * 0.44;
                    worldPos.y -= push * 0.18;
                  }
                }
              }
            }

            vHeight = aHeight;
            vCenter = aCenter;
            vPetalColor = aPetalColor;
            vGlow = aGlow;
            vWorldPos = worldPos.xyz;
            gl_Position = projectionMatrix * viewMatrix * worldPos;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uFogColor;
          uniform float uFogDensity;
          uniform float uNightFactor;

          varying float vHeight;
          varying float vCenter;
          varying vec3 vPetalColor;
          varying float vGlow;
          varying vec3 vWorldPos;

          void main() {
            vec3 stemCol = mix(vec3(0.24, 0.56, 0.34), vec3(0.16, 0.38, 0.34), uNightFactor);
            vec3 petalCol = vPetalColor * mix(0.95, 0.72, uNightFactor);
            vec3 pistilCol = vec3(1.0, 0.88, 0.48) * (1.0 + vGlow * uNightFactor * 1.42);
            vec3 flowerCol = mix(petalCol, pistilCol, smoothstep(0.4, 0.9, vCenter));
            vec3 col = mix(stemCol, flowerCol, smoothstep(0.65, 0.95, vHeight));

            float distToCam = length(cameraPosition - vWorldPos);
            float fogFactor = 1.0 - exp(-pow(uFogDensity * distToCam, 2.0));
            col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));

            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `
      })
    );
    mat.userData = { isVfx: true };
    this.#flowerMat = mat;

    const inst = new THREE.InstancedMesh(geo, mat, count);
    inst.castShadow = false;
    inst.receiveShadow = false;
    inst.frustumCulled = false;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      dummy.position.set(fx[i], 0, fz[i]);
      dummy.rotation.set(0, fYaw[i], 0);
      dummy.scale.setScalar(fScale[i]);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);

      const c = palette[i % palette.length];
      petalCols[i * 3] = c[0];
      petalCols[i * 3 + 1] = c[1];
      petalCols[i * 3 + 2] = c[2];
      glows[i] = pseudoRand(i * 9.1) < 0.16 ? 1.0 : 0.0;
      phases[i] = pseudoRand(i * 5.7) * Math.PI * 2;
    }

    geo.setAttribute('aPetalColor', new THREE.InstancedBufferAttribute(petalCols, 3));
    geo.setAttribute('aGlow', new THREE.InstancedBufferAttribute(glows, 1));
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    inst.instanceMatrix.needsUpdate = true;
    inst.matrixAutoUpdate = false;
    inst.updateMatrix();

    this.#instancedMeshes.push(inst);
    this.#root.add(inst);
  }

  // ---------------------------------------------------------------------------
  // 3. Luciérnagas / Polen Luminoso Nocturno 100% GPU
  // ---------------------------------------------------------------------------

  #buildFirefliesGPU() {
    const pos = new Float32Array(FIREFLY_COUNT * 3);
    const phase = new Float32Array(FIREFLY_COUNT);
    const col = new Float32Array(FIREFLY_COUNT * 3);
    let seed = 1207.5;

    for (let i = 0; i < FIREFLY_COUNT; i++) {
      seed += 3.17;
      let x = -80 + pseudoRand(seed) * 294;
      let z = -76 + pseudoRand(seed + 4.3) * 130;
      const y = 0.55 + pseudoRand(seed + 8.9) * 2.8;
      if (this.#decor?.isExcludedZone?.(x, z, 0.2)) {
        x = 97.5 + (pseudoRand(seed + 11) - 0.5) * 16;
        z = (pseudoRand(seed + 15) - 0.5) * 70;
      }
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      phase[i] = pseudoRand(seed + 19.3) * Math.PI * 2;

      const roll = i % 3;
      if (roll === 0) {
        col[i * 3] = 1.48; col[i * 3 + 1] = 1.18; col[i * 3 + 2] = 0.58; // Dorado cálido HDR
      } else if (roll === 1) {
        col[i * 3] = 1.42; col[i * 3 + 1] = 0.72; col[i * 3 + 2] = 1.18; // Rosa mágico HDR
      } else {
        col[i * 3] = 0.68; col[i * 3 + 1] = 1.38; col[i * 3 + 2] = 1.48; // Cian estelar HDR
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
          uniform float uNightFactor;

          varying vec3 vColor;
          varying float vAlpha;

          void main() {
            vec3 p = position + vec3(
              sin(uTime * 0.75 + aPhase) * 1.15,
              sin(uTime * 1.15 + aPhase * 1.7) * 0.42,
              cos(uTime * 0.65 + aPhase * 1.3) * 1.15
            );
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            float pulse = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 2.4 + aPhase * 3.1));
            vColor = aColor;
            vAlpha = pulse * mix(0.18, 0.92, uNightFactor);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = clamp((320.0 / max(1.0, -mv.z)) * (0.65 + 0.35 * pulse), 3.0, 20.0);
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec3 vColor;
          varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            if (d > 0.5) discard;
            float core = exp(-d * d * 22.0);
            float halo = exp(-d * d * 6.5) * 0.45;
            float a = clamp((core + halo) * vAlpha, 0.0, 1.0);
            if (a <= 0.004) discard;
            gl_FragColor = vec4(vColor * a, a);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `
      })
    );
    mat.userData = { isVfx: true };

    this.#fireflyPoints = new THREE.Points(geo, mat);
    this.#fireflyPoints.frustumCulled = false;
    this.#root.add(this.#fireflyPoints);
  }

  // ---------------------------------------------------------------------------
  // 4. Sombras de contacto instanciadas para árboles y farolas (1 draw call)
  // ---------------------------------------------------------------------------

  #buildWorldContactShadows() {
    const trees = this.#flora?.getTreeRecords?.() || [];
    const lanterns = this.#decor?.getLanternPositions?.() || [];
    const total = trees.length + lanterns.length;
    if (total === 0) return;

    const geo = this.#trackGeo(new THREE.PlaneGeometry(2.0, 2.0));
    geo.rotateX(-Math.PI / 2);

    const mat = this.#trackMat(
      new THREE.MeshBasicMaterial({
        map: getSharedContactShadowTexture(),
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      })
    );
    mat.userData = { isVfx: true };

    const inst = new THREE.InstancedMesh(geo, mat, total);
    inst.castShadow = false;
    inst.receiveShadow = false;
    inst.renderOrder = 1;

    const dummy = new THREE.Object3D();
    let idx = 0;

    for (let i = 0; i < trees.length; i++) {
      const tr = trees[i];
      const rad = 2.15 * (tr.scale || 1.0);
      dummy.position.set(tr.x, 0.02, tr.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(rad, 1, rad);
      dummy.updateMatrix();
      inst.setMatrixAt(idx++, dummy.matrix);
    }

    for (let i = 0; i < lanterns.length; i++) {
      const [lx, lz] = lanterns[i];
      dummy.position.set(lx, 0.022, lz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0.75, 1, 0.75);
      dummy.updateMatrix();
      inst.setMatrixAt(idx++, dummy.matrix);
    }

    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.matrixAutoUpdate = false;
    inst.updateMatrix();

    this.#instancedMeshes.push(inst);
    this.#root.add(inst);
  }

  applyTheme() {}

  update() {}

  dispose() {
    if (this.#root) {
      this.#scene?.remove(this.#root);
      this.#root = null;
    }
    for (let i = 0; i < this.#instancedMeshes.length; i++) {
      this.#instancedMeshes[i]?.dispose?.();
    }
    for (let i = 0; i < this.#geometries.length; i++) this.#geometries[i].dispose();
    for (let i = 0; i < this.#materials.length; i++) this.#materials[i].dispose();

    this.#instancedMeshes.length = 0;
    this.#geometries.length = 0;
    this.#materials.length = 0;
    this.#grassMat = null;
    this.#flowerMat = null;
    this.#fireflyPoints = null;
  }
}
