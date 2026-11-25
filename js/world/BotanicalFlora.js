import * as THREE from 'three';

const CASINO_CX = 162.0;
const CASINO_CZ = 0.0;

const RACE_RINGS = [
  [30, 22], [46, 14], [34, 36], [0, 45], [-21, 34],
  [-34, 18], [-30, 0], [-12, -14], [10, -10], [18, 14]
];

const STABLES_AND_HORSES = [
  [20, -11.5, 6.0],
  [18, -2.0, 4.0],
  [-8.5, -11.5, 3.5],
  [-8.2, 10.2, 3.5],
  [118.5, -7.0, 4.0],
  [118.5, 7.0, 4.0]
];

const REST_PLAZAS = [
  [64, -12.5, 4.8],
  [64, 12.5, 4.8],
  [110, -21.0, 4.8],
  [110, 21.0, 4.8]
];

const BOULEVARD_FOUNTAINS = [
  [80, -10.5, 4.5],
  [80, 10.5, 4.5]
];

const BRIDGES = [
  [97.5, 0.0, 7.0],
  [94.0, -38.0, 5.5],
  [104.5, 27.0, 5.5],
  [34.0, 24.0, 5.0],
  [-21.0, 34.0, 5.0]
];

const VIP_FOUNTAINS = [
  [162.0, -48.0, 9.0],
  [162.0, 48.0, 9.0]
];

const VIP_GAZEBOS = [
  [208.0, -22.0, 5.8],
  [208.0, 22.0, 5.8]
];

const CLASSIC_GAZEBOS = [
  [35.0, -8.0, 5.2],
  [-33.0, 41.0, 5.2],
  [-54.0, -44.0, 5.2]
];

const DEER_CLEARINGS = [
  [-54, -30],
  [62, -18],
  [78, 24],
  [138, -54],
  [192, 42],
  [-68, 36]
];

