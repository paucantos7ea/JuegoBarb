import * as THREE from 'three';
import { WaterSystem, getRiverCenterX } from './WaterSystem.js';
import { BotanicalFlora } from './BotanicalFlora.js';
import { FountainSystem } from './FountainSystem.js';
import { FoliageSystem } from './FoliageSystem.js';

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
    if (matrix) {
      g.applyMatrix4(matrix);
      if (matrix.determinant() < 0) {
        const pos = g.attributes.position;
        const norm = g.attributes.normal;
        const uv = g.attributes.uv;
        for (let v = 0; v < pos.count; v += 3) {
          const v1 = v + 1;
          const v2 = v + 2;
          swapAttr3(pos, v1, v2);
          if (norm) swapAttr3(norm, v1, v2);
          if (uv) swapAttr2(uv, v1, v2);
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

export class WorldDecor {
  #scene;
  #textures;
  #collision;
  #waterSystem = null;
  #flora = null;
  #fountainSystem = null;
  #foliageSystem = null;
  #lanternPositions = [];
  #root = null;
  #geometries = [];
  #materials = [];
  #instancedMeshes = [];
  #staticBuckets = new Map();
  #tempGeos = [];
  #dummy = new THREE.Object3D();
  #waterMat = null;
  #fountainCrystal = null;
  #fountainHalo = null;
  #fountainDrops = null;
  #dropData = null;
  #lanternMat = null;
  #lanternHaloMat = null;
  #pathGrid = new Set();
  #elapsed = 0;

  constructor(scene, textureFactory, collisionSystem) {
    this.#scene = scene;
    this.#textures = textureFactory;
    this.#collision = collisionSystem;
  }

  init() {
    this.#collision.setWorldBounds(-88, 222, -84, 64);

    this.#root = new THREE.Group();
    this.#root.name = 'RoyalGardens';

    const mats = this.#createMaterials();
    const benchSpecs = [];
    const planterFlowers = [];

    // 1. Terreno base ampliado (420 × 270 centrado en (70, 0, -6)) y avenidas imperiales
    this.#buildGroundAndAvenues(mats);
    this.#buildMonumentalFountain(mats);
    this.#buildSouthMirador(mats);

    // 2. Glorietas clásicas + Glorietas Mirador VIP del Casino en (208, ±22)
    this.#buildGazebos(mats, benchSpecs);

    // 3. Bulevar Imperial (X = 42..112): setos, jardineras, 5 arcos florales y 4 plazas de descanso
    this.#buildImperialBoulevard(mats, benchSpecs, planterFlowers);

    // 4. Explanada y Jardines VIP del Casino (anillo r=35.2..42.2, plazas r=9 en (162, ±48) y terraza Este)
    this.#buildCasinoVipGardens(mats, benchSpecs, planterFlowers);

    // 5. Pabellón Real de Establos en (20, -11.5)
    this.#buildRoyalStables(mats);

    // 6. Colinas suaves perimetrales
    this.#buildPerimeterHills(mats);

    // Fusionar toda la arquitectura estática por material en mínimas draw calls
    this.#flushStaticBuckets();

    // 7. InstancedMeshes de bancos, flores de jardineras, senderos curvos, farolas y rocas con musgo
    this.#buildBenchesInstanced(mats, benchSpecs);
    this.#buildPlanterFlowersInstanced(mats, planterFlowers);
    this.#buildCurvedStonePaths(mats);
    this.#buildLanterns(mats);
    this.#buildMossyRocksInstanced(mats);

    this.#root.matrixAutoUpdate = false;
    this.#root.updateMatrix();
    this.#scene.add(this.#root);

    // 8. Sistemas delegados especializados: Ríos/Lagos/Puentes, Fuentes Barrocas, Botánica y Pradera GPU
    this.#waterSystem = new WaterSystem(this.#scene, this.#textures, this.#collision);
    this.#waterSystem.init();

    this.#fountainSystem = new FountainSystem(this.#scene, this.#collision);
    this.#fountainSystem.init();

    this.#flora = new BotanicalFlora(this.#scene, this.#textures, this.#collision);
    this.#flora.init();

    this.#foliageSystem = new FoliageSystem(this.#scene, {
      worldDecor: this,
      waterSystem: this.#waterSystem,
      fountainSystem: this.#fountainSystem,
      flora: this.#flora
    });
    this.#foliageSystem.init();

    // Liberar rejilla temporal de construcción de caminos
    this.#pathGrid.clear();
  }

  #trackGeo(geo) {
    this.#geometries.push(geo);
    return geo;
  }

  #trackMat(mat) {
    this.#materials.push(mat);
    return mat;
  }

  #addMesh(geo, mat, x, y, z, castShadow = true, receiveShadow = true) {
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
    if (!sharedGeo) {
      this.#tempGeos.push(geo);
    }
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

  #createInstanced(geo, mat, count, castShadow = true, receiveShadow = true) {
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

  #pseudoRand(seed) {
    const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return s - Math.floor(s);
  }

  #markPathCell(x, z) {
    const gx = Math.round(x * 0.5);
    const gz = Math.round(z * 0.5);
    this.#pathGrid.add((gx + 1024) * 2048 + (gz + 1024));
  }

  #isNearStonePath(x, z) {
    const gx = Math.round(x * 0.5);
    const gz = Math.round(z * 0.5);
    return this.#pathGrid.has((gx + 1024) * 2048 + (gz + 1024));
  }

  #createMaterials() {
    const grass = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: this.#textures.getTexture('grass', 54, 35),
        color: 0xd8f0cf,
        roughness: 0.92,
        metalness: 0.0
      })
    );
    grass.customProgramCacheKey = () => 'royal_grass_water_cutout_v1';
    grass.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec2 vGrassWorldXZ;'
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvec4 grassWp = modelMatrix * vec4(transformed, 1.0);\nvGrassWorldXZ = grassWp.xz;'
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec2 vGrassWorldXZ;'
        )
        .replace(
          'void main() {',
          `void main() {
          {
            float wx = vGrassWorldXZ.x;
            float wz = vGrassWorldXZ.y;
            if (wz >= -78.2 && wz <= 39.4) {
              float tRiv = min(1.0, (wz * wz) / 144.0);
              float rcx = 97.5 + sin(wz * 0.07) * 7.5 * tRiv;
              if (abs(wx - rcx) < 3.38) discard;
            }
            vec2 dSwan = vec2((wx - 106.0) / 20.6, (wz - 45.0) / 12.1);
            if (dot(dSwan, dSwan) < 1.0) discard;
            vec2 dPond = vec2((wx - 46.0) / 10.4, (wz - 26.0) / 7.9);
            if (dot(dPond, dPond) < 1.0) discard;
            if (wx > 31.1 && wx < 35.9 && wz > 18.1 && wz < 29.9) discard;
            if (wx >= 35.2 && wx <= 39.0 && wz > 20.8 && wz < 29.2) discard;
            if (wx > -23.5 && wx < -18.5 && wz > 28.1 && wz < 55.2) discard;
            if (wx > -94.5 && wx < 94.5 && wz > 55.2 && wz < 108.0) discard;
          }`
        );
    };

    const hillGrass = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: this.#textures.getTexture('grass', 8, 6),
        color: 0xc2e6b8,
        roughness: 0.92,
        metalness: 0.0
      })
    );

    const hedge = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: this.#textures.getTexture('hedge', 2, 1),
        color: 0xd8f2dc,
        roughness: 0.84,
        metalness: 0.02
      })
    );

    const marble = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: this.#textures.getTexture('marble', 2, 2),
        color: 0xf4eff2,
        roughness: 0.3,
        metalness: 0.05
      })
    );

    const plazaFloor = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: this.#textures.getTexture('marbleFloor', 8, 8),
        color: 0xf2ecf0,
        roughness: 0.25,
        metalness: 0.06
      })
    );

    const stoneSlab = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: this.#textures.getTexture('marble', 1, 1),
        color: 0xece6ea,
        roughness: 0.38,
        metalness: 0.04
      })
    );

    const rockStone = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: this.#textures.getTexture('marble', 1, 1),
        color: 0xc7c2c9,
        roughness: 0.82,
        metalness: 0.03
      })
    );

    const moss = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x389150,
        roughness: 0.86,
        metalness: 0.02
      })
    );

    const roseGold = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: this.#textures.getTexture('roseGold', 1, 1),
        color: 0xeeb0a1,
        metalness: 0.88,
        roughness: 0.18
      })
    );

    const water = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: this.#textures.getTexture('water', 4, 4),
        color: 0x7fd8f5,
        emissive: 0x246b82,
        emissiveIntensity: 0.12,
        roughness: 0.15,
        metalness: 0.25,
        transparent: true,
        opacity: 0.8
      })
    );
    water.userData.preserveRoughness = true;
    this.#waterMat = water;

    const pondBed = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x265463,
        roughness: 0.9,
        metalness: 0.02
      })
    );

    const planterSoil = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x4f3932,
        roughness: 0.94,
        metalness: 0.0
      })
    );

    const lantern = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfff0d0,
        emissive: 0xffc878,
        emissiveIntensity: 0.9,
        roughness: 0.2
      })
    );

    const lanternHalo = this.#trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffdca8,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      })
    );
    lanternHalo.userData.isVfx = true;

    const crystalDome = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf7cce6,
        emissive: 0xc96dad,
        emissiveIntensity: 0.2,
        roughness: 0.15,
        metalness: 0.25,
        transparent: true,
        opacity: 0.28,
        depthWrite: false
      })
    );
    crystalDome.userData.preserveRoughness = true;

    const crystalFinial = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffe4f5,
        emissive: 0xe87cc4,
        emissiveIntensity: 0.55,
        roughness: 0.15,
        metalness: 0.25,
        transparent: true,
        opacity: 0.84
      })
    );
    crystalFinial.userData.preserveRoughness = true;

    const flowerPetal = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.52,
        metalness: 0.02
      })
    );

    const grassBlade = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.84,
        metalness: 0.0,
        side: THREE.DoubleSide
      })
    );

    const hayGold = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe6c36b,
        roughness: 0.88,
        metalness: 0.02
      })
    );

    this.#lanternMat = lantern;
    this.#lanternHaloMat = lanternHalo;

    return {
      grass,
      hillGrass,
      hedge,
      marble,
      plazaFloor,
      stoneSlab,
      rockStone,
      moss,
      roseGold,
      water,
      pondBed,
      planterSoil,
      lantern,
      lanternHalo,
      crystalDome,
      crystalFinial,
      flowerPetal,
      grassBlade,
      hayGold
    };
  }

  #buildGroundAndAvenues(mats) {
    // Césped amplio 420 × 270 centrado en (70, 0, -6) cubriendo holgadamente todo el valle y tras la Cúpula del Casino
    this.#addStaticMesh(new THREE.PlaneGeometry(420, 270), mats.grass, 70, 0, -6, false, true, -Math.PI / 2);

    // Avenida Norte-Sur: X ∈ [-5.5, 5.5], Z ∈ [-17, 36]
    this.#addStaticMesh(new THREE.BoxGeometry(11.0, 0.06, 53.0), mats.plazaFloor, 0, 0.015, 9.5, false, true);
    for (const sx of [-5.55, 5.55]) {
      this.#addStaticMesh(new THREE.BoxGeometry(0.16, 0.08, 22.0), mats.roseGold, sx, 0.02, 25.0, false, true);
    }

    // Avenida Oeste: Z ∈ [-3.2, 3.2], X ∈ [-37.5, -14]
    this.#addStaticMesh(new THREE.BoxGeometry(23.5, 0.06, 6.4), mats.plazaFloor, -25.75, 0.015, 0, false, true);
    for (const sz of [-3.25, 3.25]) {
      this.#addStaticMesh(new THREE.BoxGeometry(23.5, 0.08, 0.16), mats.roseGold, -25.75, 0.02, sz, false, true);
    }

    // Avenida Este: Z ∈ [-3.2, 3.2], X ∈ [14, 42]
    this.#addStaticMesh(new THREE.BoxGeometry(28.0, 0.06, 6.4), mats.plazaFloor, 28.0, 0.015, 0, false, true);
    for (const sz of [-3.25, 3.25]) {
      this.#addStaticMesh(new THREE.BoxGeometry(28.0, 0.08, 0.16), mats.roseGold, 28.0, 0.02, sz, false, true);
    }
  }

  #buildMonumentalFountain(mats) {
    // Plaza circular de mármol r = 14.5 con borde oro-rosa (la fuente barroca monumental vive en FountainSystem)
    this.#addStaticMesh(new THREE.CylinderGeometry(14.5, 14.8, 0.1, 48), mats.plazaFloor, 0, 0.02, 0, false, true);
    this.#addStaticMesh(new THREE.TorusGeometry(14.48, 0.15, 10, 64), mats.roseGold, 0, 0.08, 0, false, true, Math.PI / 2);
    this.#addStaticMesh(new THREE.TorusGeometry(8.8, 0.08, 8, 48), mats.roseGold, 0, 0.075, 0, false, true, Math.PI / 2);
  }

  #buildSouthMirador(mats) {
    // Mirador Real Sur en (0, 1.2, 46), radio 7.5 (el Gran Lago Imperial Sur vive ahora en WaterSystem)
    this.#addStaticMesh(new THREE.CylinderGeometry(7.5, 7.9, 1.2, 32), mats.marble, 0, 0.6, 46, true, true);
    this.#addStaticMesh(new THREE.CylinderGeometry(7.15, 7.15, 0.06, 32), mats.plazaFloor, 0, 1.22, 46, false, true);
    this.#collision.addDiscSurface(0, 46, 7.5, 1.2);
    this.#collision.addCylinderCollider(0, 46, 7.5, 0, 0.95);

    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const h = ((i + 1) / steps) * 1.2;
      const sz = 36.25 + i * 0.5;
      this.#addStaticMesh(new THREE.BoxGeometry(5.0, h, 0.54), mats.marble, 0, h / 2, sz, true, true);
    }
    this.#collision.addRampSurface(-3.6, 3.6, 35.8, 39.2, 'z', 36.0, 39.0, 0.0, 1.2);

    const colGeo = new THREE.CylinderGeometry(0.24, 0.28, 5.2, 12);
    const colBaseGeo = new THREE.CylinderGeometry(0.32, 0.34, 0.25, 12);
    this.#tempGeos.push(colGeo, colBaseGeo);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const cx = Math.cos(a) * 6.55;
      const cz = 46 + Math.sin(a) * 6.55;
      this.#addStaticMesh(colGeo, mats.marble, cx, 3.8, cz, true, true, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(colBaseGeo, mats.roseGold, cx, 1.33, cz, true, true, 0, 0, 0, 1, 1, 1, true);
      this.#collision.addCylinderCollider(cx, cz, 0.34, 1.2, 6.4);
    }
    this.#addStaticMesh(new THREE.TorusGeometry(6.6, 0.22, 10, 36), mats.roseGold, 0, 6.4, 46, true, false, Math.PI / 2);
    this.#addStaticMesh(
      new THREE.SphereGeometry(6.55, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      mats.crystalDome,
      0,
      6.4,
      46,
      false,
      false
    );
    this.#addStaticMesh(new THREE.OctahedronGeometry(0.42, 0), mats.crystalFinial, 0, 13.15, 46, false, false);
  }

  #buildGazebos(mats, benchSpecs) {
    const specs = [
      { x: 35, z: -8, openAngle: Math.PI / 2 },            // Glorieta de las Rosas Este
      { x: -33, z: 41, openAngle: -Math.PI / 4 },          // Glorieta de los Cerezos Sur-Oeste
      { x: -54, z: -44, openAngle: Math.PI / 4 },          // Glorieta del Claro Norte-Oeste
      { x: 208, z: -22, openAngle: Math.PI * 0.78 },       // Glorieta Mirador VIP del Casino (Norte)
      { x: 208, z: 22, openAngle: -Math.PI * 0.78 }        // Pabellón Mirador Sur del Casino
    ];

    const floorGeo = new THREE.CylinderGeometry(4.4, 4.58, 0.08, 28);
    const baseTrimGeo = new THREE.TorusGeometry(4.42, 0.09, 8, 36);
    const colGeo = new THREE.CylinderGeometry(0.18, 0.22, 4.3, 12);
    const colBaseGeo = new THREE.CylinderGeometry(0.3, 0.35, 0.24, 12);
    const corniceGeo = new THREE.TorusGeometry(3.72, 0.17, 10, 36);
    const domeGeo = new THREE.SphereGeometry(3.68, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const finialGeo = new THREE.OctahedronGeometry(0.34, 0);
    this.#tempGeos.push(floorGeo, baseTrimGeo, colGeo, colBaseGeo, corniceGeo, domeGeo, finialGeo);

    for (const g of specs) {
      this.#addStaticMesh(floorGeo, mats.plazaFloor, g.x, 0.04, g.z, false, true, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(baseTrimGeo, mats.roseGold, g.x, 0.085, g.z, false, true, Math.PI / 2, 0, 0, 1, 1, 1, true);
      this.#collision.addDiscSurface(g.x, g.z, 4.4, 0.08);

      for (let i = 0; i < 6; i++) {
        const a = g.openAngle + Math.PI / 6 + (i / 6) * Math.PI * 2;
        const cx = g.x + Math.cos(a) * 3.68;
        const cz = g.z + Math.sin(a) * 3.68;
        this.#addStaticMesh(colGeo, mats.roseGold, cx, 2.23, cz, true, true, 0, 0, 0, 1, 1, 1, true);
        this.#addStaticMesh(colBaseGeo, mats.marble, cx, 0.2, cz, true, true, 0, 0, 0, 1, 1, 1, true);
        this.#collision.addCylinderCollider(cx, cz, 0.3, 0, 4.5);
      }

      this.#addStaticMesh(corniceGeo, mats.roseGold, g.x, 4.4, g.z, true, false, Math.PI / 2, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(domeGeo, mats.crystalDome, g.x, 4.42, g.z, false, false, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(finialGeo, mats.crystalFinial, g.x, 8.28, g.z, false, false, 0, 0, 0, 1, 1, 1, true);

      // 2 bancos interiores blancos y dorados orientados al centro
      for (const offset of [Math.PI * 0.68, -Math.PI * 0.68]) {
        const ba = g.openAngle + offset;
        const bx = g.x + Math.cos(ba) * 2.65;
        const bz = g.z + Math.sin(ba) * 2.65;
        benchSpecs.push({ x: bx, y: 0.08, z: bz, rotY: Math.atan2(g.x - bx, g.z - bz) });
      }
    }
  }

  #buildImperialBoulevard(mats, benchSpecs, planterFlowers) {
    // 1. 4 Plazas circulares de descanso en (64, ±12.5) y (110, ±21) + 2 Plazas para las fuentes (80, ±10.5)
    const restPlazas = [
      { x: 64.0, z: -12.5, r: 5.2, neckX: 64.0, neckZ0: -4.4, neckZ1: -7.6, benchAngles: [-2.35, -1.57, -0.78] },
      { x: 64.0, z: 12.5, r: 5.2, neckX: 64.0, neckZ0: 4.4, neckZ1: 7.6, benchAngles: [0.78, 1.57, 2.35] },
      { x: 110.0, z: -21.0, r: 5.6, neckX: 111.5, neckZ0: -4.4, neckZ1: -15.8, benchAngles: [-2.45, -1.57, -0.68] },
      { x: 110.0, z: 21.0, r: 5.6, neckX: 111.5, neckZ0: 4.4, neckZ1: 15.8, benchAngles: [0.68, 1.57, 2.45] }
    ];

    for (const p of restPlazas) {
      this.#addStaticMesh(new THREE.CylinderGeometry(p.r, p.r + 0.2, 0.07, 36), mats.plazaFloor, p.x, 0.02, p.z, false, true);
      this.#addStaticMesh(new THREE.TorusGeometry(p.r, 0.1, 8, 44), mats.roseGold, p.x, 0.06, p.z, false, true, Math.PI / 2);
      this.#addStaticMesh(new THREE.TorusGeometry(p.r * 0.56, 0.06, 8, 36), mats.roseGold, p.x, 0.058, p.z, false, true, Math.PI / 2);
      this.#collision.addDiscSurface(p.x, p.z, p.r, 0.055);

      const neckLen = Math.abs(p.neckZ1 - p.neckZ0);
      const neckMidZ = (p.neckZ0 + p.neckZ1) * 0.5;
      this.#addStaticMesh(new THREE.BoxGeometry(3.4, 0.055, neckLen + 0.4), mats.plazaFloor, p.neckX, 0.018, neckMidZ, false, true);
      for (const sx of [-1.72, 1.72]) {
        this.#addStaticMesh(new THREE.BoxGeometry(0.12, 0.07, neckLen + 0.2), mats.roseGold, p.neckX + sx, 0.025, neckMidZ, false, true);
      }

      // 3 bancos blancos y dorados mirando al centro de cada plaza
      for (const a of p.benchAngles) {
        const bx = p.x + Math.cos(a) * (p.r - 1.15);
        const bz = p.z + Math.sin(a) * (p.r - 1.15);
        benchSpecs.push({ x: bx, y: 0.05, z: bz, rotY: Math.atan2(p.x - bx, p.z - bz) });
      }
    }

    // Plazas circulares de mármol bajo las fuentes existentes de CasinoDomeBuilder en (80, ±10.5)
    for (const fz of [-10.5, 10.5]) {
      this.#addStaticMesh(new THREE.CylinderGeometry(4.85, 5.05, 0.06, 36), mats.plazaFloor, 80.0, 0.018, fz, false, true);
      this.#addStaticMesh(new THREE.TorusGeometry(4.85, 0.09, 8, 40), mats.roseGold, 80.0, 0.055, fz, false, true, Math.PI / 2);
      const midZ = fz < 0 ? -5.15 : 5.15;
      this.#addStaticMesh(new THREE.BoxGeometry(3.2, 0.05, 1.8), mats.plazaFloor, 80.0, 0.016, midZ, false, true);
    }

    // 2. 5 Arcos Florales Monumentales sobre el bulevar en X = 53.5, 64.5, 75.5, 86.5, 108.5
    //    (Altura interior >= 5.8 m, sin colisión superior para pasar a caballo; colisionadores solo en Z = ±4.9)
    const archXList = [53.5, 64.5, 75.5, 86.5, 108.5];
    const plinthGeo = new THREE.BoxGeometry(0.95, 0.56, 0.95);
    const colGeo = new THREE.CylinderGeometry(0.22, 0.27, 3.85, 14);
    const capGeo = new THREE.CylinderGeometry(0.36, 0.24, 0.28, 14);
    const mainArchGeo = new THREE.TorusGeometry(4.9, 0.18, 10, 36, Math.PI);
    const innerArchGeo = new THREE.TorusGeometry(4.66, 0.075, 8, 36, Math.PI);
    const crownRingGeo = new THREE.TorusGeometry(0.42, 0.055, 8, 24);
    const crownGemGeo = new THREE.OctahedronGeometry(0.28, 0);
    this.#tempGeos.push(plinthGeo, colGeo, capGeo, mainArchGeo, innerArchGeo, crownRingGeo, crownGemGeo);

    const garlandPuffs = [];
    const garlandRoses = [];

    for (const ax of archXList) {
      for (const side of [-1, 1]) {
        const az = side * 4.9;
        this.#addStaticMesh(plinthGeo, mats.marble, ax, 0.28, az, true, true, 0, 0, 0, 1, 1, 1, true);
        this.#addStaticMesh(colGeo, mats.marble, ax, 2.45, az, true, true, 0, 0, 0, 1, 1, 1, true);
        this.#addStaticMesh(capGeo, mats.roseGold, ax, 4.42, az, true, true, 0, 0, 0, 1, 1, 1, true);
        this.#collision.addCylinderCollider(ax, az, 0.36, 0, 4.8);
      }

      // Arco elíptico: nace en Y = 4.52 (Z = ±4.9) y sube hasta Y = 7.07 en Z = 0 (gálibo libre > 5.8 m en toda la calzada)
      this.#addStaticMesh(mainArchGeo, mats.marble, ax, 4.52, 0, true, false, 0, Math.PI / 2, 0, 1.0, 0.52, 1.0, true);
      this.#addStaticMesh(innerArchGeo, mats.roseGold, ax, 4.52, 0, false, false, 0, Math.PI / 2, 0, 1.0, 0.52, 1.0, true);
      this.#addStaticMesh(crownRingGeo, mats.roseGold, ax, 7.42, 0, false, false, 0, Math.PI / 2, 0, 1, 1, 1, true);
      this.#addStaticMesh(crownGemGeo, mats.crystalFinial, ax, 7.42, 0, false, false, 0, 0, 0, 1, 1.25, 1, true);

      // Guirnalda floral envolviendo el arco y las columnas superiores
      const steps = 15;
      for (let s = 0; s <= steps; s++) {
        const theta = (s / steps) * Math.PI;
        const gz = -4.9 * Math.cos(theta);
        const gy = 4.52 + 4.9 * 0.52 * Math.sin(theta) + 0.12;
        garlandPuffs.push([ax, gy, gz, 0.42 + Math.sin(theta) * 0.14]);
        garlandRoses.push(
          [ax + 0.22, gy + 0.08, gz, (s + Math.round(ax)) % 3],
          [ax - 0.22, gy - 0.04, gz, (s + 1 + Math.round(ax)) % 3]
        );
      }
    }

    // InstancedMesh ligero para el follaje y rosas de los 5 arcos florales
    if (garlandPuffs.length > 0) {
      const puffGeo = new THREE.IcosahedronGeometry(0.55, 1);
      const roseGeo = new THREE.DodecahedronGeometry(0.15, 0);
      const puffInst = this.#createInstanced(puffGeo, mats.hedge, garlandPuffs.length, false, false);
      const roseInst = this.#createInstanced(roseGeo, mats.flowerPetal, garlandRoses.length, false, false);
      const dummy = this.#dummy;
      const color = new THREE.Color();
      const archRoseColors = [0xff6fa8, 0xffeef6, 0xe83b68];

      garlandPuffs.forEach(([px, py, pz, sc], i) => {
        dummy.position.set(px, py, pz);
        dummy.rotation.set(i * 0.3, i * 0.7, 0);
        dummy.scale.set(0.75 * sc, 0.68 * sc, 0.95 * sc);
        dummy.updateMatrix();
        puffInst.setMatrixAt(i, dummy.matrix);
      });

      garlandRoses.forEach(([rx, ry, rz, cIdx], i) => {
        dummy.position.set(rx, ry, rz);
        dummy.rotation.set(i * 0.4, i * 0.9, 0.2);
        dummy.scale.setScalar(1.0);
        dummy.updateMatrix();
        roseInst.setMatrixAt(i, dummy.matrix);
        color.setHex(archRoseColors[cIdx]);
        roseInst.setColorAt(i, color);
      });

      this.#finalizeStaticInstanced(puffInst);
      this.#finalizeStaticInstanced(roseInst);
    }

    // 3. Setos bajos recortados y jardineras alternas de mármol y oro fuera de Z = ±5.6
    //    Respetando accesos a plazas (X≈64, X≈111.5), fuentes (X≈80) y Puente Imperial (X ∈ [91, 104])
    const borderModules = [
      { x: 44.6, type: 'hedge' },
      { x: 47.4, type: 'planter' },
      { x: 50.2, type: 'hedge' },
      { x: 56.4, type: 'planter' },
      { x: 59.2, type: 'hedge' },
      // hueco acceso plazas X = 64
      { x: 68.4, type: 'hedge' },
      { x: 71.2, type: 'planter' },
      { x: 74.0, type: 'hedge' },
      // hueco acceso fuentes X = 80
      { x: 84.0, type: 'planter' },
      { x: 88.6, type: 'hedge' },
      // hueco Puente Imperial X ∈ [91, 104]
      { x: 105.8, type: 'planter' }
    ];

    const hedgeBoxGeo = new THREE.BoxGeometry(2.25, 0.62, 0.74);
    const hedgeCurbGeo = new THREE.BoxGeometry(2.38, 0.14, 0.86);
    const planterBoxGeo = new THREE.BoxGeometry(1.68, 0.54, 0.88);
    const planterRimGeo = new THREE.BoxGeometry(1.8, 0.09, 0.98);
    const planterSoilGeo = new THREE.BoxGeometry(1.48, 0.06, 0.68);
    this.#tempGeos.push(hedgeBoxGeo, hedgeCurbGeo, planterBoxGeo, planterRimGeo, planterSoilGeo);

    for (const mod of borderModules) {
      for (const side of [-1, 1]) {
        const mz = side * 6.25;
        if (mod.type === 'hedge') {
          this.#addStaticMesh(hedgeCurbGeo, mats.marble, mod.x, 0.07, mz, false, true, 0, 0, 0, 1, 1, 1, true);
          this.#addStaticMesh(hedgeBoxGeo, mats.hedge, mod.x, 0.44, mz, true, true, 0, 0, 0, 1, 1, 1, true);
          this.#collision.addBox(mod.x - 1.15, mod.x + 1.15, 0, 0.85, mz - 0.4, mz + 0.4);
        } else {
          this.#addStaticMesh(planterBoxGeo, mats.marble, mod.x, 0.27, mz, true, true, 0, 0, 0, 1, 1, 1, true);
          this.#addStaticMesh(planterRimGeo, mats.roseGold, mod.x, 0.56, mz, false, true, 0, 0, 0, 1, 1, 1, true);
          this.#addStaticMesh(planterSoilGeo, mats.planterSoil, mod.x, 0.54, mz, false, true, 0, 0, 0, 1, 1, 1, true);
          this.#collision.addBox(mod.x - 0.88, mod.x + 0.88, 0, 0.75, mz - 0.46, mz + 0.46);
          planterFlowers.push({ cx: mod.x, y: 0.58, cz: mz, rx: 0.64, rz: 0.28, rotY: 0 });
        }
      }
    }
  }

  #buildCasinoVipGardens(mats, benchSpecs, planterFlowers) {
    const cx = 162.0;
    const cz = 0.0;

    // 1. Anillo perimetral de paseo de mármol y oro rosa alrededor de la Cúpula (r = 35.2 .. 42.2, abierto en el Oeste)
    const thetaStart = -Math.PI * 0.84;
    const thetaLength = Math.PI * 1.68;

    this.#addStaticMesh(
      new THREE.RingGeometry(35.15, 42.25, 88, 1, thetaStart, thetaLength),
      mats.plazaFloor,
      cx,
      0.022,
      cz,
      false,
      true,
      -Math.PI / 2
    );
    this.#addStaticMesh(
      new THREE.RingGeometry(35.15, 35.42, 88, 1, thetaStart, thetaLength),
      mats.roseGold,
      cx,
      0.032,
      cz,
      false,
      true,
      -Math.PI / 2
    );
    this.#addStaticMesh(
      new THREE.RingGeometry(42.02, 42.3, 88, 1, thetaStart, thetaLength),
      mats.roseGold,
      cx,
      0.032,
      cz,
      false,
      true,
      -Math.PI / 2
    );

    // Conexiones de mármol entre los extremos Oeste del anillo (r ≈ 38.7, θ = ±0.84π -> (128, ±18.6)) y la Explanada Oeste
    for (const side of [-1, 1]) {
      this.#addStaticMesh(new THREE.BoxGeometry(10.5, 0.05, 6.8), mats.plazaFloor, 126.2, 0.018, side * 17.2, false, true);
      this.#addStaticMesh(new THREE.BoxGeometry(10.5, 0.07, 0.16), mats.roseGold, 126.2, 0.025, side * 20.6, false, true);
    }

    // 2. Plazas circulares VIP Norte (162, -48) y Sur (162, +48) de radio r = 9.0 + terrazas ajardinadas escalonadas bajas
    const planterBoxGeo = new THREE.BoxGeometry(3.2, 0.36, 1.05);
    const planterTopGeo = new THREE.BoxGeometry(2.6, 0.32, 0.72);
    const planterRimGeo = new THREE.BoxGeometry(3.34, 0.08, 1.16);
    this.#tempGeos.push(planterBoxGeo, planterTopGeo, planterRimGeo);

    for (const side of [-1, 1]) {
      const pz = side * 48.0;
      this.#addStaticMesh(new THREE.CylinderGeometry(9.0, 9.25, 0.07, 48), mats.plazaFloor, cx, 0.024, pz, false, true);
      this.#addStaticMesh(new THREE.TorusGeometry(9.0, 0.12, 8, 56), mats.roseGold, cx, 0.064, pz, false, true, Math.PI / 2);
      this.#addStaticMesh(new THREE.TorusGeometry(5.85, 0.07, 8, 44), mats.roseGold, cx, 0.06, pz, false, true, Math.PI / 2);
      this.#collision.addDiscSurface(cx, pz, 9.0, 0.06);

      // Bancos blancos y dorados en la plaza mirando a la fuente monumental VIP (162, ±48)
      const baseAng = side < 0 ? -Math.PI / 2 : Math.PI / 2;
      for (const aOff of [-0.72, 0.72]) {
        const a = baseAng + aOff;
        const bx = cx + Math.cos(a) * 7.55;
        const bz = pz + Math.sin(a) * 7.55;
        benchSpecs.push({ x: bx, y: 0.06, z: bz, rotY: Math.atan2(cx - bx, pz - bz) });
      }

      // Terrazas ajardinadas escalonadas bajas (2 peldaños florales) bordeando el arco exterior de la plaza r = 9.0
      for (const aOff of [-0.42, 0.0, 0.42]) {
        const a = baseAng + aOff;
        const tx = cx + Math.cos(a) * 9.85;
        const tz = pz + Math.sin(a) * 9.85;
        const yaw = -a + Math.PI / 2;
        this.#addStaticMesh(planterBoxGeo, mats.marble, tx, 0.18, tz, true, true, 0, yaw, 0, 1, 1, 1, true);
        this.#addStaticMesh(planterRimGeo, mats.roseGold, tx, 0.38, tz, false, true, 0, yaw, 0, 1, 1, 1, true);
        this.#addStaticMesh(planterTopGeo, mats.hedge, tx, 0.54, tz, true, true, 0, yaw, 0, 1, 1, 1, true);
        this.#collision.addCylinderCollider(tx, tz, 1.05, 0, 0.85);
        planterFlowers.push({ cx: tx, y: 0.72, cz: tz, rx: 0.95, rz: 0.24, rotY: yaw });
      }
    }

    // 3. Gran Terraza Ajardinada Este del Casino (X ∈ [203.5, 213.5], Z ∈ [-12, 12]) entre las 2 Glorietas Mirador VIP
    this.#addStaticMesh(new THREE.BoxGeometry(10.0, 0.07, 22.0), mats.plazaFloor, 207.2, 0.022, 0, false, true);
    this.#addStaticMesh(new THREE.BoxGeometry(0.18, 0.09, 22.2), mats.roseGold, 212.2, 0.035, 0, false, true);
    for (const sz of [-11.0, 11.0]) {
      this.#addStaticMesh(new THREE.BoxGeometry(10.0, 0.09, 0.18), mats.roseGold, 207.2, 0.035, sz, false, true);
    }

    // Parterres escalonados y bancos en la Terraza Este
    for (const tz of [-6.8, 0.0, 6.8]) {
      this.#addStaticMesh(planterBoxGeo, mats.marble, 213.1, 0.18, tz, true, true, 0, Math.PI / 2, 0, 1.15, 1, 1, true);
      this.#addStaticMesh(planterRimGeo, mats.roseGold, 213.1, 0.38, tz, false, true, 0, Math.PI / 2, 0, 1.15, 1, 1, true);
      this.#addStaticMesh(planterTopGeo, mats.hedge, 213.1, 0.54, tz, true, true, 0, Math.PI / 2, 0, 1.15, 1, 1, true);
      this.#collision.addBox(212.4, 213.8, 0, 0.85, tz - 1.75, tz + 1.75);
      planterFlowers.push({ cx: 213.1, y: 0.72, cz: tz, rx: 1.1, rz: 0.24, rotY: Math.PI / 2 });
    }
    benchSpecs.push(
      { x: 210.8, y: 0.06, z: -3.5, rotY: -Math.PI / 2 },
      { x: 210.8, y: 0.06, z: 3.5, rotY: -Math.PI / 2 }
    );

    // Jardineras curvas adicionales bordeando los cuadrantes NE y SE del anillo perimetral (r ≈ 43.2)
    for (const deg of [-58, -32, 32, 58]) {
      const rad = (deg * Math.PI) / 180;
      const px = cx + Math.cos(rad) * 43.25;
      const pz = -Math.sin(rad) * 43.25;
      const yaw = rad;
      this.#addStaticMesh(planterBoxGeo, mats.marble, px, 0.18, pz, true, true, 0, Math.PI / 2 + yaw, 0, 1, 1, 1, true);
      this.#addStaticMesh(planterRimGeo, mats.roseGold, px, 0.38, pz, false, true, 0, Math.PI / 2 + yaw, 0, 1, 1, 1, true);
      this.#addStaticMesh(planterTopGeo, mats.hedge, px, 0.54, pz, true, true, 0, Math.PI / 2 + yaw, 0, 1, 1, 1, true);
      this.#collision.addCylinderCollider(px, pz, 1.0, 0, 0.85);
      planterFlowers.push({ cx: px, y: 0.72, cz: pz, rx: 0.95, rz: 0.24, rotY: Math.PI / 2 + yaw });
    }
  }

  #buildRoyalStables(mats) {
    // Pabellón Real de Establos en (20, -11.5), abierto hacia +Z mirando al caballo (18, -2)
    // Interior despejado a ras de suelo (moneda en (18, 0, -10) totalmente accesible, aro [10, -10] libre)
    const sx = 20.0;
    const sz = -11.5;

    // Suelo de mármol y piedra imperial (7.4 × 4.8 m)
    this.#addStaticMesh(new THREE.BoxGeometry(7.4, 0.05, 4.8), mats.plazaFloor, sx, 0.018, sz, false, true);
    this.#addStaticMesh(new THREE.BoxGeometry(7.56, 0.07, 0.14), mats.roseGold, sx, 0.025, sz + 2.42, false, true);

    // 6 columnas de mármol y oro-rosa (abiertas al frente +Z con vano libre de 6.4 m)
    const colGeo = new THREE.CylinderGeometry(0.18, 0.22, 3.4, 12);
    const baseGeo = new THREE.CylinderGeometry(0.28, 0.32, 0.24, 12);
    this.#tempGeos.push(colGeo, baseGeo);

    const colCoords = [
      [16.8, -13.5], [20.0, -13.5], [23.2, -13.5],
      [16.8, -11.5], [23.2, -11.5],
      [16.8, -9.5], [23.2, -9.5]
    ];
    for (const [cx, cz] of colCoords) {
      this.#addStaticMesh(baseGeo, mats.roseGold, cx, 0.12, cz, true, true, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(colGeo, mats.marble, cx, 1.85, cz, true, true, 0, 0, 0, 1, 1, 1, true);
      this.#collision.addCylinderCollider(cx, cz, 0.26, 0, 3.6);
    }

    // Muro trasero imperial (Z = -13.6) con friso oro-rosa
    this.#addStaticMesh(new THREE.BoxGeometry(6.5, 2.5, 0.24), mats.marble, sx, 1.3, -13.6, true, true);
    this.#addStaticMesh(new THREE.BoxGeometry(6.6, 0.16, 0.3), mats.roseGold, sx, 2.58, -13.6, false, true);
    this.#collision.addBox(16.7, 23.3, 0, 3.2, -13.8, -13.4);

    // Cubierta a dos aguas y frontón clásico mirando a +Z
    this.#addStaticMesh(new THREE.BoxGeometry(7.8, 0.22, 5.3), mats.marble, sx, 3.65, sz, true, true);
    this.#addStaticMesh(new THREE.BoxGeometry(7.95, 0.12, 5.45), mats.roseGold, sx, 3.78, sz, false, true);

    const slopeLen = 4.15;
    const roofAngle = 0.28;
    this.#addStaticMesh(
      new THREE.BoxGeometry(slopeLen, 0.16, 5.35),
      mats.roseGold,
      sx - 1.92,
      4.32,
      sz,
      true,
      false,
      0,
      0,
      roofAngle
    );
    this.#addStaticMesh(
      new THREE.BoxGeometry(slopeLen, 0.16, 5.35),
      mats.roseGold,
      sx + 1.92,
      4.32,
      sz,
      true,
      false,
      0,
      0,
      -roofAngle
    );

    // Emblema de herradura real dorada y cristal en el frontón delantero (+Z)
    this.#addStaticMesh(
      new THREE.TorusGeometry(0.46, 0.065, 8, 22, Math.PI * 1.35),
      mats.roseGold,
      sx,
      4.22,
      sz + 2.72,
      false,
      false,
      0,
      0,
      -Math.PI * 0.175
    );
    this.#addStaticMesh(new THREE.OctahedronGeometry(0.28, 0), mats.crystalFinial, sx, 5.15, sz, false, false);

    // Abrevadero real de mármol y agua cristalina en el lateral Este (22.35, -10.35) + pacas de heno dorado al fondo
    this.#addStaticMesh(new THREE.BoxGeometry(1.32, 0.56, 0.68), mats.marble, 22.25, 0.28, -10.35, true, true);
    this.#addStaticMesh(new THREE.BoxGeometry(1.4, 0.08, 0.76), mats.roseGold, 22.25, 0.58, -10.35, false, true);
    this.#addStaticMesh(new THREE.BoxGeometry(1.12, 0.06, 0.48), mats.water, 22.25, 0.55, -10.35, false, false);
    this.#collision.addBox(21.55, 22.95, 0, 0.75, -10.75, -9.95);

    this.#addStaticMesh(new THREE.BoxGeometry(1.1, 0.48, 0.65), mats.hayGold, 21.6, 0.24, -12.95, true, true);
    this.#addStaticMesh(new THREE.BoxGeometry(0.95, 0.42, 0.58), mats.hayGold, 21.35, 0.68, -13.0, true, true, 0, 0.2, 0);

    // Vallas bajas decorativas blancas y oro-rosa flanqueando los lados (sin acercarse al aro [10, -10])
    const postGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.88, 8);
    const railHGeo = new THREE.BoxGeometry(2.4, 0.08, 0.07);
    const railZGeo = new THREE.BoxGeometry(0.07, 0.08, 3.2);
    this.#tempGeos.push(postGeo, railHGeo, railZGeo);

    // Corral decorativo Oeste (X ∈ [14.4, 16.8], a 4.4 m de distancia del aro [10, -10]) y Este (X ∈ [23.2, 25.6])
    for (const side of [-1, 1]) {
      const xOuter = side < 0 ? 14.4 : 25.6;
      const xMid = side < 0 ? 15.6 : 24.4;

      // Tramo trasero Z = -13.5
      this.#addStaticMesh(postGeo, mats.marble, xOuter, 0.44, -13.5, true, true, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(postGeo, mats.marble, xOuter, 0.44, -10.3, true, true, 0, 0, 0, 1, 1, 1, true);
      for (const ry of [0.34, 0.68]) {
        this.#addStaticMesh(railHGeo, mats.roseGold, xMid, ry, -13.5, false, true, 0, 0, 0, 1, 1, 1, true);
        this.#addStaticMesh(railZGeo, mats.roseGold, xOuter, ry, -11.9, false, true, 0, 0, 0, 1, 1, 1, true);
      }
      this.#collision.addBox(Math.min(xOuter, sx + side * 3.2), Math.max(xOuter, sx + side * 3.2), 0, 0.9, -13.65, -13.35);
      this.#collision.addBox(xOuter - 0.15, xOuter + 0.15, 0, 0.9, -13.55, -10.25);
    }
  }

  #buildPerimeterHills(mats) {
    // Colinas suaves estilizadas rodeando el valle exterior (Z < -83.5, X < -87.5, X > 221.5 y SE Z > 64)
    const domeGeo = new THREE.SphereGeometry(1.0, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
    this.#tempGeos.push(domeGeo);

    const hills = [
      // Cordillera suave Norte detrás del Palacio y flanqueando la Cascada Norte (X ≈ 103)
      [-86, -96, 26, 7.5, 15],
      [-48, -98, 28, 8.8, 16],
      [-8, -99, 30, 9.6, 16],
      [34, -98, 28, 8.5, 16],
      [72, -95, 22, 7.8, 14],
      // Colinas gemelas que abrazan la Gruta de la Cascada Norte (X ≈ 103, Z = -78)
      [85, -89, 14, 6.4, 10],
      [121, -89, 14, 6.6, 10],
      [103, -98, 24, 10.5, 14],
      // Norte-Este detrás de los jardines del Casino
      [152, -96, 28, 8.2, 16],
      [194, -95, 28, 8.6, 16],
      [232, -88, 24, 7.8, 18],
      // Borde Oeste (X < -88)
      [-104, -62, 18, 6.8, 26],
      [-106, -18, 19, 7.4, 28],
      [-105, 24, 18, 6.5, 26],
      // Borde Este detrás de las Glorietas Mirador del Casino (X > 222)
      [238, -46, 18, 6.8, 24],
      [242, 0, 20, 8.4, 28],
      [238, 44, 18, 6.8, 24],
      // Borde Sur-Este más allá de Z = 64
      [138, 78, 26, 6.5, 16],
      [182, 80, 28, 7.2, 16],
      [224, 76, 24, 6.8, 16]
    ];

    for (const [hx, hz, sx, sy, sz] of hills) {
      this.#addStaticMesh(domeGeo, mats.hillGrass, hx, -0.15, hz, false, true, 0, 0, 0, sx, sy, sz, true);
    }
  }

  #buildBenchesInstanced(mats, benchSpecs) {
    if (benchSpecs.length === 0) return;

    const seatGeo = new THREE.BoxGeometry(1.82, 0.11, 0.62);
    const backGeo = new THREE.BoxGeometry(1.82, 0.42, 0.08);
    const legGeo = new THREE.BoxGeometry(0.14, 0.44, 0.56);

    const seatInst = this.#createInstanced(seatGeo, mats.marble, benchSpecs.length, true, true);
    const backInst = this.#createInstanced(backGeo, mats.roseGold, benchSpecs.length, true, false);
    const legInst = this.#createInstanced(legGeo, mats.roseGold, benchSpecs.length * 2, true, true);

    const dummy = this.#dummy;
    benchSpecs.forEach((b, i) => {
      const cosR = Math.cos(b.rotY);
      const sinR = Math.sin(b.rotY);

      dummy.position.set(b.x, b.y + 0.46, b.z);
      dummy.rotation.set(0, b.rotY, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      seatInst.setMatrixAt(i, dummy.matrix);

      // Respaldo desplazado hacia atrás (-Z local) para mirar hacia +Z local (rotY)
      dummy.position.set(b.x - sinR * 0.26, b.y + 0.72, b.z - cosR * 0.26);
      dummy.rotation.set(-0.12, b.rotY, 0);
      dummy.updateMatrix();
      backInst.setMatrixAt(i, dummy.matrix);

      for (let k = 0; k < 2; k++) {
        const side = k === 0 ? -0.68 : 0.68;
        dummy.position.set(b.x + cosR * side, b.y + 0.22, b.z - sinR * side);
        dummy.rotation.set(0, b.rotY, 0);
        dummy.updateMatrix();
        legInst.setMatrixAt(i * 2 + k, dummy.matrix);
      }

      this.#collision.addCylinderCollider(b.x, b.z, 0.58, b.y, b.y + 0.85);
    });

    this.#finalizeStaticInstanced(seatInst);
    this.#finalizeStaticInstanced(backInst);
    this.#finalizeStaticInstanced(legInst);
  }

  #buildPlanterFlowersInstanced(mats, planterFlowers) {
    if (planterFlowers.length === 0) return;

    const roses = [];
    const lavenders = [];
    let seed = 311;

    for (const pf of planterFlowers) {
      const cosR = Math.cos(pf.rotY);
      const sinR = Math.sin(pf.rotY);
      for (let i = 0; i < 12; i++) {
        seed += 1.93;
        const lx = (this.#pseudoRand(seed) * 2 - 1) * pf.rx;
        const lz = (this.#pseudoRand(seed + 4.7) * 2 - 1) * pf.rz;
        const wx = pf.cx + lx * cosR + lz * sinR;
        const wz = pf.cz - lx * sinR + lz * cosR;
        if (i % 2 === 0) {
          roses.push([wx, pf.y, wz, i % 3]);
        } else {
          lavenders.push([wx, pf.y, wz, i % 3]);
        }
      }
    }

    const dummy = this.#dummy;
    const color = new THREE.Color();

    if (roses.length > 0) {
      const roseGeo = new THREE.DodecahedronGeometry(0.13, 0);
      const roseInst = this.#createInstanced(roseGeo, mats.flowerPetal, roses.length, false, false);
      const palette = [0xe83b68, 0xff85b8, 0xfff2f7];
      roses.forEach(([x, y, z, cIdx], i) => {
        dummy.position.set(x, y + 0.1, z);
        dummy.rotation.set(0.2, i * 0.8, 0.1);
        dummy.scale.setScalar(1.0);
        dummy.updateMatrix();
        roseInst.setMatrixAt(i, dummy.matrix);
        color.setHex(palette[cIdx]);
        roseInst.setColorAt(i, color);
      });
      this.#finalizeStaticInstanced(roseInst);
    }

    if (lavenders.length > 0) {
      const lavGeo = new THREE.ConeGeometry(0.08, 0.3, 6);
      const lavInst = this.#createInstanced(lavGeo, mats.flowerPetal, lavenders.length, false, false);
      const palette = [0x926ee0, 0xaa8cf0, 0x7a56c8];
      lavenders.forEach(([x, y, z, cIdx], i) => {
        dummy.position.set(x, y + 0.16, z);
        dummy.rotation.set(0.05, i * 0.7, 0.04);
        dummy.scale.setScalar(1.0);
        dummy.updateMatrix();
        lavInst.setMatrixAt(i, dummy.matrix);
        color.setHex(palette[cIdx]);
        lavInst.setColorAt(i, color);
      });
      this.#finalizeStaticInstanced(lavInst);
    }
  }

  #isStoneSlabBlocked(x, z) {
    // Evitar solapar losas sobre agua, puentes o pisos de mármol principales
    const rcx = getRiverCenterX(z);
    if (z >= -78.5 && z <= 39.2 && Math.abs(x - rcx) < 3.85) return true;
    const dxSwan = (x - 106) / 21.4;
    const dzSwan = (z - 45) / 12.9;
    if (dxSwan * dxSwan + dzSwan * dzSwan <= 1.0) return true;
    const dxPond = (x - 46) / 11.3;
    const dzPond = (z - 26) / 8.8;
    if (dxPond * dxPond + dzPond * dzPond <= 1.0) return true;
    if (Math.hypot(x - 162, z) < 42.35) return true;
    if (Math.hypot(x - 162, z + 48) < 9.05 || Math.hypot(x - 162, z - 48) < 9.05) return true;
    return false;
  }

  #buildCurvedStonePaths(mats) {
    // Red completa de senderos secundarios de piedra conectando todos los hitos del Reino
    const curves = [
      // 1. Avenida Este -> Pabellón Real de Establos (20, -8) -> Glorieta de las Rosas (35, -8)
      [
        [20.0, -3.3], [20.0, -6.0], [20.0, -8.7]
      ],
      [
        [23.8, -9.2], [29.0, -8.6], [30.8, -8.0]
      ],
      [
        [35.0, -3.3], [35.0, -5.0]
      ],
      // 2. Glorieta de las Rosas (35, -8) -> Plaza Descanso Norte (64, -12.5) -> Puente Norte Cerezos (89, -38)
      [
        [39.2, -8.2], [48.5, -10.2], [58.8, -12.2]
      ],
      [
        [66.5, -17.0], [74.0, -25.5], [81.5, -34.0], [88.6, -38.0]
      ],
      // 3. Sendero Ribera Oeste Norte hacia mirador de la Cascada Norte
      [
        [86.5, -39.5], [88.5, -50.0], [93.0, -61.0], [96.5, -71.5]
      ],
      // 4. Ribera Oeste del Río: Puente Norte (89, -38) -> Fuente Norte Paseo (80, -10.5) y Sur Paseo -> Puente Cisnes (99.5, 27)
      [
        [88.2, -35.2], [89.0, -24.5], [86.0, -16.5], [83.2, -13.2]
      ],
      [
        [83.5, 13.2], [90.0, 17.5], [95.5, 23.0], [99.2, 27.0]
      ],
      // 5. Avenida Este -> Puente Este (30, 24) -> Estanque Este -> Puente Sur de los Cisnes (99.5, 27)
      [
        [29.2, 3.3], [29.0, 10.0], [28.8, 17.0], [29.5, 22.0], [30.0, 24.0]
      ],
      [
        [38.2, 24.0], [40.0, 18.2], [47.0, 16.0], [56.0, 18.5], [64.0, 17.8]
      ],
      [
        [58.5, 22.0], [64.0, 30.0], [76.0, 30.5], [88.5, 28.5], [99.2, 27.0]
      ],
      // 6. Salida Este Puente Norte (99.2, -38) -> Plaza NE (110, -21) y Fuente VIP Norte Casino (162, -48)
      [
        [99.4, -38.0], [105.5, -32.5], [109.5, -26.8]
      ],
      [
        [102.0, -39.0], [116.0, -43.5], [134.0, -46.5], [152.5, -48.0]
      ],
      // 7. Salida Este Puente Cisnes (109.7, 27) -> Plaza SE (110, 21) y Orilla Norte/Este del Lago de los Cisnes (106, 45)
      [
        [109.7, 27.0], [110.2, 26.6]
      ],
      [
        [110.5, 27.5], [118.5, 29.8], [126.5, 35.5], [130.5, 44.5], [127.0, 53.5]
      ],
      // 8. Orilla Este Lago de los Cisnes -> Fuente VIP Sur Casino (162, 48)
      [
        [127.5, 36.5], [139.0, 43.0], [152.5, 48.0]
      ],
      // 9. Plazas Fuentes VIP del Casino (162, ±48) <-> Glorietas Mirador VIP del Casino (208, ±22) <-> Terraza Este
      [
        [171.2, -48.0], [186.0, -44.0], [199.0, -35.0], [206.0, -26.5]
      ],
      [
        [208.0, -17.4], [208.0, -11.2]
      ],
      [
        [171.2, 48.0], [186.0, 44.0], [199.0, 35.0], [206.0, 26.5]
      ],
      [
        [208.0, 17.4], [208.0, 11.2]
      ],
      // 10. Pasarela de Modelaje, Puente SW (-21, 34), Bosque de Cerezos SW y NW
      [
        [-5.6, 28.0], [-10.5, 30.0], [-14.2, 32.4], [-17.0, 34.0]
      ],
      [
        [-25.2, 34.0], [-28.8, 37.0], [-31.8, 39.6]
      ],
      [
        [-37.5, 41.0], [-47.0, 39.5], [-55.0, 34.0], [-52.0, 27.8]
      ],
      [
        [-56.0, 36.0], [-68.0, 33.0], [-70.5, 16.0], [-70.5, -4.0], [-68.5, -22.0], [-61.5, -35.0], [-56.5, -41.0]
      ],
      [
        [-46.0, -17.6], [-48.0, -28.0], [-51.5, -39.8]
      ],
      [
        [-51.0, -47.5], [-47.0, -59.0], [-46.5, -71.0]
      ]
    ];

    const slabPts = [];
    for (const pts of curves) {
      const vecs = pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
      const curve = new THREE.CatmullRomCurve3(vecs);
      const len = curve.getLength();
      const count = Math.max(2, Math.floor(len / 1.42));
      for (let i = 0; i <= count; i++) {
        const t = i / count;
        const p = curve.getPoint(t);
        if (this.#isStoneSlabBlocked(p.x, p.z)) continue;
        const tan = curve.getTangent(t);
        this.#markPathCell(p.x, p.z);
        slabPts.push({
          x: p.x,
          z: p.z,
          yaw: Math.atan2(tan.x, tan.z),
          w: 1.42 + (i % 2) * 0.24
        });
      }
    }

    if (slabPts.length === 0) return;

    const slabGeo = new THREE.CylinderGeometry(0.68, 0.72, 0.05, 8);
    const slabInst = this.#createInstanced(slabGeo, mats.stoneSlab, slabPts.length, false, true);
    const dummy = this.#dummy;
    slabPts.forEach((s, idx) => {
      dummy.position.set(s.x, 0.024, s.z);
      dummy.rotation.set(0, s.yaw, 0);
      dummy.scale.set(s.w, 1, 1.08);
      dummy.updateMatrix();
      slabInst.setMatrixAt(idx, dummy.matrix);
    });
    this.#finalizeStaticInstanced(slabInst);
  }

  #buildLanterns(mats) {
    // Farolas ornamentales oro-rosa (0 luces dinámicas; bulbo emisivo + halo AdditiveBlending)
    const positions = [
      // Plaza Central y Avenidas Clásicas
      [-6.5, -12.5], [6.5, -12.5],
      [-12.2, -6.5], [12.2, -6.5],
      [-12.2, 6.5], [12.2, 6.5],
      [-6.5, 22.0], [6.5, 22.0],
      [-6.5, 33.5], [6.5, 33.5],
      [-22.0, -4.0], [-22.0, 4.0],
      [-34.0, -4.0], [-34.0, 4.0],
      [22.0, -4.0], [22.0, 4.0],
      [35.0, -3.8], [39.0, 4.0],
      [29.2, 21.5], [38.8, 26.5],
      [-16.2, 31.8], [-25.8, 36.2],
      [-4.2, 37.5], [4.2, 37.5],
      [-37.5, 37.5], [-49.5, -40.5],
      // Pabellón de Establos y Plazas del Bulevar
      [16.2, -8.8], [23.8, -8.8],
      [58.5, -12.5], [69.5, -12.5],
      [58.5, 12.5], [69.5, 12.5],
      [104.2, -21.0], [115.8, -21.0],
      [104.2, 21.0], [115.8, 21.0],
      // Puentes Norte y Sur del Río y Lago de los Cisnes
      [88.2, -40.6], [99.8, -35.4],
      [98.8, 24.4], [110.2, 29.6],
      [128.5, 38.5], [131.5, 48.0],
      // Perímetro VIP de la Cúpula del Casino, Fuentes VIP y Glorietas Mirador (208, ±22)
      [152.4, -48.0], [171.6, -48.0],
      [152.4, 48.0], [171.6, 48.0],
      [135.5, -34.5], [135.5, 34.5],
      [189.5, -33.5], [189.5, 33.5],
      [212.6, -11.5], [212.6, 11.5],
      [203.2, -22.0], [203.2, 22.0]
    ];

    const postGeo = new THREE.CylinderGeometry(0.09, 0.15, 3.3, 10);
    const baseGeo = new THREE.CylinderGeometry(0.24, 0.3, 0.35, 10);
    const capGeo = new THREE.ConeGeometry(0.36, 0.35, 8);
    const bulbGeo = new THREE.OctahedronGeometry(0.26, 0);
    const haloGeo = new THREE.OctahedronGeometry(0.75, 1);

    const postInst = this.#createInstanced(postGeo, mats.roseGold, positions.length, false, false);
    this.#lanternPositions = positions;
    const baseInst = this.#createInstanced(baseGeo, mats.marble, positions.length, false, true);
    const capInst = this.#createInstanced(capGeo, mats.roseGold, positions.length, false, false);
    const bulbInst = this.#createInstanced(bulbGeo, mats.lantern, positions.length, false, false);
    const haloInst = this.#createInstanced(haloGeo, mats.lanternHalo, positions.length, false, false);

    const dummy = this.#dummy;
    positions.forEach(([lx, lz], idx) => {
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);

      dummy.position.set(lx, 1.75, lz);
      dummy.updateMatrix();
      postInst.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(lx, 0.175, lz);
      dummy.updateMatrix();
      baseInst.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(lx, 3.85, lz);
      dummy.updateMatrix();
      capInst.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(lx, 3.55, lz);
      dummy.updateMatrix();
      bulbInst.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(lx, 3.55, lz);
      dummy.scale.set(1.15, 1.15, 1.15);
      dummy.updateMatrix();
      haloInst.setMatrixAt(idx, dummy.matrix);

      this.#collision.addCylinderCollider(lx, lz, 0.24, 0, 3.5);
    });

    this.#finalizeStaticInstanced(postInst);
    this.#finalizeStaticInstanced(baseInst);
    this.#finalizeStaticInstanced(capInst);
    this.#finalizeStaticInstanced(bulbInst);
    this.#finalizeStaticInstanced(haloInst);
  }

  #isExcludedZone(x, z, margin = 0.8) {
    // Palacio y Terraza Baile
    if (x >= -43 - margin && x <= 43 + margin && z >= -79 - margin && z <= -16 + margin) return true;
    if (x >= 36 - margin && x <= 51 + margin && z >= -44 - margin && z <= -28 + margin) return true;
    // Gran Pasarela en T
    if (x >= -65 - margin && x <= -28 + margin && z >= -17 - margin && z <= 27 + margin) return true;
    // Arena de Carrera
    if (x >= 13 - margin && x <= 27 + margin && z >= 5 - margin && z <= 24 + margin) return true;
    // Pabellón Real de Establos
    if (x >= 14.2 - margin && x <= 25.8 + margin && z >= -14.0 - margin && z <= -8.8 + margin) return true;
    // Avenidas N-S, Oeste y Este + Fuente Central (r = 14.5)
    if (x >= -5.6 - margin && x <= 5.6 + margin && z >= -17 - margin && z <= 36.5 + margin) return true;
    if (x >= -39.5 - margin && x <= -14 + margin && Math.abs(z) <= 3.4 + margin) return true;
    if (x >= 14 - margin && x <= 42 + margin && Math.abs(z) <= 3.4 + margin) return true;
    if (Math.hypot(x, z) < 14.6 + margin) return true;
    // Paseo Real del Casino + setos/jardineras + Explanada Oeste
    if (x >= 41.5 - margin && x <= 112.5 + margin && Math.abs(z) <= 6.8 + margin) return true;
    if (x >= 111.5 - margin && x <= 130.5 + margin && Math.abs(z) <= 20.8 + margin) return true;
    // Plazas de descanso y fuentes del Bulevar
    if (Math.hypot(x - 64, z + 12.5) < 5.3 + margin || Math.hypot(x - 64, z - 12.5) < 5.3 + margin) return true;
    if (Math.hypot(x - 80, z + 10.5) < 5.0 + margin || Math.hypot(x - 80, z - 10.5) < 5.0 + margin) return true;
    if (Math.hypot(x - 110, z + 21) < 5.7 + margin || Math.hypot(x - 110, z - 21) < 5.7 + margin) return true;
    if (Math.abs(x - 64) < 2.0 + margin && Math.abs(z) <= 12.5) return true;
    if (Math.abs(x - 111.5) < 2.0 + margin && Math.abs(z) <= 21.0) return true;
    // Gran Cúpula del Casino + Anillo perimetral r = 42.3 + Terraza Este + Plazas VIP (162, ±48, r=9)
    if (Math.hypot(x - 162, z) < 42.6 + margin) return true;
    if (Math.hypot(x - 162, z + 48) < 9.4 + margin || Math.hypot(x - 162, z - 48) < 9.4 + margin) return true;
    if (x >= 202 - margin && x <= 214.2 + margin && Math.abs(z) <= 12.0 + margin) return true;
    // Mirador Sur (0, 46)
    if (Math.hypot(x, z - 46) < 7.8 + margin) return true;
    if (Math.abs(x) <= 4.0 + margin && z >= 35.5 - margin && z <= 46) return true;
    // 5 Glorietas
    if (Math.hypot(x - 35, z + 8) < 4.6 + margin) return true;
    if (Math.hypot(x + 33, z - 41) < 4.6 + margin) return true;
    if (Math.hypot(x + 54, z + 44) < 4.6 + margin) return true;
    if (Math.hypot(x - 208, z + 22) < 4.6 + margin) return true;
    if (Math.hypot(x - 208, z - 22) < 4.6 + margin) return true;
    // Río Cristalino Real + Gruta Norte + 3 puentes del río
    if (z >= -82 - margin && z <= 39.5 + margin) {
      const rcx = getRiverCenterX(Math.max(-78, Math.min(38, z)));
      if (Math.abs(x - rcx) < 4.1 + margin) return true;
    }
    if (x >= 88.5 - margin && x <= 99.5 + margin && z >= -40.5 - margin && z <= -35.5 + margin) return true;
    if (x >= 99.0 - margin && x <= 110.0 + margin && z >= 24.5 - margin && z <= 29.5 + margin) return true;
    // Lago de los Cisnes (106, 45, rx=21, rz=12.5)
    const dxSwan = (x - 106) / (21.4 + margin);
    const dzSwan = (z - 45) / (12.9 + margin);
    if (dxSwan * dxSwan + dzSwan * dzSwan <= 1.0) return true;
    // Estanque Este (46, 26, rx=11, rz=8.5) + Canal + Puente Este
    const dxPond = (x - 46) / (11.3 + margin);
    const dzPond = (z - 26) / (8.8 + margin);
    if (dxPond * dxPond + dzPond * dzPond <= 1.0) return true;
    if (x >= 29.5 - margin && x <= 38.5 + margin && z >= 17.5 - margin && z <= 30.5 + margin) return true;
    // Arroyo SW + Puente SW + Gran Lago Imperial Sur
    if (x >= -25.2 - margin && x <= -16.8 + margin && z >= 27.5 - margin && z <= 55.5) return true;
    if (x <= 96 + margin && z >= 54.2 - margin) return true;

    return false;
  }

  #buildMossyRocksInstanced(mats) {
    // Rocas estilizadas con cubierta de musgo verde esmeralda repartidas por bordes de colinas y claros exteriores
    const rocks = [];
    const raceRings = [
      [30, 22], [46, 14], [34, 36], [0, 45], [-21, 34],
      [-34, 18], [-30, 0], [-12, -14], [10, -10], [18, 14]
    ];
    const horses = [[-8.5, -11.5], [-8.2, 10.2], [18, -2], [118.5, -7], [118.5, 7]];

    const tryAddRock = (x, z, sc, collide = false) => {
      if (this.#isExcludedZone(x, z, 2.2) || this.#isNearStonePath(x, z)) return false;
      for (const [rx, rz] of raceRings) {
        if (Math.hypot(x - rx, z - rz) < 4.5) return false;
      }
      for (const [hx, hz] of horses) {
        if (Math.hypot(x - hx, z - hz) < 4.5) return false;
      }
      rocks.push({
        x,
        z,
        sc,
        yaw: this.#pseudoRand(x * 3.7 + z * 5.3) * Math.PI * 2,
        collide
      });
      return true;
    };

    // Rocas escénicas al pie de las colinas perimetrales (Norte, Oeste, Este y riberas altas)
    for (let x = -84; x <= 218; x += 9.5) {
      tryAddRock(x + this.#pseudoRand(x) * 3, -81.5 - this.#pseudoRand(x + 4) * 2.0, 1.15 + this.#pseudoRand(x + 9) * 0.7, false);
    }
    for (let z = -76; z <= 50; z += 8.5) {
      tryAddRock(-85.5 - this.#pseudoRand(z) * 1.8, z, 1.1 + this.#pseudoRand(z + 3) * 0.65, false);
      tryAddRock(219.5 + this.#pseudoRand(z + 7) * 2.2, z, 1.15 + this.#pseudoRand(z + 11) * 0.7, false);
    }

    // Grupos naturales de rocas con musgo en bosques, riberas del río y jardines del Casino
    let seed = 907;
    for (let i = 0; i < 190 && rocks.length < 155; i++) {
      seed += 3.17;
      const rx = -82 + this.#pseudoRand(seed) * 298;
      const rz = -78 + this.#pseudoRand(seed + 13.9) * 136;
      const sc = 0.65 + this.#pseudoRand(seed + 29.1) * 0.65;
      tryAddRock(rx, rz, sc, sc > 0.95);
    }

    if (rocks.length === 0) return;

    const rockGeo = new THREE.DodecahedronGeometry(0.85, 1);
    const mossGeo = new THREE.SphereGeometry(0.82, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.52);
    const rockInst = this.#createInstanced(rockGeo, mats.rockStone, rocks.length, true, true);
    const mossInst = this.#createInstanced(mossGeo, mats.moss, rocks.length, false, true);

    const dummy = this.#dummy;
    rocks.forEach((r, i) => {
      dummy.position.set(r.x, 0.28 * r.sc, r.z);
      dummy.rotation.set(0.08, r.yaw, -0.06);
      dummy.scale.set(r.sc * 1.25, r.sc * 0.68, r.sc * 1.05);
      dummy.updateMatrix();
      rockInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(r.x, 0.44 * r.sc, r.z);
      dummy.rotation.set(0, r.yaw, 0);
      dummy.scale.set(r.sc * 1.12, r.sc * 0.42, r.sc * 0.95);
      dummy.updateMatrix();
      mossInst.setMatrixAt(i, dummy.matrix);

      if (r.collide && r.x >= -87 && r.x <= 221 && r.z >= -83 && r.z <= 63) {
        this.#collision.addCylinderCollider(r.x, r.z, 0.72 * r.sc, 0, 1.1);
      }
    });

    this.#finalizeStaticInstanced(rockInst);
    this.#finalizeStaticInstanced(mossInst);
  }

  #createGrassTuftGeometry() {
    // Mata estilizada de 5 hojas arqueadas en abanico (solo 15 triángulos por mata -> ultraligera)
    const blades = 5;
    const positions = new Float32Array(blades * 9);
    const normals = new Float32Array(blades * 9);
    const uvs = new Float32Array(blades * 6);

    for (let b = 0; b < blades; b++) {
      const a = (b / blades) * Math.PI * 2 + 0.3;
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      const lean = 0.14 + (b % 2) * 0.08;
      const h = 0.34 + (b % 3) * 0.08;
      const hw = 0.048;

      const v9 = b * 9;
      const v6 = b * 6;
      // Base izquierda
      positions[v9] = -sinA * hw + cosA * 0.03;
      positions[v9 + 1] = 0;
      positions[v9 + 2] = cosA * hw + sinA * 0.03;
      // Base derecha
      positions[v9 + 3] = sinA * hw + cosA * 0.03;
      positions[v9 + 4] = 0;
      positions[v9 + 5] = -cosA * hw + sinA * 0.03;
      // Punta superior inclinada
      positions[v9 + 6] = cosA * lean;
      positions[v9 + 7] = h;
      positions[v9 + 8] = sinA * lean;

      for (let k = 0; k < 3; k++) {
        normals[v9 + k * 3] = cosA * 0.35;
        normals[v9 + k * 3 + 1] = 0.94;
        normals[v9 + k * 3 + 2] = sinA * 0.35;
      }
      uvs[v6] = 0;
      uvs[v6 + 1] = 0;
      uvs[v6 + 2] = 1;
      uvs[v6 + 3] = 0;
      uvs[v6 + 4] = 0.5;
      uvs[v6 + 5] = 1;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.computeBoundingSphere();
    return geo;
  }

  #createCloverGeometry() {
    // Trébol estilizado de 3 hojas horizontales ligeramente elevadas (9 triángulos por trébol)
    const leaves = 3;
    const positions = new Float32Array(leaves * 18);
    const normals = new Float32Array(leaves * 18);
    const uvs = new Float32Array(leaves * 12);

    for (let i = 0; i < leaves; i++) {
      const a = (i / leaves) * Math.PI * 2;
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      const perpX = -sinA;
      const perpZ = cosA;

      const rOut = 0.17;
      const halfW = 0.095;
      const yCenter = 0.055;
      const yTip = 0.075;

      const p0 = [0, yCenter, 0];
      const p1 = [cosA * rOut + perpX * halfW, yTip, sinA * rOut + perpZ * halfW];
      const p2 = [cosA * (rOut * 1.12), yTip - 0.01, sinA * (rOut * 1.12)];
      const p3 = [cosA * rOut - perpX * halfW, yTip, sinA * rOut - perpZ * halfW];

      const tris = [p0, p1, p2, p0, p2, p3];
      const basePos = i * 18;
      const baseUv = i * 12;
      for (let v = 0; v < 6; v++) {
        positions[basePos + v * 3] = tris[v][0];
        positions[basePos + v * 3 + 1] = tris[v][1];
        positions[basePos + v * 3 + 2] = tris[v][2];
        normals[basePos + v * 3] = 0;
        normals[basePos + v * 3 + 1] = 1;
        normals[basePos + v * 3 + 2] = 0;
        uvs[baseUv + v * 2] = 0.5;
        uvs[baseUv + v * 2 + 1] = 0.5;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.computeBoundingSphere();
    return geo;
  }

  #buildGrassAndCloversInstanced(mats) {
    // ~4.250 matas de hierba estilizada y tréboles en 2 InstancedMesh congelados desde X=-86 hasta X=220
    const grassSpots = [];
    const cloverSpots = [];

    const stepX = 2.22;
    const stepZ = 2.22;
    let seed = 17;

    for (let x = -86; x <= 220; x += stepX) {
      for (let z = -82; z <= 62; z += stepZ) {
        seed += 1.37;
        const jx = x + (this.#pseudoRand(seed) - 0.5) * stepX * 0.92;
        const jz = z + (this.#pseudoRand(seed + 5.3) - 0.5) * stepZ * 0.92;
        if (this.#isExcludedZone(jx, jz, 0.55) || this.#isNearStonePath(jx, jz)) continue;

        const rPick = this.#pseudoRand(seed + 11.7);
        const scale = 0.78 + this.#pseudoRand(seed + 19.1) * 0.62;
        const rot = this.#pseudoRand(seed + 23.9) * Math.PI * 2;
        const colIdx = Math.floor(this.#pseudoRand(seed + 31.3) * 5);

        if (rPick < 0.76) {
          grassSpots.push([jx, jz, scale, rot, colIdx]);
        } else {
          cloverSpots.push([jx, jz, scale, rot, colIdx]);
        }
      }
    }

    const dummy = this.#dummy;
    const color = new THREE.Color();
    const grassPalette = [0x58b864, 0x4ca85c, 0x6ac972, 0x459c62, 0x74cf84];
    const cloverPalette = [0x3f9c54, 0x4eb062, 0x358c4d, 0x5ec272, 0x48a668];

    if (grassSpots.length > 0) {
      const tuftGeo = this.#createGrassTuftGeometry();
      const grassInst = this.#createInstanced(tuftGeo, mats.grassBlade, grassSpots.length, false, false);
      grassInst.userData.isFlower = true;

      for (let i = 0; i < grassSpots.length; i++) {
        const [gx, gz, sc, rot, cIdx] = grassSpots[i];
        dummy.position.set(gx, 0.0, gz);
        dummy.rotation.set(0, rot, 0);
        dummy.scale.set(sc, sc * (0.85 + (i % 3) * 0.14), sc);
        dummy.updateMatrix();
        grassInst.setMatrixAt(i, dummy.matrix);
        color.setHex(grassPalette[cIdx]);
        grassInst.setColorAt(i, color);
      }
      this.#finalizeStaticInstanced(grassInst);
    }

    if (cloverSpots.length > 0) {
      const cloverGeo = this.#createCloverGeometry();
      const cloverInst = this.#createInstanced(cloverGeo, mats.grassBlade, cloverSpots.length, false, false);
      cloverInst.userData.isFlower = true;

      for (let i = 0; i < cloverSpots.length; i++) {
        const [cx, cz, sc, rot, cIdx] = cloverSpots[i];
        dummy.position.set(cx, 0.005, cz);
        dummy.rotation.set(0, rot, 0);
        dummy.scale.setScalar(sc * 0.95);
        dummy.updateMatrix();
        cloverInst.setMatrixAt(i, dummy.matrix);
        color.setHex(cloverPalette[cIdx]);
        cloverInst.setColorAt(i, color);
      }
      this.#finalizeStaticInstanced(cloverInst);
    }
  }

  getWaterSystem() {
    return this.#waterSystem;
  }

  getFountainSystem() {
    return this.#fountainSystem;
  }

  getFoliageSystem() {
    return this.#foliageSystem;
  }

  getLanternPositions() {
    return this.#lanternPositions;
  }

  isExcludedZone(x, z, margin = 0.8) {
    return this.#isExcludedZone(x, z, margin);
  }

  isNearStonePath(x, z) {
    return this.#isNearStonePath(x, z);
  }

  applyTheme(theme) {
    if (!theme) return;
    if (this.#lanternMat) {
      this.#lanternMat.emissiveIntensity = 0.65 + (theme.lanternIntensity ?? 1) * 0.5;
    }
    if (this.#lanternHaloMat) {
      this.#lanternHaloMat.opacity = Math.min(0.42, 0.14 + (theme.lanternIntensity ?? 1) * 0.14);
    }
    this.#waterSystem?.applyTheme?.(theme);
    this.#fountainSystem?.applyTheme?.(theme);
    this.#flora?.applyTheme?.(theme);
    this.#foliageSystem?.applyTheme?.(theme);
  }

  update(dt) {
    const delta = Math.min(dt, 0.1);
    this.#elapsed += delta;

    // Actualizar sistemas delegados (GC-Free)
    this.#waterSystem?.update?.(delta, this.#elapsed);
    this.#fountainSystem?.update?.(delta, this.#elapsed);
    this.#flora?.update?.(delta, this.#elapsed);
    this.#foliageSystem?.update?.(delta, this.#elapsed);
  }

  dispose() {
    this.#foliageSystem?.dispose?.();
    this.#foliageSystem = null;
    this.#fountainSystem?.dispose?.();
    this.#fountainSystem = null;
    this.#waterSystem?.dispose?.();
    this.#waterSystem = null;
    this.#flora?.dispose?.();
    this.#flora = null;
    this.#lanternPositions = [];

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

    this.#instancedMeshes.length = 0;
    this.#geometries.length = 0;
    this.#tempGeos.length = 0;
    this.#materials.length = 0;
    this.#staticBuckets.clear();
    this.#pathGrid.clear();
    this.#waterMat = null;
    this.#lanternMat = null;
    this.#lanternHaloMat = null;
    this.#fountainCrystal = null;
    this.#fountainHalo = null;
    this.#fountainDrops = null;
    this.#dropData = null;
  }
}
