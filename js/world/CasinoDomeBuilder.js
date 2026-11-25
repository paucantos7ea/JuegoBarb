import * as THREE from 'three';

const CX = 162.0;
const CZ = 0.0;
const PLATFORM_Y = 0.60;
const R_OUTER = 35.0;
const R_INNER = 33.4;
const R_WALL = 33.8;
const WALL_TOP_Y = 3.2;
const DOME_APEX_Y = 36.0;
const CROWN_TOP_Y = 42.5;
const ENTRANCE_HALF_ANG = 0.24;
const VIP_Y = 0.92;

const SLOT_SYMBOLS = Object.freeze(['crown', 'diamond', 'rose', 'star', 'seven']);

const SLOT_SPECS = Object.freeze(
  Array.from({ length: 8 }, (_, i) => {
    const ang = (-0.78 + (i / 7) * 0.56) * Math.PI;
    const r = 22.0;
    const x = CX + Math.cos(ang) * r;
    const z = CZ + Math.sin(ang) * r;
    return {
      id: `slot_${i + 1}`,
      x,
      z,
      rotY: Math.atan2(CX - x, CZ - z)
    };
  })
);

const BLACKJACK_SPECS = Object.freeze(
  [
    { id: 'blackjack_1', x: 151.5, z: 19.5 },
    { id: 'blackjack_2', x: 158.5, z: 21.2 },
    { id: 'blackjack_3', x: 165.5, z: 21.2 },
    { id: 'blackjack_4', x: 172.5, z: 19.5 }
  ].map((t) => ({
    ...t,
    rotY: Math.atan2(CX - t.x, CZ - t.z)
  }))
);

const FIREWORK_PALETTE = [0xffe066, 0xff6eb4, 0xc47aff, 0x5cf2ff];
const REST_LIGHT_COLOR = new THREE.Color(0xffdcb8);
const REST_LIGHT_INTENSITY = 1.35;
const _tmpFwColor1 = new THREE.Color();
const _tmpFwColor2 = new THREE.Color();

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

/**
 * Constructor arquitectónico de la Gran Cúpula Gigante del Casino Real,
 * Paseo Real del Casino y sistema de fuegos artificiales.
 */
export class CasinoDomeBuilder {
  static DOME_CENTER = Object.freeze({ x: CX, y: 0, z: CZ });
  static DOME_RADIUS = R_OUTER;

  #scene = null;
  #collision = null;
  #textures = null;
  #root = new THREE.Group();
  #built = false;

  #stations = [];
  #markerRingInst = null;
  #markerRingPositions = [];
  #chandelierSpinners = [];
  #animatedCrystals = [];
  #crownStar = null;
  #waterMat = null;
  #elapsed = 0;

  #geometries = new Set();
  #materials = new Set();
  #ownedTextures = new Set();
  #instancedMeshes = new Set();
  #staticBuckets = new Map();
  #tempGeos = [];
  #dummy = new THREE.Object3D();

  #sharedRoseGoldMat = null;
  #sharedMarbleMat = null;
  #sharedDarkMarbleMat = null;
  #sharedCarpetMat = null;

  // Estado del sistema VFX de fuegos artificiales
  #fwGroup = new THREE.Group();
  #fwLight = null;
  #fwSparkPoints = null;
  #fwTrailPoints = null;
  #fwActive = false;
  #fwTimer = 0;
  #fwSchedule = [];
  #fwRockets = [];
  #fwSparkMax = 2800;
  #fwSparkCount = 0;
  #fwSparkPos = null;
  #fwSparkVel = null;
  #fwSparkCol = null;
  #fwSparkBaseCol = null;
  #fwSparkAge = null;
  #fwSparkLife = null;
  #fwSparkGeo = null;
  #fwTrailMax = 700;
  #fwTrailCount = 0;
  #fwTrailPos = null;
  #fwTrailVel = null;
  #fwTrailCol = null;
  #fwTrailBaseCol = null;
  #fwTrailAge = null;
  #fwTrailLife = null;
  #fwTrailGeo = null;
  #fwFlashEnergy = 0;
  #fwFlashColor = new THREE.Color(0xffe066);

  constructor(sceneOrOpts, arg2, arg3) {
    this.#root.name = 'CasinoDomeRoot';
    this.#assignDependencies(sceneOrOpts, arg2, arg3);
  }