function riverCenterX(z) {
  return 97.5 + Math.sin(z * 0.07) * 7.5 * Math.min(1, (z * z) / 144);
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
    if (!g.attributes.normal) {
      g.computeVertexNormals();
    }
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
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
 * Paisajismo Denso, Flora Diversa y Jardines Temáticos del Reino Rosa Imperial.
 * 100% basado en InstancedMesh con matrices congeladas y update GC-Free.
 */
export class BotanicalFlora {
  #scene;
  #textures;
  #collision;
  #root = null;
  #built = false;

  #geometries = [];
  #materials = [];
  #instancedMeshes = [];
  #dummy = new THREE.Object3D();

  #sakuraPetals = null;
  #petalData = null;
  #petalMat = null;

  #mushroomCapMats = [];
  #mushroomHaloMat = null;
  #gardenLanternGlassMat = null;
  #gardenLanternHaloMat = null;

  #baseMushroomEmissive = 0.42;
  #baseMushroomHaloOpacity = 0.14;
  #baseLanternEmissive = 0.92;
  #baseLanternHaloOpacity = 0.22;

  #elapsed = 0;
  #treeRecords = [];

  constructor(scene, textureFactory, collisionSystem) {
    this.#scene = scene;
    this.#textures = textureFactory;
    this.#collision = collisionSystem;
  }

  getTreeRecords() {
    return this.#treeRecords;
  }

  init() {
    if (this.#built) return;
    this.#built = true;

    this.#root = new THREE.Group();
    this.#root.name = 'BotanicalFlora';

    const mats = this.#createMaterials();

    this.#buildAllTreesAndTopiaries(mats);
    this.#buildGeometricFlowerbeds(mats);
    this.#buildAquaticAndRiparianFlora(mats);
    this.#buildGlowingMushrooms(mats);
    this.#buildGardenLanterns(mats);
    this.#buildSakuraPetals();

    this.#root.matrixAutoUpdate = false;
    this.#root.updateMatrix();
    this.#scene?.add(this.#root);
  }

  #trackGeo(geo) {
    this.#geometries.push(geo);
    return geo;
  }

  #trackMat(mat) {
    this.#materials.push(mat);
    return mat;
  }

  #createInstanced(geo, mat, count, castShadow = true, receiveShadow = true, isFlower = false) {
    this.#trackGeo(geo);
    const im = new THREE.InstancedMesh(geo, mat, count);
    im.castShadow = isFlower ? false : castShadow;
    im.receiveShadow = receiveShadow;
    if (isFlower) {
      im.userData.isFlower = true;
    }
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

  #pseudoRand(seed) {
    const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return s - Math.floor(s);
  }

  #createMaterials() {
    const marbleTex = this.#textures?.getTexture ? this.#textures.getTexture('marble', 2, 2) : null;
    const roseGoldTex = this.#textures?.getTexture ? this.#textures.getTexture('roseGold', 1, 1) : null;

    const barkCherry = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0x583938,
      roughness: 0.88,
      metalness: 0.02
    }));

    const barkForest = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0x5f4634,
      roughness: 0.90,
      metalness: 0.02
    }));

    const barkPalm = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0x856649,
      roughness: 0.86,
      metalness: 0.03
    }));

    const foliage = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.80,
      metalness: 0.02
    }));

    const marble = this.#trackMat(new THREE.MeshStandardMaterial({
      map: marbleTex,
      color: 0xf7f1f5,
      roughness: 0.34,
      metalness: 0.05
    }));

    const roseGold = this.#trackMat(new THREE.MeshStandardMaterial({
      map: roseGoldTex,
      color: 0xeeb2a2,
      metalness: 0.88,
      roughness: 0.19
    }));

    const flowerPetal = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.50,
      metalness: 0.02
    }));

    const daisyGold = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xffc436,
      roughness: 0.55,
      metalness: 0.04
    }));

    const stemGreen = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0x3b803d,
      roughness: 0.84,
      metalness: 0.02
    }));

    const reedGreen = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0.02
    }));

    const cattailBrown = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0x6b442a,
      roughness: 0.92,
      metalness: 0.01
    }));

    const lilyPad = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.68,
      metalness: 0.03
    }));

    const mushroomStem = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xfff3eb,
      roughness: 0.72,
      metalness: 0.02
    }));

    const mushroomCapPink = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xff9ad5,
      emissive: 0xff4fb0,
      emissiveIntensity: this.#baseMushroomEmissive,
      roughness: 0.36,
      metalness: 0.04
    }));
    mushroomCapPink.userData.preserveRoughness = true;

    const mushroomCapLilac = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xd4abff,
      emissive: 0x9e5cff,
      emissiveIntensity: this.#baseMushroomEmissive,
      roughness: 0.36,
      metalness: 0.04
    }));
    mushroomCapLilac.userData.preserveRoughness = true;

    const mushroomCapTurq = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0x9cf7ee,
      emissive: 0x38e2d0,
      emissiveIntensity: this.#baseMushroomEmissive,
      roughness: 0.36,
      metalness: 0.04
    }));
    mushroomCapTurq.userData.preserveRoughness = true;

    this.#mushroomCapMats = [mushroomCapPink, mushroomCapLilac, mushroomCapTurq];

    const mushroomHalo = this.#trackMat(new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: this.#baseMushroomHaloOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    }));
    mushroomHalo.userData.isVfx = true;
    this.#mushroomHaloMat = mushroomHalo;

    const lanternGlass = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xfff3d4,
      emissive: 0xffc470,
      emissiveIntensity: this.#baseLanternEmissive,
      roughness: 0.22,
      metalness: 0.06
    }));
    lanternGlass.userData.preserveRoughness = true;
    this.#gardenLanternGlassMat = lanternGlass;

    const lanternHalo = this.#trackMat(new THREE.MeshBasicMaterial({
      color: 0xffdba4,
      transparent: true,
      opacity: this.#baseLanternHaloOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    }));
    lanternHalo.userData.isVfx = true;
    this.#gardenLanternHaloMat = lanternHalo;

    return {
      barkCherry,
      barkForest,
      barkPalm,
      foliage,
      marble,
      roseGold,
      flowerPetal,
      daisyGold,
      stemGreen,
      reedGreen,
      cattailBrown,
      lilyPad,
      mushroomStem,
      mushroomCapPink,
      mushroomCapLilac,
      mushroomCapTurq,
      mushroomHalo,
      lanternGlass,
      lanternHalo
    };
  }

  #isInCoreHardZone(x, z, margin = 0) {
    // Palacio y Terraza de Baile
    if (x >= -44 - margin && x <= 44 + margin && z >= -80 - margin && z <= -15 + margin) return true;
    if (x >= 35 - margin && x <= 52 + margin && z >= -45 - margin && z <= -27 + margin) return true;

    // Pasarela en T + acceso oeste
    if (x >= -66 - margin && x <= -27 + margin && z >= -18 - margin && z <= 28 + margin) return true;
    if (x >= -40 - margin && x <= -14 + margin && z >= -3.8 - margin && z <= 3.8 + margin) return true;

    // Arena de Carrera
    if (x >= 12 - margin && x <= 28 + margin && z >= 4 - margin && z <= 25 + margin) return true;

    // Aros de Carrera
    const ringR = 3.8 + margin;
    for (let i = 0; i < RACE_RINGS.length; i++) {
      const [rx, rz] = RACE_RINGS[i];
      if (Math.hypot(x - rx, z - rz) < ringR) return true;
    }

    // Establos y Caballos
    for (let i = 0; i < STABLES_AND_HORSES.length; i++) {
      const [hx, hz, hr] = STABLES_AND_HORSES[i];
      if (Math.hypot(x - hx, z - hz) < hr + margin) return true;
    }

    // Fuente Central y Mirador Sur + escalinata
    if (Math.hypot(x, z) < 15.0 + margin) return true;
    if (Math.hypot(x, z - 46) < 8.5 + margin) return true;
    if (x >= -4.5 - margin && x <= 4.5 + margin && z >= 35 - margin && z <= 46 + margin) return true;

    // Avenidas N-S, Oeste y Este
    if (x >= -6.0 - margin && x <= 6.0 + margin && z >= -17 - margin && z <= 36 + margin) return true;
    if (x >= 14.0 - margin && x <= 42.0 + margin && z >= -3.8 - margin && z <= 3.8 + margin) return true;

    // Bulevar Imperial y Explanada Oeste del Casino
    if (x >= 40.0 - margin && x <= 130.0 + margin && Math.abs(z) <= 6.2 + margin) return true;
    if (x >= 111.0 - margin && x <= 131.0 + margin && z >= -16.0 - margin && z <= 16.0 + margin) return true;

    // Plazas de descanso y Fuentes del Bulevar
    for (let i = 0; i < REST_PLAZAS.length; i++) {
      const [px, pz, pr] = REST_PLAZAS[i];
      if (Math.hypot(x - px, z - pz) < pr + margin) return true;
    }
    for (let i = 0; i < BOULEVARD_FOUNTAINS.length; i++) {
      const [fx, fz, fr] = BOULEVARD_FOUNTAINS[i];
      if (Math.hypot(x - fx, z - fz) < fr + margin) return true;
    }

    // Puentes
    for (let i = 0; i < BRIDGES.length; i++) {
      const [bx, bz, br] = BRIDGES[i];
      if (Math.hypot(x - bx, z - bz) < br + margin) return true;
    }

    // Fuentes VIP y Glorietas VIP del Casino + accesos radiales a Glorietas VIP
    for (let i = 0; i < VIP_FOUNTAINS.length; i++) {
      const [vx, vz, vr] = VIP_FOUNTAINS[i];
      if (Math.hypot(x - vx, z - vz) < vr + margin) return true;
    }
    for (let i = 0; i < VIP_GAZEBOS.length; i++) {
      const [gx, gz, gr] = VIP_GAZEBOS[i];
      if (Math.hypot(x - gx, z - gz) < gr + margin) return true;
    }
    if (Math.hypot(x - 199.5, z + 18.0) < 3.2 + margin) return true;
    if (Math.hypot(x - 199.5, z - 18.0) < 3.2 + margin) return true;

    // Glorietas clásicas del jardín
    for (let i = 0; i < CLASSIC_GAZEBOS.length; i++) {
      const [gx, gz, gr] = CLASSIC_GAZEBOS[i];
      if (Math.hypot(x - gx, z - gz) < gr + margin) return true;
    }

    return false;
  }

  #isInWaterZone(x, z, riverHalf = 4.8, lakePad = 1.0) {
    // Nuevo Río Cristalino z ∈ [-78, 38]
    if (z >= -79.2 && z <= 39.2) {
      if (Math.abs(x - riverCenterX(z)) < riverHalf) return true;
    }

    // Lago de los Cisnes (106, 45), rx = 21.0, rz = 12.5
    const dxSwan = (x - 106.0) / (21.0 + lakePad);
    const dzSwan = (z - 45.0) / (12.5 + lakePad);
    if (dxSwan * dxSwan + dzSwan * dzSwan <= 1.0) return true;

    // Estanque Este (46, 26), rx = 11.0, rz = 8.5 + Canal X ∈ [31, 36], Z ∈ [18, 30]
    const dxEast = (x - 46.0) / (11.0 + lakePad);
    const dzEast = (z - 26.0) / (8.5 + lakePad);
    if (dxEast * dxEast + dzEast * dzEast <= 1.0) return true;
    if (x >= 30.8 - lakePad && x <= 37.2 + lakePad && z >= 17.8 - lakePad && z <= 30.2 + lakePad) return true;

    // Arroyo SW X ∈ [-24, -18], Z ∈ [28, 55]
    if (x >= -24.2 - lakePad && x <= -17.8 + lakePad && z >= 27.8 - lakePad && z <= 55.5) return true;

    // Lago Sur Z >= 54.5, X ∈ [-95, 95]
    if (x <= 95.5 && z >= 54.5 - lakePad) return true;

    return false;
  }

  isReservedForTrees(x, z, margin = 1.3, allowCloseToCasinoRing = false, allowNearBoulevardEdge = false) {
    if (x < -86.5 || x > 220.5 || z < -82.5 || z > 62.5) return true;

    const domeDist = Math.hypot(x - CASINO_CX, z - CASINO_CZ);
    const minDomeR = allowCloseToCasinoRing ? 42.65 : 44.0;
    if (domeDist < minDomeR) return true;

    if (!allowNearBoulevardEdge && x >= 40.0 && x <= 130.0 && Math.abs(z) < 8.6) return true;

    if (this.#isInCoreHardZone(x, z, margin)) return true;
    if (this.#isInWaterZone(x, z, 4.85, 1.35)) return true;

    // Corredores rectos de entrada/salida de los puentes del río
    if (Math.abs(z + 38.0) < 2.6 && x >= 85.0 && x <= 103.0) return true;
    if (Math.abs(z - 27.0) < 2.6 && x >= 95.5 && x <= 114.0) return true;

    // Claros de ciervos (radio libre de árboles 5.0)
    for (let i = 0; i < DEER_CLEARINGS.length; i++) {
      const [cx, cz] = DEER_CLEARINGS[i];
      if (Math.hypot(x - cx, z - cz) < 5.15) return true;
    }

    return false;
  }

  isReservedForFlowers(x, z, margin = 0.28) {
    if (x < -87.2 || x > 221.2 || z < -83.2 || z > 63.2) return true;
    if (Math.hypot(x - CASINO_CX, z - CASINO_CZ) < 42.65) return true;
    if (this.#isInCoreHardZone(x, z, margin)) return true;
    if (this.#isInWaterZone(x, z, 4.35, 0.75)) return true;
    return false;
  }

  #buildAllTreesAndTopiaries(mats) {
    const trees = [];
    this.#treeRecords = trees;

    const tryPlace = (x, z, species, scale = 1.0, minSpacing = 4.2, opts = {}) => {
      const margin = opts.margin ?? 1.25;
      const allowCasinoRing = Boolean(opts.allowCasinoRing);
      const allowBoulevard = Boolean(opts.allowBoulevard);
      if (this.isReservedForTrees(x, z, margin, allowCasinoRing, allowBoulevard)) return false;

      for (let i = 0; i < trees.length; i++) {
        const t = trees[i];
        const req = Math.min(minSpacing, t.minSpacing);
        if (Math.hypot(x - t.x, z - t.z) < req) return false;
      }

      const rot = opts.rot !== undefined
        ? opts.rot
        : this.#pseudoRand(x * 3.17 + z * 7.41 + trees.length * 0.37) * Math.PI * 2;
      trees.push({ x, z, species, scale, rot, minSpacing, variant: opts.variant ?? 0 });
      return true;
    };

    // -------------------------------------------------------------------------
    // ESPECIE 5 — Topiarios Ornamentales en Maceta Dorada (~48-50 unidades)
    // -------------------------------------------------------------------------
    let topiaryVariant = 0;
    // Anillo exterior de la Cúpula del Casino (r = 43.2)
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2;
      const tx = CASINO_CX + Math.cos(a) * 43.25;
      const tz = CASINO_CZ + Math.sin(a) * 43.25;
      if (tryPlace(tx, tz, 'topiary', 1.0, 2.5, {
        margin: 0.45,
        allowCasinoRing: true,
        variant: (topiaryVariant++) % 2,
        rot: -a
      })) {
        // colocado en el anillo del Casino
      }
    }

    // Alrededor de las Fuentes VIP del Casino (162, ±48) y Glorietas VIP (208, ±22)
    for (const fz of [-48.0, 48.0]) {
      for (const angDeg of [-145, -35, 35, 145]) {
        const rad = (angDeg * Math.PI) / 180;
        const tx = 162.0 + Math.cos(rad) * 9.55;
        const tz = fz + Math.sin(rad) * 9.55;
        tryPlace(tx, tz, 'topiary', 1.02, 2.5, {
          margin: 0.45,
          allowCasinoRing: true,
          variant: (topiaryVariant++) % 2
        });
      }
    }
    for (const gz of [-22.0, 22.0]) {
      for (const angDeg of [-120, 120]) {
        const rad = (angDeg * Math.PI) / 180;
        tryPlace(208.0 + Math.cos(rad) * 6.4, gz + Math.sin(rad) * 6.4, 'topiary', 1.0, 2.5, {
          margin: 0.45,
          variant: (topiaryVariant++) % 2
        });
      }
    }

    // Bulevar Imperial y Plazas del Palacio
    const boulevardTopiaryX = [46, 56, 71, 88, 105];
    for (const bx of boulevardTopiaryX) {
      for (const bz of [-6.95, 6.95]) {
        tryPlace(bx, bz, 'topiary', 0.98, 2.5, {
          margin: 0.4,
          allowBoulevard: true,
          variant: (topiaryVariant++) % 2
        });
      }
    }
    const palaceTopiarySpots = [
      [-8.2, -14.1], [8.2, -14.1], [-26.0, -14.1], [26.0, -14.1],
      [-15.8, -6.2], [15.8, -6.2], [-15.8, 6.2], [15.8, 6.2]
    ];
    for (const [px, pz] of palaceTopiarySpots) {
      tryPlace(px, pz, 'topiary', 0.96, 2.4, {
        margin: 0.4,
        variant: (topiaryVariant++) % 2
      });
    }

    // -------------------------------------------------------------------------
    // ESPECIE 3 — Cipreses Reales Recortados (~60 árboles)
    // -------------------------------------------------------------------------
    const cypressFixed = [
      // Fachada Sur y laterales nobles del Castillo
      [-11.5, -13.4, 1.04], [11.5, -13.4, 1.04],
      [-19.5, -13.4, 1.0], [19.5, -13.4, 1.0],
      [-31.5, -13.4, 1.0], [31.5, -13.4, 1.0],
      [-39.8, -13.4, 0.98], [39.8, -13.4, 0.98],
      [-46.2, -22.0, 1.02], [-46.2, -32.0, 1.02], [-46.2, -42.0, 1.02], [-46.2, -52.0, 1.02],
      [54.2, -24.0, 1.02], [54.2, -31.0, 1.02], [54.2, -38.0, 1.02], [54.2, -45.0, 1.02],
      // Flanqueando la Pasarela en T
      [-25.2, -14.0, 1.0], [-25.2, -7.5, 1.0], [-25.2, 7.5, 1.0], [-25.2, 15.0, 1.0], [-25.2, 23.0, 1.0],
      [-67.8, -14.0, 1.02], [-67.8, -5.0, 1.02], [-67.8, 5.0, 1.02], [-67.8, 14.0, 1.02], [-67.8, 23.0, 1.02],
      [-56.0, -19.8, 0.98], [-44.0, -19.8, 0.98], [-34.0, -19.8, 0.98],
      [-56.0, 29.8, 0.98], [-44.0, 29.8, 0.98], [-34.0, 29.8, 0.98],
      // Entrada Oeste de la Cúpula del Casino (flanqueando explanada X ∈ [111, 131], Z = ±16)
      [113.0, -18.2, 1.06], [118.5, -18.2, 1.08], [124.0, -18.2, 1.08], [129.5, -18.2, 1.08],
      [113.0, 18.2, 1.06], [118.5, 18.2, 1.08], [124.0, 18.2, 1.08], [129.5, 18.2, 1.08],
      [121.0, -25.0, 1.05], [125.5, -31.5, 1.05], [130.5, -37.5, 1.04],
      [121.0, 25.0, 1.05], [125.5, 31.5, 1.05], [130.5, 37.5, 1.04]
    ];
    for (const [cx, cz, sc] of cypressFixed) {
      tryPlace(cx, cz, 'cypress', sc, 3.5, { margin: 0.95, allowBoulevard: true, allowCasinoRing: true });
    }

    // Laterales exteriores del Bulevar Imperial (Z = ±9.5)
    for (const bx of [44, 49.5, 55, 72.5, 87.5, 104.5, 109.2]) {
      for (const bz of [-9.5, 9.5]) {
        tryPlace(bx, bz, 'cypress', 1.02, 3.5, { margin: 0.95, allowBoulevard: true });
      }
    }

    // Plazas de las Fuentes VIP (162, ±48) y Glorietas VIP (208, ±22)
    for (const fz of [-48.0, 48.0]) {
      const sign = fz < 0 ? -1 : 1;
      for (const angDeg of [12, 42, 72, 108, 138, 168]) {
        const rad = (angDeg * Math.PI) / 180;
        const cx = 162.0 + Math.cos(rad) * 12.2;
        const cz = fz + sign * Math.sin(rad) * 11.4;
        tryPlace(cx, cz, 'cypress', 1.05, 3.5, { margin: 0.95 });
      }
    }
    for (const gz of [-22.0, 22.0]) {
      tryPlace(216.2, gz - 4.2, 'cypress', 1.04, 3.5, { margin: 0.95 });
      tryPlace(216.2, gz + 4.2, 'cypress', 1.04, 3.5, { margin: 0.95 });
    }

    // -------------------------------------------------------------------------
    // ESPECIE 2 — Sauces Llorones Reales (~40 árboles)
    // -------------------------------------------------------------------------
    // Ambas orillas del Río Cristalino (x = riverCenterX(z) ± 5.6)
    for (let z = -75.0; z <= 32.0; z += 7.4) {
      const rcx = riverCenterX(z);
      tryPlace(rcx - 5.65, z, 'willow', 1.04 + (Math.abs(z) % 3) * 0.05, 4.5, { margin: 1.1 });
      tryPlace(rcx + 5.65, z + 3.4, 'willow', 1.02 + ((Math.abs(z) + 1) % 3) * 0.05, 4.5, { margin: 1.1 });
    }

    // Alrededor del Lago de los Cisnes (106, 45)
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.16;
      const wx = 106.0 + Math.cos(a) * 23.6;
      const wz = 45.0 + Math.sin(a) * 14.9;
      tryPlace(wx, wz, 'willow', 1.08 + (i % 3) * 0.05, 4.6, { margin: 1.15 });
    }

    // Estanque Este (46, 26) y Orilla del Lago Sur
    const extraWillows = [
      [58.8, 22.0, 1.12], [58.5, 30.8, 1.08], [48.0, 36.6, 1.05], [39.5, 35.2, 1.02],
      [-72.0, 52.0, 1.12], [-56.0, 52.2, 1.10], [-40.0, 52.0, 1.12], [-27.5, 50.5, 1.06],
      [-13.5, 51.5, 1.06], [16.5, 52.0, 1.10], [32.0, 52.2, 1.12], [50.0, 52.0, 1.10], [68.0, 52.0, 1.10]
    ];
    for (const [wx, wz, sc] of extraWillows) {
      tryPlace(wx, wz, 'willow', sc, 4.5, { margin: 1.1 });
    }

    // -------------------------------------------------------------------------
    // ESPECIE 6 — Palmeras Reales Estilizadas (~36-38 palmeras)
    // -------------------------------------------------------------------------
    // Jardines tropicales alrededor de la Cúpula del Casino (r ∈ [44.5, 68])
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + 0.09;
      const r = 46.8 + (i % 3) * 5.2;
      const px = CASINO_CX + Math.cos(a) * r;
      const pz = CASINO_CZ + Math.sin(a) * r;
      const sc = 0.94 + (i % 4) * 0.08;
      tryPlace(px, pz, 'palm', sc, 4.3, { margin: 1.15 });
    }
    const casinoExtraPalms = [
      [142, -50, 1.05], [182, -50, 1.08], [148, -64, 1.0], [176, -64, 1.04],
      [135, -58, 1.02], [190, -58, 1.06], [162, -68, 1.08], [154, -73, 1.0], [170, -73, 1.02],
      [142, 48, 1.06], [182, 48, 1.05], [134, 54, 1.04], [190, 54, 1.04],
      [198, -36, 1.02], [198, 36, 1.02], [211, -8, 1.10], [211, 8, 1.10],
      [216, -33, 1.02], [216, 33, 1.02], [217, 0, 1.08],
      [130, -45, 1.03], [195, -46, 1.05], [204, -41, 1.02], [204, 41, 1.02],
      [158, -78, 1.04], [168, -78, 1.04], [146, 59, 1.02], [178, 59, 1.02],
      // Junto al Lago de los Cisnes
      [83.5, 42.0, 1.04], [86.0, 51.5, 1.0], [128.5, 40.5, 1.08], [129.5, 49.0, 1.05],
      [118.0, 31.0, 1.02], [93.0, 31.5, 1.0], [122.0, 58.2, 1.04], [112.0, 59.0, 1.02]
    ];
    for (const [px, pz, sc] of casinoExtraPalms) {
      tryPlace(px, pz, 'palm', sc, 4.3, { margin: 1.15 });
    }

    // -------------------------------------------------------------------------
    // ESPECIE 1 — Cerezos Imperiales en Flor (~80-84 árboles)
    // -------------------------------------------------------------------------
    const sakuraLandmarks = [
      [-16, -11, 1.02], [16, -11, 1.02], [-15, 14, 0.98], [11, 29, 0.98],
      [-43, 35, 1.06], [-42, 46, 1.02], [12, 38, 1.0], [30, 43, 1.04],
      [-48, -26, 1.04], [-61, -48, 1.05], [56, -24, 1.06], [46, -13, 1.0],
      // Riberas románticas del Río Cristalino
      [88, -62, 1.06], [107, -58, 1.04], [87, -22, 1.05], [106, -18, 1.06],
      [89, 14, 1.02], [112, 16, 1.05],
      // Jardines románticos del Casino
      [134, -38, 1.06], [190, -38, 1.06], [135, 36, 1.05], [188, 36, 1.06],
      [208, -12, 1.04], [208, 12, 1.04], [152, -62, 1.08], [172, -62, 1.08],
      [150, 58, 1.04], [174, 58, 1.04]
    ];
    for (const [sx, sz, sc] of sakuraLandmarks) {
      tryPlace(sx, sz, 'sakura', sc, 4.5, { margin: 1.3 });
    }

    const sakuraZones = [
      { minX: -85, maxX: -46, minZ: -81, maxZ: -20, target: 18 },
      { minX: -85, maxX: -36, minZ: 30, maxZ: 52, target: 11 },
      { minX: 82, maxX: 114, minZ: -78, maxZ: 34, target: 10 },
      { minX: 120, maxX: 219, minZ: -80, maxZ: -38, target: 10 },
      { minX: 128, maxX: 219, minZ: 36, maxZ: 61, target: 8 },
      { minX: 204, maxX: 219, minZ: -36, maxZ: 36, target: 5 }
    ];
    let seed = 211.7;
    for (const zBox of sakuraZones) {
      let placed = 0;
      let attempts = 0;
      while (placed < zBox.target && attempts < zBox.target * 22) {
        attempts++;
        seed += 1.91;
        const rx = zBox.minX + this.#pseudoRand(seed) * (zBox.maxX - zBox.minX);
        const rz = zBox.minZ + this.#pseudoRand(seed + 13.7) * (zBox.maxZ - zBox.minZ);
        const sc = 0.90 + this.#pseudoRand(seed + 29.3) * 0.28;
        if (tryPlace(rx, rz, 'sakura', sc, 4.6, { margin: 1.35 })) placed++;
      }
    }

    // -------------------------------------------------------------------------
    // ESPECIE 4 — Árboles Frondosos de Copa Doble (~85-88 árboles)
    // -------------------------------------------------------------------------
    const broadleafZones = [
      // Colinas Norte y Oeste del Palacio
      { minX: -85, maxX: -46, minZ: -81, maxZ: -46, target: 10 },
      { minX: -85, maxX: -68, minZ: -44, maxZ: 48, target: 12 },
      { minX: 46, maxX: 88, minZ: -81, maxZ: -20, target: 16 },
      // Valle Oriental Central (entre Palacio y Casino)
      { minX: 56, maxX: 92, minZ: 12, maxZ: 50, target: 12 },
      { minX: 104, maxX: 134, minZ: -80, maxZ: -26, target: 10 },
      // Gran Anillo Exterior del Casino (Norte, Este, Sur, NE, SE)
      { minX: 134, maxX: 219, minZ: -81, maxZ: -44, target: 14 },
      { minX: 205, maxX: 220, minZ: -44, maxZ: 44, target: 8 },
      { minX: 132, maxX: 219, minZ: 44, maxZ: 61, target: 8 }
    ];
    for (const zBox of broadleafZones) {
      let placed = 0;
      let attempts = 0;
      while (placed < zBox.target && attempts < zBox.target * 24) {
        attempts++;
        seed += 2.37;
        const rx = zBox.minX + this.#pseudoRand(seed) * (zBox.maxX - zBox.minX);
        const rz = zBox.minZ + this.#pseudoRand(seed + 17.9) * (zBox.maxZ - zBox.minZ);
        const sc = 0.88 + this.#pseudoRand(seed + 43.1) * 0.32;
        if (tryPlace(rx, rz, 'broadleaf', sc, 4.65, { margin: 1.35 })) placed++;
      }
    }

    // Colisiones ÚNICAMENTE para troncos de árboles grandes y macetones topiarios en [-87, 221] x [-83, 63]
    if (this.#collision) {
      for (let i = 0; i < trees.length; i++) {
        const t = trees[i];
        if (t.x >= -87 && t.x <= 221 && t.z >= -83 && t.z <= 63) {
          this.#collision.addCylinderCollider(t.x, t.z, 0.46, 0, 3.5);
        }
      }
    }

    this.#instantiateSakuras(trees.filter((t) => t.species === 'sakura'), mats);
    this.#instantiateWillows(trees.filter((t) => t.species === 'willow'), mats);
    this.#instantiateCypresses(trees.filter((t) => t.species === 'cypress'), mats);
    this.#instantiateBroadleafs(trees.filter((t) => t.species === 'broadleaf'), mats);
    this.#instantiateTopiaries(trees.filter((t) => t.species === 'topiary'), mats);
    this.#instantiateRoyalPalms(trees.filter((t) => t.species === 'palm'), mats);
  }

  #instantiateSakuras(list, mats) {
    if (list.length === 0) return;
    const dummy = this.#dummy;
    const color = new THREE.Color();

    // Tronco fusionado con raíces y 3 ramas cálidas
    const woodPieces = [];
    const baseG = new THREE.CylinderGeometry(0.24, 0.40, 1.55, 8);
    const upperG = new THREE.CylinderGeometry(0.16, 0.25, 1.45, 8);
    const branchG = new THREE.CylinderGeometry(0.08, 0.15, 1.75, 7);

    dummy.position.set(0, 0.77, 0);
    dummy.rotation.set(0.04, 0, 0.03);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    woodPieces.push({ geometry: baseG, matrix: dummy.matrix.clone() });

    dummy.position.set(0.05, 2.15, 0.03);
    dummy.rotation.set(0.07, 0.2, -0.04);
    dummy.updateMatrix();
    woodPieces.push({ geometry: upperG, matrix: dummy.matrix.clone() });

    for (let b = 0; b < 3; b++) {
      const ba = (b / 3) * Math.PI * 2 + 0.3;
      dummy.position.set(Math.cos(ba) * 0.52, 2.68, Math.sin(ba) * 0.52);
      dummy.rotation.set(Math.sin(ba) * 0.58, ba, -Math.cos(ba) * 0.58);
      dummy.updateMatrix();
      woodPieces.push({ geometry: branchG, matrix: dummy.matrix.clone() });
    }
    const woodGeo = mergeGeometries(woodPieces);
    baseG.dispose();
    upperG.dispose();
    branchG.dispose();

    const puffGeo = new THREE.IcosahedronGeometry(1.52, 1);
    const woodInst = this.#createInstanced(woodGeo, mats.barkCherry, list.length, true, true);
    const puffInst = this.#createInstanced(puffGeo, mats.foliage, list.length * 5, true, false);

    const sakuraPalette = [0xffb7d5, 0xff94c2, 0xfff3f8, 0xffcde2, 0xf6a0c7];
    const puffOffsets = [
      [0, 3.85, 0, 1.18],
      [-1.12, 3.35, 0.65, 0.90],
      [1.10, 3.40, -0.62, 0.92],
      [0.20, 3.48, 1.08, 0.86],
      [-0.24, 3.32, -1.04, 0.84]
    ];

    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      dummy.position.set(t.x, 0, t.z);
      dummy.rotation.set(0, t.rot, 0);
      dummy.scale.setScalar(t.scale);
      dummy.updateMatrix();
      woodInst.setMatrixAt(i, dummy.matrix);

      const cosR = Math.cos(t.rot);
      const sinR = Math.sin(t.rot);
      for (let p = 0; p < 5; p++) {
        const [ox, oy, oz, ps] = puffOffsets[p];
        const wx = t.x + (ox * cosR - oz * sinR) * t.scale;
        const wz = t.z + (ox * sinR + oz * cosR) * t.scale;
        dummy.position.set(wx, oy * t.scale, wz);
        dummy.rotation.set(p * 0.35, t.rot + p * 0.8, 0.16);
        dummy.scale.set(ps * t.scale, ps * 0.72 * t.scale, ps * t.scale);
        dummy.updateMatrix();
        const idx = i * 5 + p;
        puffInst.setMatrixAt(idx, dummy.matrix);
        color.setHex(sakuraPalette[(i + p) % sakuraPalette.length]);
        puffInst.setColorAt(idx, color);
      }
    }

    this.#finalizeStaticInstanced(woodInst);
    this.#finalizeStaticInstanced(puffInst);
  }

  #instantiateWillows(list, mats) {
    if (list.length === 0) return;
    const dummy = this.#dummy;
    const color = new THREE.Color();

    const woodPieces = [];
    const trunkG = new THREE.CylinderGeometry(0.28, 0.46, 3.0, 8);
    const boughG = new THREE.CylinderGeometry(0.10, 0.20, 1.85, 7);

    dummy.position.set(0, 1.5, 0);
    dummy.rotation.set(0.05, 0, -0.04);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    woodPieces.push({ geometry: trunkG, matrix: dummy.matrix.clone() });

    for (let b = 0; b < 4; b++) {
      const ba = (b / 4) * Math.PI * 2 + 0.4;
      dummy.position.set(Math.cos(ba) * 0.62, 3.15, Math.sin(ba) * 0.62);
      dummy.rotation.set(Math.sin(ba) * 0.68, ba, -Math.cos(ba) * 0.68);
      dummy.updateMatrix();
      woodPieces.push({ geometry: boughG, matrix: dummy.matrix.clone() });
    }
    const woodGeo = mergeGeometries(woodPieces);
    trunkG.dispose();
    boughG.dispose();

    // Cortina doble de ramas colgantes por gajo
    const drapePieces = [];
    const strandA = new THREE.CylinderGeometry(0.07, 0.21, 2.85, 6);
    const strandB = new THREE.CylinderGeometry(0.05, 0.15, 2.45, 6);
    dummy.position.set(0, 0, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    drapePieces.push({ geometry: strandA, matrix: dummy.matrix.clone() });
    dummy.position.set(0.18, -0.18, 0.08);
    dummy.rotation.set(0.04, 0.5, -0.05);
    dummy.updateMatrix();
    drapePieces.push({ geometry: strandB, matrix: dummy.matrix.clone() });
    const drapeGeo = mergeGeometries(drapePieces);
    strandA.dispose();
    strandB.dispose();

    const crownGeo = new THREE.IcosahedronGeometry(2.05, 1);
    const woodInst = this.#createInstanced(woodGeo, mats.barkForest, list.length, true, true);
    const crownInst = this.#createInstanced(crownGeo, mats.foliage, list.length * 2, true, false);
    const drapeInst = this.#createInstanced(drapeGeo, mats.foliage, list.length * 9, false, false);

    const willowPalette = [0x6fd19c, 0x52b782, 0x88dfb0, 0x3f9d6d];

    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      dummy.position.set(t.x, 0, t.z);
      dummy.rotation.set(0, t.rot, 0);
      dummy.scale.setScalar(t.scale);
      dummy.updateMatrix();
      woodInst.setMatrixAt(i, dummy.matrix);

      // Corona doble frondosa
      dummy.position.set(t.x, 3.92 * t.scale, t.z);
      dummy.rotation.set(0, t.rot, 0);
      dummy.scale.set(1.18 * t.scale, 0.68 * t.scale, 1.18 * t.scale);
      dummy.updateMatrix();
      crownInst.setMatrixAt(i * 2, dummy.matrix);
      color.setHex(willowPalette[i % willowPalette.length]);
      crownInst.setColorAt(i * 2, color);

      dummy.position.set(t.x + Math.cos(t.rot) * 0.45 * t.scale, 4.35 * t.scale, t.z + Math.sin(t.rot) * 0.45 * t.scale);
      dummy.rotation.set(0.2, t.rot + 1.1, 0.1);
      dummy.scale.set(0.88 * t.scale, 0.62 * t.scale, 0.88 * t.scale);
      dummy.updateMatrix();
      crownInst.setMatrixAt(i * 2 + 1, dummy.matrix);
      color.setHex(willowPalette[(i + 2) % willowPalette.length]);
      crownInst.setColorAt(i * 2 + 1, color);

      for (let d = 0; d < 9; d++) {
        const da = t.rot + (d / 9) * Math.PI * 2;
        const r = 1.72 * t.scale;
        dummy.position.set(t.x + Math.cos(da) * r, 2.28 * t.scale, t.z + Math.sin(da) * r);
        dummy.rotation.set(Math.sin(da) * 0.08, -da + Math.PI * 0.5, -Math.cos(da) * 0.08);
        dummy.scale.set(t.scale, t.scale * (0.92 + (d % 3) * 0.12), t.scale);
        dummy.updateMatrix();
        const idx = i * 9 + d;
        drapeInst.setMatrixAt(idx, dummy.matrix);
        color.setHex(willowPalette[(i + d) % willowPalette.length]);
        drapeInst.setColorAt(idx, color);
      }
    }

    this.#finalizeStaticInstanced(woodInst);
    this.#finalizeStaticInstanced(crownInst);
    this.#finalizeStaticInstanced(drapeInst);
  }

  #instantiateCypresses(list, mats) {
    if (list.length === 0) return;
    const dummy = this.#dummy;
    const color = new THREE.Color();

    const trunkGeo = new THREE.CylinderGeometry(0.17, 0.28, 1.4, 8);
    const coneGeo = new THREE.ConeGeometry(0.96, 2.35, 10);

    const trunkInst = this.#createInstanced(trunkGeo, mats.barkForest, list.length, true, true);
    const coneInst = this.#createInstanced(coneGeo, mats.foliage, list.length * 4, true, true);

    const emeraldPalette = [0x1a5c3a, 0x226e46, 0x2a7f53, 0x164e31];
    const tiers = [
      [1.95, 1.12, 1.02],
      [3.12, 0.92, 0.98],
      [4.22, 0.70, 0.94],
      [5.22, 0.46, 0.88]
    ];

    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      dummy.position.set(t.x, 0.7 * t.scale, t.z);
      dummy.rotation.set(0, t.rot, 0);
      dummy.scale.setScalar(t.scale);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(i, dummy.matrix);

      for (let k = 0; k < 4; k++) {
        const [ty, rad, hs] = tiers[k];
        dummy.position.set(t.x, ty * t.scale, t.z);
        dummy.rotation.set(0, t.rot + k * 0.4, 0);
        dummy.scale.set(rad * t.scale, hs * t.scale, rad * t.scale);
        dummy.updateMatrix();
        const idx = i * 4 + k;
        coneInst.setMatrixAt(idx, dummy.matrix);
        color.setHex(emeraldPalette[(i + k) % emeraldPalette.length]);
        coneInst.setColorAt(idx, color);
      }
    }

    this.#finalizeStaticInstanced(trunkInst);
    this.#finalizeStaticInstanced(coneInst);
  }

  #instantiateBroadleafs(list, mats) {
    if (list.length === 0) return;
    const dummy = this.#dummy;
    const color = new THREE.Color();

    const woodPieces = [];
    const trunkG = new THREE.CylinderGeometry(0.25, 0.40, 2.65, 8);
    const limbG = new THREE.CylinderGeometry(0.11, 0.19, 1.55, 7);

    dummy.position.set(0, 1.32, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    woodPieces.push({ geometry: trunkG, matrix: dummy.matrix.clone() });

    for (const dir of [-1, 1]) {
      dummy.position.set(dir * 0.42, 2.55, dir * 0.18);
      dummy.rotation.set(dir * 0.25, 0.3, -dir * 0.48);
      dummy.updateMatrix();
      woodPieces.push({ geometry: limbG, matrix: dummy.matrix.clone() });
    }
    const woodGeo = mergeGeometries(woodPieces);
    trunkG.dispose();
    limbG.dispose();

    const canopyGeo = new THREE.DodecahedronGeometry(1.62, 1);
    const woodInst = this.#createInstanced(woodGeo, mats.barkForest, list.length, true, true);
    const canopyInst = this.#createInstanced(canopyGeo, mats.foliage, list.length * 4, true, true);

    const lowerPalette = [0x4ca64d, 0x5cb856, 0x3d8f43, 0x67c45a];
    const crownGoldPalette = [0x8cd156, 0xaade64, 0x74c858, 0xbbe36b];
    const offsets = [
      [-0.92, 3.18, 0.58, 0.92],
      [0.94, 3.22, -0.55, 0.94],
      [0.06, 3.30, -0.82, 0.88],
      [0.0, 4.22, 0.08, 1.12]
    ];

    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      dummy.position.set(t.x, 0, t.z);
      dummy.rotation.set(0, t.rot, 0);
      dummy.scale.setScalar(t.scale);
      dummy.updateMatrix();
      woodInst.setMatrixAt(i, dummy.matrix);

      const cosR = Math.cos(t.rot);
      const sinR = Math.sin(t.rot);
      for (let k = 0; k < 4; k++) {
        const [ox, oy, oz, cs] = offsets[k];
        dummy.position.set(
          t.x + (ox * cosR - oz * sinR) * t.scale,
          oy * t.scale,
          t.z + (ox * sinR + oz * cosR) * t.scale
        );
        dummy.rotation.set(k * 0.45, t.rot + k, 0.18);
        dummy.scale.set(cs * t.scale, cs * 0.80 * t.scale, cs * t.scale);
        dummy.updateMatrix();
        const idx = i * 4 + k;
        canopyInst.setMatrixAt(idx, dummy.matrix);
        const pal = k === 3 ? crownGoldPalette : lowerPalette;
        color.setHex(pal[(i + k) % pal.length]);
        canopyInst.setColorAt(idx, color);
      }
    }

    this.#finalizeStaticInstanced(woodInst);
    this.#finalizeStaticInstanced(canopyInst);
  }

  #instantiateTopiaries(list, mats) {
    if (list.length === 0) return;
    const dummy = this.#dummy;
    const color = new THREE.Color();

    // Macetón de mármol imperial
    const marblePieces = [];
    const plinthG = new THREE.CylinderGeometry(0.50, 0.54, 0.14, 8);
    const waistG = new THREE.CylinderGeometry(0.32, 0.40, 0.18, 10);
    const urnG = new THREE.CylinderGeometry(0.52, 0.36, 0.54, 12);

    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.position.set(0, 0.07, 0);
    dummy.updateMatrix();
    marblePieces.push({ geometry: plinthG, matrix: dummy.matrix.clone() });

    dummy.position.set(0, 0.22, 0);
    dummy.updateMatrix();
    marblePieces.push({ geometry: waistG, matrix: dummy.matrix.clone() });

    dummy.position.set(0, 0.56, 0);
    dummy.updateMatrix();
    marblePieces.push({ geometry: urnG, matrix: dummy.matrix.clone() });

    const potMarbleGeo = mergeGeometries(marblePieces);
    plinthG.dispose();
    waistG.dispose();
    urnG.dispose();

    // Molduras y remate oro rosa
    const goldPieces = [];
    const rimBotG = new THREE.TorusGeometry(0.50, 0.032, 8, 20);
    const rimMidG = new THREE.TorusGeometry(0.44, 0.025, 6, 20);
    const rimTopG = new THREE.TorusGeometry(0.52, 0.045, 8, 24);
    const stemPinG = new THREE.CylinderGeometry(0.045, 0.065, 2.05, 7);
    const finialG = new THREE.OctahedronGeometry(0.11, 0);

    dummy.rotation.set(Math.PI / 2, 0, 0);
    dummy.position.set(0, 0.14, 0);
    dummy.updateMatrix();
    goldPieces.push({ geometry: rimBotG, matrix: dummy.matrix.clone() });

    dummy.position.set(0, 0.56, 0);
    dummy.updateMatrix();
    goldPieces.push({ geometry: rimMidG, matrix: dummy.matrix.clone() });

    dummy.position.set(0, 0.83, 0);
    dummy.updateMatrix();
    goldPieces.push({ geometry: rimTopG, matrix: dummy.matrix.clone() });

    dummy.rotation.set(0, 0, 0);
    dummy.position.set(0, 1.82, 0);
    dummy.updateMatrix();
    goldPieces.push({ geometry: stemPinG, matrix: dummy.matrix.clone() });

    dummy.position.set(0, 2.94, 0);
    dummy.updateMatrix();
    goldPieces.push({ geometry: finialG, matrix: dummy.matrix.clone() });

    const potGoldGeo = mergeGeometries(goldPieces);
    rimBotG.dispose();
    rimMidG.dispose();
    rimTopG.dispose();
    stemPinG.dispose();
    finialG.dispose();

    // Variante A: Arbusto esculpido en Espiral
    const spiralPieces = [];
    const puffUnitG = new THREE.IcosahedronGeometry(1.0, 1);
    const steps = 15;
    for (let s = 0; s < steps; s++) {
      const t = s / (steps - 1);
      const ang = t * Math.PI * 4.4;
      const orbitR = (1 - t * 0.85) * 0.25;
      const rad = 0.40 * (1 - t * 0.56);
      dummy.position.set(Math.cos(ang) * orbitR, 1.04 + t * 1.68, Math.sin(ang) * orbitR);
      dummy.rotation.set(t * 1.2, ang, 0.15);
      dummy.scale.set(rad * 1.12, rad * 0.82, rad * 1.12);
      dummy.updateMatrix();
      spiralPieces.push({ geometry: puffUnitG, matrix: dummy.matrix.clone() });
    }
    const spiralGeo = mergeGeometries(spiralPieces);

    // Variante B: Arbusto esculpido en Doble Esfera
    const doublePieces = [];
    const sphereUnitG = new THREE.IcosahedronGeometry(1.0, 2);
    dummy.rotation.set(0, 0, 0);
    dummy.position.set(0, 1.32, 0);
    dummy.scale.set(0.64, 0.56, 0.64);
    dummy.updateMatrix();
    doublePieces.push({ geometry: sphereUnitG, matrix: dummy.matrix.clone() });

    dummy.position.set(0, 1.84, 0);
    dummy.scale.set(0.28, 0.20, 0.28);
    dummy.updateMatrix();
    doublePieces.push({ geometry: puffUnitG, matrix: dummy.matrix.clone() });

    dummy.position.set(0, 2.24, 0);
    dummy.scale.set(0.46, 0.42, 0.46);
    dummy.updateMatrix();
    doublePieces.push({ geometry: sphereUnitG, matrix: dummy.matrix.clone() });

    dummy.position.set(0, 2.72, 0);
    dummy.scale.set(0.19, 0.19, 0.19);
    dummy.updateMatrix();
    doublePieces.push({ geometry: puffUnitG, matrix: dummy.matrix.clone() });

    const doubleGeo = mergeGeometries(doublePieces);
    puffUnitG.dispose();
    sphereUnitG.dispose();

    const spirals = list.filter((t) => t.variant % 2 === 0);
    const doubles = list.filter((t) => t.variant % 2 !== 0);

    const potMarbleInst = this.#createInstanced(potMarbleGeo, mats.marble, list.length, true, true);
    const potGoldInst = this.#createInstanced(potGoldGeo, mats.roseGold, list.length, true, false);

    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      dummy.position.set(t.x, 0, t.z);
      dummy.rotation.set(0, t.rot, 0);
      dummy.scale.setScalar(t.scale);
      dummy.updateMatrix();
      potMarbleInst.setMatrixAt(i, dummy.matrix);
      potGoldInst.setMatrixAt(i, dummy.matrix);
    }
    this.#finalizeStaticInstanced(potMarbleInst);
    this.#finalizeStaticInstanced(potGoldInst);

    const boxwoodPalette = [0x2b7a44, 0x358c50, 0x246a3a, 0x3f9b5b];

    if (spirals.length > 0) {
      const spiralInst = this.#createInstanced(spiralGeo, mats.foliage, spirals.length, true, true);
      for (let i = 0; i < spirals.length; i++) {
        const t = spirals[i];
        dummy.position.set(t.x, 0, t.z);
        dummy.rotation.set(0, t.rot, 0);
        dummy.scale.setScalar(t.scale);
        dummy.updateMatrix();
        spiralInst.setMatrixAt(i, dummy.matrix);
        color.setHex(boxwoodPalette[i % boxwoodPalette.length]);
        spiralInst.setColorAt(i, color);
      }
      this.#finalizeStaticInstanced(spiralInst);
    } else {
      spiralGeo.dispose();
    }

    if (doubles.length > 0) {
      const doubleInst = this.#createInstanced(doubleGeo, mats.foliage, doubles.length, true, true);
      for (let i = 0; i < doubles.length; i++) {
        const t = doubles[i];
        dummy.position.set(t.x, 0, t.z);
        dummy.rotation.set(0, t.rot, 0);
        dummy.scale.setScalar(t.scale);
        dummy.updateMatrix();
        doubleInst.setMatrixAt(i, dummy.matrix);
        color.setHex(boxwoodPalette[(i + 1) % boxwoodPalette.length]);
        doubleInst.setColorAt(i, color);
      }
      this.#finalizeStaticInstanced(doubleInst);
    } else {
      doubleGeo.dispose();
    }
  }

  #instantiateRoyalPalms(list, mats) {
    if (list.length === 0) return;
    const dummy = this.#dummy;
    const color = new THREE.Color();

    // Tronco esbelto curvado con 8 segmentos anillados tropicales + cocos
    const trunkPieces = [];
    const segCount = 8;
    const totalH = 4.9;
    const segUnitG = new THREE.CylinderGeometry(0.84, 1.0, 1.0, 8);
    const ringCollarG = new THREE.TorusGeometry(0.92, 0.14, 5, 10);
    const cocoG = new THREE.SphereGeometry(0.14, 7, 6);

    for (let s = 0; s < segCount; s++) {
      const t0 = s / segCount;
      const t1 = (s + 1) / segCount;
      const tm = (t0 + t1) * 0.5;
      const x0 = 0.58 * t0 * t0;
      const x1 = 0.58 * t1 * t1;
      const y0 = t0 * totalH;
      const y1 = t1 * totalH;
      const xm = (x0 + x1) * 0.5;
      const ym = (y0 + y1) * 0.5;
      const len = Math.hypot(x1 - x0, y1 - y0) * 1.06;
      const tilt = -Math.atan2(x1 - x0, y1 - y0);
      const rad = 0.33 * (1 - tm * 0.52);

      dummy.position.set(xm, ym, 0);
      dummy.rotation.set(0, 0, tilt);
      dummy.scale.set(rad, len, rad);
      dummy.updateMatrix();
      trunkPieces.push({ geometry: segUnitG, matrix: dummy.matrix.clone() });

      dummy.position.set(x1, y1, 0);
      dummy.rotation.set(Math.PI / 2, tilt, 0);
      dummy.scale.set(rad * 0.92, rad * 0.92, rad * 0.65);
      dummy.updateMatrix();
      trunkPieces.push({ geometry: ringCollarG, matrix: dummy.matrix.clone() });
    }

    for (let c = 0; c < 3; c++) {
      const ca = (c / 3) * Math.PI * 2;
      dummy.position.set(0.58 + Math.cos(ca) * 0.16, totalH - 0.12, Math.sin(ca) * 0.16);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1.15, 1);
      dummy.updateMatrix();
      trunkPieces.push({ geometry: cocoG, matrix: dummy.matrix.clone() });
    }

    const palmTrunkGeo = mergeGeometries(trunkPieces);
    segUnitG.dispose();
    ringCollarG.dispose();
    cocoG.dispose();

    // Corona de 8 hojas arqueadas estilizadas centradas en la cúspide (0.58, 4.92, 0)
    const crownPieces = [];
    const bladeSegG = new THREE.BoxGeometry(0.46, 0.035, 0.72);
    const spearG = new THREE.ConeGeometry(0.09, 0.85, 6);

    dummy.position.set(0.58, totalH + 0.36, 0);
    dummy.rotation.set(0, 0, -0.14);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    crownPieces.push({ geometry: spearG, matrix: dummy.matrix.clone() });

    const frondCount = 8;
    const pivot = new THREE.Object3D();
    const leafPart = new THREE.Object3D();
    pivot.add(leafPart);

    for (let f = 0; f < frondCount; f++) {
      const yaw = (f / frondCount) * Math.PI * 2 + (f % 2) * 0.12;
      const lift = f % 2 === 0 ? 0.36 : 0.16;
      pivot.position.set(0.58, totalH + 0.04, 0);
      pivot.rotation.set(0, yaw, 0);
      pivot.scale.set(1, 1, 1);

      let curZ = 0.12;
      let curY = 0.04;
      for (let b = 0; b < 4; b++) {
        const pitch = lift - b * 0.34;
        const segLen = 0.66;
        const midZ = curZ + Math.cos(pitch) * segLen * 0.5;
        const midY = curY + Math.sin(pitch) * segLen * 0.5;
        const widthScale = b === 0 ? 0.78 : b === 1 ? 1.18 : b === 2 ? 1.02 : 0.58;

        leafPart.position.set(0, midY, midZ);
        leafPart.rotation.set(-pitch, 0, (f % 2 === 0 ? 1 : -1) * 0.08);
        leafPart.scale.set(widthScale, 1, 1);
        pivot.updateMatrixWorld(true);
        crownPieces.push({ geometry: bladeSegG, matrix: leafPart.matrixWorld.clone() });

        curZ += Math.cos(pitch) * segLen * 0.94;
        curY += Math.sin(pitch) * segLen * 0.94;
      }
    }

    const palmCrownGeo = mergeGeometries(crownPieces);
    bladeSegG.dispose();
    spearG.dispose();

    const trunkInst = this.#createInstanced(palmTrunkGeo, mats.barkPalm, list.length, true, true);
    const crownInst = this.#createInstanced(palmCrownGeo, mats.foliage, list.length, true, false);
    const palmPalette = [0x3ca34b, 0x4eb857, 0x2e8e40, 0x64c659];

    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      dummy.position.set(t.x, 0, t.z);
      dummy.rotation.set(0, t.rot, 0);
      dummy.scale.setScalar(t.scale);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(i, dummy.matrix);
      crownInst.setMatrixAt(i, dummy.matrix);

      color.setHex(palmPalette[i % palmPalette.length]);
      crownInst.setColorAt(i, color);
    }

    this.#finalizeStaticInstanced(trunkInst);
    this.#finalizeStaticInstanced(crownInst);
  }

  #buildGeometricFlowerbeds(mats) {
    const beds = [];
    const addEllipticalBed = (cx, cz, rx, rz, count, kind, rot = 0) => {
      beds.push({ cx, cz, rx, rz, count, kind, rot });
    };

    const kinds = ['rose', 'tulip', 'daisy', 'lavender'];

    // 1. Todo el perímetro exterior del Casino (r ∈ [44, 62] alrededor de (162, 0))
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r1 = 44.6;
      addEllipticalBed(
        CASINO_CX + Math.cos(a) * r1,
        CASINO_CZ + Math.sin(a) * r1,
        3.6,
        1.35,
        62,
        kinds[i % 4],
        -a + Math.PI / 2
      );

      if (i % 2 === 0) {
        const a2 = a + Math.PI / 24;
        const r2 = 54.0;
        addEllipticalBed(
          CASINO_CX + Math.cos(a2) * r2,
          CASINO_CZ + Math.sin(a2) * r2,
          4.2,
          1.7,
          60,
          kinds[(i + 2) % 4],
          -a2 + Math.PI / 2
        );
      }
    }

    // Rodeando las Fuentes VIP del Casino (162, ±48, r=9.0) y Glorietas VIP (208, ±22, r=5.8)
    for (const fz of [-48.0, 48.0]) {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        addEllipticalBed(
          162.0 + Math.cos(a) * 10.2,
          fz + Math.sin(a) * 10.2,
          2.6,
          1.15,
          46,
          kinds[k % 4],
          -a + Math.PI / 2
        );
      }
    }
    for (const gz of [-22.0, 22.0]) {
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.4;
        addEllipticalBed(
          208.0 + Math.cos(a) * 6.8,
          gz + Math.sin(a) * 6.8,
          2.3,
          1.1,
          40,
          kinds[(k + 1) % 4],
          -a + Math.PI / 2
        );
      }
    }

    // 2. Ambos lados del Bulevar Imperial (X = 44..112)
    let bIdx = 0;
    for (let x = 45.0; x <= 111.0; x += 7.4) {
      for (const zSide of [-7.55, 7.55]) {
        addEllipticalBed(x, zSide, 3.2, 0.95, 48, kinds[(bIdx++) % 4], 0);
      }
    }

    // 3. Riberas del Río Cristalino (z ∈ [-70, 30])
    let rIdx = 0;
    for (let z = -68.0; z <= 28.0; z += 10.5) {
      const rcx = riverCenterX(z);
      addEllipticalBed(rcx - 6.2, z, 1.35, 3.2, 42, kinds[(rIdx++) % 4], 0.15);
      addEllipticalBed(rcx + 6.2, z + 4.5, 1.35, 3.2, 42, kinds[(rIdx++) % 4], -0.15);
    }

    // 4. Orilla exterior del Lago de los Cisnes (106, 45) y Estanque Este (46, 26)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.35;
      addEllipticalBed(
        106.0 + Math.cos(a) * 22.6,
        45.0 + Math.sin(a) * 13.9,
        2.8,
        1.25,
        44,
        kinds[i % 4],
        -a + Math.PI / 2
      );
    }
    for (let i = 0; i < 5; i++) {
      const a = -0.9 + (i / 4) * 2.2;
      addEllipticalBed(
        46.0 + Math.cos(a) * 12.4,
        26.0 + Math.sin(a) * 9.8,
        2.4,
        1.15,
        38,
        kinds[(i + 1) % 4],
        -a + Math.PI / 2
      );
    }

    // 5. Fachada del Palacio, Fuente Central y Pasarela en T
    const palaceAndRunwayBeds = [
      [-22.0, -13.9, 9.5, 1.15, 95, 'rose', 0],
      [22.0, -13.9, 9.5, 1.15, 95, 'rose', 0],
      [-35.0, -13.9, 3.5, 1.1, 45, 'daisy', 0],
      [35.0, -13.9, 3.5, 1.1, 45, 'daisy', 0],
      // Cuadrantes de la Fuente Central
      [12.2, 11.6, 2.8, 1.6, 55, 'tulip', -0.7],
      [-12.2, 11.6, 2.8, 1.6, 55, 'daisy', 0.7],
      [12.2, -11.4, 2.8, 1.6, 55, 'rose', 0.7],
      [-12.2, -11.4, 2.8, 1.6, 55, 'lavender', -0.7],
      // Pasarela en T (exteriores)
      [-48.0, -19.4, 11.0, 1.15, 95, 'rose', 0],
      [-48.0, 29.4, 11.0, 1.15, 95, 'tulip', 0],
      [-67.4, -8.5, 1.15, 6.5, 65, 'lavender', 0],
      [-67.4, 11.5, 1.15, 6.5, 65, 'daisy', 0],
      // Avenida Norte-Sur & Mirador Sur
      [-7.5, 22.5, 1.15, 7.0, 68, 'lavender', 0],
      [7.5, 22.5, 1.15, 7.0, 68, 'daisy', 0],
      [-10.8, 44.5, 2.2, 2.6, 48, 'rose', 0],
      [10.8, 44.5, 2.2, 2.6, 48, 'tulip', 0]
    ];
    for (const [cx, cz, rx, rz, cnt, kind, rot] of palaceAndRunwayBeds) {
      addEllipticalBed(cx, cz, rx, rz, cnt, kind, rot);
    }

    const roses = [];
    const tulips = [];
    const daisies = [];
    const lavenders = [];
    const shrubs = [];

    let seed = 701.3;
    for (let b = 0; b < beds.length; b++) {
      const bed = beds[b];
      const cosB = Math.cos(bed.rot);
      const sinB = Math.sin(bed.rot);

      // Arbustos bajos de lavanda y jardín en los extremos de cada parterre
      for (const side of [-0.78, 0.78]) {
        const sx = bed.cx + side * bed.rx * cosB;
        const sz = bed.cz + side * bed.rx * sinB;
        if (!this.isReservedForFlowers(sx, sz, 0.55)) {
          shrubs.push([sx, sz, bed.kind === 'lavender' ? 1 : 0]);
        }
      }

      for (let i = 0; i < bed.count; i++) {
        seed += 2.19;
        const a = this.#pseudoRand(seed) * Math.PI * 2;
        const r = Math.sqrt(this.#pseudoRand(seed + 7.3));
        const lx = Math.cos(a) * r * bed.rx;
        const lz = Math.sin(a) * r * bed.rz;
        const fx = bed.cx + lx * cosB - lz * sinB;
        const fz = bed.cz + lx * sinB + lz * cosB;

        if (this.isReservedForFlowers(fx, fz, 0.25)) continue;

        const h = 0.82 + this.#pseudoRand(seed + 15.1) * 0.42;
        const yaw = this.#pseudoRand(seed + 31.7) * Math.PI * 2;
        if (bed.kind === 'rose') roses.push([fx, fz, h, yaw]);
        else if (bed.kind === 'tulip') tulips.push([fx, fz, h, yaw]);
        else if (bed.kind === 'daisy') daisies.push([fx, fz, h, yaw]);
        else lavenders.push([fx, fz, h, yaw]);
      }
    }

    const dummy = this.#dummy;
    const color = new THREE.Color();

    // Tallo compartido con 2 hojitas para TODAS las flores (~3.600 instancias en 1 draw call)
    const allFlowers = [...roses, ...tulips, ...daisies, ...lavenders];
    if (allFlowers.length > 0) {
      const stemPieces = [];
      const stalkG = new THREE.CylinderGeometry(0.017, 0.025, 0.34, 5);
      const leafG = new THREE.BoxGeometry(0.09, 0.015, 0.04);

      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(0, 0.17, 0);
      dummy.updateMatrix();
      stemPieces.push({ geometry: stalkG, matrix: dummy.matrix.clone() });

      dummy.position.set(0.04, 0.14, 0);
      dummy.rotation.set(0, 0.2, 0.42);
      dummy.updateMatrix();
      stemPieces.push({ geometry: leafG, matrix: dummy.matrix.clone() });

      dummy.position.set(-0.04, 0.21, 0.01);
      dummy.rotation.set(0, -0.3, -0.42);
      dummy.updateMatrix();
      stemPieces.push({ geometry: leafG, matrix: dummy.matrix.clone() });

      const sharedStemGeo = mergeGeometries(stemPieces);
      stalkG.dispose();
      leafG.dispose();

      const stemInst = this.#createInstanced(sharedStemGeo, mats.stemGreen, allFlowers.length, false, false, true);
      for (let i = 0; i < allFlowers.length; i++) {
        const [x, z, h, yaw] = allFlowers[i];
        dummy.position.set(x, 0, z);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, h, 1);
        dummy.updateMatrix();
        stemInst.setMatrixAt(i, dummy.matrix);
      }
      this.#finalizeStaticInstanced(stemInst);
    }

    // 1. Rosas (carmesí, rosa imperial, blanco marfil)
    if (roses.length > 0) {
      const rosePieces = [];
      const outerG = new THREE.DodecahedronGeometry(0.125, 0);
      const innerG = new THREE.OctahedronGeometry(0.082, 0);
      dummy.scale.set(1, 0.85, 1);
      dummy.rotation.set(0.15, 0, 0.1);
      dummy.position.set(0, 0.35, 0);
      dummy.updateMatrix();
      rosePieces.push({ geometry: outerG, matrix: dummy.matrix.clone() });

      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0.6, 0);
      dummy.position.set(0, 0.38, 0);
      dummy.updateMatrix();
      rosePieces.push({ geometry: innerG, matrix: dummy.matrix.clone() });

      const roseGeo = mergeGeometries(rosePieces);
      outerG.dispose();
      innerG.dispose();

      const roseInst = this.#createInstanced(roseGeo, mats.flowerPetal, roses.length, false, false, true);
      const rosePalette = [0xd91e41, 0xff6fa9, 0xfff6f0];
      for (let i = 0; i < roses.length; i++) {
        const [x, z, h, yaw] = roses[i];
        const sc = 0.92 + (i % 3) * 0.10;
        dummy.position.set(x, 0, z);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(sc, h, sc);
        dummy.updateMatrix();
        roseInst.setMatrixAt(i, dummy.matrix);
        color.setHex(rosePalette[i % rosePalette.length]);
        roseInst.setColorAt(i, color);
      }
      this.#finalizeStaticInstanced(roseInst);
    }

    // 2. Tulipanes (dorados, violetas, coral)
    if (tulips.length > 0) {
      const tulipPieces = [];
      const cupG = new THREE.CylinderGeometry(0.10, 0.052, 0.21, 6);
      dummy.position.set(0, 0.37, 0);
      dummy.rotation.set(0.05, 0, 0.04);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      tulipPieces.push({ geometry: cupG, matrix: dummy.matrix.clone() });
      const tulipGeo = mergeGeometries(tulipPieces);
      cupG.dispose();

      const tulipInst = this.#createInstanced(tulipGeo, mats.flowerPetal, tulips.length, false, false, true);
      const tulipPalette = [0xffca3a, 0x8a4fff, 0xff6e54];
      for (let i = 0; i < tulips.length; i++) {
        const [x, z, h, yaw] = tulips[i];
        dummy.position.set(x, 0, z);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, h, 1);
        dummy.updateMatrix();
        tulipInst.setMatrixAt(i, dummy.matrix);
        color.setHex(tulipPalette[i % tulipPalette.length]);
        tulipInst.setColorAt(i, color);
      }
      this.#finalizeStaticInstanced(tulipInst);
    }

    // 3. Margaritas blancas (corazón botón dorado + corola blanca estilizada)
    if (daisies.length > 0) {
      const corollaPieces = [];
      const petalG = new THREE.BoxGeometry(0.052, 0.016, 0.135);
      for (let p = 0; p < 8; p++) {
        const pa = (p / 8) * Math.PI * 2;
        dummy.position.set(Math.sin(pa) * 0.085, 0.345, Math.cos(pa) * 0.085);
        dummy.rotation.set(0.12, pa, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        corollaPieces.push({ geometry: petalG, matrix: dummy.matrix.clone() });
      }
      const corollaGeo = mergeGeometries(corollaPieces);
      petalG.dispose();

      const heartPieces = [];
      const btnG = new THREE.SphereGeometry(0.058, 7, 5);
      dummy.position.set(0, 0.358, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 0.55, 1);
      dummy.updateMatrix();
      heartPieces.push({ geometry: btnG, matrix: dummy.matrix.clone() });
      const heartGeo = mergeGeometries(heartPieces);
      btnG.dispose();

      const corollaInst = this.#createInstanced(corollaGeo, mats.flowerPetal, daisies.length, false, false, true);
      const heartInst = this.#createInstanced(heartGeo, mats.daisyGold, daisies.length, false, false, true);
      const daisyWhites = [0xffffff, 0xfff9fc, 0xf7f5ff];

      for (let i = 0; i < daisies.length; i++) {
        const [x, z, h, yaw] = daisies[i];
        dummy.position.set(x, 0, z);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, h, 1);
        dummy.updateMatrix();
        corollaInst.setMatrixAt(i, dummy.matrix);
        heartInst.setMatrixAt(i, dummy.matrix);
        color.setHex(daisyWhites[i % daisyWhites.length]);
        corollaInst.setColorAt(i, color);
      }
      this.#finalizeStaticInstanced(corollaInst);
      this.#finalizeStaticInstanced(heartInst);
    }

    // 4. Espigas de lavanda imperial
    if (lavenders.length > 0) {
      const spikePieces = [];
      const coneG = new THREE.ConeGeometry(0.062, 0.28, 6);

      dummy.position.set(0, 0.43, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      spikePieces.push({ geometry: coneG, matrix: dummy.matrix.clone() });

      for (const dir of [-1, 1]) {
        dummy.position.set(dir * 0.055, 0.37, dir * 0.02);
        dummy.rotation.set(0.08, 0, -dir * 0.22);
        dummy.scale.set(0.82, 0.82, 0.82);
        dummy.updateMatrix();
        spikePieces.push({ geometry: coneG, matrix: dummy.matrix.clone() });
      }
      const lavGeo = mergeGeometries(spikePieces);
      coneG.dispose();

      const lavInst = this.#createInstanced(lavGeo, mats.flowerPetal, lavenders.length, false, false, true);
      const lavPalette = [0x8b63da, 0xa57ef2, 0x6f46c2];
      for (let i = 0; i < lavenders.length; i++) {
        const [x, z, h, yaw] = lavenders[i];
        dummy.position.set(x, 0, z);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, h, 1);
        dummy.updateMatrix();
        lavInst.setMatrixAt(i, dummy.matrix);
        color.setHex(lavPalette[i % lavPalette.length]);
        lavInst.setColorAt(i, color);
      }
      this.#finalizeStaticInstanced(lavInst);
    }

    // Arbustos bajos de lavanda imperial y jardín (sin colisión)
    if (shrubs.length > 0) {
      const bushGeo = new THREE.IcosahedronGeometry(0.56, 1);
      const tuftGeo = new THREE.ConeGeometry(0.075, 0.24, 5);
      const bushInst = this.#createInstanced(bushGeo, mats.foliage, shrubs.length, false, true, true);
      const tuftInst = this.#createInstanced(tuftGeo, mats.flowerPetal, shrubs.length * 4, false, false, true);

      const greenCols = [0x3d8c45, 0x4b9d52];
      const lavBushCols = [0x597d68, 0x4f7360];
      const tuftLavCols = [0x956ee5, 0xb18df7];
      const tuftRoseCols = [0xff8ec4, 0xfff2f8];

      for (let i = 0; i < shrubs.length; i++) {
        const [bx, bz, isLav] = shrubs[i];
        dummy.position.set(bx, 0.30, bz);
        dummy.rotation.set(0, i * 1.1, 0);
        dummy.scale.set(1.12, 0.72, 1.05);
        dummy.updateMatrix();
        bushInst.setMatrixAt(i, dummy.matrix);
        color.setHex(isLav ? lavBushCols[i % 2] : greenCols[i % 2]);
        bushInst.setColorAt(i, color);

        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + i * 0.7;
          dummy.position.set(bx + Math.cos(a) * 0.32, 0.58, bz + Math.sin(a) * 0.32);
          dummy.rotation.set(Math.sin(a) * 0.18, a, -Math.cos(a) * 0.18);
          dummy.scale.setScalar(isLav ? 1.0 : 0.72);
          dummy.updateMatrix();
          const idx = i * 4 + k;
          tuftInst.setMatrixAt(idx, dummy.matrix);
          color.setHex(isLav ? tuftLavCols[(i + k) % 2] : tuftRoseCols[(i + k) % 2]);
          tuftInst.setColorAt(idx, color);
        }
      }
      this.#finalizeStaticInstanced(bushInst);
      this.#finalizeStaticInstanced(tuftInst);
    }
  }

  #buildAquaticAndRiparianFlora(mats) {
    const dummy = this.#dummy;
    const color = new THREE.Color();

    const isNearAnyBridgeOrBoulevard = (x, z, pad = 0.8) => {
      if (x >= 40 && x <= 130 && Math.abs(z) <= 6.8 + pad) return true;
      for (let i = 0; i < BRIDGES.length; i++) {
        const [bx, bz, br] = BRIDGES[i];
        if (Math.hypot(x - bx, z - bz) < br + pad) return true;
      }
      return false;
    };

    // -------------------------------------------------------------------------
    // 1. Juncos esbeltos con espadañas en orillas húmedas
    // -------------------------------------------------------------------------
    const reeds = [];

    // Orillas del Río Cristalino (x = riverCenterX(z) ± 3.5)
    for (let z = -75.0; z <= 34.0; z += 1.65) {
      const rcx = riverCenterX(z);
      const side = Math.sin(z * 1.7) > -0.25 ? 1 : -1;
      const rx1 = rcx + side * (3.42 + (Math.abs(z) % 2) * 0.16);
      if (!isNearAnyBridgeOrBoulevard(rx1, z, 0.9)) {
        reeds.push([rx1, z, 0.85 + this.#pseudoRand(z * 3.1) * 0.38]);
      }
      if (Math.cos(z * 0.9) > 0.15) {
        const rx2 = rcx - side * 3.48;
        if (!isNearAnyBridgeOrBoulevard(rx2, z + 0.6, 0.9)) {
          reeds.push([rx2, z + 0.6, 0.82 + this.#pseudoRand(z * 5.7) * 0.36]);
        }
      }
    }

    // Orilla del Lago de los Cisnes (106, 45, rx=21, rz=12.5)
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const rx = 106.0 + Math.cos(a) * 20.5;
      const rz = 45.0 + Math.sin(a) * 12.1;
      // Dejar desembocadura del río despejada en NW
      if (rz < 35.5 && rx > 96.0 && rx < 106.0) continue;
      if (i % 4 === 2) continue;
      reeds.push([rx, rz, 0.88 + (i % 3) * 0.14]);
    }

    // Orilla del Estanque Este (46, 26, rx=11, rz=8.5)
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const rx = 46.0 + Math.cos(a) * 10.55;
      const rz = 26.0 + Math.sin(a) * 8.15;
      if (rx < 37.8 && rz > 21.0 && rz < 27.5) continue;
      if (i % 3 === 1) continue;
      reeds.push([rx, rz, 0.85 + (i % 3) * 0.13]);
    }

    if (reeds.length > 0) {
      const stalkPieces = [];
      const cattailPieces = [];
      const stalkG = new THREE.CylinderGeometry(0.015, 0.026, 1.28, 5);
      const bladeG = new THREE.ConeGeometry(0.036, 0.95, 4);
      const headG = new THREE.CylinderGeometry(0.034, 0.034, 0.25, 6);

      const offsets = [
        [0, 0, 0.04, 0.02, 1.08, true],
        [0.11, 0.06, -0.06, 0.07, 0.96, true],
        [-0.10, 0.05, 0.05, -0.08, 1.02, true],
        [0.06, -0.10, -0.08, -0.04, 0.84, false],
        [-0.08, -0.08, 0.09, 0.06, 0.88, false]
      ];

      for (let k = 0; k < offsets.length; k++) {
        const [ox, oz, tx, tz, hs, hasHead] = offsets[k];
        dummy.position.set(ox, 0.62 * hs, oz);
        dummy.rotation.set(tx, k * 0.7, tz);
        dummy.scale.set(1, hs, 1);
        dummy.updateMatrix();
        stalkPieces.push({ geometry: stalkG, matrix: dummy.matrix.clone() });

        if (hasHead) {
          dummy.position.set(ox + Math.sin(tz) * -0.45, 1.06 * hs, oz + Math.sin(tx) * 0.45);
          dummy.rotation.set(tx, 0, tz);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          cattailPieces.push({ geometry: headG, matrix: dummy.matrix.clone() });
        }
      }

      for (let b = 0; b < 3; b++) {
        const ba = (b / 3) * Math.PI * 2 + 0.5;
        dummy.position.set(Math.cos(ba) * 0.08, 0.44, Math.sin(ba) * 0.08);
        dummy.rotation.set(Math.sin(ba) * 0.28, ba, -Math.cos(ba) * 0.28);
        dummy.scale.set(1, 1, 0.45);
        dummy.updateMatrix();
        stalkPieces.push({ geometry: bladeG, matrix: dummy.matrix.clone() });
      }

      const reedGeo = mergeGeometries(stalkPieces);
      const cattailGeo = mergeGeometries(cattailPieces);
      stalkG.dispose();
      bladeG.dispose();
      headG.dispose();

      const reedInst = this.#createInstanced(reedGeo, mats.reedGreen, reeds.length, false, false, true);
      const cattailInst = this.#createInstanced(cattailGeo, mats.cattailBrown, reeds.length, false, false, true);
      const reedPalette = [0x4c944c, 0x5da653, 0x3e8344, 0x6cb05a];

      for (let i = 0; i < reeds.length; i++) {
        const [rx, rz, sc] = reeds[i];
        dummy.position.set(rx, 0.02, rz);
        dummy.rotation.set(0, i * 1.37, 0);
        dummy.scale.setScalar(sc);
        dummy.updateMatrix();
        reedInst.setMatrixAt(i, dummy.matrix);
        cattailInst.setMatrixAt(i, dummy.matrix);
        color.setHex(reedPalette[i % reedPalette.length]);
        reedInst.setColorAt(i, color);
      }

      this.#finalizeStaticInstanced(reedInst);
      this.#finalizeStaticInstanced(cattailInst);
    }

    // -------------------------------------------------------------------------
    // 2. Nenúfares verdes y Flores de Loto rosas/blancas flotando en Y = 0.075
    // -------------------------------------------------------------------------
    const pads = [];
    const lotuses = [];

    // Remansos del Río Cristalino
    let lSeed = 913.4;
    for (let z = -70.0; z <= 32.0; z += 4.2) {
      const rcx = riverCenterX(z);
      const side = (Math.floor(z + 100) % 2 === 0) ? 1 : -1;
      const lx = rcx + side * (1.25 + this.#pseudoRand(lSeed++) * 1.15);
      if (isNearAnyBridgeOrBoulevard(lx, z, 1.2)) continue;
      pads.push([lx, z, 0.78 + this.#pseudoRand(lSeed++) * 0.42]);
      if (pads.length % 2 === 0) {
        lotuses.push([lx, z, 0.85 + this.#pseudoRand(lSeed++) * 0.30]);
      }
      // Segundo nenúfar compañero en el remanso
      const lx2 = lx - side * 0.75;
      const lz2 = z + 0.85;
      if (!isNearAnyBridgeOrBoulevard(lx2, lz2, 1.2)) {
        pads.push([lx2, lz2, 0.68 + this.#pseudoRand(lSeed++) * 0.35]);
      }
    }

    // Lago de los Cisnes (106, 45, rx=21, rz=12.5) — grupos elegantes cerca de la orilla dejando centro libre
    for (let i = 0; i < 68; i++) {
      lSeed += 1.83;
      const a = (i / 68) * Math.PI * 2 + this.#pseudoRand(lSeed) * 0.16;
      const rNorm = 0.50 + this.#pseudoRand(lSeed + 4.7) * 0.36;
      const lx = 106.0 + Math.cos(a) * 21.0 * rNorm;
      const lz = 45.0 + Math.sin(a) * 12.5 * rNorm;
      pads.push([lx, lz, 0.82 + (i % 4) * 0.14]);
      if (i % 3 !== 1) {
        lotuses.push([lx, lz, 0.88 + (i % 3) * 0.14]);
      }
    }

    // Estanque Este (46, 26, rx=11, rz=8.5)
    for (let i = 0; i < 34; i++) {
      lSeed += 2.11;
      const a = (i / 34) * Math.PI * 2 + 0.25;
      const rNorm = 0.48 + this.#pseudoRand(lSeed) * 0.36;
      const lx = 46.0 + Math.cos(a) * 11.0 * rNorm;
      const lz = 26.0 + Math.sin(a) * 8.5 * rNorm;
      pads.push([lx, lz, 0.78 + (i % 3) * 0.15]);
      if (i % 2 === 0) {
        lotuses.push([lx, lz, 0.86 + (i % 3) * 0.12]);
      }
    }

    if (pads.length > 0) {
      const padGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.026, 14, 1, false, 0.28, Math.PI * 1.82);
      const padInst = this.#createInstanced(padGeo, mats.lilyPad, pads.length, false, true, true);
      const padGreens = [0x3f8f48, 0x4da355, 0x5cb35c, 0x367d40];

      for (let i = 0; i < pads.length; i++) {
        const [lx, lz, sc] = pads[i];
        dummy.position.set(lx, 0.075, lz);
        dummy.rotation.set(0, i * 1.93, 0);
        dummy.scale.set(sc, 1, sc);
        dummy.updateMatrix();
        padInst.setMatrixAt(i, dummy.matrix);
        color.setHex(padGreens[i % padGreens.length]);
        padInst.setColorAt(i, color);
      }
      this.#finalizeStaticInstanced(padInst);
    }

    if (lotuses.length > 0) {
      const lotusPieces = [];
      const outerPetalG = new THREE.ConeGeometry(0.075, 0.24, 5);
      for (let p = 0; p < 6; p++) {
        const pa = (p / 6) * Math.PI * 2;
        dummy.position.set(Math.sin(pa) * 0.13, 0.045, Math.cos(pa) * 0.13);
        dummy.rotation.set(1.08, pa, 0);
        dummy.scale.set(1.15, 1, 0.55);
        dummy.updateMatrix();
        lotusPieces.push({ geometry: outerPetalG, matrix: dummy.matrix.clone() });
      }
      for (let p = 0; p < 6; p++) {
        const pa = (p / 6) * Math.PI * 2 + Math.PI / 6;
        dummy.position.set(Math.sin(pa) * 0.075, 0.085, Math.cos(pa) * 0.075);
        dummy.rotation.set(0.55, pa, 0);
        dummy.scale.set(0.95, 0.92, 0.55);
        dummy.updateMatrix();
        lotusPieces.push({ geometry: outerPetalG, matrix: dummy.matrix.clone() });
      }
      const lotusGeo = mergeGeometries(lotusPieces);
      outerPetalG.dispose();

      const heartGeo = new THREE.CylinderGeometry(0.06, 0.04, 0.055, 7);
      const lotusInst = this.#createInstanced(lotusGeo, mats.flowerPetal, lotuses.length, false, false, true);
      const heartInst = this.#createInstanced(heartGeo, mats.daisyGold, lotuses.length, false, false, true);
      const lotusPalette = [0xff9bc6, 0xfff5fa, 0xff70ad, 0xffd6e8];

      for (let i = 0; i < lotuses.length; i++) {
        const [lx, lz, sc] = lotuses[i];
        dummy.position.set(lx, 0.078, lz);
        dummy.rotation.set(0, i * 1.17, 0);
        dummy.scale.setScalar(sc);
        dummy.updateMatrix();
        lotusInst.setMatrixAt(i, dummy.matrix);

        dummy.position.set(lx, 0.125, lz);
        dummy.scale.setScalar(sc);
        dummy.updateMatrix();
        heartInst.setMatrixAt(i, dummy.matrix);

        color.setHex(lotusPalette[i % lotusPalette.length]);
        lotusInst.setColorAt(i, color);
      }

      this.#finalizeStaticInstanced(lotusInst);
      this.#finalizeStaticInstanced(heartInst);
    }
  }

  #buildGlowingMushrooms(mats) {
    // ~144 setas luminosas pastel bajo los árboles del bosque, ribera del río y arboledas del Casino
    const mushrooms = [];
    const forestTrees = this.#treeRecords.filter(
      (t) => t.species === 'sakura' || t.species === 'broadleaf' || t.species === 'willow'
    );

    let mSeed = 1305.9;
    for (let i = 0; i < forestTrees.length && mushrooms.length < 148; i += 2) {
      const t = forestTrees[i];
      const clusterSize = 3 + (i % 2);
      const baseAngle = this.#pseudoRand(mSeed++) * Math.PI * 2;
      for (let c = 0; c < clusterSize && mushrooms.length < 148; c++) {
        const a = baseAngle + c * 0.72;
        const r = 0.85 + this.#pseudoRand(mSeed++) * 0.75;
        const mx = t.x + Math.cos(a) * r;
        const mz = t.z + Math.sin(a) * r;
        if (this.isReservedForFlowers(mx, mz, 0.25)) continue;
        const sc = 0.72 + this.#pseudoRand(mSeed++) * 0.62;
        const hueIdx = (mushrooms.length + c) % 3;
        mushrooms.push({ x: mx, z: mz, sc, hueIdx, rot: a });
      }
    }

    if (mushrooms.length === 0) return;

    const dummy = this.#dummy;
    const color = new THREE.Color();

    const stemGeo = new THREE.CylinderGeometry(0.036, 0.062, 0.24, 7);
    const capBaseGeo = new THREE.SphereGeometry(0.165, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.58);
    const haloGeo = new THREE.OctahedronGeometry(0.28, 1);

    const stemInst = this.#createInstanced(stemGeo, mats.mushroomStem, mushrooms.length, false, false, true);
    const haloInst = this.#createInstanced(haloGeo, mats.mushroomHalo, mushrooms.length, false, false, true);

    const byHue = [[], [], []];
    const haloPalette = [0xff77c8, 0xc388ff, 0x66f5e4];

    for (let i = 0; i < mushrooms.length; i++) {
      const m = mushrooms[i];
      byHue[m.hueIdx].push(m);

      dummy.position.set(m.x, 0.12 * m.sc, m.z);
      dummy.rotation.set(0.06, m.rot, -0.05);
      dummy.scale.setScalar(m.sc);
      dummy.updateMatrix();
      stemInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(m.x, 0.22 * m.sc, m.z);
      dummy.rotation.set(0, m.rot, 0);
      dummy.scale.setScalar(m.sc * 1.15);
      dummy.updateMatrix();
      haloInst.setMatrixAt(i, dummy.matrix);
      color.setHex(haloPalette[m.hueIdx]);
      haloInst.setColorAt(i, color);
    }

    this.#finalizeStaticInstanced(stemInst);
    this.#finalizeStaticInstanced(haloInst);

    const capMats = [mats.mushroomCapPink, mats.mushroomCapLilac, mats.mushroomCapTurq];
    for (let h = 0; h < 3; h++) {
      const group = byHue[h];
      if (group.length === 0) continue;
      const capGeo = h === 0 ? capBaseGeo : capBaseGeo.clone();
      const capInst = this.#createInstanced(capGeo, capMats[h], group.length, false, false, true);
      for (let i = 0; i < group.length; i++) {
        const m = group[i];
        dummy.position.set(m.x, 0.20 * m.sc, m.z);
        dummy.rotation.set(0.06, m.rot, -0.05);
        dummy.scale.set(m.sc * 1.08, m.sc * 0.92, m.sc * 1.08);
        dummy.updateMatrix();
        capInst.setMatrixAt(i, dummy.matrix);
      }
      this.#finalizeStaticInstanced(capInst);
    }
  }

  #buildGardenLanterns(mats) {
    // ~36-38 faroles bajos japoneses/imperiales a lo largo del río, Lago de los Cisnes y jardines VIP del Casino
    const candidates = [];

    // Senderos del Río Cristalino (intercalados entre sauces)
    for (const z of [-71, -64, -56, -49, -31, -24, -16, 9, 17, 33]) {
      const rcx = riverCenterX(z);
      candidates.push([rcx - 4.95, z]);
      candidates.push([rcx + 4.95, z]);
    }

    // Paseo del Lago de los Cisnes (106, 45)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.38;
      candidates.push([106.0 + Math.cos(a) * 22.3, 45.0 + Math.sin(a) * 13.7]);
    }

    // Jardines VIP del Casino (alrededor de cúpula, fuentes VIP y glorietas VIP)
    const casinoSpots = [
      [151.5, -46.5], [172.5, -46.5], [151.5, 46.5], [172.5, 46.5],
      [154.0, -56.5], [170.0, -56.5], [154.0, 56.5], [170.0, 56.5],
      [201.0, -25.0], [201.0, -19.0], [201.0, 19.0], [201.0, 25.0],
      [136.0, -33.0], [188.0, -33.0], [136.0, 33.0], [188.0, 33.0],
      [206.5, -6.0], [206.5, 6.0], [144.0, -44.0], [180.0, -44.0],
      [144.0, 44.0], [180.0, 44.0]
    ];
    for (const pt of casinoSpots) candidates.push(pt);

    const lanterns = [];
    for (let i = 0; i < candidates.length; i++) {
      const [lx, lz] = candidates[i];
      if (this.isReservedForFlowers(lx, lz, 0.45)) continue;
      let tooClose = false;
      for (let j = 0; j < this.#treeRecords.length; j++) {
        if (Math.hypot(lx - this.#treeRecords[j].x, lz - this.#treeRecords[j].z) < 1.35) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) lanterns.push([lx, lz]);
    }

    if (lanterns.length === 0) return;

    const dummy = this.#dummy;

    // Pedestal bajo de piedra/mármol
    const stonePieces = [];
    const baseFootG = new THREE.CylinderGeometry(0.28, 0.34, 0.14, 6);
    const postG = new THREE.CylinderGeometry(0.11, 0.14, 0.40, 6);
    const trayG = new THREE.CylinderGeometry(0.26, 0.18, 0.08, 6);

    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.position.set(0, 0.07, 0);
    dummy.updateMatrix();
    stonePieces.push({ geometry: baseFootG, matrix: dummy.matrix.clone() });

    dummy.position.set(0, 0.34, 0);
    dummy.updateMatrix();
    stonePieces.push({ geometry: postG, matrix: dummy.matrix.clone() });

    dummy.position.set(0, 0.56, 0);
    dummy.updateMatrix();
    stonePieces.push({ geometry: trayG, matrix: dummy.matrix.clone() });

    const lanternStoneGeo = mergeGeometries(stonePieces);
    baseFootG.dispose();
    postG.dispose();
    trayG.dispose();

    // Tejadillo pagoda y celosía oro rosa
    const goldPieces = [];
    const eaveLowG = new THREE.ConeGeometry(0.36, 0.18, 6);
    const finialG = new THREE.OctahedronGeometry(0.075, 0);
    const barG = new THREE.CylinderGeometry(0.016, 0.016, 0.34, 5);

    dummy.position.set(0, 0.99, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    goldPieces.push({ geometry: eaveLowG, matrix: dummy.matrix.clone() });

    dummy.position.set(0, 1.13, 0);
    dummy.updateMatrix();
    goldPieces.push({ geometry: finialG, matrix: dummy.matrix.clone() });

    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      dummy.position.set(Math.cos(a) * 0.165, 0.75, Math.sin(a) * 0.165);
      dummy.updateMatrix();
      goldPieces.push({ geometry: barG, matrix: dummy.matrix.clone() });
    }

    const lanternGoldGeo = mergeGeometries(goldPieces);
    eaveLowG.dispose();
    finialG.dispose();
    barG.dispose();

    // Cristal cálido y halo aditivo con centro local horneado en Y = 0.75
    const glassPieces = [];
    const coreG = new THREE.CylinderGeometry(0.145, 0.13, 0.32, 6);
    dummy.position.set(0, 0.75, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    glassPieces.push({ geometry: coreG, matrix: dummy.matrix.clone() });
    const lanternGlassGeo = mergeGeometries(glassPieces);
    coreG.dispose();

    const haloPieces = [];
    const auraG = new THREE.OctahedronGeometry(0.52, 1);
    dummy.position.set(0, 0.75, 0);
    dummy.updateMatrix();
    haloPieces.push({ geometry: auraG, matrix: dummy.matrix.clone() });
    const lanternHaloGeo = mergeGeometries(haloPieces);
    auraG.dispose();

    const stoneInst = this.#createInstanced(lanternStoneGeo, mats.marble, lanterns.length, false, true);
    const goldInst = this.#createInstanced(lanternGoldGeo, mats.roseGold, lanterns.length, false, false);
    const glassInst = this.#createInstanced(lanternGlassGeo, mats.lanternGlass, lanterns.length, false, false);
    const haloInst = this.#createInstanced(lanternHaloGeo, mats.lanternHalo, lanterns.length, false, false);

    for (let i = 0; i < lanterns.length; i++) {
      const [lx, lz] = lanterns[i];
      dummy.position.set(lx, 0, lz);
      dummy.rotation.set(0, (i % 6) * (Math.PI / 6), 0);
      dummy.scale.setScalar(1.04);
      dummy.updateMatrix();
      stoneInst.setMatrixAt(i, dummy.matrix);
      goldInst.setMatrixAt(i, dummy.matrix);
      glassInst.setMatrixAt(i, dummy.matrix);
      haloInst.setMatrixAt(i, dummy.matrix);
    }

    this.#finalizeStaticInstanced(stoneInst);
    this.#finalizeStaticInstanced(goldInst);
    this.#finalizeStaticInstanced(glassInst);
    this.#finalizeStaticInstanced(haloInst);
  }

  #buildSakuraPetals() {
    // ~220 pétalos de cerezo cayendo tanto en el Bosque/Palacio/Río como en los jardines del Casino
    const count = 220;
    const pos = new Float32Array(count * 3);
    this.#petalData = new Float32Array(count * 4);

    const sakuras = this.#treeRecords.filter((t) => t.species === 'sakura');
    let seed = 3101.5;

    for (let i = 0; i < count; i++) {
      seed += 1.67;
      let px;
      let pz;

      if (sakuras.length > 0 && i < 165) {
        const tree = sakuras[i % sakuras.length];
        const ang = this.#pseudoRand(seed) * Math.PI * 2;
        const rad = 0.8 + this.#pseudoRand(seed + 4.3) * 5.2;
        px = tree.x + Math.cos(ang) * rad;
        pz = tree.z + Math.sin(ang) * rad;
      } else if (i % 2 === 0) {
        // Jardines del Casino (anillo exterior r ∈ [44, 72])
        const ang = this.#pseudoRand(seed) * Math.PI * 2;
        const rad = 44.5 + this.#pseudoRand(seed + 8.1) * 26.0;
        px = CASINO_CX + Math.cos(ang) * rad;
        pz = Math.max(-80, Math.min(60, CASINO_CZ + Math.sin(ang) * rad));
      } else {
        // Jardines del Palacio, Bosque de Cerezos y Ribera del Río
        px = -82 + this.#pseudoRand(seed) * 192;
        pz = -78 + this.#pseudoRand(seed + 11.9) * 130;
      }

      const py = 0.6 + this.#pseudoRand(seed + 19.3) * 6.4;
      pos[i * 3] = px;
      pos[i * 3 + 1] = py;
      pos[i * 3 + 2] = pz;

      this.#petalData[i * 4] = px;
      this.#petalData[i * 4 + 1] = pz;
      this.#petalData[i * 4 + 2] = this.#pseudoRand(seed + 27.5) * Math.PI * 2;
      this.#petalData[i * 4 + 3] = 0.42 + this.#pseudoRand(seed + 39.1) * 0.52;
    }

    const geo = this.#trackGeo(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const mat = this.#trackMat(new THREE.PointsMaterial({
      color: 0xffc6e0,
      size: 0.17,
      transparent: true,
      opacity: 0.86,
      depthWrite: false
    }));
    this.#petalMat = mat;

    this.#sakuraPetals = new THREE.Points(geo, mat);
    this.#sakuraPetals.matrixAutoUpdate = false;
    this.#sakuraPetals.updateMatrix();
    this.#root.add(this.#sakuraPetals);
  }

  applyTheme(theme) {
    if (!theme) return;

    const isGala = theme.id === 'gala_imperial';
    const li = theme.lanternIntensity ?? 0.9;

    this.#baseLanternEmissive = isGala ? 2.45 : (0.68 + li * 0.44);
    this.#baseLanternHaloOpacity = isGala
      ? 0.46
      : Math.min(0.42, 0.14 + li * 0.10);

    this.#baseMushroomEmissive = isGala ? 1.50 : (0.26 + li * 0.28);
    this.#baseMushroomHaloOpacity = isGala
      ? 0.36
      : Math.min(0.32, 0.08 + li * 0.08);

    if (this.#gardenLanternGlassMat) {
      this.#gardenLanternGlassMat.emissiveIntensity = this.#baseLanternEmissive;
    }
    if (this.#gardenLanternHaloMat) {
      this.#gardenLanternHaloMat.opacity = this.#baseLanternHaloOpacity;
    }
    for (let i = 0; i < this.#mushroomCapMats.length; i++) {
      this.#mushroomCapMats[i].emissiveIntensity = this.#baseMushroomEmissive;
    }
    if (this.#mushroomHaloMat) {
      this.#mushroomHaloMat.opacity = this.#baseMushroomHaloOpacity;
    }
    if (this.#petalMat) {
      this.#petalMat.opacity = isGala ? 0.92 : 0.86;
    }
  }

  update(dt, elapsed) {
    const delta = dt > 0.1 ? 0.1 : dt;
    this.#elapsed += delta;
    const t = elapsed !== undefined ? elapsed : this.#elapsed;

    // Caída suave y deriva de los ~220 pétalos de cerezo (100% GC-Free)
    if (this.#sakuraPetals && this.#petalData) {
      const pos = this.#sakuraPetals.geometry.attributes.position;
      const count = pos.count;
      const data = this.#petalData;

      for (let i = 0; i < count; i++) {
        const i4 = i * 4;
        const baseX = data[i4];
        const baseZ = data[i4 + 1];
        const phase = data[i4 + 2];
        const speed = data[i4 + 3];

        let y = pos.getY(i) - delta * speed;
        if (y < 0.12) {
          y = 6.4 + (Math.sin(phase + t) * 0.5 + 0.5) * 1.1;
        }
        const driftX = baseX + Math.sin(t * 0.85 + phase) * 1.75;
        const driftZ = baseZ + Math.cos(t * 0.68 + phase * 1.3) * 1.75;
        pos.setXYZ(i, driftX, y, driftZ);
      }
      pos.needsUpdate = true;
    }

    // Pulso mágico sutil en setas bioluminiscentes y faroles de jardín (cero asignaciones)
    const pulse = 0.94 + Math.sin(t * 1.85) * 0.06;
    const lanternPulse = 0.96 + Math.sin(t * 2.4 + 1.1) * 0.04;

    if (this.#mushroomHaloMat) {
      this.#mushroomHaloMat.opacity = this.#baseMushroomHaloOpacity * pulse;
    }
    for (let i = 0; i < this.#mushroomCapMats.length; i++) {
      this.#mushroomCapMats[i].emissiveIntensity = this.#baseMushroomEmissive * pulse;
    }
    if (this.#gardenLanternGlassMat) {
      this.#gardenLanternGlassMat.emissiveIntensity = this.#baseLanternEmissive * lanternPulse;
    }
    if (this.#gardenLanternHaloMat) {
      this.#gardenLanternHaloMat.opacity = this.#baseLanternHaloOpacity * lanternPulse;
    }
  }

  dispose() {
    if (this.#root) {
      this.#scene?.remove(this.#root);
      this.#root = null;
    }
    for (let i = 0; i < this.#instancedMeshes.length; i++) {
      const im = this.#instancedMeshes[i];
      if (typeof im.dispose === 'function') im.dispose();
    }
    for (let i = 0; i < this.#geometries.length; i++) {
      this.#geometries[i].dispose();
    }
    for (let i = 0; i < this.#materials.length; i++) {
      this.#materials[i].dispose();
    }
    this.#instancedMeshes.length = 0;
    this.#geometries.length = 0;
    this.#materials.length = 0;
    this.#mushroomCapMats.length = 0;
    this.#treeRecords.length = 0;
    this.#sakuraPetals = null;
    this.#petalData = null;
    this.#petalMat = null;
    this.#mushroomHaloMat = null;
    this.#gardenLanternGlassMat = null;
    this.#gardenLanternHaloMat = null;
    this.#built = false;
  }
}
