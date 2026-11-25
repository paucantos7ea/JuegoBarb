import * as THREE from 'three';

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
  #root = null;
  #geometries = [];
  #materials = [];
  #instancedMeshes = [];
  #staticBuckets = new Map();
  #tempGeos = [];
  #dummy = new THREE.Object3D();
  #waterMeshes = [];
  #fountainCrystal = null;
  #fountainHalo = null;
  #fountainDrops = null;
  #dropData = null;
  #sakuraPetals = null;
  #petalData = null;
  #lanternLights = [];
  #lanternMat = null;
  #lanternHaloMat = null;
  #elapsed = 0;

  constructor(scene, textureFactory, collisionSystem) {
    this.#scene = scene;
    this.#textures = textureFactory;
    this.#collision = collisionSystem;
  }

  init() {
    this.#collision.setWorldBounds(-88, 88, -84, 64);

    this.#root = new THREE.Group();
    this.#root.name = 'RoyalGardens';

    const mats = this.#createMaterials();
    this.#buildGroundAndAvenues(mats);
    this.#buildMonumentalFountain(mats);
    this.#buildGazebos(mats);
    this.#buildPondsStreamsAndBridges(mats);
    this.#buildMiradorAndLake(mats);
    this.#flushStaticBuckets(mats);

    this.#buildCurvedStonePaths(mats);
    this.#buildLanterns(mats);
    this.#buildForestsAndTrees(mats);
    this.#buildFlowerbeds(mats);
    this.#buildSakuraPetals();

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

  #addMesh(geo, mat, x, y, z, castShadow = true, receiveShadow = true) {
    this.#trackGeo(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = castShadow;
    m.receiveShadow = receiveShadow;
    this.#root.add(m);
    return m;
  }

  #addStaticMesh(geo, mat, x, y, z, castShadow = true, receiveShadow = true, rotX = 0, rotY = 0, rotZ = 0, sx = 1, sy = 1, sz = 1, sharedGeo = false) {
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

  #flushStaticBuckets(mats) {
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
      if (bucket.mat === mats.water) {
        this.#waterMeshes.push(mesh);
      }
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

  #createMaterials() {
    const grass = this.#trackMat(new THREE.MeshStandardMaterial({
      map: this.#textures.getTexture('grass', 30, 30),
      color: 0xd8f0cf,
      roughness: 0.92,
      metalness: 0.0
    }));

    const marble = this.#trackMat(new THREE.MeshStandardMaterial({
      map: this.#textures.getTexture('marble', 2, 2),
      color: 0xf4eff2,
      roughness: 0.3,
      metalness: 0.05
    }));

    const plazaFloor = this.#trackMat(new THREE.MeshStandardMaterial({
      map: this.#textures.getTexture('marbleFloor', 8, 8),
      color: 0xf2ecf0,
      roughness: 0.25,
      metalness: 0.06
    }));

    const stoneSlab = this.#trackMat(new THREE.MeshStandardMaterial({
      map: this.#textures.getTexture('marble', 1, 1),
      color: 0xece6ea,
      roughness: 0.38,
      metalness: 0.04
    }));

    const roseGold = this.#trackMat(new THREE.MeshStandardMaterial({
      map: this.#textures.getTexture('roseGold', 1, 1),
      color: 0xeeb0a1,
      metalness: 0.88,
      roughness: 0.18
    }));

    const water = this.#trackMat(new THREE.MeshStandardMaterial({
      map: this.#textures.getTexture('water', 4, 4),
      color: 0x7fd8f5,
      emissive: 0x246b82,
      emissiveIntensity: 0.12,
      roughness: 0.15,
      metalness: 0.25,
      transparent: true,
      opacity: 0.78
    }));
    water.userData.preserveRoughness = true;

    const pondBed = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0x265463,
      roughness: 0.9,
      metalness: 0.02
    }));

    const lantern = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xfff0d0,
      emissive: 0xffc878,
      emissiveIntensity: 0.9,
      roughness: 0.2
    }));

    const lanternHalo = this.#trackMat(new THREE.MeshBasicMaterial({
      color: 0xffdca8,
      transparent: true,
      opacity: 0.24,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    }));
    lanternHalo.userData.isVfx = true;

    const crystalDome = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xf7cce6,
      emissive: 0xc96dad,
      emissiveIntensity: 0.2,
      roughness: 0.15,
      metalness: 0.25,
      transparent: true,
      opacity: 0.28,
      depthWrite: false
    }));
    crystalDome.userData.preserveRoughness = true;

    const crystalFinial = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xffe4f5,
      emissive: 0xe87cc4,
      emissiveIntensity: 0.55,
      roughness: 0.15,
      metalness: 0.25,
      transparent: true,
      opacity: 0.82
    }));
    crystalFinial.userData.preserveRoughness = true;

    const barkCherry = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0x5c403c,
      roughness: 0.9,
      metalness: 0.02
    }));

    const barkForest = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0x614836,
      roughness: 0.92,
      metalness: 0.02
    }));

    const foliage = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.82,
      metalness: 0.02
    }));

    const flowerPetal = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.52,
      metalness: 0.02
    }));

    const stemGreen = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0x3b7d3b,
      roughness: 0.85,
      metalness: 0.02
    }));

    const lilyPad = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0x4b9450,
      roughness: 0.72,
      metalness: 0.02
    }));

    this.#lanternMat = lantern;
    this.#lanternHaloMat = lanternHalo;

    return {
      grass, marble, plazaFloor, stoneSlab, roseGold, water, pondBed,
      lantern, lanternHalo, crystalDome, crystalFinial, barkCherry, barkForest,
      foliage, flowerPetal, stemGreen, lilyPad
    };
  }

  #buildGroundAndAvenues(mats) {
    // Césped amplio 240 x 240 cubriendo todo el valle real
    this.#addStaticMesh(new THREE.PlaneGeometry(240, 240), mats.grass, 0, 0, -6, false, true, -Math.PI / 2);

    // Avenida Norte-Sur: X ∈ [-5.5, 5.5], Z ∈ [-17, 36]
    this.#addStaticMesh(new THREE.BoxGeometry(11.0, 0.06, 53.0), mats.plazaFloor, 0, 0.015, 9.5, false, true);
    // Bordillos oro-rosa sutiles de la avenida Norte-Sur (fuera de la plaza de la fuente r=14.5)
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
    // Plaza circular de mármol r = 14.5 con borde oro-rosa
    this.#addStaticMesh(new THREE.CylinderGeometry(14.5, 14.8, 0.1, 48), mats.plazaFloor, 0, 0.02, 0, false, true);
    this.#addStaticMesh(new THREE.TorusGeometry(14.48, 0.15, 10, 64), mats.roseGold, 0, 0.08, 0, false, true, Math.PI / 2);
    this.#addStaticMesh(new THREE.TorusGeometry(8.8, 0.08, 8, 48), mats.roseGold, 0, 0.075, 0, false, true, Math.PI / 2);

    // Vaso inferior (r = 5.6)
    this.#addStaticMesh(new THREE.CylinderGeometry(5.6, 5.9, 0.72, 36), mats.marble, 0, 0.39, 0, true, true);
    this.#addStaticMesh(new THREE.CylinderGeometry(5.1, 5.1, 0.12, 32), mats.pondBed, 0, 0.15, 0, false, true);
    this.#addStaticMesh(new THREE.TorusGeometry(5.6, 0.18, 12, 48), mats.roseGold, 0, 0.76, 0, true, true, Math.PI / 2);
    this.#addStaticMesh(new THREE.CylinderGeometry(5.32, 5.32, 0.1, 36), mats.water, 0, 0.65, 0, false, false);

    // Colisionador sólido del vaso inferior
    this.#collision.addCylinderCollider(0, 0, 5.65, 0, 5.5);

    // Pedestal central inferior -> Copa intermedia (r = 3.3)
    this.#addStaticMesh(new THREE.CylinderGeometry(0.95, 1.35, 1.9, 20), mats.marble, 0, 1.55, 0, true, true);
    this.#addStaticMesh(new THREE.CylinderGeometry(3.3, 1.15, 0.52, 28), mats.marble, 0, 2.55, 0, true, true);
    this.#addStaticMesh(new THREE.TorusGeometry(3.3, 0.12, 10, 40), mats.roseGold, 0, 2.82, 0, false, true, Math.PI / 2);
    this.#addStaticMesh(new THREE.CylinderGeometry(3.05, 3.05, 0.08, 28), mats.water, 0, 2.77, 0, false, false);

    // Pedestal medio -> Copa superior (r = 1.7)
    this.#addStaticMesh(new THREE.CylinderGeometry(0.5, 0.72, 1.65, 16), mats.roseGold, 0, 3.6, 0, true, true);
    this.#addStaticMesh(new THREE.CylinderGeometry(1.7, 0.65, 0.42, 24), mats.marble, 0, 4.45, 0, true, true);
    this.#addStaticMesh(new THREE.TorusGeometry(1.7, 0.09, 8, 32), mats.roseGold, 0, 4.66, 0, false, true, Math.PI / 2);
    this.#addStaticMesh(new THREE.CylinderGeometry(1.5, 1.5, 0.06, 24), mats.water, 0, 4.62, 0, false, false);

    // Pedestal superior y remate de cristal giratorio en Y = 6.2
    this.#addStaticMesh(new THREE.CylinderGeometry(0.24, 0.36, 1.1, 14), mats.marble, 0, 5.2, 0, true, true);
    this.#fountainCrystal = this.#addMesh(new THREE.OctahedronGeometry(0.58, 0), mats.crystalFinial, 0, 6.2, 0, false, false);
    this.#fountainHalo = this.#addMesh(new THREE.TorusGeometry(0.85, 0.055, 8, 28), mats.roseGold, 0, 6.2, 0, false, false);

    // Sistema de ~180 gotas en cascada de 3 niveles
    const dropCount = 180;
    const pos = new Float32Array(dropCount * 3);
    this.#dropData = new Float32Array(dropCount * 4);
    for (let i = 0; i < dropCount; i++) {
      const tier = i < 44 ? 0 : i < 108 ? 1 : 2;
      this.#dropData[i * 4] = Math.random() * Math.PI * 2;
      this.#dropData[i * 4 + 1] = Math.random();
      this.#dropData[i * 4 + 2] = 0.65 + Math.random() * 0.45;
      this.#dropData[i * 4 + 3] = tier;
    }
    const dropGeo = this.#trackGeo(new THREE.BufferGeometry());
    dropGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dropMat = this.#trackMat(new THREE.PointsMaterial({
      color: 0xdaf6ff,
      size: 0.22,
      transparent: true,
      opacity: 0.84,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    this.#fountainDrops = new THREE.Points(dropGeo, dropMat);
    this.#fountainDrops.matrixAutoUpdate = false;
    this.#fountainDrops.updateMatrix();
    this.#root.add(this.#fountainDrops);
  }

  #buildGazebos(mats) {
    const specs = [
      { x: 35, z: -8, openAngle: Math.PI / 2 },    // Glorieta de las Rosas Este (abre hacia Avenida Este)
      { x: -33, z: 41, openAngle: -Math.PI / 4 },  // Glorieta de los Cerezos Sur-Oeste
      { x: -54, z: -44, openAngle: Math.PI / 4 }   // Glorieta del Claro Norte-Oeste
    ];

    const floorGeo = new THREE.CylinderGeometry(4.2, 4.35, 0.08, 24);
    const baseTrimGeo = new THREE.TorusGeometry(4.22, 0.08, 8, 32);
    const colGeo = new THREE.CylinderGeometry(0.18, 0.22, 4.2, 12);
    const colBaseGeo = new THREE.CylinderGeometry(0.3, 0.34, 0.22, 12);
    const corniceGeo = new THREE.TorusGeometry(3.6, 0.16, 10, 32);
    const domeGeo = new THREE.SphereGeometry(3.55, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const finialGeo = new THREE.OctahedronGeometry(0.32, 0);
    const benchGeo = new THREE.BoxGeometry(1.75, 0.12, 0.62);
    const legGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.44, 8);
    this.#tempGeos.push(floorGeo, baseTrimGeo, colGeo, colBaseGeo, corniceGeo, domeGeo, finialGeo, benchGeo, legGeo);

    for (const g of specs) {
      // Suelo plano de mármol accesible sin escalón brusco
      this.#addStaticMesh(floorGeo, mats.plazaFloor, g.x, 0.04, g.z, false, true, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(baseTrimGeo, mats.roseGold, g.x, 0.08, g.z, false, true, Math.PI / 2, 0, 0, 1, 1, 1, true);
      this.#collision.addDiscSurface(g.x, g.z, 4.2, 0.08);

      // 6 columnas oro-rosa con entrada despejada hacia openAngle
      for (let i = 0; i < 6; i++) {
        const a = g.openAngle + Math.PI / 6 + (i / 6) * Math.PI * 2;
        const cx = g.x + Math.cos(a) * 3.55;
        const cz = g.z + Math.sin(a) * 3.55;
        this.#addStaticMesh(colGeo, mats.roseGold, cx, 2.18, cz, true, true, 0, 0, 0, 1, 1, 1, true);
        this.#addStaticMesh(colBaseGeo, mats.marble, cx, 0.19, cz, true, true, 0, 0, 0, 1, 1, 1, true);
        this.#collision.addCylinderCollider(cx, cz, 0.3, 0, 4.4);
      }

      // Cornisa y cúpula de cristal rosado
      this.#addStaticMesh(corniceGeo, mats.roseGold, g.x, 4.3, g.z, true, false, Math.PI / 2, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(domeGeo, mats.crystalDome, g.x, 4.32, g.z, false, false, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(finialGeo, mats.crystalFinial, g.x, 8.05, g.z, false, false, 0, 0, 0, 1, 1, 1, true);

      // 2 bancos interiores cómodos en lados opuestos a la entrada
      for (const offset of [Math.PI * 0.68, -Math.PI * 0.68]) {
        const ba = g.openAngle + offset;
        const bx = g.x + Math.cos(ba) * 2.55;
        const bz = g.z + Math.sin(ba) * 2.55;
        this.#addStaticMesh(benchGeo, mats.marble, bx, 0.52, bz, true, true, 0, -ba + Math.PI / 2, 0, 1, 1, 1, true);
        this.#addStaticMesh(
          legGeo,
          mats.roseGold,
          bx + Math.cos(ba + Math.PI / 2) * 0.65,
          0.26,
          bz + Math.sin(ba + Math.PI / 2) * 0.65,
          true,
          true,
          0, 0, 0, 1, 1, 1, true
        );
        this.#addStaticMesh(
          legGeo,
          mats.roseGold,
          bx - Math.cos(ba + Math.PI / 2) * 0.65,
          0.26,
          bz - Math.sin(ba + Math.PI / 2) * 0.65,
          true,
          true,
          0, 0, 0, 1, 1, 1, true
        );
        this.#collision.addCylinderCollider(bx, bz, 0.55, 0, 0.7);
      }
    }
  }

  #buildPondsStreamsAndBridges(mats) {
    // 1. Estanque de los Cisnes Este: centro (46, 0.06, 26), rx = 11, rz = 8.5
    const circleGeo = new THREE.CircleGeometry(1.0, 36);
    this.#tempGeos.push(circleGeo);
    this.#addStaticMesh(circleGeo, mats.pondBed, 46, 0.012, 26, false, true, -Math.PI / 2, 0, 0, 11.0, 8.5, 1, true);
    this.#addStaticMesh(circleGeo, mats.water, 46, 0.06, 26, false, false, -Math.PI / 2, 0, 0, 10.8, 8.3, 1, true);

    // Canal ornamental hacia el Oeste: X ∈ [31, 36], Z ∈ [18, 30]
    this.#addStaticMesh(new THREE.PlaneGeometry(5.4, 12.2), mats.pondBed, 33.5, 0.012, 24, false, true, -Math.PI / 2);
    this.#addStaticMesh(new THREE.PlaneGeometry(5.0, 12.0), mats.water, 33.5, 0.058, 24, false, false, -Math.PI / 2);

    // Conector suave del canal al estanque
    this.#addStaticMesh(new THREE.PlaneGeometry(4.0, 9.5), mats.water, 37.0, 0.059, 25.0, false, false, -Math.PI / 2);

    // Colisión interior del Estanque Este (permite caminar por la orilla sin entrar al agua profunda)
    const pondColliders = [
      [46, 26, 6.2],
      [43.2, 22.8, 3.2],
      [42.8, 28.8, 3.5],
      [51.0, 26.0, 4.5]
    ];
    for (const [cx, cz, r] of pondColliders) {
      this.#collision.addCylinderCollider(cx, cz, r, 0, 1.4);
    }
    // Colisión del canal dejando libre el Puente 1 en Z ∈ [22.2, 25.8]
    this.#collision.addBox(31.2, 35.8, 0, 1.4, 18.0, 22.05);
    this.#collision.addBox(31.2, 35.8, 0, 1.4, 25.95, 30.0);

    // Piedras blancas bajas bordeando el Estanque Este y el Canal (sin bloquear el puente)
    const stonePositions = [];
    for (let i = 0; i < 38; i++) {
      const a = (i / 38) * Math.PI * 2;
      const sx = 46 + Math.cos(a) * 11.1;
      const sz = 26 + Math.sin(a) * 8.6;
      if (sx < 37.8 && sz > 21.6 && sz < 26.6) continue;
      stonePositions.push([sx, sz, 0.65 + (i % 3) * 0.16, a]);
    }
    for (let z = 18.2; z <= 29.8; z += 1.15) {
      if (z >= 21.8 && z <= 26.2) continue;
      stonePositions.push([31.0, z, 0.55, z]);
      stonePositions.push([36.0, z, 0.55, z + 1.0]);
    }

    // 2. Arroyo Sur-Oeste: X ∈ [-24, -18], Z ∈ [28, 48] (desagua al Lago Sur Z=55)
    this.#addStaticMesh(new THREE.PlaneGeometry(6.0, 27.5), mats.pondBed, -21, 0.012, 41.5, false, true, -Math.PI / 2);
    this.#addStaticMesh(new THREE.PlaneGeometry(5.2, 27.2), mats.water, -21, 0.058, 41.5, false, false, -Math.PI / 2);

    // Colisión del Arroyo Sur-Oeste (deja libre Puente 2 en Z ∈ [32.2, 35.8])
    this.#collision.addBox(-23.6, -18.4, 0, 1.4, 28.0, 32.05);
    this.#collision.addBox(-23.6, -18.4, 0, 1.4, 35.95, 55.0);

    for (let z = 28.2; z <= 53.5; z += 1.25) {
      if (z >= 31.8 && z <= 36.2) continue;
      stonePositions.push([-23.9, z, 0.55, z * 0.7]);
      stonePositions.push([-18.1, z, 0.55, z * 1.1]);
    }

    // InstancedMesh único para piedras blancas de borde de agua
    const stoneGeo = new THREE.DodecahedronGeometry(0.55, 1);
    const stoneInst = this.#createInstanced(stoneGeo, mats.stoneSlab, stonePositions.length, false, true);
    const dummy = this.#dummy;
    stonePositions.forEach(([sx, sz, scale, rot], idx) => {
      dummy.position.set(sx, 0.12, sz);
      dummy.rotation.set(0.1, rot, 0.08);
      dummy.scale.set(scale * 1.15, scale * 0.45, scale);
      dummy.updateMatrix();
      stoneInst.setMatrixAt(idx, dummy.matrix);
    });
    this.#finalizeStaticInstanced(stoneInst);

    // Nenúfares en el Estanque Este
    const lilyCoords = [
      [42.5, 22.0], [43.3, 21.4], [49.5, 29.2], [50.4, 28.5],
      [47.0, 21.0], [41.0, 29.8], [52.2, 24.0]
    ];
    const lilyGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.03, 14, 1, false, 0.25, Math.PI * 1.82);
    const lilyInst = this.#createInstanced(lilyGeo, mats.lilyPad, lilyCoords.length, false, true);
    lilyCoords.forEach(([lx, lz], idx) => {
      dummy.position.set(lx, 0.075, lz);
      dummy.rotation.set(0, idx * 1.3, 0);
      dummy.scale.setScalar(0.85 + (idx % 3) * 0.2);
      dummy.updateMatrix();
      lilyInst.setMatrixAt(idx, dummy.matrix);
    });
    this.#finalizeStaticInstanced(lilyInst);

    // 3. Puente Romántico 1 en (34, 0, 24) sobre canal Este
    this.#buildArchedBridge(mats, 34, 24, 30.0, 38.0);
    this.#collision.addRampSurface(30.0, 34.0, 22.3, 25.7, 'x', 30.2, 33.8, 0.0, 0.75);
    this.#collision.addRampSurface(34.0, 38.0, 22.3, 25.7, 'x', 37.8, 34.2, 0.0, 0.75);

    // 4. Puente Romántico 2 en (-21, 0, 34) sobre arroyo Sur-Oeste
    this.#buildArchedBridge(mats, -21, 34, -25.0, -17.0);
    this.#collision.addRampSurface(-25.0, -21.0, 32.3, 35.7, 'x', -24.8, -21.2, 0.0, 0.75);
    this.#collision.addRampSurface(-21.0, -17.0, 32.3, 35.7, 'x', -17.2, -20.8, 0.0, 0.75);
  }

  #buildArchedBridge(mats, cx, cz, minX, maxX) {
    const segments = 12;
    const halfSpan = (maxX - minX) / 2;
    const segLen = (maxX - minX) / segments;
    const plankGeo = new THREE.BoxGeometry(segLen + 0.06, 0.14, 3.6);
    const postGeo = new THREE.CylinderGeometry(0.075, 0.09, 0.92, 10);
    const orbGeo = new THREE.SphereGeometry(0.11, 10, 8);
    this.#tempGeos.push(plankGeo, postGeo, orbGeo);

    for (let i = 0; i < segments; i++) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const x0 = minX + t0 * (maxX - minX);
      const x1 = minX + t1 * (maxX - minX);
      const xm = (x0 + x1) * 0.5;

      const y0 = 0.75 * (1 - Math.abs(x0 - cx) / halfSpan);
      const y1 = 0.75 * (1 - Math.abs(x1 - cx) / halfSpan);
      const ym = (y0 + y1) * 0.5;
      const slope = Math.atan2(y1 - y0, x1 - x0);

      this.#addStaticMesh(plankGeo, mats.marble, xm, ym - 0.06, cz, true, true, 0, 0, slope, 1, 1, 1, true);
    }

    // Barandillas doradas laterales en Z = cz - 1.8 y Z = cz + 1.8
    for (const side of [-1.8, 1.8]) {
      const rz = cz + side;
      for (const px of [minX + 0.15, cx - 2.0, cx, cx + 2.0, maxX - 0.15]) {
        const py = 0.75 * (1 - Math.abs(px - cx) / halfSpan);
        this.#addStaticMesh(postGeo, mats.roseGold, px, py + 0.46, rz, true, false, 0, 0, 0, 1, 1, 1, true);
        this.#addStaticMesh(orbGeo, mats.roseGold, px, py + 0.96, rz, false, false, 0, 0, 0, 1, 1, 1, true);
      }

      // Pasamanos inclinados siguiendo el perfil del puente
      for (const dir of [-1, 1]) {
        const startX = dir < 0 ? minX + 0.15 : cx;
        const endX = dir < 0 ? cx : maxX - 0.15;
        const startY = (dir < 0 ? 0.03 : 0.75) + 0.88;
        const endY = (dir < 0 ? 0.75 : 0.03) + 0.88;
        const len = Math.hypot(endX - startX, endY - startY);
        const railAngle = Math.PI / 2 - Math.atan2(endY - startY, endX - startX);
        this.#addStaticMesh(
          new THREE.CylinderGeometry(0.045, 0.045, len, 8),
          mats.roseGold,
          (startX + endX) * 0.5,
          (startY + endY) * 0.5,
          rz,
          true,
          false,
          0,
          0,
          railAngle
        );
      }

      this.#collision.addBox(minX, maxX, 0, 1.7, rz - 0.14, rz + 0.14);
    }
  }

  #buildMiradorAndLake(mats) {
    // Mirador Real Sur en (0, 1.2, 46), radio 7.5
    this.#addStaticMesh(new THREE.CylinderGeometry(7.5, 7.9, 1.2, 32), mats.marble, 0, 0.6, 46, true, true);
    this.#addStaticMesh(new THREE.CylinderGeometry(7.15, 7.15, 0.06, 32), mats.plazaFloor, 0, 1.22, 46, false, true);
    this.#collision.addDiscSurface(0, 46, 7.5, 1.2);
    this.#collision.addCylinderCollider(0, 46, 7.5, 0, 0.95);

    // Escalinata Norte Z = 36.0 -> 39.0
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const h = ((i + 1) / steps) * 1.2;
      const sz = 36.25 + i * 0.5;
      this.#addStaticMesh(new THREE.BoxGeometry(5.0, h, 0.54), mats.marble, 0, h / 2, sz, true, true);
    }
    this.#collision.addRampSurface(-3.6, 3.6, 35.8, 39.2, 'z', 36.0, 39.0, 0.0, 1.2);

    // 8 columnas y cúpula cristalina del Mirador
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
    this.#addStaticMesh(new THREE.SphereGeometry(6.55, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), mats.crystalDome, 0, 6.4, 46, false, false);
    this.#addStaticMesh(new THREE.OctahedronGeometry(0.42, 0), mats.crystalFinial, 0, 13.15, 46, false, false);

    // Gran Lago Imperial Sur: Z ∈ [55, 108], X ∈ [-95, 95]
    this.#addStaticMesh(new THREE.PlaneGeometry(190, 53), mats.pondBed, 0, 0.01, 81.5, false, true, -Math.PI / 2);
    this.#addStaticMesh(new THREE.PlaneGeometry(190, 53), mats.water, 0, 0.06, 81.5, false, false, -Math.PI / 2);

    // Rocas ornamentales en la orilla del Lago Sur (Z ≈ 55)
    const shoreGeo = new THREE.DodecahedronGeometry(0.75, 1);
    const shoreCoords = [];
    for (let x = -84; x <= 84; x += 3.8) {
      if (Math.abs(x) < 10.5) continue;
      shoreCoords.push([x + Math.sin(x) * 0.6, 54.8 + Math.cos(x * 0.4) * 0.7]);
    }
    const shoreInst = this.#createInstanced(shoreGeo, mats.stoneSlab, shoreCoords.length, false, true);
    const dummy = this.#dummy;
    shoreCoords.forEach(([sx, sz], idx) => {
      dummy.position.set(sx, 0.14, sz);
      dummy.rotation.set(0.1, idx * 0.9, 0.05);
      dummy.scale.set(1.25 + (idx % 3) * 0.25, 0.42, 0.95);
      dummy.updateMatrix();
      shoreInst.setMatrixAt(idx, dummy.matrix);
    });
    this.#finalizeStaticInstanced(shoreInst);
  }

  #buildCurvedStonePaths(mats) {
    // Senderos curvos de losas blancas conectando glorietas, puentes, estanque y claros
    const curves = [
      // Avenida Este -> Glorieta de las Rosas Este (35, -8) -> Claro NE (62, -18)
      [
        [35, -3.2], [35, -5.2], [35, -8]
      ],
      [
        [39.2, -8], [46, -10.5], [54, -14], [62, -18]
      ],
      // Avenida Este (29, 3.2) -> Puente 1 (30, 24) rodeando la Arena de Carrera
      [
        [29.2, 3.2], [29.0, 9.5], [28.8, 16.5], [29.4, 21.8], [30.0, 24.0]
      ],
      // Puente 1 salida Este (38, 24) -> paseo por orilla norte del Estanque -> Claro SE (64, 38)
      [
        [38.0, 24.0], [39.0, 19.0], [46.0, 16.2], [54.5, 18.0], [59.5, 25.0], [61.5, 32.5], [64.0, 38.0]
      ],
      // Avenida Sur -> Puente 2 (-17, 34)
      [
        [-5.5, 28.0], [-10.0, 29.8], [-14.0, 32.2], [-17.0, 34.0]
      ],
      // Puente 2 salida Oeste (-25, 34) -> Glorieta SW (-33, 41) -> Claro SW (-68, 36)
      [
        [-25.0, 34.0], [-28.5, 36.8], [-32.0, 39.8]
      ],
      [
        [-37.2, 41.0], [-46.0, 40.5], [-56.0, 38.5], [-68.0, 36.0]
      ],
      // Paseo Oeste del claro SW (-68, 36) -> rodeando Pasarela por X=-69 -> Glorieta NW (-54, -44)
      [
        [-68.0, 32.0], [-69.5, 18.0], [-69.5, 0.0], [-68.5, -18.0], [-63.0, -32.0], [-54.0, -41.0]
      ],
      // Glorieta NW (-54, -44) -> Claro Norte-Oeste / Norte-Este
      [
        [-50.5, -47.0], [-46.5, -58.0], [-46.0, -70.0]
      ]
    ];

    const slabPts = [];
    for (const pts of curves) {
      const vecs = pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
      const curve = new THREE.CatmullRomCurve3(vecs);
      const len = curve.getLength();
      const count = Math.max(3, Math.floor(len / 1.45));
      for (let i = 0; i <= count; i++) {
        const t = i / count;
        const p = curve.getPoint(t);
        const tan = curve.getTangent(t);
        slabPts.push({ x: p.x, z: p.z, yaw: Math.atan2(tan.x, tan.z), w: 1.45 + (i % 2) * 0.25 });
      }
    }

    const slabGeo = new THREE.CylinderGeometry(0.68, 0.72, 0.05, 8);
    const slabInst = this.#createInstanced(slabGeo, mats.stoneSlab, slabPts.length, false, true);
    const dummy = this.#dummy;
    slabPts.forEach((s, idx) => {
      dummy.position.set(s.x, 0.025, s.z);
      dummy.rotation.set(0, s.yaw, 0);
      dummy.scale.set(s.w, 1, 1.08);
      dummy.updateMatrix();
      slabInst.setMatrixAt(idx, dummy.matrix);
    });
    this.#finalizeStaticInstanced(slabInst);
  }

  #buildLanterns(mats) {
    // Farolas ornamentales oro-rosa a lo largo de plazas, avenidas, glorietas y puentes
    const positions = [
      [-6.5, -12.5, true], [6.5, -12.5, true],
      [-12.2, -6.5, true], [12.2, -6.5, true],
      [-12.2, 6.5, false], [12.2, 6.5, false],
      [-6.5, 22.0, true], [6.5, 22.0, true],
      [-6.5, 33.5, false], [6.5, 33.5, false],
      [-22.0, -4.0, false], [-22.0, 4.0, false],
      [-34.0, -4.0, true], [-34.0, 4.0, false],
      [22.0, -4.0, false], [22.0, 4.0, false],
      [35.0, -3.8, true], [39.0, 4.0, false],
      [29.2, 21.5, true], [38.8, 26.5, false],
      [-16.2, 31.8, false], [-25.8, 36.2, true],
      [-4.2, 37.5, false], [4.2, 37.5, false],
      [-37.5, 37.5, false], [-49.5, -40.5, false]
    ];

    const postGeo = new THREE.CylinderGeometry(0.09, 0.15, 3.3, 10);
    const baseGeo = new THREE.CylinderGeometry(0.24, 0.3, 0.35, 10);
    const capGeo = new THREE.ConeGeometry(0.36, 0.35, 8);
    const bulbGeo = new THREE.OctahedronGeometry(0.26, 0);
    const haloGeo = new THREE.OctahedronGeometry(0.75, 1);

    const postInst = this.#createInstanced(postGeo, mats.roseGold, positions.length, false, false);
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

  #isReservedZone(x, z, margin = 1.6) {
    // Gran Palacio: X ∈ [-43, 43], Z ∈ [-79, -16]
    if (x >= -43 - margin && x <= 43 + margin && z >= -79 - margin && z <= -16 + margin) return true;
    // Terraza Exterior de Baile: X ∈ [36, 51], Z ∈ [-44, -28]
    if (x >= 36 - margin && x <= 51 + margin && z >= -44 - margin && z <= -28 + margin) return true;
    // Gran Pasarela en T + Gradas: X ∈ [-65, -28], Z ∈ [-17, 27]
    if (x >= -65 - margin && x <= -28 + margin && z >= -17 - margin && z <= 27 + margin) return true;
    // Pasillo VIP hacia Pasarela: X ∈ [-39.5, -14], Z ∈ [-3.5, 3.5]
    if (x >= -39.5 - margin && x <= -14 + margin && z >= -3.5 - margin && z <= 3.5 + margin) return true;
    // Arena de Salida/Meta de Carrera + entradas N/S: X ∈ [13, 27], Z ∈ [5, 24]
    if (x >= 13 - margin && x <= 27 + margin && z >= 5 - margin && z <= 24 + margin) return true;
    // Avenida Norte-Sur: X ∈ [-5.5, 5.5], Z ∈ [-17, 36]
    if (x >= -5.5 - margin && x <= 5.5 + margin && z >= -17 - margin && z <= 36 + margin) return true;
    // Avenida Oeste: Z ∈ [-3.2, 3.2], X ∈ [-37.5, -14]
    if (x >= -37.5 - margin && x <= -14 + margin && z >= -3.2 - margin && z <= 3.2 + margin) return true;
    // Avenida Este: Z ∈ [-3.2, 3.2], X ∈ [14, 42]
    if (x >= 14 - margin && x <= 42 + margin && z >= -3.2 - margin && z <= 3.2 + margin) return true;
    // Plaza de la Fuente (0, 0), r = 14.5
    if (Math.hypot(x, z) < 14.5 + margin) return true;
    // Cúpula Real del Casino: centro (-18.6, 17.0), radio 9.0 + entrada Este X ∈ [-11.0, -5.0], Z ∈ [14.2, 19.8]
    if (Math.hypot(x + 18.6, z - 17.0) < 9.6 + margin) return true;
    if (x >= -11.0 - margin && x <= -5.0 + margin && z >= 14.2 - margin && z <= 19.8 + margin) return true;
    // Mirador Real Sur (0, 46), r = 7.5 + escalinata Z ∈ [35.5, 46]
    if (Math.hypot(x, z - 46) < 7.8 + margin) return true;
    if (x >= -4.2 - margin && x <= 4.2 + margin && z >= 35.5 - margin && z <= 46) return true;
    // Gran Lago Imperial Sur: Z >= 54.5
    if (z >= 54.5 - margin * 0.4) return true;
    // Glorietas: (35, -8), (-33, 41), (-54, -44)
    if (Math.hypot(x - 35, z + 8) < 5.0 + margin) return true;
    if (Math.hypot(x + 33, z - 41) < 5.0 + margin) return true;
    if (Math.hypot(x + 54, z + 44) < 5.0 + margin) return true;
    // Estanque Este (46, 26) rx=11, rz=8.5 + Canal + Puente 1
    const dxPond = (x - 46) / (11.2 + margin);
    const dzPond = (z - 26) / (8.7 + margin);
    if (dxPond * dxPond + dzPond * dzPond <= 1.0) return true;
    if (x >= 29.5 - margin && x <= 38.5 + margin && z >= 17.5 - margin && z <= 30.5 + margin) return true;
    // Arroyo SW + Puente 2
    if (x >= -25.2 - margin && x <= -16.8 + margin && z >= 27.5 - margin && z <= 55) return true;
    // Claros centrales de fauna para pastar libremente
    const faunaClearings = [[-54, -30], [62, -18], [64, 38], [-68, 36], [42, -64]];
    for (const [fx, fz] of faunaClearings) {
      if (Math.hypot(x - fx, z - fz) < 4.5) return true;
    }

    return false;
  }

  #pseudoRand(seed) {
    const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return s - Math.floor(s);
  }

  #buildForestsAndTrees(mats) {
    // 4 especies: 'sakura' (~52), 'cypress' (~34), 'willow' (~24), 'broadleaf' (~50) => ~160 árboles
    const trees = [];
    const tryAddTree = (x, z, type, scale = 1.0, minSpacing = 4.6) => {
      if (this.#isReservedZone(x, z, 2.2)) return false;
      for (const t of trees) {
        if (Math.hypot(x - t.x, z - t.z) < minSpacing) return false;
      }
      trees.push({ x, z, type, scale, rot: this.#pseudoRand(x * 3.1 + z * 7.3) * Math.PI * 2 });
      return true;
    };

    // 1. Sauces elegantes junto al Estanque Este y orilla del Lago Sur y Arroyo SW
    const willowSpots = [
      [58.5, 22.0, 1.15], [58.2, 31.0, 1.1], [47.0, 36.8, 1.05], [39.0, 34.5, 1.0],
      [-28.5, 49.0, 1.1], [-14.0, 49.5, 1.05], [-34.0, 52.0, 1.15], [-46.0, 52.5, 1.1],
      [-60.0, 52.0, 1.15], [16.0, 52.2, 1.1], [28.0, 52.5, 1.15], [42.0, 52.0, 1.1],
      [56.0, 52.2, 1.15], [70.0, 52.0, 1.1], [-74.0, 52.0, 1.1]
    ];
    for (const [wx, wz, sc] of willowSpots) {
      tryAddTree(wx, wz, 'willow', sc, 4.2);
    }

    // 2. Arboledas decorativas de cerezos y cipreses en claros del jardín
    const ornamentalSpots = [
      [-15, -11, 'sakura', 1.0], [15, -11, 'sakura', 1.0],
      [-15, 13, 'sakura', 0.95], [-16, 22, 'cypress', 1.0],
      [11, 28, 'sakura', 0.95], [-11, 24, 'cypress', 1.0],
      [44, -10, 'sakura', 1.05], [48, -2, 'cypress', 1.0],
      [50, 7, 'sakura', 1.0], [44, 11, 'cypress', 0.95],
      [-43, 35, 'sakura', 1.05], [-42, 46, 'sakura', 1.0],
      [-26, 20, 'cypress', 0.95], [11, 37, 'sakura', 1.0],
      [25, 36, 'broadleaf', 1.0], [31, 42, 'sakura', 1.05],
      [-48, -28, 'sakura', 1.0], [-46, -54, 'cypress', 1.0],
      [-62, -48, 'sakura', 1.0], [-60, -34, 'broadleaf', 1.0],
      [56, -24, 'sakura', 1.05], [56, -38, 'cypress', 1.0]
    ];
    for (const [ox, oz, type, sc] of ornamentalSpots) {
      tryAddTree(ox, oz, type, sc, 4.0);
    }

    // 3. Bosques densos en franjas Norte, Oeste, Este y esquinas Sur
    const zones = [
      // Franja Norte Oeste & Este (fuera del palacio y claros)
      { minX: -85, maxX: -46, minZ: -82, maxZ: -52, target: 32 },
      { minX: 46, maxX: 85, minZ: -82, maxZ: -48, target: 32 },
      { minX: -38, maxX: 38, minZ: -83, maxZ: -80.5, target: 8 },
      // Franja Oeste
      { minX: -86, maxX: -67, minZ: -50, maxZ: 50, target: 38 },
      // Franja Este
      { minX: 56, maxX: 86, minZ: -46, maxZ: 50, target: 38 },
      // Bordes Sur-Oeste y Sur-Este
      { minX: -66, maxX: -38, minZ: 30, maxZ: 52, target: 10 },
      { minX: 34, maxX: 55, minZ: 38, maxZ: 52, target: 10 }
    ];

    let seed = 101;
    const speciesCycle = ['sakura', 'broadleaf', 'cypress', 'broadleaf', 'sakura', 'willow'];
    for (const z of zones) {
      let placed = 0;
      let attempts = 0;
      while (placed < z.target && attempts < z.target * 14 && trees.length < 168) {
        attempts++;
        seed += 1.73;
        const rx = z.minX + this.#pseudoRand(seed) * (z.maxX - z.minX);
        const rz = z.minZ + this.#pseudoRand(seed + 19.3) * (z.maxZ - z.minZ);
        const sp = speciesCycle[(attempts + placed) % speciesCycle.length];
        const sc = 0.88 + this.#pseudoRand(seed + 41.7) * 0.34;
        if (tryAddTree(rx, rz, sp, sc, 4.7)) placed++;
      }
    }

    // Separar por especie para construir InstancedMesh optimizados
    const sakuras = trees.filter((t) => t.type === 'sakura');
    const cypresses = trees.filter((t) => t.type === 'cypress');
    const willows = trees.filter((t) => t.type === 'willow');
    const broadleafs = trees.filter((t) => t.type === 'broadleaf');

    const dummy = this.#dummy;
    const color = new THREE.Color();

    // Colisionadores para árboles dentro del área caminable [-86, 86] × [-82, 62]
    for (const t of trees) {
      if (t.x >= -86 && t.x <= 86 && t.z >= -82 && t.z <= 62) {
        this.#collision.addCylinderCollider(t.x, t.z, 0.48, 0, 3.5);
      }
    }

    // --- Especie 1: Cerezos en flor (troncos + ramas + copas esponjosas rosas) ---
    if (sakuras.length > 0) {
      const trunkGeo = new THREE.CylinderGeometry(0.24, 0.38, 2.8, 8);
      const branchGeo = new THREE.CylinderGeometry(0.11, 0.18, 1.8, 7);
      const puffGeo = new THREE.IcosahedronGeometry(1.55, 1);

      const trunkInst = this.#createInstanced(trunkGeo, mats.barkCherry, sakuras.length, true, true);
      const branchInst = this.#createInstanced(branchGeo, mats.barkCherry, sakuras.length * 2, false, true);
      const puffInst = this.#createInstanced(puffGeo, mats.foliage, sakuras.length * 4, true, false);

      const pinkPalette = [0xffb7d5, 0xff9ec6, 0xffcfe3, 0xf58db8];
      const puffOffsets = [
        [0, 3.7, 0, 1.15],
        [-1.1, 3.3, 0.65, 0.88],
        [1.05, 3.35, -0.6, 0.9],
        [0.15, 3.45, 1.05, 0.84]
      ];

      sakuras.forEach((t, i) => {
        dummy.position.set(t.x, 1.4 * t.scale, t.z);
        dummy.rotation.set(0.06, t.rot, 0.04);
        dummy.scale.setScalar(t.scale);
        dummy.updateMatrix();
        trunkInst.setMatrixAt(i, dummy.matrix);

        for (let b = 0; b < 2; b++) {
          const ba = t.rot + b * Math.PI;
          dummy.position.set(t.x + Math.cos(ba) * 0.5 * t.scale, 2.55 * t.scale, t.z + Math.sin(ba) * 0.5 * t.scale);
          dummy.rotation.set(Math.sin(ba) * 0.5, ba, -Math.cos(ba) * 0.5);
          dummy.scale.setScalar(t.scale);
          dummy.updateMatrix();
          branchInst.setMatrixAt(i * 2 + b, dummy.matrix);
        }

        puffOffsets.forEach(([ox, oy, oz, ps], pIdx) => {
          const cosR = Math.cos(t.rot);
          const sinR = Math.sin(t.rot);
          const wx = t.x + (ox * cosR - oz * sinR) * t.scale;
          const wz = t.z + (ox * sinR + oz * cosR) * t.scale;
          dummy.position.set(wx, oy * t.scale, wz);
          dummy.rotation.set(pIdx * 0.4, t.rot + pIdx, 0.2);
          dummy.scale.set(ps * t.scale, ps * 0.72 * t.scale, ps * t.scale);
          dummy.updateMatrix();
          const idx = i * 4 + pIdx;
          puffInst.setMatrixAt(idx, dummy.matrix);
          color.setHex(pinkPalette[(i + pIdx) % pinkPalette.length]);
          puffInst.setColorAt(idx, color);
        });
      });

      this.#finalizeStaticInstanced(trunkInst);
      this.#finalizeStaticInstanced(branchInst);
      this.#finalizeStaticInstanced(puffInst);
    }

    // --- Especie 2: Cipreses reales recortados (conos escalonados verde esmeralda) ---
    if (cypresses.length > 0) {
      const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 1.5, 7);
      const coneGeo = new THREE.ConeGeometry(1.0, 2.6, 10);

      const trunkInst = this.#createInstanced(trunkGeo, mats.barkForest, cypresses.length, true, true);
      const coneInst = this.#createInstanced(coneGeo, mats.foliage, cypresses.length * 3, true, true);
      const emeraldPalette = [0x1e5c3a, 0x246b44, 0x2c7a4f];

      cypresses.forEach((t, i) => {
        dummy.position.set(t.x, 0.75 * t.scale, t.z);
        dummy.rotation.set(0, t.rot, 0);
        dummy.scale.setScalar(t.scale);
        dummy.updateMatrix();
        trunkInst.setMatrixAt(i, dummy.matrix);

        const tiers = [
          [2.1, 1.15, 1.05],
          [3.4, 0.92, 1.0],
          [4.65, 0.65, 0.95]
        ];
        tiers.forEach(([ty, rad, hScale], k) => {
          dummy.position.set(t.x, ty * t.scale, t.z);
          dummy.rotation.set(0, t.rot + k * 0.5, 0);
          dummy.scale.set(rad * t.scale, hScale * t.scale, rad * t.scale);
          dummy.updateMatrix();
          const idx = i * 3 + k;
          coneInst.setMatrixAt(idx, dummy.matrix);
          color.setHex(emeraldPalette[(i + k) % emeraldPalette.length]);
          coneInst.setColorAt(idx, color);
        });
      });

      this.#finalizeStaticInstanced(trunkInst);
      this.#finalizeStaticInstanced(coneInst);
    }

    // --- Especie 3: Sauces elegantes (copas amplias + cortinas colgantes) ---
    if (willows.length > 0) {
      const trunkGeo = new THREE.CylinderGeometry(0.28, 0.44, 3.0, 8);
      const crownGeo = new THREE.SphereGeometry(2.1, 10, 8);
      const drapeGeo = new THREE.CylinderGeometry(0.14, 0.24, 2.7, 6);

      const trunkInst = this.#createInstanced(trunkGeo, mats.barkForest, willows.length, true, true);
      const crownInst = this.#createInstanced(crownGeo, mats.foliage, willows.length, true, false);
      const drapeInst = this.#createInstanced(drapeGeo, mats.foliage, willows.length * 8, false, false);
      const willowColors = [0x6da659, 0x7cb865, 0x5d944b];

      willows.forEach((t, i) => {
        dummy.position.set(t.x, 1.5 * t.scale, t.z);
        dummy.rotation.set(0.05, t.rot, -0.04);
        dummy.scale.setScalar(t.scale);
        dummy.updateMatrix();
        trunkInst.setMatrixAt(i, dummy.matrix);

        dummy.position.set(t.x, 3.85 * t.scale, t.z);
        dummy.rotation.set(0, t.rot, 0);
        dummy.scale.set(t.scale * 1.15, t.scale * 0.68, t.scale * 1.15);
        dummy.updateMatrix();
        crownInst.setMatrixAt(i, dummy.matrix);
        color.setHex(willowColors[i % willowColors.length]);
        crownInst.setColorAt(i, color);

        for (let d = 0; d < 8; d++) {
          const da = t.rot + (d / 8) * Math.PI * 2;
          const r = 1.65 * t.scale;
          dummy.position.set(t.x + Math.cos(da) * r, 2.35 * t.scale, t.z + Math.sin(da) * r);
          dummy.rotation.set(Math.sin(da) * 0.08, da, -Math.cos(da) * 0.08);
          dummy.scale.set(t.scale, t.scale * (0.9 + (d % 2) * 0.18), t.scale);
          dummy.updateMatrix();
          const idx = i * 8 + d;
          drapeInst.setMatrixAt(idx, dummy.matrix);
          color.setHex(willowColors[(i + d) % willowColors.length]);
          drapeInst.setColorAt(idx, color);
        }
      });

      this.#finalizeStaticInstanced(trunkInst);
      this.#finalizeStaticInstanced(crownInst);
      this.#finalizeStaticInstanced(drapeInst);
    }

    // --- Especie 4: Árboles frondosos de copa multicapa verde primavera ---
    if (broadleafs.length > 0) {
      const trunkGeo = new THREE.CylinderGeometry(0.24, 0.36, 2.7, 8);
      const canopyGeo = new THREE.DodecahedronGeometry(1.65, 1);

      const trunkInst = this.#createInstanced(trunkGeo, mats.barkForest, broadleafs.length, true, true);
      const canopyInst = this.#createInstanced(canopyGeo, mats.foliage, broadleafs.length * 3, true, true);
      const springPalette = [0x4da34d, 0x5eb556, 0x3f8f45, 0x6ec462];

      const canopyOffsets = [
        [0, 3.85, 0, 1.15],
        [-0.9, 3.2, 0.65, 0.85],
        [0.95, 3.25, -0.55, 0.88]
      ];

      broadleafs.forEach((t, i) => {
        dummy.position.set(t.x, 1.35 * t.scale, t.z);
        dummy.rotation.set(0, t.rot, 0);
        dummy.scale.setScalar(t.scale);
        dummy.updateMatrix();
        trunkInst.setMatrixAt(i, dummy.matrix);

        canopyOffsets.forEach(([ox, oy, oz, cs], k) => {
          const cosR = Math.cos(t.rot);
          const sinR = Math.sin(t.rot);
          dummy.position.set(
            t.x + (ox * cosR - oz * sinR) * t.scale,
            oy * t.scale,
            t.z + (ox * sinR + oz * cosR) * t.scale
          );
          dummy.rotation.set(k * 0.5, t.rot + k, 0.2);
          dummy.scale.set(cs * t.scale, cs * 0.8 * t.scale, cs * t.scale);
          dummy.updateMatrix();
          const idx = i * 3 + k;
          canopyInst.setMatrixAt(idx, dummy.matrix);
          color.setHex(springPalette[(i + k) % springPalette.length]);
          canopyInst.setColorAt(idx, color);
        });
      });

      this.#finalizeStaticInstanced(trunkInst);
      this.#finalizeStaticInstanced(canopyInst);
    }
  }

  #buildFlowerbeds(mats) {
    // Parterres de flores (>1,000 instancias) bordeando avenidas, fuente, glorietas y fachada sur del Palacio
    const beds = [
      // Borde fachada Palacio (fuera de Z ∈ [-79, -16] y fuera de avenida X ∈ [-5.5, 5.5])
      { cx: -20, cz: -14.2, rx: 10.5, rz: 1.4, count: 160, kind: 'rose' },
      { cx: 20, cz: -14.2, rx: 10.5, rz: 1.4, count: 160, kind: 'rose' },
      // Alrededor de la Plaza de la Fuente (anillo r ≈ 15.6..17.2 en los 4 cuadrantes)
      { cx: 12.2, cz: 11.8, rx: 3.4, rz: 2.2, count: 120, kind: 'tulip' },
      { cx: -12.2, cz: 11.8, rx: 3.4, rz: 2.2, count: 120, kind: 'tulip' },
      { cx: 12.2, cz: -11.2, rx: 3.4, rz: 2.0, count: 110, kind: 'rose' },
      { cx: -12.2, cz: -11.2, rx: 3.4, rz: 2.0, count: 110, kind: 'rose' },
      // Bordes Avenida Norte-Sur (Z ∈ [16, 33])
      { cx: -7.6, cz: 23.0, rx: 1.4, rz: 7.5, count: 130, kind: 'lavender' },
      { cx: 7.6, cz: 23.0, rx: 1.4, rz: 7.5, count: 130, kind: 'lavender' },
      // Bordes Avenida Este & Oeste
      { cx: 31.0, cz: -4.8, rx: 5.5, rz: 1.1, count: 95, kind: 'rose' },
      { cx: 32.0, cz: 4.8, rx: 6.5, rz: 1.1, count: 105, kind: 'tulip' },
      { cx: -21.0, cz: 4.8, rx: 5.0, rz: 1.1, count: 90, kind: 'lavender' },
      { cx: -21.0, cz: -4.8, rx: 5.0, rz: 1.1, count: 90, kind: 'rose' },
      // Junto a Glorieta de las Rosas Este (35, -8)
      { cx: 35.0, cz: -13.6, rx: 4.2, rz: 1.3, count: 95, kind: 'rose' },
      { cx: 40.8, cz: -8.0, rx: 1.3, rz: 4.0, count: 90, kind: 'tulip' },
      // Junto a Glorieta SW (-33, 41) y Arroyo
      { cx: -33.0, cz: 46.8, rx: 4.2, rz: 1.3, count: 95, kind: 'tulip' },
      { cx: -15.5, cz: 30.5, rx: 1.6, rz: 3.8, count: 85, kind: 'lavender' },
      // Junto a Glorieta NW (-54, -44) y Mirador
      { cx: -54.0, cz: -49.8, rx: 4.0, rz: 1.3, count: 85, kind: 'lavender' },
      { cx: -10.5, cz: 44.0, rx: 2.2, rz: 3.2, count: 85, kind: 'rose' },
      { cx: 10.5, cz: 44.0, rx: 2.2, rz: 3.2, count: 85, kind: 'tulip' }
    ];

    const roses = [];
    const tulips = [];
    const lavenders = [];
    const bushes = [];

    let seed = 500;
    for (const b of beds) {
      // Arbustos floridos en las puntas/bordes de cada parterre
      bushes.push([b.cx - b.rx * 0.72, b.cz], [b.cx + b.rx * 0.72, b.cz]);

      for (let i = 0; i < b.count; i++) {
        seed += 2.31;
        const a = this.#pseudoRand(seed) * Math.PI * 2;
        const r = Math.sqrt(this.#pseudoRand(seed + 7.1));
        const fx = b.cx + Math.cos(a) * r * b.rx;
        const fz = b.cz + Math.sin(a) * r * b.rz;
        if (this.#isReservedZone(fx, fz, 0.25)) continue;
        const h = 0.8 + this.#pseudoRand(seed + 13.7) * 0.45;
        const rot = this.#pseudoRand(seed + 29.3) * Math.PI * 2;
        if (b.kind === 'rose') roses.push([fx, fz, h, rot]);
        else if (b.kind === 'tulip') tulips.push([fx, fz, h, rot]);
        else lavenders.push([fx, fz, h, rot]);
      }
    }

    const dummy = this.#dummy;
    const color = new THREE.Color();

    // Rosas (rojas, rosas, blancas)
    if (roses.length > 0) {
      const roseHead = new THREE.DodecahedronGeometry(0.13, 0);
      const roseStem = new THREE.CylinderGeometry(0.02, 0.03, 0.34, 5);
      const headInst = this.#createInstanced(roseHead, mats.flowerPetal, roses.length, false, false);
      const stemInst = this.#createInstanced(roseStem, mats.stemGreen, roses.length, false, false);
      const roseColors = [0xe63956, 0xff7eb3, 0xfff0f5];

      roses.forEach(([x, z, h, rot], i) => {
        dummy.position.set(x, 0.17 * h, z);
        dummy.rotation.set(0, rot, 0);
        dummy.scale.set(1, h, 1);
        dummy.updateMatrix();
        stemInst.setMatrixAt(i, dummy.matrix);

        dummy.position.set(x, 0.36 * h, z);
        dummy.rotation.set(0.2, rot, 0.15);
        dummy.scale.setScalar(0.95 + (i % 3) * 0.12);
        dummy.updateMatrix();
        headInst.setMatrixAt(i, dummy.matrix);
        color.setHex(roseColors[i % roseColors.length]);
        headInst.setColorAt(i, color);
      });
      this.#finalizeStaticInstanced(stemInst);
      this.#finalizeStaticInstanced(headInst);
    }

    // Tulipanes (dorados, coral, magenta)
    if (tulips.length > 0) {
      const tulipCup = new THREE.ConeGeometry(0.11, 0.22, 6, 1, true);
      tulipCup.rotateX(Math.PI);
      const tulipStem = new THREE.CylinderGeometry(0.018, 0.025, 0.38, 5);
      const cupInst = this.#createInstanced(tulipCup, mats.flowerPetal, tulips.length, false, false);
      const stemInst = this.#createInstanced(tulipStem, mats.stemGreen, tulips.length, false, false);
      const tulipColors = [0xffcf56, 0xff7b5c, 0xe040a0];

      tulips.forEach(([x, z, h, rot], i) => {
        dummy.position.set(x, 0.19 * h, z);
        dummy.rotation.set(0, rot, 0);
        dummy.scale.set(1, h, 1);
        dummy.updateMatrix();
        stemInst.setMatrixAt(i, dummy.matrix);

        dummy.position.set(x, 0.38 * h, z);
        dummy.rotation.set(0.06, rot, 0.05);
        dummy.scale.setScalar(1.0);
        dummy.updateMatrix();
        cupInst.setMatrixAt(i, dummy.matrix);
        color.setHex(tulipColors[i % tulipColors.length]);
        cupInst.setColorAt(i, color);
      });
      this.#finalizeStaticInstanced(stemInst);
      this.#finalizeStaticInstanced(cupInst);
    }

    // Espigas de lavanda (violetas)
    if (lavenders.length > 0) {
      const spikeGeo = new THREE.ConeGeometry(0.075, 0.34, 6);
      const stemGeo = new THREE.CylinderGeometry(0.015, 0.022, 0.32, 5);
      const spikeInst = this.#createInstanced(spikeGeo, mats.flowerPetal, lavenders.length, false, false);
      const stemInst = this.#createInstanced(stemGeo, mats.stemGreen, lavenders.length, false, false);
      const lavColors = [0x8f6ed5, 0xa484e8, 0x7652c4];

      lavenders.forEach(([x, z, h, rot], i) => {
        dummy.position.set(x, 0.16 * h, z);
        dummy.rotation.set(0.05, rot, 0.04);
        dummy.scale.set(1, h, 1);
        dummy.updateMatrix();
        stemInst.setMatrixAt(i, dummy.matrix);

        dummy.position.set(x, 0.42 * h, z);
        dummy.rotation.set(0.05, rot, 0.04);
        dummy.scale.set(1, 0.9 + (i % 3) * 0.15, 1);
        dummy.updateMatrix();
        spikeInst.setMatrixAt(i, dummy.matrix);
        color.setHex(lavColors[i % lavColors.length]);
        spikeInst.setColorAt(i, color);
      });
      this.#finalizeStaticInstanced(stemInst);
      this.#finalizeStaticInstanced(spikeInst);
    }

    // Arbustos floridos bajos en los parterres
    const validBushes = bushes.filter(([bx, bz]) => !this.#isReservedZone(bx, bz, 0.7));
    if (validBushes.length > 0) {
      const bushGeo = new THREE.IcosahedronGeometry(0.62, 1);
      const blossomGeo = new THREE.DodecahedronGeometry(0.14, 0);
      const bushInst = this.#createInstanced(bushGeo, mats.foliage, validBushes.length, false, true);
      const blossomInst = this.#createInstanced(blossomGeo, mats.flowerPetal, validBushes.length * 4, false, false);
      const bushGreens = [0x3d8a42, 0x4b9c4e, 0x357d3a];
      const speckColors = [0xff8dc2, 0xffd166, 0xffffff];

      validBushes.forEach(([bx, bz], i) => {
        dummy.position.set(bx, 0.34, bz);
        dummy.rotation.set(0, i * 0.9, 0);
        dummy.scale.set(1.15, 0.75, 1.05);
        dummy.updateMatrix();
        bushInst.setMatrixAt(i, dummy.matrix);
        color.setHex(bushGreens[i % bushGreens.length]);
        bushInst.setColorAt(i, color);

        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + i;
          dummy.position.set(bx + Math.cos(a) * 0.42, 0.56 + (k % 2) * 0.1, bz + Math.sin(a) * 0.42);
          dummy.rotation.set(k, i, 0);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          const idx = i * 4 + k;
          blossomInst.setMatrixAt(idx, dummy.matrix);
          color.setHex(speckColors[(i + k) % speckColors.length]);
          blossomInst.setColorAt(idx, color);
        }
      });
      this.#finalizeStaticInstanced(bushInst);
      this.#finalizeStaticInstanced(blossomInst);
    }
  }

  #buildSakuraPetals() {
    // Pétalos de cerezo flotando suavemente por el jardín
    const count = 140;
    const pos = new Float32Array(count * 3);
    this.#petalData = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const px = (Math.random() - 0.5) * 140;
      const py = 1.0 + Math.random() * 6.5;
      const pz = (Math.random() - 0.5) * 120 - 8;
      pos[i * 3] = px;
      pos[i * 3 + 1] = py;
      pos[i * 3 + 2] = pz;
      this.#petalData[i * 4] = px;
      this.#petalData[i * 4 + 1] = pz;
      this.#petalData[i * 4 + 2] = Math.random() * Math.PI * 2;
      this.#petalData[i * 4 + 3] = 0.45 + Math.random() * 0.55;
    }
    const geo = this.#trackGeo(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = this.#trackMat(new THREE.PointsMaterial({
      color: 0xffc4df,
      size: 0.16,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    }));
    this.#sakuraPetals = new THREE.Points(geo, mat);
    this.#sakuraPetals.matrixAutoUpdate = false;
    this.#sakuraPetals.updateMatrix();
    this.#root.add(this.#sakuraPetals);
  }

  applyTheme(theme) {
    if (!theme) return;
    if (this.#lanternMat) {
      this.#lanternMat.emissiveIntensity = 0.65 + theme.lanternIntensity * 0.5;
    }
    if (this.#lanternHaloMat) {
      this.#lanternHaloMat.opacity = Math.min(0.42, 0.14 + (theme.lanternIntensity ?? 1) * 0.14);
    }
    for (const light of this.#lanternLights) {
      light.intensity = 4.2 * theme.lanternIntensity;
    }
  }

  update(dt) {
    const delta = Math.min(dt, 0.1);
    this.#elapsed += delta;

    // Animar textura de agua compartida
    if (this.#waterMeshes.length > 0 && this.#waterMeshes[0]?.material?.map) {
      this.#waterMeshes[0].material.map.offset.x = (this.#elapsed * 0.045) % 1;
      this.#waterMeshes[0].material.map.offset.y = (this.#elapsed * 0.03) % 1;
    }

    // Cristal giratorio del remate de la fuente
    if (this.#fountainCrystal) {
      this.#fountainCrystal.rotation.y += delta * 1.15;
      this.#fountainCrystal.position.y = 6.2 + Math.sin(this.#elapsed * 2.2) * 0.08;
    }
    if (this.#fountainHalo) {
      this.#fountainHalo.rotation.y -= delta * 0.8;
      this.#fountainHalo.rotation.x = Math.sin(this.#elapsed * 1.1) * 0.35;
    }

    // Gotas de agua en cascada de 3 niveles
    if (this.#fountainDrops) {
      const pos = this.#fountainDrops.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const angle = this.#dropData[i * 4];
        const speed = this.#dropData[i * 4 + 2];
        const tier = this.#dropData[i * 4 + 3];
        const phase = (this.#dropData[i * 4 + 1] + delta * speed) % 1;
        this.#dropData[i * 4 + 1] = phase;

        let r;
        let y;
        if (tier === 0) {
          // Remate (Y=6.0) -> Copa superior (r=1.5, Y=4.65)
          r = 0.15 + phase * 1.25;
          y = 6.05 + Math.sin(phase * Math.PI) * 0.65 - phase * 1.4;
        } else if (tier === 1) {
          // Copa superior (r=1.7, Y=4.6) -> Copa intermedia (r=3.0, Y=2.8)
          r = 1.65 + phase * 1.25;
          y = 4.62 + Math.sin(phase * Math.PI) * 0.32 - phase * 1.85;
        } else {
          // Copa intermedia (r=3.3, Y=2.8) -> Vaso inferior (r=5.0, Y=0.7)
          r = 3.25 + phase * 1.65;
          y = 2.8 + Math.sin(phase * Math.PI) * 0.36 - phase * 2.12;
        }

        pos.setXYZ(i, Math.cos(angle) * r, y, Math.sin(angle) * r);
      }
      pos.needsUpdate = true;
    }

    // Pétalos de cerezo flotantes
    if (this.#sakuraPetals) {
      const pos = this.#sakuraPetals.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const baseX = this.#petalData[i * 4];
        const baseZ = this.#petalData[i * 4 + 1];
        const phase = this.#petalData[i * 4 + 2];
        const speed = this.#petalData[i * 4 + 3];

        let y = pos.getY(i) - delta * speed;
        if (y < 0.1) y = 6.5 + Math.random() * 1.2;
        const driftX = baseX + Math.sin(this.#elapsed * 0.9 + phase) * 1.8;
        const driftZ = baseZ + Math.cos(this.#elapsed * 0.7 + phase) * 1.8;
        pos.setXYZ(i, driftX, y, driftZ);
      }
      pos.needsUpdate = true;
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
    this.#instancedMeshes.length = 0;
    this.#geometries.length = 0;
    this.#tempGeos.length = 0;
    this.#materials.length = 0;
    this.#staticBuckets.clear();
    this.#lanternLights.length = 0;
    this.#waterMeshes.length = 0;
    this.#lanternMat = null;
    this.#lanternHaloMat = null;
    this.#fountainCrystal = null;
    this.#fountainHalo = null;
    this.#fountainDrops = null;
    this.#sakuraPetals = null;
  }
}