  #assignDependencies(a, b, c) {
    if (a && !a.isObject3D && typeof a === 'object' && a.scene) {
      this.#scene = a.scene || this.#scene;
      this.#collision = a.collision || this.#collision;
      this.#textures = a.textures || this.#textures;
      return;
    }
    if (a && a.isObject3D) this.#scene = a;
    for (const dep of [b, c]) {
      if (!dep) continue;
      if (typeof dep.getTexture === 'function') this.#textures = dep;
      else if (typeof dep.addDiscSurface === 'function') this.#collision = dep;
    }
  }

  init(sceneOrOpts, arg2, arg3) {
    if (sceneOrOpts || arg2 || arg3) {
      this.#assignDependencies(sceneOrOpts, arg2, arg3);
    }
    if (this.#built) return this.#root;
    this.#built = true;

    this.#sharedRoseGoldMat = this.#createRoseGoldMat(0.2, 0.9);
    this.#sharedMarbleMat = this.#createMarbleMat('marble', 4, 4, 0xfff8fb);
    this.#sharedDarkMarbleMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x2a1424,
        roughness: 0.28,
        metalness: 0.14
      })
    );
    this.#sharedCarpetMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xb8225d,
        map: this.#getSharedTexture('carpet', 2, 8),
        roughness: 0.84,
        metalness: 0.04
      })
    );
    this.#waterMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: this.#getSharedTexture('water', 3, 3),
        color: 0x7fd8f5,
        emissive: 0x246b82,
        emissiveIntensity: 0.24,
        roughness: 0.15,
        metalness: 0.25,
        transparent: true,
        opacity: 0.82
      })
    );
    this.#waterMat.userData.preserveRoughness = true;

    this.#buildRoyalPromenade();
    this.#buildPlatformAndStairs();
    this.#buildPerimeterWalls();
    this.#buildCrystalDomeAndArch();
    this.#buildLuxuryInterior();
    this.#buildPalmPlanters();
    this.#buildSlotMachines();
    this.#buildBlackjackTables();
    this.#flushBuckets(this.#staticBuckets, this.#root);
    this.#buildInteractionMarkers();
    this.#initFireworksSystem();

    for (const g of this.#tempGeos) g.dispose();
    this.#tempGeos.length = 0;

    this.#root.matrixAutoUpdate = false;
    this.#root.updateMatrix();
    this.#root.updateMatrixWorld(true);

    if (this.#scene && !this.#root.parent) {
      this.#scene.add(this.#root);
    }
    return this.#root;
  }

  build(sceneOrOpts, arg2, arg3) {
    return this.init(sceneOrOpts, arg2, arg3);
  }

  getGroup() {
    return this.#root;
  }

  getStations() {
    return this.#stations;
  }

  getNearestStation(playerPos, maxDist = 2.6) {
    if (!playerPos) return null;
    let best = null;
    let bestDist = maxDist;
    for (const station of this.#stations) {
      const p = station.interactPos;
      const dx = playerPos.x - p.x;
      const dy = (playerPos.y ?? p.y) - p.y;
      const dz = playerPos.z - p.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist <= bestDist) {
        bestDist = dist;
        best = station;
      }
    }
    return best;
  }

  triggerDomeFireworks() {
    this.#fwActive = true;
    this.#fwTimer = 0;
    this.#fwSchedule.length = 0;
    this.#fwRockets.length = 0;
    this.#fwFlashEnergy = 0;

    const totalRockets = 22;
    for (let i = 0; i < totalRockets; i++) {
      const isInterior = i % 2 === 0;
      const delay = (i / (totalRockets - 1)) * 5.4 + (Math.random() - 0.5) * 0.14;
      const angle = i * 2.39996 + (Math.random() - 0.5) * 0.45;
      const radius = isInterior
        ? 6.0 + Math.random() * 18.0
        : 10.0 + Math.random() * 28.0;
      const targetY = isInterior
        ? 14.0 + Math.random() * 16.0
        : 42.0 + Math.random() * 26.0;

      const startR = isInterior
        ? Math.min(radius * 0.45, 11.0)
        : 14.0 + Math.random() * 16.0;
      const startY = isInterior ? PLATFORM_Y + 1.2 : 3.5;
      const startX = CX + Math.cos(angle) * startR;
      const startZ = CZ + Math.sin(angle) * startR;

      const targetX = CX + Math.cos(angle) * radius;
      const targetZ = CZ + Math.sin(angle) * radius;

      this.#fwSchedule.push({
        delay: Math.max(0, delay),
        launched: false,
        startX,
        startY,
        startZ,
        targetX,
        targetY,
        targetZ,
        colorHex: FIREWORK_PALETTE[i % FIREWORK_PALETTE.length],
        isInterior
      });
    }
    this.#fwSchedule.sort((a, b) => a.delay - b.delay);
  }

  update(dt = 0.016) {
    const safeDt = Math.min(Math.max(dt, 0), 0.05);
    this.#elapsed += safeDt;

    if (this.#waterMat?.map) {
      this.#waterMat.map.offset.x = (this.#elapsed * 0.045) % 1;
      this.#waterMat.map.offset.y = (this.#elapsed * 0.03) % 1;
    }

    for (let i = 0; i < this.#chandelierSpinners.length; i++) {
      const sp = this.#chandelierSpinners[i];
      sp.rotation.y += safeDt * (i % 2 === 0 ? 0.35 : -0.28);
    }

    for (let i = 0; i < this.#animatedCrystals.length; i++) {
      const item = this.#animatedCrystals[i];
      item.mesh.rotation.y += safeDt * item.speed;
      item.mesh.position.y = item.baseY + Math.sin(this.#elapsed * 2.2 + i * 1.4) * 0.1;
    }

    if (this.#crownStar) {
      this.#crownStar.rotation.y += safeDt * 0.65;
    }

    if (this.#markerRingInst && this.#markerRingPositions.length > 0) {
      const dummy = this.#dummy;
      const rotZ = this.#elapsed * 1.1;
      for (let i = 0; i < this.#markerRingPositions.length; i++) {
        const pos = this.#markerRingPositions[i];
        const pulse = 0.94 + 0.08 * Math.sin(this.#elapsed * 3.2 + i * 1.1);
        dummy.position.set(pos.x, pos.y, pos.z);
        dummy.rotation.set(-Math.PI / 2, 0, rotZ);
        dummy.scale.set(pulse, pulse, 1);
        dummy.updateMatrix();
        this.#markerRingInst.setMatrixAt(i, dummy.matrix);
      }
      this.#markerRingInst.instanceMatrix.needsUpdate = true;
    }

    this.#updateFireworks(safeDt);
  }

  dispose() {
    for (const mesh of this.#instancedMeshes) {
      if (mesh && typeof mesh.dispose === 'function') mesh.dispose();
    }
    this.#instancedMeshes.clear();

    for (const geo of this.#geometries) {
      if (geo && typeof geo.dispose === 'function') geo.dispose();
    }
    this.#geometries.clear();

    for (const g of this.#tempGeos) g.dispose();
    this.#tempGeos.length = 0;
    this.#staticBuckets.clear();

    for (const mat of this.#materials) {
      if (mat && typeof mat.dispose === 'function') mat.dispose();
    }
    this.#materials.clear();

    for (const tex of this.#ownedTextures) {
      if (tex && typeof tex.dispose === 'function') tex.dispose();
    }
    this.#ownedTextures.clear();

    if (this.#root.parent) {
      this.#root.parent.remove(this.#root);
    }
    this.#root.clear();
    this.#stations.length = 0;
    this.#markerRingInst = null;
    this.#markerRingPositions.length = 0;
    this.#chandelierSpinners.length = 0;
    this.#animatedCrystals.length = 0;
    this.#crownStar = null;
    this.#waterMat = null;
    this.#fwSchedule.length = 0;
    this.#fwRockets.length = 0;
    this.#fwSparkPoints = null;
    this.#fwTrailPoints = null;
    this.#fwLight = null;
    this.#sharedRoseGoldMat = null;
    this.#sharedMarbleMat = null;
    this.#sharedDarkMarbleMat = null;
    this.#sharedCarpetMat = null;
    this.#fwActive = false;
    this.#built = false;
  }

  // ---------------------------------------------------------------------------
  // Helpers de seguimiento de recursos, batching y texturas
  // ---------------------------------------------------------------------------

  #trackGeo(geo) {
    this.#geometries.add(geo);
    return geo;
  }

  #trackMat(mat) {
    this.#materials.add(mat);
    return mat;
  }

  #trackTex(tex) {
    this.#ownedTextures.add(tex);
    return tex;
  }

  #trackInstanced(mesh) {
    this.#instancedMeshes.add(mesh);
    return mesh;
  }

  #finalizeStaticInstanced(inst, castShadow = false, receiveShadow = false) {
    inst.castShadow = castShadow;
    inst.receiveShadow = receiveShadow;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.matrixAutoUpdate = false;
    inst.updateMatrix();
    return inst;
  }

  #addBucketPiece(buckets, geo, mat, matrix, castShadow = false, receiveShadow = true, sharedGeo = false) {
    if (!sharedGeo) {
      this.#tempGeos.push(geo);
    }
    const key = `${mat.id}_${castShadow ? 1 : 0}_${receiveShadow ? 1 : 0}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { mat, castShadow, receiveShadow, pieces: [] };
      buckets.set(key, bucket);
    }
    bucket.pieces.push({ geometry: geo, matrix: matrix.clone() });
  }

  #addBucketMesh(buckets, geo, mat, x, y, z, castShadow = false, receiveShadow = true, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, sharedGeo = false) {
    this.#dummy.position.set(x, y, z);
    this.#dummy.rotation.set(rx, ry, rz);
    this.#dummy.scale.set(sx, sy, sz);
    this.#dummy.updateMatrix();
    this.#addBucketPiece(buckets, geo, mat, this.#dummy.matrix, castShadow, receiveShadow, sharedGeo);
  }

  #flushBuckets(buckets, parent) {
    for (const bucket of buckets.values()) {
      const merged = mergeGeometries(bucket.pieces);
      if (!merged) continue;
      this.#trackGeo(merged);
      const mesh = new THREE.Mesh(merged, bucket.mat);
      mesh.castShadow = bucket.castShadow;
      mesh.receiveShadow = bucket.receiveShadow;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
    }
    buckets.clear();
  }

  #getSharedTexture(key, rx = 1, ry = 1) {
    if (!this.#textures || typeof this.#textures.getTexture !== 'function') return null;
    return this.#textures.getTexture(key, rx, ry);
  }

  #localToWorld(originX, originY, originZ, rotY, lx, ly, lz) {
    const c = Math.cos(rotY);
    const s = Math.sin(rotY);
    return new THREE.Vector3(
      originX + lx * c + lz * s,
      originY + ly,
      originZ - lx * s + lz * c
    );
  }

  #createRoseGoldMat(roughness = 0.2, metalness = 0.88) {
    const tex = this.#getSharedTexture('roseGold', 2, 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xf4c2b8,
      map: tex,
      roughness,
      metalness
    });
    mat.userData.preserveRoughness = true;
    return this.#trackMat(mat);
  }

  #createMarbleMat(key = 'marble', rx = 3, ry = 3, tint = 0xffffff) {
    const tex = this.#getSharedTexture(key, rx, ry);
    return this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: tint,
        map: tex,
        roughness: 0.34,
        metalness: 0.06
      })
    );
  }

  // ---------------------------------------------------------------------------
  // 0. Paseo Real del Casino (X = 42..127), Explanada, 14 Farolas y 2 Fuentes
  // ---------------------------------------------------------------------------

  #buildRoyalPromenade() {
    const group = new THREE.Group();
    group.name = 'RoyalCasinoPromenade';

    const marbleMat = this.#sharedMarbleMat;
    const roadMat = this.#createMarbleMat('marbleFloor', 14, 3, 0xfff6fa);
    const plazaMat = this.#createMarbleMat('marbleFloor', 5, 6, 0xfff8fb);
    const roseGoldMat = this.#sharedRoseGoldMat;
    const carpetMat = this.#sharedCarpetMat;
    const buckets = this.#staticBuckets;

    // Calzada de mármol desde X = 42 hasta X = 127 (Z ∈ [-4.4, 4.4], Y = 0.015)
    this.#addBucketMesh(buckets, new THREE.BoxGeometry(85.0, 0.06, 8.8), roadMat, 84.5, 0.015, 0, false, true);

    // Bordillos oro rosa en Z = ±4.45 a lo largo del paseo (X = 42..112)
    for (const sz of [-4.45, 4.45]) {
      this.#addBucketMesh(buckets, new THREE.BoxGeometry(70.0, 0.08, 0.16), roseGoldMat, 77.0, 0.02, sz, false, true);
    }

    // Alfombra real central rosa/burdeos en Z ∈ [-1.6, 1.6] a Y = 0.05 (X = 42..121.6)
    this.#addBucketMesh(buckets, new THREE.BoxGeometry(79.6, 0.018, 3.2), carpetMat, 81.8, 0.05, 0, false, true);
    for (const tz of [-1.63, 1.63]) {
      this.#addBucketMesh(buckets, new THREE.BoxGeometry(79.6, 0.02, 0.08), roseGoldMat, 81.8, 0.052, tz, false, true);
    }

    // Explanada de llegada X ∈ [112, 130], Z ∈ [-15, 15] (recibe al jugador y deja sitio a los caballos)
    this.#addBucketMesh(buckets, new THREE.BoxGeometry(18.0, 0.06, 30.0), plazaMat, 121.0, 0.014, 0, false, true);
    // Molduras oro-rosa de la explanada
    for (const sz of [-15.0, 15.0]) {
      this.#addBucketMesh(buckets, new THREE.BoxGeometry(18.2, 0.08, 0.18), roseGoldMat, 121.0, 0.02, sz, false, true);
    }
    for (const sz of [-9.75, 9.75]) {
      this.#addBucketMesh(buckets, new THREE.BoxGeometry(0.18, 0.08, 10.6), roseGoldMat, 112.0, 0.02, sz, false, true);
    }
    // Medallón ornamental en la explanada ante la escalinata (X = 118.5, Z = 0)
    this.#addBucketMesh(buckets, new THREE.RingGeometry(3.4, 3.65, 48), roseGoldMat, 117.5, 0.048, 0, false, true, -Math.PI / 2);

    // 14 farolas emisivas de cristal y oro (7 pares en Z = ±5.3 desde X = 48 hasta X = 114)
    const lampCount = 14;
    const baseGeo = this.#trackGeo(new THREE.CylinderGeometry(0.26, 0.34, 0.42, 12));
    const postGeo = this.#trackGeo(new THREE.CylinderGeometry(0.1, 0.16, 3.6, 12));
    const collarGeo = this.#trackGeo(new THREE.CylinderGeometry(0.24, 0.14, 0.22, 10));
    const bulbGeo = this.#trackGeo(new THREE.OctahedronGeometry(0.28, 1));
    const capGeo = this.#trackGeo(new THREE.ConeGeometry(0.36, 0.38, 8));
    const haloGeo = this.#trackGeo(new THREE.OctahedronGeometry(0.82, 1));

    const lanternBulbMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfff3d8,
        emissive: 0xffc878,
        emissiveIntensity: 0.92,
        roughness: 0.18
      })
    );
    const lanternHaloMat = this.#trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffdca8,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      })
    );
    lanternHaloMat.userData.isVfx = true;

    const baseInst = this.#trackInstanced(new THREE.InstancedMesh(baseGeo, marbleMat, lampCount));
    const postInst = this.#trackInstanced(new THREE.InstancedMesh(postGeo, roseGoldMat, lampCount));
    const collarInst = this.#trackInstanced(new THREE.InstancedMesh(collarGeo, roseGoldMat, lampCount));
    const bulbInst = this.#trackInstanced(new THREE.InstancedMesh(bulbGeo, lanternBulbMat, lampCount));
    const capInst = this.#trackInstanced(new THREE.InstancedMesh(capGeo, roseGoldMat, lampCount));
    const haloInst = this.#trackInstanced(new THREE.InstancedMesh(haloGeo, lanternHaloMat, lampCount));

    const dummy = this.#dummy;
    let idx = 0;
    for (let p = 0; p < 7; p++) {
      const lx = 48 + p * 11;
      for (const lz of [-5.3, 5.3]) {
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);

        dummy.position.set(lx, 0.21, lz);
        dummy.updateMatrix();
        baseInst.setMatrixAt(idx, dummy.matrix);

        dummy.position.set(lx, 2.2, lz);
        dummy.updateMatrix();
        postInst.setMatrixAt(idx, dummy.matrix);

        dummy.position.set(lx, 4.05, lz);
        dummy.updateMatrix();
        collarInst.setMatrixAt(idx, dummy.matrix);

        dummy.position.set(lx, 4.4, lz);
        dummy.updateMatrix();
        bulbInst.setMatrixAt(idx, dummy.matrix);

        dummy.position.set(lx, 4.78, lz);
        dummy.updateMatrix();
        capInst.setMatrixAt(idx, dummy.matrix);

        dummy.position.set(lx, 4.4, lz);
        dummy.scale.setScalar(1.1);
        dummy.updateMatrix();
        haloInst.setMatrixAt(idx, dummy.matrix);

        if (this.#collision) {
          this.#collision.addCylinderCollider(lx, lz, 0.28, 0, 4.4);
        }
        idx++;
      }
    }

    this.#finalizeStaticInstanced(baseInst, false, true);
    this.#finalizeStaticInstanced(postInst, false, false);
    this.#finalizeStaticInstanced(collarInst, false, false);
    this.#finalizeStaticInstanced(bulbInst, false, false);
    this.#finalizeStaticInstanced(capInst, false, false);
    this.#finalizeStaticInstanced(haloInst, false, false);
    group.add(baseInst, postInst, collarInst, bulbInst, capInst, haloInst);

    // 2 fuentes ornamentales flanqueando el paseo en (80, 0, -10.5) y (80, 0, 10.5)
    for (const fz of [-10.5, 10.5]) {
      this.#buildOrnamentalFountain(group, buckets, 80.0, 0.0, fz, 2.75, 2.8);
    }

    group.matrixAutoUpdate = false;
    group.updateMatrix();
    this.#root.add(group);
  }

  #buildOrnamentalFountain(parent, buckets, fx, fy, fz, outerRadius, colliderRadius) {
    const marbleMat = this.#sharedMarbleMat;
    const roseGoldMat = this.#sharedRoseGoldMat;
    const pondBedMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1e4c5c,
        roughness: 0.9,
        metalness: 0.02
      })
    );
    const crystalMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffe4f5,
        emissive: 0xe87cc4,
        emissiveIntensity: 0.72,
        roughness: 0.16,
        metalness: 0.3,
        transparent: true,
        opacity: 0.88
      })
    );
    crystalMat.userData.preserveRoughness = true;

    const rInner = outerRadius - 0.22;
    this.#addBucketMesh(buckets, new THREE.CylinderGeometry(outerRadius, outerRadius + 0.18, 0.56, 32), marbleMat, fx, fy + 0.28, fz, true, true);
    this.#addBucketMesh(buckets, new THREE.CylinderGeometry(rInner, rInner, 0.1, 28), pondBedMat, fx, fy + 0.18, fz, false, true);
    this.#addBucketMesh(buckets, new THREE.TorusGeometry(outerRadius, 0.11, 10, 40), roseGoldMat, fx, fy + 0.58, fz, false, true, Math.PI / 2);
    this.#addBucketMesh(buckets, new THREE.CylinderGeometry(rInner, rInner, 0.08, 30), this.#waterMat, fx, fy + 0.48, fz, false, false);

    // Pedestal central y copa superior
    this.#addBucketMesh(buckets, new THREE.CylinderGeometry(0.45, 0.62, 1.35, 18), marbleMat, fx, fy + 1.05, fz, true, true);
    this.#addBucketMesh(buckets, new THREE.CylinderGeometry(1.25, 0.52, 0.36, 24), marbleMat, fx, fy + 1.78, fz, true, true);
    this.#addBucketMesh(buckets, new THREE.TorusGeometry(1.25, 0.08, 8, 32), roseGoldMat, fx, fy + 1.96, fz, false, true, Math.PI / 2);
    this.#addBucketMesh(buckets, new THREE.CylinderGeometry(1.12, 1.12, 0.06, 24), this.#waterMat, fx, fy + 1.93, fz, false, false);
    this.#addBucketMesh(buckets, new THREE.CylinderGeometry(0.18, 0.26, 0.85, 14), roseGoldMat, fx, fy + 2.38, fz, false, true);

    // Cristal central emisivo animado
    const crystalGeo = this.#trackGeo(new THREE.OctahedronGeometry(0.44, 0));
    const crystal = new THREE.Mesh(crystalGeo, crystalMat);
    crystal.position.set(fx, fy + 3.15, fz);
    crystal.castShadow = false;
    parent.add(crystal);
    this.#animatedCrystals.push({ mesh: crystal, baseY: fy + 3.15, speed: 1.1 });

    this.#addBucketMesh(buckets, new THREE.TorusGeometry(0.68, 0.04, 8, 28), roseGoldMat, fx, fy + 3.15, fz, false, false, Math.PI / 3);

    if (this.#collision) {
      this.#collision.addCylinderCollider(fx, fz, colliderRadius, fy, fy + 4.0);
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Plataforma circular gigante, zócalo y escalinata monumental Oeste
  // ---------------------------------------------------------------------------

  #buildPlatformAndStairs() {
    const group = new THREE.Group();
    group.name = 'DomePlatformAndStairs';

    const marbleMat = this.#sharedMarbleMat;
    const floorMat = this.#createMarbleMat('marbleFloor', 14, 14, 0xfff7fa);
    const roseGoldMat = this.#sharedRoseGoldMat;
    const carpetMat = this.#sharedCarpetMat;
    const buckets = this.#staticBuckets;

    // Zócalo imperial escalonado (R_OUTER = 35.0) hasta PLATFORM_Y = 0.60
    this.#addBucketMesh(buckets, new THREE.CylinderGeometry(R_OUTER, R_OUTER + 0.32, 0.20, 72), marbleMat, CX, 0.10, CZ, false, true);
    this.#addBucketMesh(buckets, new THREE.CylinderGeometry(R_OUTER - 0.12, R_OUTER, 0.20, 72), marbleMat, CX, 0.30, CZ, false, true);
    this.#addBucketMesh(buckets, new THREE.CylinderGeometry(R_OUTER - 0.20, R_OUTER - 0.12, 0.20, 72), floorMat, CX, 0.50, CZ, false, true);

    // Moldura oro-rosa perimetral interior en R_INNER = 33.4 m
    this.#addBucketMesh(buckets, new THREE.RingGeometry(R_INNER - 0.14, R_INNER + 0.14, 80), roseGoldMat, CX, PLATFORM_Y + 0.004, CZ, false, true, -Math.PI / 2);

    // Escalinata monumental al Oeste (-X, X ∈ [121.5, 128.5], Z ∈ [-6.5, 6.5])
    const stepCount = 6;
    const xStart = 121.5;
    const xEnd = 128.5;
    const stepRun = (xEnd - xStart) / stepCount;
    const stepRise = PLATFORM_Y / stepCount;

    for (let i = 0; i < stepCount; i++) {
      const h = (i + 1) * stepRise;
      const minX = xStart + i * stepRun;
      const stepW = stepRun + 0.08;
      this.#addBucketMesh(buckets, new THREE.BoxGeometry(stepW, h, 13.0), marbleMat, minX + stepW * 0.5, h * 0.5, CZ, true, true);
      // Ribete oro-rosa en el borde Oeste de cada peldaño
      this.#addBucketMesh(buckets, new THREE.BoxGeometry(0.06, 0.04, 13.04), roseGoldMat, minX + 0.02, h - 0.015, CZ, false, true);
    }

    // Alfombra imperial de entrada sobre la escalinata (Z ∈ [-3.2, 3.2])
    const rampLen = Math.hypot(xEnd - xStart, PLATFORM_Y);
    const rampSlope = Math.atan2(PLATFORM_Y, xEnd - xStart);
    this.#addBucketMesh(
      buckets,
      new THREE.BoxGeometry(rampLen + 0.3, 0.024, 6.4),
      carpetMat,
      (xStart + xEnd) * 0.5,
      PLATFORM_Y * 0.5 + 0.026,
      CZ,
      false,
      true,
      0,
      0,
      rampSlope
    );
    for (const bz of [-3.24, 3.24]) {
      this.#addBucketMesh(
        buckets,
        new THREE.BoxGeometry(rampLen + 0.3, 0.026, 0.1),
        roseGoldMat,
        (xStart + xEnd) * 0.5,
        PLATFORM_Y * 0.5 + 0.028,
        CZ + bz,
        false,
        true,
        0,
        0,
        rampSlope
      );
    }

    // Balaustradas laterales de la escalinata con pilares y remates oro-rosa
    const cheekGeo = new THREE.BoxGeometry(7.2, 0.72, 0.45);
    const postGeo = new THREE.CylinderGeometry(0.28, 0.34, 1.35, 16);
    const finialGeo = new THREE.OctahedronGeometry(0.26, 0);
    const finialMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffd6ec,
        emissive: 0xff8dc7,
        emissiveIntensity: 0.65,
        roughness: 0.16,
        metalness: 0.35
      })
    );
    this.#tempGeos.push(cheekGeo, postGeo, finialGeo);

    for (const side of [-1, 1]) {
      const zSide = CZ + side * 6.72;
      this.#addBucketMesh(buckets, cheekGeo, marbleMat, 125.0, 0.36, zSide, true, true, 0, 0, 0, 1, 1, 1, true);
      this.#addBucketMesh(buckets, postGeo, marbleMat, 121.55, 0.68, zSide, true, true, 0, 0, 0, 1, 1, 1, true);
      this.#addBucketMesh(buckets, finialGeo, finialMat, 121.55, 1.56, zSide, false, false, 0, 0, 0, 1, 1, 1, true);
      this.#addBucketMesh(buckets, postGeo, marbleMat, 128.45, 0.98, zSide, true, true, 0, 0, 0, 1, 1, 1, true);
      this.#addBucketMesh(buckets, finialGeo, finialMat, 128.45, 1.86, zSide, false, false, 0, 0, 0, 1, 1, 1, true);

      if (this.#collision) {
        this.#collision.addBox(121.3, 128.6, 0, 2.5, zSide - 0.28, zSide + 0.28);
      }
    }

    group.matrixAutoUpdate = false;
    group.updateMatrix();
    this.#root.add(group);

    // Colisiones exactas especificadas para plataforma y escalinata
    if (this.#collision) {
      this.#collision.addDiscSurface(CX, CZ, 34.8, PLATFORM_Y);
      this.#collision.addCylinderCollider(CX, CZ, 34.9, 0, 0.45);
      this.#collision.addRampSurface(120.5, 129.0, -6.5, 6.5, 'x', 121.2, 128.2, 0.0, PLATFORM_Y);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Muro perimetral bajo + barandillas doradas en R_WALL = 33.8
  // ---------------------------------------------------------------------------

  #buildPerimeterWalls() {
    const group = new THREE.Group();
    group.name = 'DomePerimeterWalls';

    const marbleMat = this.#sharedMarbleMat;
    const roseGoldMat = this.#sharedRoseGoldMat;

    const startAng = Math.PI + ENTRANCE_HALF_ANG;
    const endAng = Math.PI * 3 - ENTRANCE_HALF_ANG;
    const segments = 48;
    const stepAng = (endAng - startAng) / segments;
    const totalWallH = WALL_TOP_Y - PLATFORM_Y; // 2.60 m
    const lowWallH = 1.05;                      // y = 0.60..1.65

    // Pilares de mármol y capiteles oro-rosa instanciados en las 49 juntas
    const pillarGeo = this.#trackGeo(new THREE.CylinderGeometry(0.22, 0.26, totalWallH + 0.08, 14));
    const capGeo = this.#trackGeo(new THREE.CylinderGeometry(0.32, 0.24, 0.14, 14));
    const pillarInst = this.#trackInstanced(new THREE.InstancedMesh(pillarGeo, marbleMat, segments + 1));
    const capInst = this.#trackInstanced(new THREE.InstancedMesh(capGeo, roseGoldMat, segments + 1));
    const dummy = this.#dummy;

    for (let i = 0; i <= segments; i++) {
      const ang = startAng + i * stepAng;
      const px = CX + Math.cos(ang) * R_WALL;
      const pz = CZ + Math.sin(ang) * R_WALL;

      dummy.position.set(px, PLATFORM_Y + (totalWallH + 0.08) * 0.5, pz);
      dummy.rotation.set(0, -ang, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      pillarInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(px, WALL_TOP_Y + 0.05, pz);
      dummy.updateMatrix();
      capInst.setMatrixAt(i, dummy.matrix);
    }
    this.#finalizeStaticInstanced(pillarInst, false, true);
    this.#finalizeStaticInstanced(capInst, false, true);
    group.add(pillarInst, capInst);

    // Paños bajos de mármol, pasamanos intermedios/superiores y balaustres dorados
    const chordLen = 2 * R_WALL * Math.sin(stepAng * 0.5) + 0.08;
    const wallGeo = this.#trackGeo(new THREE.BoxGeometry(0.42, lowWallH, chordLen));
    const midRailGeo = this.#trackGeo(new THREE.BoxGeometry(0.48, 0.11, chordLen + 0.04));
    const topRailGeo = this.#trackGeo(new THREE.BoxGeometry(0.54, 0.14, chordLen + 0.06));
    const spindleGeo = this.#trackGeo(new THREE.CylinderGeometry(0.055, 0.065, totalWallH - lowWallH - 0.1, 10));

    const wallInst = this.#trackInstanced(new THREE.InstancedMesh(wallGeo, marbleMat, segments));
    const midRailInst = this.#trackInstanced(new THREE.InstancedMesh(midRailGeo, roseGoldMat, segments));
    const topRailInst = this.#trackInstanced(new THREE.InstancedMesh(topRailGeo, roseGoldMat, segments));
    const spindleInst = this.#trackInstanced(new THREE.InstancedMesh(spindleGeo, roseGoldMat, segments * 3));

    const spindleCenterY = PLATFORM_Y + lowWallH + (totalWallH - lowWallH) * 0.5;
    let spindleIdx = 0;

    for (let i = 0; i < segments; i++) {
      const midAng = startAng + (i + 0.5) * stepAng;
      const rMid = R_WALL * Math.cos(stepAng * 0.5);
      const wx = CX + Math.cos(midAng) * rMid;
      const wz = CZ + Math.sin(midAng) * rMid;

      dummy.position.set(wx, PLATFORM_Y + lowWallH * 0.5, wz);
      dummy.rotation.set(0, -midAng, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      wallInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(wx, PLATFORM_Y + lowWallH + 0.04, wz);
      dummy.updateMatrix();
      midRailInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(wx, WALL_TOP_Y - 0.02, wz);
      dummy.updateMatrix();
      topRailInst.setMatrixAt(i, dummy.matrix);

      for (let s = -1; s <= 1; s++) {
        const subAng = midAng + s * (stepAng * 0.25);
        const sx = CX + Math.cos(subAng) * rMid;
        const sz = CZ + Math.sin(subAng) * rMid;
        dummy.position.set(sx, spindleCenterY, sz);
        dummy.rotation.set(0, -subAng, 0);
        dummy.updateMatrix();
        spindleInst.setMatrixAt(spindleIdx++, dummy.matrix);
      }
    }

    this.#finalizeStaticInstanced(wallInst, false, true);
    this.#finalizeStaticInstanced(midRailInst, false, true);
    this.#finalizeStaticInstanced(topRailInst, false, true);
    this.#finalizeStaticInstanced(spindleInst, false, false);
    group.add(wallInst, midRailInst, topRailInst, spindleInst);

    group.matrixAutoUpdate = false;
    group.updateMatrix();
    this.#root.add(group);

    // Colisionadores perimetrales continuos desde minY = 0 hasta maxY = 6.0 (dejan libre |ang - Math.PI| < ENTRANCE_HALF_ANG)
    if (this.#collision) {
      const colSteps = 140;
      const colStart = startAng + 0.015;
      const colEnd = endAng - 0.015;
      for (let i = 0; i <= colSteps; i++) {
        const ang = colStart + (i / colSteps) * (colEnd - colStart);
        const cx = CX + Math.cos(ang) * R_WALL;
        const cz = CZ + Math.sin(ang) * R_WALL;
        this.#collision.addCylinderCollider(cx, cz, 0.55, 0, 6.0);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Doble anillo de cristal, 24 costillas, Corona Imperial y Pórtico Oeste
  // ---------------------------------------------------------------------------

  #buildCrystalDomeAndArch() {
    const group = new THREE.Group();
    group.name = 'CrystalDomeStructure';

    const roseGoldMat = this.#sharedRoseGoldMat;
    const marbleMat = this.#sharedMarbleMat;
    const buckets = this.#staticBuckets;

    // Doble material cristalino ligero (MeshStandardMaterial, NUNCA MeshPhysicalMaterial)
    const crystalTex = this.#getSharedTexture('stainedCrystal', 14, 4);
    const roseGlassMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffdff2,
        map: crystalTex,
        emissive: 0xff8ec8,
        emissiveIntensity: 0.24,
        transparent: true,
        opacity: 0.28,
        roughness: 0.16,
        metalness: 0.24,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    roseGlassMat.userData.preserveRoughness = true;

    const goldGlassMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfff0dc,
        map: crystalTex,
        emissive: 0xffc688,
        emissiveIntensity: 0.22,
        transparent: true,
        opacity: 0.25,
        roughness: 0.15,
        metalness: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    goldGlassMat.userData.preserveRoughness = true;

    const emissiveRingMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffe4b8,
        emissive: 0xffb86c,
        emissiveIntensity: 0.72,
        roughness: 0.2,
        metalness: 0.6
      })
    );

    // Anillo / Tambor inferior cristal rosado (y = 3.2..7.8), dejando libre la entrada Oeste (-X)
    const lowerDrumH = 7.8 - WALL_TOP_Y;
    const lowerDrumGeo = new THREE.CylinderGeometry(
      R_WALL,
      R_WALL,
      lowerDrumH,
      56,
      1,
      true,
      ENTRANCE_HALF_ANG,
      Math.PI * 2 - ENTRANCE_HALF_ANG * 2
    );
    this.#addBucketMesh(
      buckets,
      lowerDrumGeo,
      roseGlassMat,
      CX,
      WALL_TOP_Y + lowerDrumH * 0.5,
      CZ,
      false,
      false,
      0,
      -Math.PI / 2,
      0
    );

    // Anillo / Tambor superior cristal rosado-dorado (y = 7.8..11.5) por encima del dintel (y > 7.8)
    const upperDrumH = 11.5 - 7.8;
    const upperDrumR = R_WALL * 0.965;
    this.#addBucketMesh(
      buckets,
      new THREE.CylinderGeometry(upperDrumR, R_WALL, upperDrumH, 56, 1, true),
      roseGlassMat,
      CX,
      7.8 + upperDrumH * 0.5,
      CZ,
      false,
      false
    );

    // Bóveda principal abovedada de cristal dorado/rosado (y = 11.5..36.0 hasta el óculo)
    const domeBaseY = 11.5;
    const domeHeight = DOME_APEX_Y - domeBaseY; // 24.5 m
    const oculusPhi = 0.155;
    const scaleY = domeHeight / upperDrumR;
    const vaultGeo = new THREE.SphereGeometry(upperDrumR, 48, 22, 0, Math.PI * 2, oculusPhi, Math.PI * 0.5 - oculusPhi);
    this.#addBucketMesh(buckets, vaultGeo, goldGlassMat, CX, domeBaseY, CZ, false, false, 0, 0, 0, 1, scaleY, 1);

    // 24 costillas meridionales doradas ornamentadas (InstancedMesh)
    const ribCount = 24;
    const vaultSteps = 18;
    const vaultPts = [];
    for (let s = 0; s <= vaultSteps; s++) {
      const phi = Math.PI * 0.5 + (oculusPhi - Math.PI * 0.5) * (s / vaultSteps);
      const rHoriz = (upperDrumR + 0.08) * Math.sin(phi);
      const y = domeBaseY + domeHeight * Math.cos(phi);
      vaultPts.push(new THREE.Vector3(rHoriz, y, 0));
    }
    const vaultCurve = new THREE.CatmullRomCurve3(vaultPts);
    const vaultRibGeo = this.#trackGeo(new THREE.TubeGeometry(vaultCurve, 24, 0.16, 8, false));
    const vaultRibInst = this.#trackInstanced(new THREE.InstancedMesh(vaultRibGeo, roseGoldMat, ribCount));

    const dummy = this.#dummy;
    const lowerRibAngles = [];
    for (let i = 0; i < ribCount; i++) {
      const ang = (i / ribCount) * Math.PI * 2;
      dummy.position.set(CX, 0, CZ);
      dummy.rotation.set(0, -ang, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      vaultRibInst.setMatrixAt(i, dummy.matrix);

      // En el tambor inferior evitamos la zona abierta del pórtico Oeste
      const distFromWest = Math.abs(Math.atan2(Math.sin(ang - Math.PI), Math.cos(ang - Math.PI)));
      if (distFromWest > ENTRANCE_HALF_ANG + 0.02) {
        lowerRibAngles.push(ang);
      }
    }
    this.#finalizeStaticInstanced(vaultRibInst, false, true);
    group.add(vaultRibInst);

    if (lowerRibAngles.length > 0) {
      const drumPts = [
        new THREE.Vector3(R_WALL + 0.08, WALL_TOP_Y, 0),
        new THREE.Vector3(R_WALL + 0.08, 7.8, 0),
        new THREE.Vector3(upperDrumR + 0.08, domeBaseY, 0)
      ];
      const drumCurve = new THREE.CatmullRomCurve3(drumPts);
      const drumRibGeo = this.#trackGeo(new THREE.TubeGeometry(drumCurve, 10, 0.18, 8, false));
      const drumRibInst = this.#trackInstanced(new THREE.InstancedMesh(drumRibGeo, roseGoldMat, lowerRibAngles.length));
      for (let i = 0; i < lowerRibAngles.length; i++) {
        dummy.position.set(CX, 0, CZ);
        dummy.rotation.set(0, -lowerRibAngles[i], 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        drumRibInst.setMatrixAt(i, dummy.matrix);
      }
      this.#finalizeStaticInstanced(drumRibInst, false, true);
      group.add(drumRibInst);
    }

    // 4 anillos horizontales dorados / emisivos
    // Anillo 1 (y = 7.8): arco libre en la entrada Oeste
    this.#addBucketMesh(
      buckets,
      new THREE.TorusGeometry(R_WALL + 0.08, 0.16, 10, 72, Math.PI * 2 - ENTRANCE_HALF_ANG * 2),
      roseGoldMat,
      CX,
      7.8,
      CZ,
      false,
      true,
      Math.PI / 2,
      0,
      -(Math.PI + ENTRANCE_HALF_ANG)
    );
    // Anillo 2 (y = 11.5): gran cornisa del tambor con banda luminosa
    this.#addBucketMesh(buckets, new THREE.TorusGeometry(upperDrumR + 0.1, 0.22, 12, 80), roseGoldMat, CX, 11.5, CZ, false, true, Math.PI / 2);
    this.#addBucketMesh(buckets, new THREE.TorusGeometry(upperDrumR + 0.28, 0.08, 8, 80), emissiveRingMat, CX, 11.5, CZ, false, false, Math.PI / 2);

    // Anillos 3 y 4 en la bóveda superior
    for (const phi of [0.96, 0.52]) {
      const ringR = (upperDrumR + 0.08) * Math.sin(phi);
      const ringY = domeBaseY + domeHeight * Math.cos(phi);
      this.#addBucketMesh(buckets, new THREE.TorusGeometry(ringR, 0.15, 10, 64), roseGoldMat, CX, ringY, CZ, false, true, Math.PI / 2);
      this.#addBucketMesh(buckets, new THREE.TorusGeometry(ringR + 0.12, 0.06, 8, 64), emissiveRingMat, CX, ringY, CZ, false, false, Math.PI / 2);
    }

    // Corona Imperial gigante iluminada en la cúspide (y = 36.0..42.5)
    this.#buildImperialCrown(group, buckets, upperDrumR, domeBaseY, domeHeight, oculusPhi, roseGoldMat, roseGlassMat, emissiveRingMat);

    // Pórtico Monumental en la entrada Oeste (-X, mirando hacia -X)
    this.#buildEntranceArch(group, buckets, marbleMat, roseGoldMat);

    group.matrixAutoUpdate = false;
    group.updateMatrix();
    this.#root.add(group);
  }

  #buildImperialCrown(group, buckets, upperDrumR, domeBaseY, domeHeight, oculusPhi, roseGoldMat, glassMat, emissiveRingMat) {
    const oculusR = upperDrumR * Math.sin(oculusPhi); // ~5.04 m
    const oculusY = domeBaseY + domeHeight * Math.cos(oculusPhi); // ~35.7 m

    const rubyMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xff4b96,
        emissive: 0xff2a82,
        emissiveIntensity: 0.92,
        roughness: 0.14,
        metalness: 0.35
      })
    );
    rubyMat.userData.preserveRoughness = true;

    const starMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffeeb0,
        emissive: 0xffcc58,
        emissiveIntensity: 0.95,
        roughness: 0.14,
        metalness: 0.55
      })
    );
    starMat.userData.preserveRoughness = true;

    // Aro del óculo y tambor de linterna de cristal (y = 35.7..38.0)
    this.#addBucketMesh(buckets, new THREE.TorusGeometry(oculusR + 0.1, 0.24, 12, 48), roseGoldMat, CX, oculusY, CZ, false, true, Math.PI / 2);
    this.#addBucketMesh(buckets, new THREE.CylinderGeometry(oculusR * 0.92, oculusR * 0.98, 2.2, 24, 1, true), glassMat, CX, oculusY + 1.1, CZ, false, false);

    // Doble aro dorado de la Corona Real (y = 38.0..39.2)
    const crownBaseY = 38.0;
    const crownR = oculusR * 0.95; // ~4.78 m
    this.#addBucketMesh(buckets, new THREE.TorusGeometry(crownR, 0.22, 12, 48), roseGoldMat, CX, crownBaseY, CZ, false, true, Math.PI / 2);
    this.#addBucketMesh(buckets, new THREE.TorusGeometry(crownR + 0.35, 0.16, 10, 48), emissiveRingMat, CX, crownBaseY + 0.65, CZ, false, false, Math.PI / 2);

    // 12 puntas reales y 12 gemas rubí emisivas instanciadas
    const spikeCount = 12;
    const spikeGeo = this.#trackGeo(new THREE.ConeGeometry(0.42, 2.2, 8));
    const gemGeo = this.#trackGeo(new THREE.OctahedronGeometry(0.32, 0));
    const spikeInst = this.#trackInstanced(new THREE.InstancedMesh(spikeGeo, roseGoldMat, spikeCount));
    const gemInst = this.#trackInstanced(new THREE.InstancedMesh(gemGeo, rubyMat, spikeCount * 2));
    const dummy = this.#dummy;

    for (let i = 0; i < spikeCount; i++) {
      const ang = (i / spikeCount) * Math.PI * 2;
      const sx = CX + Math.cos(ang) * (crownR + 0.18);
      const sz = CZ + Math.sin(ang) * (crownR + 0.18);

      dummy.position.set(sx, crownBaseY + 1.35, sz);
      dummy.rotation.set(0, -ang, -0.14);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      spikeInst.setMatrixAt(i, dummy.matrix);

      // Gema en la punta de cada almena
      dummy.position.set(CX + Math.cos(ang) * (crownR + 0.35), crownBaseY + 2.48, CZ + Math.sin(ang) * (crownR + 0.35));
      dummy.rotation.set(0, ang, 0);
      dummy.scale.set(0.85, 1.15, 0.85);
      dummy.updateMatrix();
      gemInst.setMatrixAt(i * 2, dummy.matrix);

      // Gema en la banda frontal de la corona
      dummy.position.set(CX + Math.cos(ang) * (crownR + 0.45), crownBaseY + 0.32, CZ + Math.sin(ang) * (crownR + 0.45));
      dummy.scale.set(1.0, 0.8, 0.55);
      dummy.updateMatrix();
      gemInst.setMatrixAt(i * 2 + 1, dummy.matrix);
    }
    this.#finalizeStaticInstanced(spikeInst, false, false);
    this.#finalizeStaticInstanced(gemInst, false, false);
    group.add(spikeInst, gemInst);

    // 6 arcos imperiales que convergen en la cúspide (y = 40.9)
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * Math.PI * 2;
      const archPts = [
        new THREE.Vector3(CX + Math.cos(ang) * crownR, crownBaseY + 0.4, CZ + Math.sin(ang) * crownR),
        new THREE.Vector3(CX + Math.cos(ang) * (crownR * 0.62), crownBaseY + 2.3, CZ + Math.sin(ang) * (crownR * 0.62)),
        new THREE.Vector3(CX, crownBaseY + 2.95, CZ)
      ];
      const curve = new THREE.CatmullRomCurve3(archPts);
      this.#addBucketMesh(buckets, new THREE.TubeGeometry(curve, 12, 0.14, 8, false), roseGoldMat, 0, 0, 0, false, false);
    }

    // Estrella / Octaedro gigante superior en CROWN_TOP_Y = 42.5 (visible desde todo el reino)
    this.#addBucketMesh(buckets, new THREE.CylinderGeometry(0.18, 0.3, 1.3, 12), roseGoldMat, CX, 41.3, CZ, false, false);
    const starGeo = this.#trackGeo(new THREE.OctahedronGeometry(1.45, 0));
    const starMesh = new THREE.Mesh(starGeo, starMat);
    starMesh.position.set(CX, CROWN_TOP_Y - 0.15, CZ);
    group.add(starMesh);
    this.#crownStar = starMesh;

    this.#addBucketMesh(buckets, new THREE.TorusGeometry(1.95, 0.09, 10, 40), emissiveRingMat, CX, CROWN_TOP_Y - 0.15, CZ, false, false, Math.PI / 3);
  }

  #buildEntranceArch(archParent, buckets, marbleMat, roseGoldMat) {
    const xCols = 128.8;
    const colHeight = 6.4;
    const colBaseY = PLATFORM_Y;
    const colGeo = new THREE.CylinderGeometry(0.44, 0.52, colHeight, 16);
    const plinthGeo = new THREE.BoxGeometry(1.35, 0.48, 1.35);
    const capGeo = new THREE.CylinderGeometry(0.72, 0.46, 0.48, 16);
    this.#tempGeos.push(colGeo, plinthGeo, capGeo);

    // 4 columnas estriadas monumentales en la entrada Oeste (-X)
    const colZOffsets = [-7.9, -4.3, 4.3, 7.9];
    for (const czOff of colZOffsets) {
      const zPos = CZ + czOff;
      this.#addBucketMesh(buckets, plinthGeo, roseGoldMat, xCols, colBaseY + 0.24, zPos, false, true, 0, 0, 0, 1, 1, 1, true);
      this.#addBucketMesh(buckets, colGeo, marbleMat, xCols, colBaseY + 0.48 + colHeight * 0.5, zPos, true, true, 0, 0, 0, 1, 1, 1, true);
      this.#addBucketMesh(buckets, capGeo, roseGoldMat, xCols, colBaseY + 0.48 + colHeight + 0.24, zPos, false, true, 0, 0, 0, 1, 1, 1, true);

      if (this.#collision) {
        this.#collision.addCylinderCollider(xCols, zPos, 0.62, 0, 8.5);
      }
    }

    // Entablamento monumental (y = 7.96..9.45)
    const entY = colBaseY + 0.48 + colHeight + 0.48; // 7.96
    this.#addBucketMesh(buckets, new THREE.BoxGeometry(1.65, 1.45, 17.6), marbleMat, xCols - 0.12, entY + 0.72, CZ, false, true);
    this.#addBucketMesh(buckets, new THREE.BoxGeometry(1.85, 0.22, 18.0), roseGoldMat, xCols - 0.12, entY + 0.08, CZ, false, true);
    this.#addBucketMesh(buckets, new THREE.BoxGeometry(1.92, 0.26, 18.3), roseGoldMat, xCols - 0.12, entY + 1.48, CZ, false, true);

    // Frontón curvo imperial coronando el pórtico (y = 9.5..12.2)
    this.#addBucketMesh(
      buckets,
      new THREE.CylinderGeometry(7.2, 7.2, 1.35, 32, 1, false, 0, Math.PI),
      marbleMat,
      xCols - 0.12,
      entY + 1.5,
      CZ,
      false,
      true,
      0,
      0,
      Math.PI / 2
    );
    this.#addBucketMesh(
      buckets,
      new THREE.TorusGeometry(7.3, 0.22, 10, 40, Math.PI),
      roseGoldMat,
      xCols - 0.9,
      entY + 1.5,
      CZ,
      false,
      true,
      0,
      Math.PI / 2,
      0
    );

    const crestMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffd6ec,
        emissive: 0xff66b3,
        emissiveIntensity: 0.85,
        roughness: 0.18,
        metalness: 0.35
      })
    );
    this.#addBucketMesh(buckets, new THREE.OctahedronGeometry(0.68, 0), crestMat, xCols - 0.85, entY + 3.25, CZ, false, false);

    // Cartel luminoso mirando hacia -X (ry = -Math.PI / 2): "♛ GRAN CÚPULA REAL · CASINO ♛"
    const signTex = this.#createSignTexture();
    const signMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: signTex,
        emissiveMap: signTex,
        emissive: 0xffd2ec,
        emissiveIntensity: 0.78,
        roughness: 0.24,
        metalness: 0.15
      })
    );
    const signX = xCols - 0.98;
    const signY = entY + 0.74;
    this.#addBucketMesh(buckets, new THREE.PlaneGeometry(10.6, 1.32), signMat, signX, signY, CZ, false, false, 0, -Math.PI / 2, 0);

    // Bombillas doradas emisivas instanciadas rodeando el cartel
    const bulbGeo = this.#trackGeo(new THREE.SphereGeometry(0.08, 10, 8));
    const bulbMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfff0c8,
        emissive: 0xffd175,
        emissiveIntensity: 0.88,
        roughness: 0.2
      })
    );
    const colsPerEdge = 21;
    const bulbCount = colsPerEdge * 2 + 4;
    const bulbInst = this.#trackInstanced(new THREE.InstancedMesh(bulbGeo, bulbMat, bulbCount));
    const dummy = this.#dummy;
    let idx = 0;

    for (let i = 0; i < colsPerEdge; i++) {
      const zPos = CZ - 5.2 + (i / (colsPerEdge - 1)) * 10.4;
      for (const yOff of [-0.70, 0.70]) {
        dummy.position.set(signX - 0.03, signY + yOff, zPos);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        bulbInst.setMatrixAt(idx++, dummy.matrix);
      }
    }
    for (const zSide of [-5.28, 5.28]) {
      for (const yOff of [-0.25, 0.25]) {
        dummy.position.set(signX - 0.03, signY + yOff, CZ + zSide);
        dummy.updateMatrix();
        bulbInst.setMatrixAt(idx++, dummy.matrix);
      }
    }

    this.#finalizeStaticInstanced(bulbInst, false, false);
    archParent.add(bulbInst);
  }

  // ---------------------------------------------------------------------------
  // 4. Interior de Lujo: Suelo Estrella 8 Puntas, Araña Colosal y 2 Fuentes
  // ---------------------------------------------------------------------------

  #buildLuxuryInterior() {
    const group = new THREE.Group();
    group.name = 'LuxuryDomeInterior';

    const roseGoldMat = this.#sharedRoseGoldMat;
    const carpetMat = this.#sharedCarpetMat;
    const buckets = this.#staticBuckets;

    // Suelo de mármol blanco, negro y dorado con estrella central gigante de 8 puntas (1024x1024)
    const luxuryFloorTex = this.#createLuxuryFloorTexture();
    const luxuryFloorMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: luxuryFloorTex,
        roughness: 0.28,
        metalness: 0.1
      })
    );
    this.#addBucketMesh(
      buckets,
      new THREE.CircleGeometry(R_INNER, 72),
      luxuryFloorMat,
      CX,
      PLATFORM_Y + 0.005,
      CZ,
      false,
      true,
      -Math.PI / 2
    );

    // Pasillo de alfombra burdeos/rosa desde la entrada Oeste (X = 128.5) hacia el centro
    this.#addBucketMesh(buckets, new THREE.BoxGeometry(20.0, 0.018, 6.2), carpetMat, 138.5, PLATFORM_Y + 0.012, CZ, false, true);
    for (const tz of [-3.15, 3.15]) {
      this.#addBucketMesh(buckets, new THREE.BoxGeometry(20.0, 0.02, 0.14), roseGoldMat, 138.5, PLATFORM_Y + 0.014, CZ + tz, false, true);
    }

    // Halo cálido sutil en el suelo bajo la araña
    const floorGlowTex = this.#createSparkTexture();
    const floorGlowMat = this.#trackMat(
      new THREE.MeshBasicMaterial({
        map: floorGlowTex,
        color: 0xffc6e2,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      })
    );
    floorGlowMat.userData.isVfx = true;
    this.#addBucketMesh(buckets, new THREE.CircleGeometry(14.0, 48), floorGlowMat, CX, PLATFORM_Y + 0.016, CZ, false, false, -Math.PI / 2);

    // Lámpara de araña colosal colgante (Y = 34.5 a Y = 16.8)
    this.#buildColossalChandelier(group, buckets, roseGoldMat);

    // 2 fuentes interiores ornamentales en (145, PLATFORM_Y, -13) y (145, PLATFORM_Y, 13)
    for (const fz of [-13.0, 13.0]) {
      this.#buildOrnamentalFountain(group, buckets, 145.0, PLATFORM_Y, fz, 2.55, 2.6);
    }

    group.matrixAutoUpdate = false;
    group.updateMatrix();
    this.#root.add(group);
  }

  #buildColossalChandelier(group, buckets, roseGoldMat) {
    const chanGroup = new THREE.Group();
    chanGroup.position.set(CX, 22.0, CZ);

    // Cadena/mástil y dosel superior hasta Y = 34.5
    this.#addBucketMesh(buckets, new THREE.CylinderGeometry(0.16, 0.24, 13.2, 12), roseGoldMat, CX, 28.6, CZ, false, false);
    this.#addBucketMesh(buckets, new THREE.ConeGeometry(2.6, 1.4, 24), roseGoldMat, CX, 34.5, CZ, false, false);
    this.#addBucketMesh(buckets, new THREE.TorusGeometry(2.6, 0.14, 10, 32), roseGoldMat, CX, 33.8, CZ, false, false, Math.PI / 2);

    const crystalMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfff0fa,
        emissive: 0xffcae6,
        emissiveIntensity: 0.65,
        transparent: true,
        opacity: 0.85,
        roughness: 0.14,
        metalness: 0.28
      })
    );
    crystalMat.userData.preserveRoughness = true;

    const flameMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfff5d6,
        emissive: 0xffd584,
        emissiveIntensity: 0.88,
        roughness: 0.18
      })
    );

    // 4 aros concéntricos giratorios desde Y = 22.0 hasta Y = 17.0 (puntas hasta 16.8)
    const tiers = [
      { r: 5.4, y: 0.0, count: 20, tube: 0.14 },
      { r: 3.9, y: -1.65, count: 16, tube: 0.12 },
      { r: 2.5, y: -3.15, count: 12, tube: 0.10 },
      { r: 1.25, y: -4.45, count: 8, tube: 0.08 }
    ];

    const crystalGeo = new THREE.OctahedronGeometry(0.24, 0);
    const bulbGeo = new THREE.SphereGeometry(0.14, 10, 8);
    const dummy = this.#dummy;

    for (let t = 0; t < tiers.length; t++) {
      const { r, y, count, tube } = tiers[t];
      const spinner = new THREE.Group();
      spinner.position.y = y;

      const hoopGeo = new THREE.TorusGeometry(r, tube, 10, 40);
      const goldPieces = [];
      const crystalPieces = [];
      const flamePieces = [];

      dummy.position.set(0, 0, 0);
      dummy.rotation.set(Math.PI / 2, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      goldPieces.push({ geometry: hoopGeo, matrix: dummy.matrix.clone() });

      for (let c = 0; c < count; c++) {
        const a = (c / count) * Math.PI * 2;
        const px = Math.cos(a) * r;
        const pz = Math.sin(a) * r;

        dummy.position.set(px, -0.45, pz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(0.8, 2.0, 0.8);
        dummy.updateMatrix();
        crystalPieces.push({ geometry: crystalGeo, matrix: dummy.matrix.clone() });

        dummy.position.set(px, 0.28, pz);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        flamePieces.push({ geometry: bulbGeo, matrix: dummy.matrix.clone() });
      }

      if (t === tiers.length - 1) {
        // Cristal colgante central inferior (llega a Y ≈ 16.8)
        dummy.position.set(0, -0.75, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1.6, 2.6, 1.6);
        dummy.updateMatrix();
        crystalPieces.push({ geometry: crystalGeo, matrix: dummy.matrix.clone() });
      }

      for (const [pieces, mat] of [
        [goldPieces, roseGoldMat],
        [crystalPieces, crystalMat],
        [flamePieces, flameMat]
      ]) {
        const merged = mergeGeometries(pieces);
        if (!merged) continue;
        this.#trackGeo(merged);
        const m = new THREE.Mesh(merged, mat);
        m.matrixAutoUpdate = false;
        m.updateMatrix();
        spinner.add(m);
      }

      hoopGeo.dispose();
      chanGroup.add(spinner);
      this.#chandelierSpinners.push(spinner);
    }

    crystalGeo.dispose();
    bulbGeo.dispose();

    chanGroup.matrixAutoUpdate = false;
    chanGroup.updateMatrix();
    group.add(chanGroup);
  }

  // ---------------------------------------------------------------------------
  // 4b. 12 Palmeras / Jardineras de Lujo (InstancedMesh en r = 30.2)
  // ---------------------------------------------------------------------------

  #buildPalmPlanters() {
    const group = new THREE.Group();
    group.name = 'LuxuryPalmPlanters';

    const marbleMat = this.#sharedMarbleMat;
    const roseGoldMat = this.#sharedRoseGoldMat;
    const trunkMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x7c5742,
        roughness: 0.86,
        metalness: 0.04
      })
    );
    const frondMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3f9653,
        roughness: 0.68,
        metalness: 0.04
      })
    );

    const count = 12;
    const radius = 30.2;
    const startAng = Math.PI + 0.42;
    const endAng = Math.PI * 3 - 0.42;
    const positions = [];
    for (let i = 0; i < count; i++) {
      const ang = startAng + (i / (count - 1)) * (endAng - startAng);
      positions.push({
        x: CX + Math.cos(ang) * radius,
        z: CZ + Math.sin(ang) * radius,
        ang
      });
    }

    const potGeo = this.#trackGeo(new THREE.CylinderGeometry(0.84, 0.66, 0.92, 12));
    const potTrimGeo = this.#trackGeo(new THREE.TorusGeometry(0.84, 0.08, 8, 24));
    const trunkGeo = this.#trackGeo(new THREE.CylinderGeometry(0.16, 0.26, 3.8, 10));
    const frondGeo = this.#trackGeo(new THREE.ConeGeometry(0.32, 2.35, 6));
    frondGeo.translate(0, 1.17, 0);

    const potInst = this.#trackInstanced(new THREE.InstancedMesh(potGeo, marbleMat, count));
    const trimInst = this.#trackInstanced(new THREE.InstancedMesh(potTrimGeo, roseGoldMat, count));
    const trunkInst = this.#trackInstanced(new THREE.InstancedMesh(trunkGeo, trunkMat, count));
    const frondsPerPalm = 7;
    const frondInst = this.#trackInstanced(new THREE.InstancedMesh(frondGeo, frondMat, count * frondsPerPalm));

    const dummy = this.#dummy;
    let frondIdx = 0;

    for (let i = 0; i < count; i++) {
      const { x, z, ang } = positions[i];
      dummy.position.set(x, PLATFORM_Y + 0.46, z);
      dummy.rotation.set(0, ang, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      potInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, PLATFORM_Y + 0.92, z);
      dummy.rotation.set(Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      trimInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, PLATFORM_Y + 2.75, z);
      dummy.rotation.set(0.05, ang, 0);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(i, dummy.matrix);

      for (let f = 0; f < frondsPerPalm; f++) {
        const fa = ang + (f / frondsPerPalm) * Math.PI * 2;
        dummy.position.set(x, PLATFORM_Y + 4.55, z);
        dummy.rotation.set(0, fa, 0);
        dummy.rotateX(1.08 + (f % 2) * 0.18);
        dummy.scale.set(1.0, 1.0, 0.35);
        dummy.updateMatrix();
        frondInst.setMatrixAt(frondIdx++, dummy.matrix);
      }

      if (this.#collision) {
        this.#collision.addCylinderCollider(x, z, 0.85, PLATFORM_Y, PLATFORM_Y + 4.5);
      }
    }

    this.#finalizeStaticInstanced(potInst, false, true);
    this.#finalizeStaticInstanced(trimInst, false, false);
    this.#finalizeStaticInstanced(trunkInst, false, true);
    this.#finalizeStaticInstanced(frondInst, false, false);
    group.add(potInst, trimInst, trunkInst, frondInst);

    group.matrixAutoUpdate = false;
    group.updateMatrix();
    this.#root.add(group);
  }

  // ---------------------------------------------------------------------------
  // 5. Gran Ala de Tragaperras (8 Máquinas en Arco Norte r = 22.0)
  // ---------------------------------------------------------------------------

  #buildSlotMachines() {
    const group = new THREE.Group();
    group.name = 'SlotMachinesGroup';

    const roseGoldMat = this.#sharedRoseGoldMat;
    const bodyPinkMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe97aad,
        roughness: 0.28,
        metalness: 0.35
      })
    );
    const darkVelvetMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3b122a,
        roughness: 0.75,
        metalness: 0.08
      })
    );
    const chromeMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf4ecee,
        roughness: 0.14,
        metalness: 0.94
      })
    );
    chromeMat.userData.preserveRoughness = true;

    const knobMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe62968,
        emissive: 0x801036,
        emissiveIntensity: 0.32,
        roughness: 0.16,
        metalness: 0.25
      })
    );
    knobMat.userData.preserveRoughness = true;

    const glassWindowMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.18,
        roughness: 0.15,
        metalness: 0.25,
        depthWrite: false
      })
    );
    glassWindowMat.userData.preserveRoughness = true;

    const reelTex = this.#createReelTexture();
    const reelMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: reelTex,
        emissive: 0xffffff,
        emissiveMap: reelTex,
        emissiveIntensity: 0.18,
        roughness: 0.26,
        metalness: 0.12
      })
    );
    reelMat.userData.preserveRoughness = true;

    const marqueeTex = this.#createMarqueeTexture();
    const marqueeMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: marqueeTex,
        emissiveMap: marqueeTex,
        emissive: 0xffd0ea,
        emissiveIntensity: 0.72,
        roughness: 0.25,
        metalness: 0.15
      })
    );

    const btnMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffd272,
        emissive: 0xffb338,
        emissiveIntensity: 0.62,
        roughness: 0.25,
        metalness: 0.4
      })
    );

    const pedestalGeo = new THREE.BoxGeometry(0.94, 0.94, 0.64);
    const baseTrimGeo = new THREE.BoxGeometry(0.98, 0.08, 0.68);
    const cabinetGeo = new THREE.BoxGeometry(0.90, 0.70, 0.56);
    const recessGeo = new THREE.BoxGeometry(0.68, 0.32, 0.12);
    const frameHGeo = new THREE.BoxGeometry(0.76, 0.05, 0.08);
    const frameVGeo = new THREE.BoxGeometry(0.05, 0.39, 0.08);
    const marqueeBoxGeo = new THREE.BoxGeometry(0.88, 0.34, 0.46);
    const marqueeFaceGeo = new THREE.PlaneGeometry(0.80, 0.28);
    const topperGeo = new THREE.OctahedronGeometry(0.11, 0);
    const trayGeo = new THREE.BoxGeometry(0.68, 0.10, 0.20);
    const consoleGeo = new THREE.BoxGeometry(0.86, 0.12, 0.24);
    const winPaneGeo = new THREE.PlaneGeometry(0.68, 0.30);
    const hubGeo = new THREE.CylinderGeometry(0.055, 0.065, 0.09, 14);
    hubGeo.rotateZ(Math.PI / 2);

    this.#tempGeos.push(
      pedestalGeo, baseTrimGeo, cabinetGeo, recessGeo, frameHGeo, frameVGeo,
      marqueeBoxGeo, marqueeFaceGeo, topperGeo, trayGeo, consoleGeo, winPaneGeo, hubGeo
    );

    const coinGeo = this.#trackGeo(new THREE.CylinderGeometry(0.032, 0.032, 0.012, 12));
    const btnGeo = this.#trackGeo(new THREE.CylinderGeometry(0.036, 0.04, 0.035, 14));
    const coinInst = this.#trackInstanced(new THREE.InstancedMesh(coinGeo, btnMat, SLOT_SPECS.length * 6));
    const btnInst = this.#trackInstanced(new THREE.InstancedMesh(btnGeo, btnMat, SLOT_SPECS.length * 3));

    const reelGeo = this.#trackGeo(new THREE.CylinderGeometry(0.165, 0.165, 0.155, 40, 1, false));
    reelGeo.rotateZ(Math.PI / 2);
    const shaftGeo = this.#trackGeo(new THREE.CylinderGeometry(0.02, 0.024, 0.45, 12));
    const knobGeo = this.#trackGeo(new THREE.SphereGeometry(0.058, 18, 14));

    const getReelAngleForSymbol = (symbolIdx) => {
      const n = SLOT_SYMBOLS.length;
      const idx = ((symbolIdx % n) + n) % n;
      return ((idx + 0.5) / n) * Math.PI * 2;
    };

    const buckets = this.#staticBuckets;
    const localObj = new THREE.Object3D();
    const worldMat = new THREE.Matrix4();
    let coinIdx = 0;
    let btnIdx = 0;

    for (let sIdx = 0; sIdx < SLOT_SPECS.length; sIdx++) {
      const spec = SLOT_SPECS[sIdx];
      const machine = new THREE.Group();
      machine.name = `SlotMachine_${spec.id}`;
      machine.position.set(spec.x, PLATFORM_Y, spec.z);
      machine.rotation.y = spec.rotY;
      machine.matrixAutoUpdate = false;
      machine.updateMatrix();

      const pushMachineStatic = (geo, mat, lx, ly, lz, castShadow = false, receiveShadow = true, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
        localObj.position.set(lx, ly, lz);
        localObj.rotation.set(rx, ry, rz);
        localObj.scale.set(sx, sy, sz);
        localObj.updateMatrix();
        worldMat.multiplyMatrices(machine.matrix, localObj.matrix);
        this.#addBucketPiece(buckets, geo, mat, worldMat, castShadow, receiveShadow, true);
      };

      pushMachineStatic(pedestalGeo, bodyPinkMat, 0, 0.47, 0, true, true);
      pushMachineStatic(baseTrimGeo, roseGoldMat, 0, 0.04, 0, false, true);
      pushMachineStatic(trayGeo, roseGoldMat, 0, 0.62, 0.36, false, true);

      for (let c = 0; c < 6; c++) {
        localObj.position.set(-0.2 + c * 0.08, 0.675, 0.36 + (c % 2 === 0 ? 0.02 : -0.02));
        localObj.rotation.set(0, 0, 0);
        localObj.scale.set(1, 1, 1);
        localObj.updateMatrix();
        worldMat.multiplyMatrices(machine.matrix, localObj.matrix);
        coinInst.setMatrixAt(coinIdx++, worldMat);
      }

      pushMachineStatic(consoleGeo, darkVelvetMat, 0, 0.96, 0.32, false, true, 0.25);
      for (let b = -1; b <= 1; b++) {
        localObj.position.set(b * 0.16, 1.03, 0.34);
        localObj.rotation.set(0.25, 0, 0);
        localObj.scale.set(1, 1, 1);
        localObj.updateMatrix();
        worldMat.multiplyMatrices(machine.matrix, localObj.matrix);
        btnInst.setMatrixAt(btnIdx++, worldMat);
      }

      pushMachineStatic(cabinetGeo, bodyPinkMat, 0, 1.32, -0.02, true, true);
      pushMachineStatic(recessGeo, darkVelvetMat, 0, 1.38, 0.21, false, true);
      pushMachineStatic(frameHGeo, roseGoldMat, 0, 1.55, 0.28, false, true);
      pushMachineStatic(frameHGeo, roseGoldMat, 0, 1.21, 0.28, false, true);
      for (const side of [-1, 1]) {
        pushMachineStatic(frameVGeo, roseGoldMat, side * 0.355, 1.38, 0.28, false, true);
      }

      const reels = [];
      const initSymbols = [0, 4, (sIdx + 1) % 5];
      for (let r = 0; r < 3; r++) {
        const reel = new THREE.Mesh(reelGeo, reelMat);
        reel.position.set((r - 1) * 0.21, 1.38, 0.115);
        reel.rotation.x = getReelAngleForSymbol(initSymbols[r]);
        machine.add(reel);
        reels.push(reel);
      }

      pushMachineStatic(winPaneGeo, glassWindowMat, 0, 1.38, 0.295, false, false);
      pushMachineStatic(marqueeBoxGeo, roseGoldMat, 0, 1.84, 0.02, false, true);
      pushMachineStatic(marqueeFaceGeo, marqueeMat, 0, 1.84, 0.256, false, false);
      pushMachineStatic(topperGeo, btnMat, 0, 2.10, 0.02, false, false, 0, 0, 0, 1.2, 0.85, 0.7);
      pushMachineStatic(hubGeo, roseGoldMat, 0.46, 1.24, 0.04, false, true);

      const leverPivot = new THREE.Group();
      leverPivot.name = `LeverPivot_${spec.id}`;
      leverPivot.position.set(0.50, 1.24, 0.04);

      const shaft = new THREE.Mesh(shaftGeo, chromeMat);
      shaft.position.set(0.02, 0.22, 0.01);
      shaft.rotation.z = -0.09;
      shaft.matrixAutoUpdate = false;
      shaft.updateMatrix();
      leverPivot.add(shaft);

      const knob = new THREE.Mesh(knobGeo, knobMat);
      knob.position.set(0.04, 0.44, 0.02);
      knob.matrixAutoUpdate = false;
      knob.updateMatrix();
      leverPivot.add(knob);

      machine.add(leverPivot);
      machine.updateMatrixWorld(true);
      group.add(machine);

      if (this.#collision) {
        this.#collision.addCylinderCollider(spec.x, spec.z, 0.65, PLATFORM_Y, PLATFORM_Y + 2.5);
      }

      const playerStandPos = this.#localToWorld(spec.x, PLATFORM_Y, spec.z, spec.rotY, 0, 0, 1.15);
      const cameraPos = this.#localToWorld(spec.x, PLATFORM_Y, spec.z, spec.rotY, 0, 1.48, 0.88);
      const cameraLookAt = this.#localToWorld(spec.x, PLATFORM_Y, spec.z, spec.rotY, 0, 1.38, 0.16);

      this.#stations.push({
        id: spec.id,
        type: 'slots',
        label: 'Jugar Tragaperras Real',
        group: machine,
        playerStandPos,
        interactPos: playerStandPos.clone(),
        playerYaw: spec.rotY + Math.PI,
        cameraPos,
        cameraLookAt,
        reels,
        leverPivot,
        leverGrabLocal: new THREE.Vector3(0.54, 1.68, 0.06),
        symbols: [...SLOT_SYMBOLS],
        getReelAngleForSymbol
      });
    }

    this.#finalizeStaticInstanced(coinInst, false, false);
    this.#finalizeStaticInstanced(btnInst, false, false);
    group.add(coinInst, btnInst);

    group.matrixAutoUpdate = false;
    group.updateMatrix();
    this.#root.add(group);
  }

  // ---------------------------------------------------------------------------
  // 6. Salón VIP de Blackjack (Plataforma VIP_Y = 0.92, Escalinata y 4 Mesas)
  // ---------------------------------------------------------------------------

  #buildBlackjackTables() {
    const group = new THREE.Group();
    group.name = 'BlackjackTablesGroup';

    const roseGoldMat = this.#sharedRoseGoldMat;
    const marbleMat = this.#sharedMarbleMat;
    const carpetMat = this.#sharedCarpetMat;
    const buckets = this.#staticBuckets;

    // Plataforma elevada VIP en el Sur: X ∈ [147, 177], Z ∈ [12.5, 26.5], VIP_Y = 0.92
    const vipH = VIP_Y - PLATFORM_Y; // 0.32 m
    this.#addBucketMesh(buckets, new THREE.BoxGeometry(30.0, vipH, 14.0), marbleMat, 162.0, PLATFORM_Y + vipH * 0.5, 19.5, true, true);
    this.#addBucketMesh(buckets, new THREE.BoxGeometry(29.4, 0.018, 13.4), carpetMat, 162.0, VIP_Y + 0.008, 19.5, false, true);
    // Ribete oro-rosa superior de la plataforma VIP
    for (const wz of [12.54, 26.46]) {
      this.#addBucketMesh(buckets, new THREE.BoxGeometry(30.1, 0.06, 0.14), roseGoldMat, 162.0, VIP_Y - 0.01, wz, false, true);
    }
    for (const wx of [147.04, 176.96]) {
      this.#addBucketMesh(buckets, new THREE.BoxGeometry(0.14, 0.06, 14.0), roseGoldMat, wx, VIP_Y - 0.01, 19.5, false, true);
    }

    // Escalinata ancha de terciopelo burdeos y oro en el borde Norte: X ∈ [154, 170], Z ∈ [10.0, 12.8]
    const vipStepCount = 3;
    const vipZStart = 10.1;
    const vipZEnd = 12.6;
    const vipStepRun = (vipZEnd - vipZStart) / vipStepCount;
    const vipStepRise = vipH / vipStepCount;

    for (let i = 0; i < vipStepCount; i++) {
      const h = (i + 1) * vipStepRise;
      const minZ = vipZStart + i * vipStepRun;
      this.#addBucketMesh(buckets, new THREE.BoxGeometry(16.0, h, vipStepRun + 0.08), marbleMat, 162.0, PLATFORM_Y + h * 0.5, minZ + vipStepRun * 0.5, true, true);
      this.#addBucketMesh(buckets, new THREE.BoxGeometry(16.04, 0.03, 0.05), roseGoldMat, 162.0, PLATFORM_Y + h - 0.01, minZ + 0.02, false, true);
    }
    const vipRampLen = Math.hypot(vipZEnd - vipZStart, vipH);
    const vipRampSlope = Math.atan2(vipH, vipZEnd - vipZStart);
    this.#addBucketMesh(
      buckets,
      new THREE.BoxGeometry(14.8, 0.022, vipRampLen + 0.2),
      carpetMat,
      162.0,
      PLATFORM_Y + vipH * 0.5 + 0.022,
      (vipZStart + vipZEnd) * 0.5,
      false,
      true,
      -vipRampSlope,
      0,
      0
    );

    // Barandillas doradas en laterales y borde de la plataforma VIP (dejando libre X ∈ [154, 170])
    const railPostGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.96, 10);
    const railOrbGeo = new THREE.SphereGeometry(0.13, 10, 8);
    this.#tempGeos.push(railPostGeo, railOrbGeo);

    const addVipRailRun = (x0, z0, x1, z1, posts) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const yaw = Math.atan2(x1 - x0, z1 - z0);
      this.#addBucketMesh(
        buckets,
        new THREE.BoxGeometry(0.1, 0.08, len),
        roseGoldMat,
        (x0 + x1) * 0.5,
        VIP_Y + 0.92,
        (z0 + z1) * 0.5,
        false,
        true,
        0,
        yaw,
        0
      );
      for (let i = 0; i <= posts; i++) {
        const t = i / posts;
        const px = x0 + (x1 - x0) * t;
        const pz = z0 + (z1 - z0) * t;
        this.#addBucketMesh(buckets, railPostGeo, roseGoldMat, px, VIP_Y + 0.48, pz, false, true, 0, 0, 0, 1, 1, 1, true);
        this.#addBucketMesh(buckets, railOrbGeo, roseGoldMat, px, VIP_Y + 1.0, pz, false, false, 0, 0, 0, 1, 1, 1, true);
      }
    };

    addVipRailRun(147.2, 12.7, 154.0, 12.7, 3);
    addVipRailRun(170.0, 12.7, 176.8, 12.7, 3);
    addVipRailRun(147.2, 12.7, 147.2, 26.3, 6);
    addVipRailRun(176.8, 12.7, 176.8, 26.3, 6);
    addVipRailRun(147.2, 26.3, 176.8, 26.3, 12);

    if (this.#collision) {
      this.#collision.addFlatSurface(147, 177, 12.5, 26.5, VIP_Y);
      this.#collision.addRampSurface(154, 170, 10.0, 12.8, 'z', 10.2, 12.6, PLATFORM_Y, VIP_Y);
      // Colisionadores en tramos de barandilla VIP
      this.#collision.addBox(147.0, 154.05, VIP_Y - 0.1, VIP_Y + 2.0, 12.5, 12.9);
      this.#collision.addBox(169.95, 177.0, VIP_Y - 0.1, VIP_Y + 2.0, 12.5, 12.9);
      this.#collision.addBox(147.0, 147.4, VIP_Y - 0.1, VIP_Y + 2.0, 12.5, 26.5);
      this.#collision.addBox(176.6, 177.0, VIP_Y - 0.1, VIP_Y + 2.0, 12.5, 26.5);
      this.#collision.addBox(147.0, 177.0, VIP_Y - 0.1, VIP_Y + 2.0, 26.1, 26.5);
    }

    // 4 Mesas reales de Blackjack sobre VIP_Y = 0.92
    const feltTex = this.#createBlackjackFeltTexture();
    const feltMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: feltTex,
        roughness: 0.88,
        metalness: 0.03
      })
    );
    const railMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x7a1c4b,
        roughness: 0.42,
        metalness: 0.12
      })
    );
    const velvetChairMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xb62768,
        roughness: 0.78,
        metalness: 0.05
      })
    );
    const acrylicMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffeef8,
        transparent: true,
        opacity: 0.36,
        roughness: 0.15,
        metalness: 0.25
      })
    );
    acrylicMat.userData.preserveRoughness = true;

    const cardDeckMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfff5fa,
        roughness: 0.35,
        metalness: 0.02
      })
    );

    const chipColors = [0xffd25a, 0xe83b7a, 0x45c8ff, 0xa86bff, 0xfff2f8];
    const chipMat = this.#trackMat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0.25 }));

    const tableRadius = 1.06;
    const flatZ = -0.36;
    const feltShape = new THREE.Shape();
    feltShape.moveTo(-tableRadius, 0);
    feltShape.absarc(0, 0, tableRadius, Math.PI, 0, false);
    feltShape.lineTo(-tableRadius, 0);

    const tableBaseGeo = new THREE.ExtrudeGeometry(feltShape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.02, bevelSegments: 2 });
    tableBaseGeo.rotateX(-Math.PI / 2);

    const railShape = new THREE.Shape();
    railShape.moveTo(-tableRadius - 0.09, 0);
    railShape.absarc(0, 0, tableRadius + 0.09, Math.PI, 0, false);
    railShape.lineTo(tableRadius - 0.02, 0);
    railShape.absarc(0, 0, tableRadius - 0.02, 0, Math.PI, true);
    railShape.closePath();

    const railGeo = new THREE.ExtrudeGeometry(railShape, { depth: 0.055, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3 });
    railGeo.rotateX(-Math.PI / 2);

    const feltTopGeo = new THREE.CircleGeometry(tableRadius - 0.01, 36, 0, Math.PI);
    feltTopGeo.rotateX(-Math.PI / 2);
    feltTopGeo.rotateY(Math.PI);

    const pedBaseGeo = new THREE.CylinderGeometry(0.42, 0.56, 0.14, 24);
    const pedColGeo = new THREE.CylinderGeometry(0.20, 0.25, 0.68, 20);
    const backTrimGeo = new THREE.BoxGeometry((tableRadius + 0.09) * 2, 0.09, 0.12);
    const shoeBodyGeo = new THREE.BoxGeometry(0.11, 0.09, 0.24);
    const deckBlockGeo = new THREE.BoxGeometry(0.085, 0.068, 0.14);
    const shoeTrimGeo = new THREE.BoxGeometry(0.12, 0.02, 0.25);
    const chairStemGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.48, 12);
    const chairFootGeo = new THREE.CylinderGeometry(0.26, 0.28, 0.04, 18);
    const seatGeo = new THREE.CylinderGeometry(0.28, 0.26, 0.10, 20);
    const backrestGeo = new THREE.BoxGeometry(0.46, 0.36, 0.08);

    this.#tempGeos.push(
      tableBaseGeo, railGeo, feltTopGeo, pedBaseGeo, pedColGeo, backTrimGeo,
      shoeBodyGeo, deckBlockGeo, shoeTrimGeo, chairStemGeo, chairFootGeo, seatGeo, backrestGeo
    );

    const stackSpecs = [
      { x: 0.56, z: -0.24, count: 6, matIdx: 0 },
      { x: 0.65, z: -0.22, count: 4, matIdx: 1 },
      { x: 0.60, z: -0.14, count: 5, matIdx: 2 },
      { x: -0.44, z: 0.28, count: 5, matIdx: 0 },
      { x: -0.36, z: 0.32, count: 4, matIdx: 3 },
      { x: 0.44, z: 0.28, count: 6, matIdx: 4 }
    ];
    const chipsPerTable = stackSpecs.reduce((acc, s) => acc + s.count, 0);
    const chipGeo = this.#trackGeo(new THREE.CylinderGeometry(0.032, 0.032, 0.012, 16));
    const chipInst = this.#trackInstanced(new THREE.InstancedMesh(chipGeo, chipMat, BLACKJACK_SPECS.length * chipsPerTable));

    const tableLocalY = 0.86;
    const tableSurfaceY = VIP_Y + tableLocalY;
    const localObj = new THREE.Object3D();
    const subObj = new THREE.Object3D();
    const subMat = new THREE.Matrix4();
    const worldMat = new THREE.Matrix4();
    const chipColor = new THREE.Color();
    let chipIdx = 0;

    for (const spec of BLACKJACK_SPECS) {
      const table = new THREE.Group();
      table.name = `BlackjackTable_${spec.id}`;
      table.position.set(spec.x, VIP_Y, spec.z);
      table.rotation.y = spec.rotY;
      table.matrixAutoUpdate = false;
      table.updateMatrix();

      const pushTableStatic = (geo, mat, lx, ly, lz, castShadow = false, receiveShadow = true, rx = 0, ry = 0, rz = 0) => {
        localObj.position.set(lx, ly, lz);
        localObj.rotation.set(rx, ry, rz);
        localObj.scale.set(1, 1, 1);
        localObj.updateMatrix();
        worldMat.multiplyMatrices(table.matrix, localObj.matrix);
        this.#addBucketPiece(buckets, geo, mat, worldMat, castShadow, receiveShadow, true);
      };

      pushTableStatic(pedBaseGeo, roseGoldMat, 0, 0.07, 0.05, false, true);
      pushTableStatic(pedColGeo, marbleMat, 0, 0.48, 0.05, true, true);
      pushTableStatic(tableBaseGeo, roseGoldMat, 0, tableLocalY - 0.096, flatZ, true, true);
      pushTableStatic(feltTopGeo, feltMat, 0, tableLocalY - 0.0005, flatZ, false, true);
      pushTableStatic(railGeo, railMat, 0, tableLocalY - 0.02, flatZ, false, true);
      pushTableStatic(backTrimGeo, roseGoldMat, 0, tableLocalY - 0.046, flatZ - 0.05, false, true);

      const shoePos = new THREE.Vector3(-0.68, tableLocalY, -0.25);
      localObj.position.copy(shoePos);
      localObj.rotation.set(0, 0.42, 0);
      localObj.scale.set(1, 1, 1);
      localObj.updateMatrix();
      subMat.multiplyMatrices(table.matrix, localObj.matrix);

      for (const [geo, mat, sx, sy, sz] of [
        [shoeBodyGeo, acrylicMat, 0, 0.045, 0],
        [deckBlockGeo, cardDeckMat, 0, 0.042, 0.01],
        [shoeTrimGeo, roseGoldMat, 0, 0.01, 0]
      ]) {
        subObj.position.set(sx, sy, sz);
        subObj.rotation.set(0, 0, 0);
        subObj.scale.set(1, 1, 1);
        subObj.updateMatrix();
        worldMat.multiplyMatrices(subMat, subObj.matrix);
        this.#addBucketPiece(buckets, geo, mat, worldMat, false, true, true);
      }

      for (const st of stackSpecs) {
        chipColor.setHex(chipColors[st.matIdx]);
        for (let k = 0; k < st.count; k++) {
          localObj.position.set(st.x, tableLocalY + 0.008 + k * 0.013, st.z);
          localObj.rotation.set(0, 0, 0);
          localObj.scale.set(1, 1, 1);
          localObj.updateMatrix();
          worldMat.multiplyMatrices(table.matrix, localObj.matrix);
          chipInst.setMatrixAt(chipIdx, worldMat);
          chipInst.setColorAt(chipIdx, chipColor);
          chipIdx++;
        }
      }

      pushTableStatic(chairStemGeo, roseGoldMat, 0, 0.24, 1.82, false, true);
      pushTableStatic(chairFootGeo, roseGoldMat, 0, 0.02, 1.82, false, true);
      pushTableStatic(seatGeo, velvetChairMat, 0, 0.52, 1.82, false, true);
      pushTableStatic(backrestGeo, velvetChairMat, 0, 0.74, 2.04, false, true);

      table.updateMatrixWorld(true);
      group.add(table);

      if (this.#collision) {
        this.#collision.addCylinderCollider(spec.x, spec.z, 1.15, VIP_Y, VIP_Y + 1.4);
      }

      const playerStandPos = this.#localToWorld(spec.x, VIP_Y, spec.z, spec.rotY, 0, 0, 1.32);
      const interactPos = this.#localToWorld(spec.x, VIP_Y, spec.z, spec.rotY, 0, 0, 1.45);
      const cameraPos = this.#localToWorld(spec.x, VIP_Y, spec.z, spec.rotY, 0, 1.48, 1.12);
      const cameraLookAt = this.#localToWorld(spec.x, VIP_Y, spec.z, spec.rotY, 0, tableLocalY, 0.05);

      this.#stations.push({
        id: spec.id,
        type: 'blackjack',
        label: 'Jugar Blackjack Real',
        group: table,
        playerStandPos,
        interactPos,
        playerYaw: spec.rotY + Math.PI,
        cameraPos,
        cameraLookAt,
        tableSurfaceY,
        shoeLocalPos: shoePos.clone(),
        playerCardOriginLocal: new THREE.Vector3(0.0, tableLocalY, 0.32),
        dealerCardOriginLocal: new THREE.Vector3(0.0, tableLocalY, -0.22),
        betSpotLocal: new THREE.Vector3(0.0, tableLocalY, 0.52)
      });
    }

    this.#finalizeStaticInstanced(chipInst, false, false);
    group.add(chipInst);

    group.matrixAutoUpdate = false;
    group.updateMatrix();
    this.#root.add(group);
  }

  // ---------------------------------------------------------------------------
  // 7. Marcadores discretos de interacción en el suelo (PLATFORM_Y y VIP_Y)
  // ---------------------------------------------------------------------------

  #buildInteractionMarkers() {
    const markerGeo = this.#trackGeo(new THREE.RingGeometry(0.28, 0.36, 28));
    const innerGeo = this.#trackGeo(new THREE.RingGeometry(0.14, 0.18, 24));
    innerGeo.rotateX(-Math.PI / 2);

    const markerMat = this.#trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffd982,
        transparent: true,
        opacity: 0.52,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    const innerMat = this.#trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xff8ec8,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );

    const ringInst = this.#trackInstanced(new THREE.InstancedMesh(markerGeo, markerMat, this.#stations.length));
    const dotInst = this.#trackInstanced(new THREE.InstancedMesh(innerGeo, innerMat, this.#stations.length));
    const dummy = this.#dummy;

    for (let i = 0; i < this.#stations.length; i++) {
      const station = this.#stations[i];
      const rx = station.interactPos.x;
      const ry = station.interactPos.y + 0.015;
      const rz = station.interactPos.z;
      this.#markerRingPositions.push({ x: rx, y: ry, z: rz });

      dummy.position.set(rx, ry, rz);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      ringInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(rx, ry + 0.001, rz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      dotInst.setMatrixAt(i, dummy.matrix);
    }

    ringInst.castShadow = false;
    ringInst.receiveShadow = false;
    ringInst.instanceMatrix.needsUpdate = true;
    ringInst.computeBoundingSphere();
    this.#markerRingInst = ringInst;

    this.#finalizeStaticInstanced(dotInst, false, false);
    this.#root.add(ringInst, dotInst);
  }

  // ---------------------------------------------------------------------------
  // 8. Sistema de Fuegos Artificiales a Gran Escala (PointsMaterial + PointLight único)
  // ---------------------------------------------------------------------------

  #initFireworksSystem() {
    this.#fwGroup.name = 'DomeFireworksVFX';
    this.#fwGroup.matrixAutoUpdate = false;
    this.#fwGroup.updateMatrix();
    const sparkTex = this.#createSparkTexture();

    this.#fwSparkPos = new Float32Array(this.#fwSparkMax * 3);
    this.#fwSparkVel = new Float32Array(this.#fwSparkMax * 3);
    this.#fwSparkCol = new Float32Array(this.#fwSparkMax * 3);
    this.#fwSparkBaseCol = new Float32Array(this.#fwSparkMax * 3);
    this.#fwSparkAge = new Float32Array(this.#fwSparkMax);
    this.#fwSparkLife = new Float32Array(this.#fwSparkMax);

    this.#fwSparkGeo = this.#trackGeo(new THREE.BufferGeometry());
    const sparkPosAttr = new THREE.BufferAttribute(this.#fwSparkPos, 3);
    sparkPosAttr.setUsage(THREE.DynamicDrawUsage);
    const sparkColAttr = new THREE.BufferAttribute(this.#fwSparkCol, 3);
    sparkColAttr.setUsage(THREE.DynamicDrawUsage);
    this.#fwSparkGeo.setAttribute('position', sparkPosAttr);
    this.#fwSparkGeo.setAttribute('color', sparkColAttr);
    this.#fwSparkGeo.setDrawRange(0, 0);

    const sparkMat = this.#trackMat(
      new THREE.PointsMaterial({
        size: 0.58,
        map: sparkTex,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      })
    );
    sparkMat.userData.isVfx = true;

    const sparkPoints = new THREE.Points(this.#fwSparkGeo, sparkMat);
    sparkPoints.frustumCulled = false;
    sparkPoints.visible = false;
    sparkPoints.matrixAutoUpdate = false;
    sparkPoints.updateMatrix();
    this.#fwSparkPoints = sparkPoints;
    this.#fwGroup.add(sparkPoints);

    this.#fwTrailPos = new Float32Array(this.#fwTrailMax * 3);
    this.#fwTrailVel = new Float32Array(this.#fwTrailMax * 3);
    this.#fwTrailCol = new Float32Array(this.#fwTrailMax * 3);
    this.#fwTrailBaseCol = new Float32Array(this.#fwTrailMax * 3);
    this.#fwTrailAge = new Float32Array(this.#fwTrailMax);
    this.#fwTrailLife = new Float32Array(this.#fwTrailMax);

    this.#fwTrailGeo = this.#trackGeo(new THREE.BufferGeometry());
    const trailPosAttr = new THREE.BufferAttribute(this.#fwTrailPos, 3);
    trailPosAttr.setUsage(THREE.DynamicDrawUsage);
    const trailColAttr = new THREE.BufferAttribute(this.#fwTrailCol, 3);
    trailColAttr.setUsage(THREE.DynamicDrawUsage);
    this.#fwTrailGeo.setAttribute('position', trailPosAttr);
    this.#fwTrailGeo.setAttribute('color', trailColAttr);
    this.#fwTrailGeo.setDrawRange(0, 0);

    const trailMat = this.#trackMat(
      new THREE.PointsMaterial({
        size: 0.38,
        map: sparkTex,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      })
    );
    trailMat.userData.isVfx = true;

    const trailPoints = new THREE.Points(this.#fwTrailGeo, trailMat);
    trailPoints.frustumCulled = false;
    trailPoints.visible = false;
    trailPoints.matrixAutoUpdate = false;
    trailPoints.updateMatrix();
    this.#fwTrailPoints = trailPoints;
    this.#fwGroup.add(trailPoints);

    // Único PointLight interior de la cúpula (ajustado a gran escala)
    this.#fwLight = new THREE.PointLight(0xffdcb8, REST_LIGHT_INTENSITY, 68, 1.4);
    this.#fwLight.position.set(CX, 18.0, CZ);
    this.#fwLight.visible = true;
    this.#fwLight.matrixAutoUpdate = false;
    this.#fwLight.updateMatrix();
    this.#fwGroup.add(this.#fwLight);

    this.#root.add(this.#fwGroup);
  }

  #spawnTrailParticle(x, y, z, vx, vy, vz, colorHex, life) {
    const idx = this.#fwTrailCount;
    if (idx >= this.#fwTrailMax) return;
    const c = _tmpFwColor1.setHex(colorHex);
    const i3 = idx * 3;
    this.#fwTrailPos[i3] = x;
    this.#fwTrailPos[i3 + 1] = y;
    this.#fwTrailPos[i3 + 2] = z;
    this.#fwTrailVel[i3] = vx;
    this.#fwTrailVel[i3 + 1] = vy;
    this.#fwTrailVel[i3 + 2] = vz;
    this.#fwTrailBaseCol[i3] = c.r;
    this.#fwTrailBaseCol[i3 + 1] = c.g;
    this.#fwTrailBaseCol[i3 + 2] = c.b;
    this.#fwTrailCol[i3] = c.r;
    this.#fwTrailCol[i3 + 1] = c.g;
    this.#fwTrailCol[i3 + 2] = c.b;
    this.#fwTrailAge[idx] = 0;
    this.#fwTrailLife[idx] = life;
    this.#fwTrailCount++;
  }

  #spawnExplosion(x, y, z, primaryHex, isInterior) {
    const secondaryHex = FIREWORK_PALETTE[Math.floor(Math.random() * FIREWORK_PALETTE.length)];
    const c1 = _tmpFwColor1.setHex(primaryHex);
    const c2 = _tmpFwColor2.setHex(secondaryHex);
    const count = isInterior ? 88 : 114;
    const baseSpeed = isInterior ? 7.5 : 13.5;

    for (let i = 0; i < count; i++) {
      const idx = this.#fwSparkCount;
      if (idx >= this.#fwSparkMax) break;

      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const rHoriz = Math.sqrt(Math.max(0, 1 - u * u));
      const speed = baseSpeed * (0.45 + Math.random() * 0.65);

      const i3 = idx * 3;
      this.#fwSparkPos[i3] = x;
      this.#fwSparkPos[i3 + 1] = y;
      this.#fwSparkPos[i3 + 2] = z;
      this.#fwSparkVel[i3] = rHoriz * Math.cos(theta) * speed;
      this.#fwSparkVel[i3 + 1] = u * speed + 1.2;
      this.#fwSparkVel[i3 + 2] = rHoriz * Math.sin(theta) * speed;

      const col = i % 3 === 0 ? c2 : c1;
      this.#fwSparkBaseCol[i3] = col.r;
      this.#fwSparkBaseCol[i3 + 1] = col.g;
      this.#fwSparkBaseCol[i3 + 2] = col.b;
      this.#fwSparkCol[i3] = col.r;
      this.#fwSparkCol[i3 + 1] = col.g;
      this.#fwSparkCol[i3 + 2] = col.b;
      this.#fwSparkAge[idx] = 0;
      this.#fwSparkLife[idx] = 1.65 + Math.random() * 1.1;
      this.#fwSparkCount++;
    }

    this.#fwFlashColor.copy(c1);
    this.#fwFlashEnergy = Math.min(8.65, this.#fwFlashEnergy + (isInterior ? 6.0 : 4.2));
  }

  #updateFireworks(dt) {
    if (!this.#fwActive && this.#fwSparkCount === 0 && this.#fwTrailCount === 0 && this.#fwRockets.length === 0) {
      if (this.#fwSparkPoints) this.#fwSparkPoints.visible = false;
      if (this.#fwTrailPoints) this.#fwTrailPoints.visible = false;
      if (this.#fwLight) {
        if (this.#fwFlashEnergy > 0.001) {
          this.#fwFlashEnergy = Math.max(0, this.#fwFlashEnergy - dt * 7.5);
        }
        const targetIntensity = REST_LIGHT_INTENSITY + this.#fwFlashEnergy;
        this.#fwLight.intensity += (targetIntensity - this.#fwLight.intensity) * Math.min(1, dt * 8);
        this.#fwLight.color.lerp(REST_LIGHT_COLOR, Math.min(1, dt * 6));
      }
      return;
    }

    this.#fwTimer += dt;

    let pendingCount = 0;
    for (let i = 0; i < this.#fwSchedule.length; i++) {
      const item = this.#fwSchedule[i];
      if (!item.launched) {
        if (this.#fwTimer >= item.delay) {
          item.launched = true;
          const flightDuration = item.isInterior ? 0.72 : 1.05;
          this.#fwRockets.push({
            x: item.startX,
            y: item.startY,
            z: item.startZ,
            sx: item.startX,
            sy: item.startY,
            sz: item.startZ,
            tx: item.targetX,
            ty: item.targetY,
            tz: item.targetZ,
            age: 0,
            duration: flightDuration,
            trailAcc: 0,
            colorHex: item.colorHex,
            isInterior: item.isInterior
          });
        } else {
          pendingCount++;
        }
      }
    }
    if (pendingCount === 0 && this.#fwRockets.length === 0) {
      this.#fwActive = false;
    }

    for (let i = this.#fwRockets.length - 1; i >= 0; i--) {
      const r = this.#fwRockets[i];
      r.age += dt;
      const t = Math.min(1, r.age / r.duration);
      const ease = 1 - Math.pow(1 - t, 1.7);
      r.x = r.sx + (r.tx - r.sx) * ease;
      r.y = r.sy + (r.ty - r.sy) * ease;
      r.z = r.sz + (r.tz - r.sz) * ease;

      r.trailAcc += dt;
      while (r.trailAcc >= 0.024) {
        r.trailAcc -= 0.024;
        this.#spawnTrailParticle(
          r.x + (Math.random() - 0.5) * 0.14,
          r.y,
          r.z + (Math.random() - 0.5) * 0.14,
          (Math.random() - 0.5) * 0.55,
          -1.2 - Math.random() * 0.8,
          (Math.random() - 0.5) * 0.55,
          r.colorHex,
          0.48
        );
      }

      if (t >= 1) {
        this.#spawnExplosion(r.tx, r.ty, r.tz, r.colorHex, r.isInterior);
        this.#fwRockets.splice(i, 1);
      }
    }

    this.#stepParticlePool(
      dt,
      -1.4,
      0.92,
      this.#fwTrailPos,
      this.#fwTrailVel,
      this.#fwTrailCol,
      this.#fwTrailBaseCol,
      this.#fwTrailAge,
      this.#fwTrailLife,
      () => this.#fwTrailCount,
      (v) => { this.#fwTrailCount = v; }
    );
    if (this.#fwTrailPoints) {
      this.#fwTrailPoints.visible = this.#fwTrailCount > 0;
    }
    if (this.#fwTrailCount > 0) {
      this.#fwTrailGeo.setDrawRange(0, this.#fwTrailCount);
      this.#fwTrailGeo.attributes.position.needsUpdate = true;
      this.#fwTrailGeo.attributes.color.needsUpdate = true;
    }

    this.#stepParticlePool(
      dt,
      -3.8,
      Math.exp(-1.45 * dt),
      this.#fwSparkPos,
      this.#fwSparkVel,
      this.#fwSparkCol,
      this.#fwSparkBaseCol,
      this.#fwSparkAge,
      this.#fwSparkLife,
      () => this.#fwSparkCount,
      (v) => { this.#fwSparkCount = v; }
    );
    if (this.#fwSparkPoints) {
      this.#fwSparkPoints.visible = this.#fwSparkCount > 0;
    }
    if (this.#fwSparkCount > 0) {
      this.#fwSparkGeo.setDrawRange(0, this.#fwSparkCount);
      this.#fwSparkGeo.attributes.position.needsUpdate = true;
      this.#fwSparkGeo.attributes.color.needsUpdate = true;
    }

    this.#fwFlashEnergy = Math.max(0, this.#fwFlashEnergy - dt * 7.5);
    if (this.#fwLight) {
      if (this.#fwFlashEnergy > 0.05) {
        this.#fwLight.color.lerp(this.#fwFlashColor, 0.25);
        this.#fwLight.intensity = Math.min(10.0, REST_LIGHT_INTENSITY + this.#fwFlashEnergy);
      } else {
        this.#fwLight.color.lerp(REST_LIGHT_COLOR, Math.min(1, dt * 6));
        this.#fwLight.intensity += (REST_LIGHT_INTENSITY - this.#fwLight.intensity) * Math.min(1, dt * 8);
      }
    }
  }

  #stepParticlePool(dt, gravity, drag, pos, vel, col, baseCol, age, life, getCount, setCount) {
    let count = getCount();
    let i = 0;
    while (i < count) {
      age[i] += dt;
      if (age[i] >= life[i]) {
        const last = count - 1;
        if (i !== last) {
          const i3 = i * 3;
          const l3 = last * 3;
          pos[i3] = pos[l3];
          pos[i3 + 1] = pos[l3 + 1];
          pos[i3 + 2] = pos[l3 + 2];
          vel[i3] = vel[l3];
          vel[i3 + 1] = vel[l3 + 1];
          vel[i3 + 2] = vel[l3 + 2];
          baseCol[i3] = baseCol[l3];
          baseCol[i3 + 1] = baseCol[l3 + 1];
          baseCol[i3 + 2] = baseCol[l3 + 2];
          col[i3] = col[l3];
          col[i3 + 1] = col[l3 + 1];
          col[i3 + 2] = col[l3 + 2];
          age[i] = age[last];
          life[i] = life[last];
        }
        count--;
        continue;
      }

      const i3 = i * 3;
      vel[i3] *= drag;
      vel[i3 + 1] = vel[i3 + 1] * drag + gravity * dt;
      vel[i3 + 2] *= drag;

      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;

      const fade = Math.pow(Math.max(0, 1 - age[i] / life[i]), 1.35);
      col[i3] = baseCol[i3] * fade;
      col[i3 + 1] = baseCol[i3 + 1] * fade;
      col[i3 + 2] = baseCol[i3 + 2] * fade;
      i++;
    }
    setCount(count);
  }

  // ---------------------------------------------------------------------------
  // 9. Texturas procedurales de alta nitidez (CanvasTexture)
  // ---------------------------------------------------------------------------

  #createLuxuryFloorTexture() {
    const S = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d');
    const c = S * 0.5;

    // Mármol blanco/crema base con vetas suaves
    const bg = ctx.createRadialGradient(c, c, 40, c, c, c);
    bg.addColorStop(0, '#fff9fc');
    bg.addColorStop(0.65, '#f6ecf2');
    bg.addColorStop(0.88, '#ead7e4');
    bg.addColorStop(1, '#2a1322');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, S, S);

    // Anillo exterior negro imperial con filetes dorados
    ctx.strokeStyle = '#24101e';
    ctx.lineWidth = 46;
    ctx.beginPath();
    ctx.arc(c, c, 456, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#e5b868';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(c, c, 480, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c, c, 432, 0, Math.PI * 2);
    ctx.stroke();

    // Medallones intermedios en oro y negro
    ctx.strokeStyle = '#2d1526';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(c, c, 320, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#dfb060';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(c, c, 306, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c, c, 334, 0, Math.PI * 2);
    ctx.stroke();

    // Estrella central gigante de 8 puntas (oro + negro imperial)
    const drawStar = (outerR, innerR, rotOffset, fillStyle, strokeStyle, lineWidth) => {
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(rotOffset);
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const a = (i * Math.PI) / 8;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = fillStyle;
      ctx.fill();
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
      ctx.restore();
    };

    drawStar(275, 108, Math.PI / 8, '#281220', '#e6ba6a', 6);

    const goldGrad = ctx.createRadialGradient(c, c, 20, c, c, 240);
    goldGrad.addColorStop(0, '#fff2c4');
    goldGrad.addColorStop(0.55, '#e8bc66');
    goldGrad.addColorStop(1, '#b57b28');
    drawStar(242, 86, 0, goldGrad, '#3c182d', 5);

    // Roseta central en mármol blanco y corona dorada
    ctx.fillStyle = '#fff8fb';
    ctx.beginPath();
    ctx.arc(c, c, 64, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d9a44e';
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.fillStyle = '#a8225a';
    ctx.beginPath();
    ctx.arc(c, c, 36, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return this.#trackTex(tex);
  }

  #createSignTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 192;
    const ctx = canvas.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, 1024, 192);
    bg.addColorStop(0, '#451231');
    bg.addColorStop(0.5, '#6d1b4c');
    bg.addColorStop(1, '#451231');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1024, 192);

    ctx.strokeStyle = '#f5cb78';
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, 1004, 172);
    ctx.strokeStyle = '#ff9fd0';
    ctx.lineWidth = 2;
    ctx.strokeRect(22, 22, 980, 148);

    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 50px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255, 160, 210, 0.75)';
    ctx.shadowBlur = 12;
    ctx.fillText('♛ GRAN CÚPULA REAL · CASINO ♛', 512, 98);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return this.#trackTex(tex);
  }

  #createMarqueeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;
    const ctx = canvas.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, 512, 192);
    bg.addColorStop(0, '#5a1440');
    bg.addColorStop(0.5, '#962268');
    bg.addColorStop(1, '#5a1440');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 192);

    ctx.strokeStyle = '#ffd984';
    ctx.lineWidth = 7;
    ctx.strokeRect(8, 8, 496, 176);

    ctx.fillStyle = '#fff0bc';
    ctx.font = 'bold 46px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♛ ROYAL SLOTS ♛', 256, 82);

    ctx.fillStyle = '#ffbce0';
    ctx.font = 'bold 22px Georgia, serif';
    ctx.fillText('JACKPOT IMPERIAL', 256, 138);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return this.#trackTex(tex);
  }

  #createReelTexture() {
    const W = 1024;
    const H = 256;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const cellW = W / SLOT_SYMBOLS.length;

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#f5e7ef');
    bg.addColorStop(0.5, '#fffbfd');
    bg.addColorStop(1, '#f5e7ef');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < SLOT_SYMBOLS.length; i++) {
      const cx = (i + 0.5) * cellW;
      const cy = H * 0.5;

      ctx.fillStyle = '#d9a452';
      ctx.fillRect(i * cellW - 3, 0, 6, H);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI / 2);

      ctx.beginPath();
      ctx.arc(0, 0, 68, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(248, 224, 238, 0.55)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(218, 165, 86, 0.7)';
      ctx.stroke();

      this.#drawSlotSymbol(ctx, SLOT_SYMBOLS[i]);
      ctx.restore();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return this.#trackTex(tex);
  }

  #drawSlotSymbol(ctx, symbol) {
    if (symbol === 'crown') {
      ctx.beginPath();
      ctx.moveTo(-44, 28);
      ctx.lineTo(-48, -18);
      ctx.lineTo(-22, 4);
      ctx.lineTo(0, -36);
      ctx.lineTo(22, 4);
      ctx.lineTo(48, -18);
      ctx.lineTo(44, 28);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, -36, 0, 34);
      g.addColorStop(0, '#ffe87a');
      g.addColorStop(1, '#d68f22');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#7a4b0b';
      ctx.stroke();

      ctx.fillStyle = '#e82e78';
      for (const [jx, jy] of [[-48, -18], [0, -36], [48, -18], [0, 14]]) {
        ctx.beginPath();
        ctx.arc(jx, jy, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    if (symbol === 'diamond') {
      ctx.beginPath();
      ctx.moveTo(-28, -34);
      ctx.lineTo(28, -34);
      ctx.lineTo(48, -8);
      ctx.lineTo(0, 46);
      ctx.lineTo(-48, -8);
      ctx.closePath();
      const g = ctx.createLinearGradient(-40, -34, 40, 44);
      g.addColorStop(0, '#aef2ff');
      g.addColorStop(0.5, '#29a8f5');
      g.addColorStop(1, '#1259b5');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#0d3b7a';
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-48, -8);
      ctx.lineTo(48, -8);
      ctx.moveTo(-20, -34);
      ctx.lineTo(-14, -8);
      ctx.lineTo(0, 46);
      ctx.moveTo(20, -34);
      ctx.lineTo(14, -8);
      ctx.lineTo(0, 46);
      ctx.stroke();
      return;
    }

    if (symbol === 'rose') {
      ctx.fillStyle = '#2e8b57';
      ctx.beginPath();
      ctx.ellipse(-26, 26, 20, 10, -0.5, 0, Math.PI * 2);
      ctx.ellipse(26, 26, 20, 10, 0.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#c81d66';
      ctx.beginPath();
      ctx.arc(0, -4, 38, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ff5c9e';
      ctx.beginPath();
      ctx.arc(-8, -8, 24, 0, Math.PI * 2);
      ctx.arc(10, -2, 22, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffd1e6';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(0, -4, 16, 0.3, Math.PI * 1.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -4, 7, 0, Math.PI * 1.5);
      ctx.stroke();
      return;
    }

    if (symbol === 'star') {
      ctx.beginPath();
      for (let p = 0; p < 10; p++) {
        const rad = p % 2 === 0 ? 48 : 20;
        const a = -Math.PI / 2 + (p * Math.PI) / 5;
        const px = Math.cos(a) * rad;
        const py = Math.sin(a) * rad;
        if (p === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      const g = ctx.createRadialGradient(0, -6, 4, 0, 0, 48);
      g.addColorStop(0, '#fff7b2');
      g.addColorStop(0.6, '#ffc837');
      g.addColorStop(1, '#d98416');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#7d4b08';
      ctx.stroke();
      return;
    }

    ctx.font = 'bold 104px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#e6ad3e';
    ctx.strokeText('7', 0, 4);
    const g7 = ctx.createLinearGradient(0, -44, 0, 44);
    g7.addColorStop(0, '#ff3b7f');
    g7.addColorStop(1, '#9c093d');
    ctx.fillStyle = g7;
    ctx.fillText('7', 0, 4);
  }

  #createBlackjackFeltTexture() {
    const S = 512;
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#5c1438';
    ctx.fillRect(0, 0, S, S);

    ctx.save();
    ctx.translate(S * 0.5, S * 0.5);
    ctx.rotate(Math.PI);

    ctx.strokeStyle = '#e7bd6b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, S * 0.36, 0, Math.PI, false);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 210, 140, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, S * 0.30, 0, Math.PI, false);
    ctx.stroke();

    ctx.fillStyle = '#f5d284';
    ctx.font = 'bold 20px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('BLACKJACK PAYS 3 TO 2', 0, 108);
    ctx.font = 'bold 15px Georgia, serif';
    ctx.fillStyle = '#ffbde0';
    ctx.fillText('DEALER STANDS ON ALL 17', 0, 78);

    ctx.beginPath();
    ctx.arc(0, 214, 24, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffd578';
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return this.#trackTex(tex);
  }

  #createSparkTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.28, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.65, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return this.#trackTex(tex);
  }

  /**
   * Adaptador de tema del reino (la cúpula conserva su estética cristal/oro-rosa imperial).
   */
  applyTheme() {}
}
