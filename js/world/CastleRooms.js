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

/**
 * Construye, anima y gestiona las 5 estancias reales amuebladas del Palacio de Cristal:
 * 1. Gran Vestíbulo Imperial y Atelier del Vestidor Real (Planta Baja Central y Oeste)
 * 2. Salón del Trono Real (Ábside Norte, Planta Baja)
 * 3. Suite Real / Dormitorio de Princesa (Planta Alta Oeste)
 * 4. Salón de Baile y Banquetes (Planta Baja Este)
 * 5. Biblioteca Real y Sala de Té (Planta Alta Este)
 */
export class CastleRooms {
  #root = null;
  #textures;
  #collision;
  #sharedMats;
  #geometries = [];
  #materials = [];
  #ownedTextures = [];
  #instancedMeshes = [];
  #staticBuckets = new Map();
  #tempGeos = [];
  #dummy = new THREE.Object3D();
  #lights = [];
  #glowRecords = [];
  #glowMat = null;
  #chandeliers = [];
  #chandelierMeta = [];
  #floatingGems = [];
  #globes = [];
  #candleFlameRecords = [];
  #candleFlameInst = null;
  #dressRecords = [];
  #perfumeRecords = [];
  #crystalMat = null;
  #danceFloorMat = null;

  constructor(rootGroup, textureFactory, collisionSystem, sharedMats) {
    this.#root = rootGroup;
    this.#textures = textureFactory;
    this.#collision = collisionSystem;
    this.#sharedMats = sharedMats;
    this.#crystalMat = sharedMats.crystal;
    this.#danceFloorMat = sharedMats.danceFloor;
  }

  init() {
    const mats = this.#createRoomMaterials();
    this.#buildGrandFoyerAndAtelier(mats);
    this.#buildThroneRoom(mats);
    this.#buildRoyalSuite(mats);
    this.#buildBallroomAndBanquet(mats);
    this.#buildRoyalLibraryAndTeaSalon(mats);

    this.#flushStaticBuckets();
    this.#buildInstancedDressesAndPerfumes(mats);
    this.#buildInstancedCandleFlames(mats);
    this.#buildInstancedGlowDiscs();
  }

  #createRoomMaterials() {
    const longCarpetTex = this.#textures.getTexture('carpet', 1, 11);
    const longCarpet = new THREE.MeshStandardMaterial({
      map: longCarpetTex,
      roughness: 0.85,
      metalness: 0.02
    });

    const crimsonVelvet = new THREE.MeshStandardMaterial({
      color: 0xa61f5c,
      roughness: 0.78,
      metalness: 0.05
    });

    const blushSilk = new THREE.MeshStandardMaterial({
      color: 0xf9cde1,
      roughness: 0.42,
      metalness: 0.06
    });

    const creamSilk = new THREE.MeshStandardMaterial({
      color: 0xfff3f6,
      roughness: 0.48,
      metalness: 0.04
    });

    const tulleCanopy = new THREE.MeshStandardMaterial({
      color: 0xffe8f3,
      roughness: 0.6,
      metalness: 0.02,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide
    });

    const mahogany = new THREE.MeshStandardMaterial({
      color: 0x5c2d38,
      roughness: 0.36,
      metalness: 0.08
    });

    const pianoLacquer = new THREE.MeshStandardMaterial({
      color: 0xfbf6f8,
      roughness: 0.08,
      metalness: 0.14
    });
    pianoLacquer.userData.preserveRoughness = true;

    const pianoKeysWhite = new THREE.MeshStandardMaterial({
      color: 0xfcf9fb,
      roughness: 0.2,
      metalness: 0.02
    });

    const pianoKeysBlack = new THREE.MeshStandardMaterial({
      color: 0x221921,
      roughness: 0.25,
      metalness: 0.08
    });

    const porcelain = new THREE.MeshStandardMaterial({
      color: 0xfff8fb,
      roughness: 0.14,
      metalness: 0.06
    });
    porcelain.userData.preserveRoughness = true;

    const gemMat = new THREE.MeshStandardMaterial({
      color: 0xff9bd4,
      emissive: 0xe664b4,
      emissiveIntensity: 0.62,
      roughness: 0.15,
      metalness: 0.25,
      transparent: true,
      opacity: 0.86
    });
    gemMat.userData.preserveRoughness = true;

    const flameMat = new THREE.MeshStandardMaterial({
      color: 0xffe4a0,
      emissive: 0xffb347,
      emissiveIntensity: 0.82,
      roughness: 0.3,
      metalness: 0.0
    });

    const bookMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.58,
      metalness: 0.05
    });

    const dressMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.45,
      metalness: 0.08
    });

    const perfumeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.15,
      metalness: 0.2
    });
    perfumeMat.userData.preserveRoughness = true;

    const globeMat = new THREE.MeshStandardMaterial({
      color: 0xe6b99a,
      roughness: 0.26,
      metalness: 0.65
    });

    const rosePetal = new THREE.MeshStandardMaterial({
      color: 0xeb5a96,
      roughness: 0.65,
      metalness: 0.02
    });

    const foliage = new THREE.MeshStandardMaterial({
      color: 0x458055,
      roughness: 0.72,
      metalness: 0.02
    });

    const pastryFrosting = new THREE.MeshStandardMaterial({
      color: 0xffd5e7,
      roughness: 0.52,
      metalness: 0.03
    });

    const mirror = new THREE.MeshStandardMaterial({
      color: 0xf4f8ff,
      metalness: 0.96,
      roughness: 0.04
    });
    mirror.userData.preserveRoughness = true;

    const glowTex = this.#createGlowTexture();
    const glowMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      color: 0xffe6f2,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide
    });
    glowMat.userData.isVfx = true;
    this.#glowMat = glowMat;

    this.#materials.push(
      longCarpet,
      crimsonVelvet,
      blushSilk,
      creamSilk,
      tulleCanopy,
      mahogany,
      pianoLacquer,
      pianoKeysWhite,
      pianoKeysBlack,
      porcelain,
      gemMat,
      flameMat,
      bookMat,
      dressMat,
      perfumeMat,
      globeMat,
      rosePetal,
      foliage,
      pastryFrosting,
      mirror,
      glowMat
    );

    return {
      ...this.#sharedMats,
      longCarpet,
      crimsonVelvet,
      blushSilk,
      creamSilk,
      tulleCanopy,
      mahogany,
      pianoLacquer,
      pianoKeysWhite,
      pianoKeysBlack,
      porcelain,
      gemMat,
      flameMat,
      bookMat,
      dressMat,
      perfumeMat,
      globeMat,
      rosePetal,
      foliage,
      pastryFrosting,
      mirror
    };
  }

  #createGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
    grad.addColorStop(0, 'rgba(255, 240, 224, 1)');
    grad.addColorStop(0.35, 'rgba(255, 222, 238, 0.55)');
    grad.addColorStop(0.7, 'rgba(255, 200, 226, 0.16)');
    grad.addColorStop(1, 'rgba(255, 200, 226, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    this.#ownedTextures.push(tex);
    return tex;
  }

  #trackGeo(geo) {
    this.#geometries.push(geo);
    return geo;
  }

  #addStaticPiece(geo, mat, matrix, castShadow = false, receiveShadow = true, sharedGeo = false) {
    if (!sharedGeo) {
      this.#tempGeos.push(geo);
    }
    const key = `${mat.id}_${castShadow ? 1 : 0}_${receiveShadow ? 1 : 0}`;
    let bucket = this.#staticBuckets.get(key);
    if (!bucket) {
      bucket = { mat, castShadow, receiveShadow, pieces: [] };
      this.#staticBuckets.set(key, bucket);
    }
    bucket.pieces.push({ geometry: geo, matrix: matrix.clone() });
  }

  #addStaticMesh(geo, mat, x, y, z, castShadow = false, receiveShadow = true, rotX = 0, rotY = 0, rotZ = 0, sx = 1, sy = 1, sz = 1, sharedGeo = false) {
    this.#dummy.position.set(x, y, z);
    this.#dummy.rotation.set(rotX, rotY, rotZ);
    this.#dummy.scale.set(sx, sy, sz);
    this.#dummy.updateMatrix();
    this.#addStaticPiece(geo, mat, this.#dummy.matrix, castShadow, receiveShadow, sharedGeo);
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

  #addMesh(geo, mat, x, y, z, castShadow = false, receiveShadow = true, parent = this.#root) {
    if (parent === this.#root) {
      this.#addStaticMesh(geo, mat, x, y, z, castShadow, receiveShadow);
      return null;
    }
    this.#trackGeo(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    parent.add(mesh);
    return mesh;
  }

  #addAnimatedMesh(geo, mat, x, y, z) {
    this.#trackGeo(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    this.#root.add(mesh);
    return mesh;
  }

  #addBox(w, h, d, x, y, z, mat, castShadow = false, addCollider = false, receiveShadow = true) {
    this.#addStaticMesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, castShadow, receiveShadow);
    if (addCollider) {
      this.#collision.addBox(x - w / 2, x + w / 2, y - h / 2, y + h / 2, z - d / 2, z + d / 2);
    }
  }

  #addColumn(x, yBase, z, height, radius, mats, addCollider = true) {
    const shaftGeo = new THREE.CylinderGeometry(radius * 0.88, radius, height, 14);
    const capGeo = new THREE.CylinderGeometry(radius * 1.3, radius * 0.92, 0.42, 14);
    this.#tempGeos.push(shaftGeo, capGeo);

    this.#addStaticMesh(shaftGeo, mats.marble, x, yBase + height / 2, z, true, true, 0, 0, 0, 1, 1, 1, true);
    this.#addStaticMesh(capGeo, mats.roseGold, x, yBase + height - 0.21, z, false, true, 0, 0, 0, 1, 1, 1, true);
    this.#addStaticMesh(capGeo, mats.roseGold, x, yBase + 0.21, z, false, true, 0, 0, 0, 1, 1, 1, true);

    if (addCollider) {
      this.#collision.addCylinderCollider(x, z, radius * 1.08, yBase, yBase + height);
    }
  }

  #addGlowSpot(x, floorY, z, radius = 6.5) {
    this.#glowRecords.push({ x, y: floorY + 0.055, z, radius });
  }

  #addChandelier(x, y, z, radius, chainLength, mats) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const chainGeo = new THREE.CylinderGeometry(0.06, 0.06, chainLength, 8);
    const upperRingGeo = new THREE.TorusGeometry(radius * 0.62, 0.08, 8, 24);
    const mainRingGeo = new THREE.TorusGeometry(radius, 0.11, 10, 28);
    const dropGeo = new THREE.OctahedronGeometry(0.24, 0);
    const candleGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.26, 8);

    const goldPieces = [];
    const crystalPieces = [];
    const candlePieces = [];

    const d = this.#dummy;
    const pushPiece = (arr, geo, px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
      d.position.set(px, py, pz);
      d.rotation.set(rx, ry, rz);
      d.scale.set(sx, sy, sz);
      d.updateMatrix();
      arr.push({ geometry: geo, matrix: d.matrix.clone() });
    };

    pushPiece(goldPieces, chainGeo, 0, chainLength / 2, 0);
    pushPiece(goldPieces, mainRingGeo, 0, 0, 0, Math.PI / 2);
    pushPiece(goldPieces, upperRingGeo, 0, 0.85, 0, Math.PI / 2);

    const chandelierIdx = this.#chandeliers.length;
    const arms = 10;
    for (let i = 0; i < arms; i++) {
      const a = (i / arms) * Math.PI * 2;
      const cx = Math.cos(a) * radius;
      const cz = Math.sin(a) * radius;

      pushPiece(crystalPieces, dropGeo, cx, -0.38, cz);
      pushPiece(candlePieces, candleGeo, cx, 0.18, cz);

      this.#candleFlameRecords.push({
        chandelierIdx,
        lx: cx,
        ly: 0.36,
        lz: cz,
        baseScale: 1.0,
        phase: i * 0.7 + z
      });
    }

    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      pushPiece(crystalPieces, dropGeo, Math.cos(a) * radius * 0.62, 0.5, Math.sin(a) * radius * 0.62);
    }

    pushPiece(crystalPieces, dropGeo, 0, -0.85, 0, 0, 0, 0, 1.6, 2.4, 1.6);

    const mergedGold = mergeGeometries(goldPieces);
    const mergedCrystal = mergeGeometries(crystalPieces);
    const mergedCandles = mergeGeometries(candlePieces);

    for (const [geo, mat] of [
      [mergedGold, mats.roseGold],
      [mergedCrystal, mats.crystal],
      [mergedCandles, mats.creamSilk]
    ]) {
      if (!geo) continue;
      this.#trackGeo(geo);
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = false;
      m.receiveShadow = false;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      group.add(m);
    }

    chainGeo.dispose();
    upperRingGeo.dispose();
    mainRingGeo.dispose();
    dropGeo.dispose();
    candleGeo.dispose();

    this.#root.add(group);
    this.#chandeliers.push(group);
    this.#chandelierMeta.push({ x, y, z });
    this.#addGlowSpot(x, 1.0, z, 7.2);
  }

  #addFlowerUrn(x, yBase, z, mats) {
    // Pedestal + ánfora + ramo de rosas
    this.#addBox(0.9, 1.0, 0.9, x, yBase + 0.5, z, mats.marble, false, true);
    this.#addStaticMesh(new THREE.CylinderGeometry(0.36, 0.22, 0.75, 12), mats.roseGold, x, yBase + 1.375, z, false, true);
    this.#addStaticMesh(new THREE.SphereGeometry(0.45, 10, 8), mats.foliage, x, yBase + 1.85, z, false, true);
    const petalGeo = new THREE.DodecahedronGeometry(0.14, 0);
    this.#tempGeos.push(petalGeo);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.#addStaticMesh(
        petalGeo,
        mats.rosePetal,
        x + Math.cos(a) * 0.26,
        yBase + 2.02 + (i % 2) * 0.1,
        z + Math.sin(a) * 0.26,
        false,
        true,
        0, 0, 0, 1, 1, 1, true
      );
    }
  }

  #addVelvetDivan(x, yBase, z, rotY, mats, addCollider = true) {
    const parentMat = new THREE.Matrix4().compose(
      new THREE.Vector3(x, yBase, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
      new THREE.Vector3(1, 1, 1)
    );
    const localObj = new THREE.Object3D();
    const pushLocal = (geo, mat, lx, ly, lz, rx = 0, ry = 0, rz = 0, sharedGeo = false) => {
      localObj.position.set(lx, ly, lz);
      localObj.rotation.set(rx, ry, rz);
      localObj.scale.set(1, 1, 1);
      localObj.updateMatrix();
      const worldMat = new THREE.Matrix4().multiplyMatrices(parentMat, localObj.matrix);
      this.#addStaticPiece(geo, mat, worldMat, false, true, sharedGeo);
    };

    const legGeo = new THREE.CylinderGeometry(0.05, 0.03, 0.28, 8);
    this.#tempGeos.push(legGeo);
    for (const [lx, lz] of [[-0.55, -1.2], [0.55, -1.2], [-0.55, 1.2], [0.55, 1.2]]) {
      pushLocal(legGeo, mats.roseGold, lx, 0.14, lz, 0, 0, 0, true);
    }

    pushLocal(new THREE.BoxGeometry(1.3, 0.36, 2.8), mats.velvet, 0, 0.42, 0);
    pushLocal(new THREE.BoxGeometry(0.28, 0.72, 2.7), mats.velvet, -0.5, 0.85, 0);

    const bolsterGeo = new THREE.CylinderGeometry(0.16, 0.16, 1.12, 10);
    this.#tempGeos.push(bolsterGeo);
    pushLocal(bolsterGeo, mats.blushSilk, 0, 0.72, -1.2, 0, 0, Math.PI / 2, true);
    pushLocal(bolsterGeo, mats.blushSilk, 0, 0.72, 1.2, 0, 0, Math.PI / 2, true);

    if (addCollider) {
      const cos = Math.abs(Math.cos(rotY));
      const sin = Math.abs(Math.sin(rotY));
      const hw = (1.35 * cos + 2.85 * sin) / 2;
      const hd = (1.35 * sin + 2.85 * cos) / 2;
      this.#collision.addBox(x - hw, x + hw, yBase, yBase + 1.25, z - hd, z + hd);
    }
  }

  // =========================================================================
  // 1. GRAN VESTÍBULO IMPERIAL + ATELIER DEL VESTIDOR REAL (Planta Baja)
  // =========================================================================
  #buildGrandFoyerAndAtelier(mats) {
    // Alfombra imperial central (Z = -22 a -68) con ribete dorado
    this.#addBox(4.8, 0.03, 46.0, 0, 1.015, -45.0, mats.roseGold, false, false);
    this.#addBox(4.4, 0.04, 45.8, 0, 1.02, -45.0, mats.longCarpet, false, false);

    // 2 grandes lámparas de araña colgantes en el Gran Vestíbulo
    this.#addChandelier(0, 12.2, -31.0, 2.6, 5.4, mats);
    this.#addChandelier(0, 12.2, -44.0, 2.6, 5.4, mats);

    // Columnata imperial de mármol con capiteles dorados (deja X ∈ [-6.6, 6.6] libre)
    for (const [cx, cz, h] of [
      [-7.4, -26.4, 13.8], [7.4, -26.4, 13.8],
      [-7.4, -34.5, 6.2], [7.4, -34.5, 6.2],
      [-7.4, -43.5, 6.2], [7.4, -43.5, 6.2],
      [-7.4, -51.5, 13.8], [7.4, -51.5, 13.8]
    ]) {
      this.#addColumn(cx, 1.0, cz, h, 0.44, mats, true);
    }

    // Jarrones monumentales con rosas
    for (const [ux, uz] of [[-5.2, -24.2], [5.2, -24.2], [-5.4, -52.4], [5.4, -52.4]]) {
      this.#addFlowerUrn(ux, 1.0, uz, mats);
    }

    // --- ATELIER DEL VESTIDOR REAL (Planta Baja Oeste, X ∈ [-36, -14]) ---
    // Espejos de cuerpo entero en X = -35.2
    for (const z of [-28.0, -35.0, -42.0, -48.0]) {
      this.#addBox(0.22, 4.2, 2.5, -35.25, 3.2, z, mats.roseGold, false, false);
      this.#addBox(0.08, 3.75, 2.1, -35.12, 3.2, z, mats.mirror, false, false, false);
    }

    // Podio oro-rosa en (-22, 1.0, -35)
    this.#addStaticMesh(new THREE.CylinderGeometry(2.25, 2.45, 0.24, 28), mats.roseGold, -22, 1.12, -35, false, true);
    this.#addStaticMesh(new THREE.CylinderGeometry(2.0, 2.0, 0.04, 28), mats.blushSilk, -22, 1.25, -35, false, true);
    this.#collision.addDiscSurface(-22, -35, 2.35, 1.26);

    // Diván de terciopelo en (-18, 1.0, -41)
    this.#addVelvetDivan(-18, 1.0, -41, 0, mats, true);

    // Maniquíes y exhibidores de vestidos al fondo del Atelier
    const manBaseGeo = new THREE.CylinderGeometry(0.75, 0.85, 0.22, 16);
    const manPoleGeo = new THREE.CylinderGeometry(0.06, 0.08, 1.1, 8);
    this.#tempGeos.push(manBaseGeo, manPoleGeo);

    for (const [mx, mz, dressColor] of [
      [-31.5, -51.0, 0xf284b8],
      [-26.5, -51.0, 0xd8a8ff],
      [-21.5, -51.0, 0xffd2b8]
    ]) {
      this.#addStaticMesh(manBaseGeo, mats.marble, mx, 1.11, mz, false, true, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(manPoleGeo, mats.roseGold, mx, 1.75, mz, false, true, 0, 0, 0, 1, 1, 1, true);
      this.#dressRecords.push({
        x: mx,
        skirtY: 2.0,
        bodiceY: 2.8,
        z: mz,
        skirtR: 0.62,
        skirtH: 1.35,
        bodiceR: 0.24,
        bodiceH: 0.55,
        colorHex: dressColor
      });
      this.#collision.addCylinderCollider(mx, mz, 0.85, 1.0, 3.2);
    }

    this.#addGlowSpot(-25, 1.0, -35, 7.0);
    this.#addGlowSpot(-26, 1.0, -48, 5.5);
  }

  // =========================================================================
  // 2. SALÓN DEL TRONO REAL (X ∈ [-20, 20], Z ∈ [-76, -54], Y = 1.0)
  // =========================================================================
  #buildThroneRoom(mats) {
    // Estrado real de 3 peldaños al fondo (Z ∈ [-73.5, -67.5], Y = 1.6)
    this.#addBox(19.0, 0.2, 8.2, 0, 1.1, -69.4, mats.marble, true, false);
    this.#addBox(19.0, 0.2, 7.4, 0, 1.3, -69.8, mats.marble, true, false);
    this.#addBox(19.0, 0.2, 6.0, 0, 1.5, -70.5, mats.marbleFloor, false, false);
    this.#addBox(18.6, 0.04, 5.6, 0, 1.61, -70.5, mats.crimsonVelvet, false, false);
    this.#collision.addFlatSurface(-9.5, 9.5, -73.5, -67.5, 1.6);
    this.#collision.addRampSurface(-9.5, 9.5, -67.5, -65.3, 'z', -65.3, -67.5, 1.0, 1.6);

    // Dos tronos reales detallados
    for (const tx of [-2.2, 2.2]) {
      this.#buildSingleThrone(tx, 1.6, -71.0, mats);
    }

    // Gran dosel imperial con 4 postes dorados y cortinajes
    const postGeo = new THREE.CylinderGeometry(0.14, 0.16, 5.4, 12);
    this.#tempGeos.push(postGeo);
    for (const [px, pz] of [[-4.8, -68.8], [4.8, -68.8], [-4.8, -73.0], [4.8, -73.0]]) {
      this.#addStaticMesh(postGeo, mats.roseGold, px, 4.3, pz, true, true, 0, 0, 0, 1, 1, 1, true);
      this.#collision.addCylinderCollider(px, pz, 0.25, 1.6, 7.0);
    }
    this.#addBox(10.0, 0.45, 4.6, 0, 7.1, -70.9, mats.roseGold, true, false);
    this.#addStaticMesh(new THREE.ConeGeometry(2.2, 1.6, 8), mats.roseGold, 0, 8.1, -70.9, false, true);
    this.#addStaticMesh(new THREE.OctahedronGeometry(0.55, 0), mats.gemMat, 0, 9.15, -70.9, false, false);

    // Cortinajes laterales del dosel
    const drapeGeo = new THREE.CylinderGeometry(0.32, 0.52, 5.1, 10);
    this.#tempGeos.push(drapeGeo);
    for (const [dx, dz] of [[-4.55, -69.0], [4.55, -69.0], [-4.55, -72.8], [4.55, -72.8]]) {
      this.#addStaticMesh(drapeGeo, mats.crimsonVelvet, dx, 4.25, dz, false, true, 0, 0, 0, 1, 1, 1, true);
    }
    this.#addBox(9.6, 0.65, 0.22, 0, 6.65, -68.85, mats.crimsonVelvet, false, false);

    // 6 estandartes colgantes reales (3 en muro Oeste, 3 en muro Este)
    const bannerGemGeo = new THREE.OctahedronGeometry(0.34, 0);
    this.#tempGeos.push(bannerGemGeo);
    for (const side of [-1, 1]) {
      for (const bz of [-58.5, -64.5, -70.5]) {
        const bx = side * 19.15;
        this.#addBox(0.25, 0.12, 2.2, bx, 12.2, bz, mats.roseGold, false, false);
        this.#addBox(0.08, 5.4, 1.8, bx - side * 0.05, 9.4, bz, mats.crimsonVelvet, false, false);
        this.#addBox(0.1, 0.35, 1.85, bx - side * 0.06, 6.75, bz, mats.roseGold, false, false);
        this.#addStaticMesh(bannerGemGeo, mats.roseGold, bx - side * 0.12, 9.8, bz, false, true, 0, 0, 0, 1, 1, 1, true);
      }
    }

    // 4 pedestales de mármol con gemas flotantes giratorias
    const pedPositions = [
      [-11.5, -59.5], [11.5, -59.5],
      [-11.5, -67.5], [11.5, -67.5]
    ];
    const pedBodyGeo = new THREE.CylinderGeometry(0.62, 0.72, 1.45, 14);
    const pedCapGeo = new THREE.CylinderGeometry(0.74, 0.66, 0.18, 14);
    const sharedGemGeo = this.#trackGeo(new THREE.OctahedronGeometry(0.42, 0));
    this.#tempGeos.push(pedBodyGeo, pedCapGeo);

    for (let i = 0; i < pedPositions.length; i++) {
      const [px, pz] = pedPositions[i];
      this.#addStaticMesh(pedBodyGeo, mats.marble, px, 1.725, pz, false, true, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(pedCapGeo, mats.roseGold, px, 2.48, pz, false, true, 0, 0, 0, 1, 1, 1, true);
      this.#collision.addCylinderCollider(px, pz, 0.76, 1.0, 3.4);

      const gem = new THREE.Mesh(sharedGemGeo, mats.gemMat);
      gem.position.set(px, 3.25, pz);
      gem.scale.set(0.85, 1.35, 0.85);
      gem.castShadow = false;
      gem.receiveShadow = false;
      this.#root.add(gem);
      this.#floatingGems.push({ mesh: gem, baseY: 3.25, phase: i * 1.57 });
    }

    // Araña de cristal del Salón del Trono
    this.#addChandelier(0, 12.6, -63.5, 2.4, 4.8, mats);
    this.#addGlowSpot(0, 1.6, -70.5, 6.2);
  }

  #buildSingleThrone(x, yBase, z, mats) {
    this.#addBox(1.5, 0.65, 1.3, x, yBase + 0.325, z, mats.roseGold, false, false);
    this.#addBox(1.25, 0.24, 1.15, x, yBase + 0.75, z + 0.05, mats.crimsonVelvet, false, false);
    // Respaldo alto tallado
    this.#addBox(1.45, 2.2, 0.25, x, yBase + 1.75, z - 0.52, mats.roseGold, false, false);
    this.#addBox(1.15, 1.85, 0.14, x, yBase + 1.75, z - 0.38, mats.crimsonVelvet, false, false);
    this.#addStaticMesh(
      new THREE.CylinderGeometry(0.72, 0.72, 0.22, 16, 1, false, 0, Math.PI),
      mats.roseGold,
      x,
      yBase + 2.85,
      z - 0.52,
      false,
      true,
      Math.PI / 2
    );
    this.#addStaticMesh(new THREE.OctahedronGeometry(0.24, 0), mats.gemMat, x, yBase + 3.45, z - 0.5, false, false);
    // Reposabrazos
    this.#addBox(0.22, 0.48, 1.15, x - 0.65, yBase + 0.95, z, mats.roseGold, false, false);
    this.#addBox(0.22, 0.48, 1.15, x + 0.65, yBase + 0.95, z, mats.roseGold, false, false);

    this.#collision.addBox(x - 0.85, x + 0.85, yBase, yBase + 3.2, z - 0.72, z + 0.72);
  }

  // =========================================================================
  // 3. SUITE REAL / DORMITORIO DE PRINCESA (Planta Alta Izquierda, Y = 7.5)
  // =========================================================================
  #buildRoyalSuite(mats) {
    const y = 7.5;

    // Cama real con dosel y cortinas translúcidas en (-29, 7.5, -46)
    this.#addBox(3.8, 0.6, 4.4, -29, y + 0.3, -46, mats.roseGold, false, false);
    this.#addBox(3.4, 0.38, 4.0, -29, y + 0.78, -46, mats.creamSilk, false, false);
    this.#addBox(3.45, 0.42, 2.5, -29, y + 0.84, -45.2, mats.blushSilk, false, false);
    // Cabecero tapizado
    this.#addBox(3.8, 2.1, 0.28, -29, y + 1.45, -48.1, mats.roseGold, false, false);
    this.#addBox(3.3, 1.65, 0.14, -29, y + 1.48, -47.92, mats.velvet, false, false);
    // Almohadas
    this.#addBox(1.1, 0.24, 0.65, -29.85, y + 1.08, -47.4, mats.creamSilk, false, false);
    this.#addBox(1.1, 0.24, 0.65, -28.15, y + 1.08, -47.4, mats.creamSilk, false, false);
    // Postes y dosel translúcido
    const postGeo = new THREE.CylinderGeometry(0.1, 0.12, 3.8, 10);
    const curtainGeo = new THREE.CylinderGeometry(0.28, 0.45, 3.4, 10);
    this.#tempGeos.push(postGeo, curtainGeo);
    for (const [px, pz] of [[-30.8, -48.0], [-27.2, -48.0], [-30.8, -44.0], [-27.2, -44.0]]) {
      this.#addStaticMesh(postGeo, mats.roseGold, px, y + 1.9, pz, false, true, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(
        curtainGeo,
        mats.tulleCanopy,
        px + (px < -29 ? 0.15 : -0.15),
        y + 1.9,
        pz + (pz < -46 ? 0.15 : -0.15),
        false,
        false,
        0, 0, 0, 1, 1, 1, true
      );
    }
    this.#addBox(3.9, 0.22, 4.3, -29, y + 3.85, -46, mats.roseGold, false, false);
    this.#collision.addBox(-31.0, -27.0, y, y + 4.0, -48.3, -43.7);

    // Mesillas de noche con lámparas de cristal
    const lampBaseGeo = new THREE.CylinderGeometry(0.14, 0.2, 0.35, 10);
    const lampShadeGeo = new THREE.SphereGeometry(0.16, 10, 8);
    this.#tempGeos.push(lampBaseGeo, lampShadeGeo);
    for (const mx of [-31.7, -26.3]) {
      this.#addBox(0.85, 0.78, 0.75, mx, y + 0.39, -47.7, mats.mahogany, false, true);
      this.#addStaticMesh(lampBaseGeo, mats.roseGold, mx, y + 0.95, -47.7, false, true, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(lampShadeGeo, mats.flameMat, mx, y + 1.2, -47.7, false, false, 0, 0, 0, 1, 1, 1, true);
    }

    // Tocador con espejo iluminado y frascos de perfume (despeja puerta balcón Z ∈ [-38.1, -33.9])
    this.#addBox(1.1, 0.95, 2.8, -34.2, y + 0.475, -29.5, mats.creamSilk, false, false);
    this.#addBox(1.16, 0.1, 2.9, -34.2, y + 0.98, -29.5, mats.marble, false, false);
    this.#addBox(0.16, 1.85, 2.1, -34.65, y + 1.95, -29.5, mats.roseGold, false, false);
    this.#addBox(0.06, 1.6, 1.8, -34.55, y + 1.95, -29.5, mats.mirror, false, false, false);
    // Bombillas alrededor del espejo
    const bulbGeo = new THREE.SphereGeometry(0.06, 8, 8);
    this.#tempGeos.push(bulbGeo);
    for (let i = 0; i < 6; i++) {
      this.#addStaticMesh(bulbGeo, mats.flameMat, -34.54, y + 2.72, -30.3 + i * 0.32, false, false, 0, 0, 0, 1, 1, 1, true);
    }
    // Frascos de perfume (instanciados después con setColorAt)
    for (const [pz, col] of [[-30.2, 0xff9bd4], [-29.8, 0xa8e0ff], [-28.8, 0xffe09b]]) {
      this.#perfumeRecords.push({ x: -33.95, y: y + 1.15, z: pz, colorHex: col });
    }
    // Taburete del tocador
    this.#addStaticMesh(new THREE.CylinderGeometry(0.36, 0.32, 0.56, 12), mats.velvet, -33.1, y + 0.28, -29.5, false, true);
    this.#collision.addBox(-34.9, -32.6, y, y + 2.9, -31.0, -28.0);

    // Armario vestidor abierto con vestidos 3D expuestos en (-22, 7.5, -51.8)
    this.#addBox(5.4, 4.1, 1.5, -22, y + 2.05, -52.2, mats.mahogany, true, false);
    this.#addBox(5.6, 0.22, 1.65, -22, y + 4.15, -52.2, mats.roseGold, false, false);
    this.#addStaticMesh(new THREE.CylinderGeometry(0.04, 0.04, 4.8, 8), mats.roseGold, -22, y + 3.45, -51.8, false, true, 0, 0, Math.PI / 2);
    const gownColors = [0xf67db8, 0xc79bff, 0x8ad6ff, 0xffcaa6, 0xf2b5d4];
    for (let i = 0; i < gownColors.length; i++) {
      const gx = -23.8 + i * 0.9;
      this.#dressRecords.push({
        x: gx,
        skirtY: y + 2.2,
        bodiceY: y + 3.05,
        z: -51.8,
        skirtR: 0.34,
        skirtH: 1.45,
        bodiceR: 0.18,
        bodiceH: 0.45,
        colorHex: gownColors[i]
      });
    }
    this.#collision.addBox(-24.8, -19.2, y, y + 4.2, -53.1, -51.3);

    // Alfombra circular peluda en (-25, 7.52, -38)
    this.#addStaticMesh(new THREE.CylinderGeometry(4.2, 4.2, 0.04, 32), mats.blushSilk, -25, y + 0.02, -38, false, true);
    this.#addStaticMesh(new THREE.CylinderGeometry(3.2, 3.2, 0.05, 32), mats.creamSilk, -25, y + 0.025, -38, false, true);

    // Diván de lectura en la Suite (minY = 7.5)
    this.#addVelvetDivan(-20.2, y, -36.0, Math.PI, mats, true);

    this.#addGlowSpot(-26, y, -38, 6.8);
    this.#addGlowSpot(-28, y, -48, 5.2);
  }

  // =========================================================================
  // 4. SALÓN DE BAILE Y BANQUETES (Planta Baja Derecha, X ∈ [14, 36], Y = 1.0)
  // =========================================================================
  #buildBallroomAndBanquet(mats) {
    // Pista de baile pulida e iluminada centrada en (23, 1.03, -33) (10 x 13m)
    this.#addBox(10.6, 0.05, 13.6, 23, 1.015, -33, mats.roseGold, false, false);
    this.#addBox(10.0, 0.06, 13.0, 23, 1.03, -33, mats.danceFloor, false, false);

    // Columnas de cristal iluminadas en las esquinas de la pista
    const capGeo = new THREE.CylinderGeometry(0.4, 0.45, 0.35, 12);
    const shaftGeo = new THREE.CylinderGeometry(0.28, 0.32, 5.8, 10);
    const topGeo = new THREE.CylinderGeometry(0.45, 0.35, 0.35, 12);
    this.#tempGeos.push(capGeo, shaftGeo, topGeo);

    for (const [cx, cz] of [
      [18.1, -26.6], [27.9, -26.6],
      [18.1, -39.4], [27.9, -39.4]
    ]) {
      this.#addStaticMesh(capGeo, mats.roseGold, cx, 1.175, cz, false, true, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(shaftGeo, mats.crystal, cx, 4.25, cz, false, false, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(topGeo, mats.roseGold, cx, 7.25, cz, false, true, 0, 0, 0, 1, 1, 1, true);
      this.#collision.addCylinderCollider(cx, cz, 0.45, 1.0, 7.4);
    }

    // Piano de cola blanco y dorado en (18.5, 1.0, -24.8) + arpa dorada y banqueta
    this.#buildGrandPianoAndHarp(18.5, 1.0, -24.8, mats);

    // Mesa imperial de banquetes en (31.5, 1.0, -44.0) (despeja puerta Este Z ∈ [-38.3, -33.7])
    this.#buildImperialBanquetTable(31.5, 1.0, -44.0, mats);

    this.#addGlowSpot(23, 1.0, -33, 7.5);
    this.#addGlowSpot(31.5, 1.0, -44, 5.8);
  }

  #buildGrandPianoAndHarp(x, yBase, z, mats) {
    const pushOffset = (geo, mat, lx, ly, lz, rx = 0, ry = 0, rz = 0, castShadow = false, sharedGeo = false) => {
      this.#addStaticMesh(geo, mat, x + lx, yBase + ly, z + lz, castShadow, true, rx, ry, rz, 1, 1, 1, sharedGeo);
    };

    // Silueta curva del piano de cola
    const shape = new THREE.Shape();
    shape.moveTo(-1.15, -0.9);
    shape.lineTo(1.15, -0.9);
    shape.lineTo(1.15, 0.25);
    shape.bezierCurveTo(1.15, 0.85, 0.35, 1.05, 0.1, 1.55);
    shape.bezierCurveTo(-0.15, 2.05, -1.15, 1.9, -1.15, 0.9);
    shape.closePath();

    const bodyGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.42, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
    bodyGeo.rotateX(Math.PI / 2);
    pushOffset(bodyGeo, mats.pianoLacquer, 0, 1.24, 0, 0, 0, 0, true);

    // Tapa levantada brillante (preserveRoughness = true en mats.pianoLacquer)
    const lidGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false });
    lidGeo.rotateX(Math.PI / 2);
    pushOffset(lidGeo, mats.pianoLacquer, 0, 1.28, 0, 0, 0, 0.48, true);

    // Puntal dorado de la tapa
    pushOffset(new THREE.CylinderGeometry(0.025, 0.025, 0.95, 8), mats.roseGold, 0.68, 1.66, 0.1, 0, 0, -0.18);

    // Patas torneadas
    const legGeo = new THREE.CylinderGeometry(0.07, 0.04, 0.84, 10);
    this.#tempGeos.push(legGeo);
    for (const [lx, lz] of [[-0.95, -0.75], [0.95, -0.75], [-0.55, 1.35]]) {
      pushOffset(legGeo, mats.roseGold, lx, 0.42, lz, 0, 0, 0, false, true);
    }

    // Teclado blanco y negro + atril
    pushOffset(new THREE.BoxGeometry(1.9, 0.1, 0.36), mats.pianoKeysWhite, 0, 0.96, -1.04);
    pushOffset(new THREE.BoxGeometry(1.72, 0.06, 0.16), mats.pianoKeysBlack, 0, 1.03, -0.96);
    pushOffset(new THREE.BoxGeometry(0.95, 0.34, 0.04), mats.roseGold, 0, 1.42, -0.78, -0.25);

    // Banqueta del piano
    pushOffset(new THREE.BoxGeometry(1.1, 0.18, 0.48), mats.velvet, 0, 0.56, -1.72);

    // Arpa dorada al lado del piano
    const harpX = -2.1;
    pushOffset(new THREE.BoxGeometry(0.5, 0.25, 0.85), mats.roseGold, harpX, 0.125, 0.2);
    pushOffset(new THREE.CylinderGeometry(0.05, 0.07, 1.9, 10), mats.roseGold, harpX, 1.1, -0.18);
    pushOffset(new THREE.BoxGeometry(0.08, 0.14, 0.95), mats.roseGold, harpX, 1.95, 0.25, 0.22);
    pushOffset(new THREE.CylinderGeometry(0.06, 0.12, 1.8, 10), mats.roseGold, harpX, 0.98, 0.42, -0.3);

    const strGeo = new THREE.CylinderGeometry(0.008, 0.008, 1.35, 6);
    this.#tempGeos.push(strGeo);
    for (let s = 0; s < 7; s++) {
      pushOffset(strGeo, mats.creamSilk, harpX, 1.25, -0.05 + s * 0.09, 0, 0, 0, false, true);
    }

    this.#collision.addBox(x - 2.6, x + 1.4, yBase, yBase + 2.4, z - 2.0, z + 1.95);
  }

  #buildImperialBanquetTable(x, yBase, z, mats) {
    // Mesa imperial (2.6 x 10.6m) con mantel elegante y camino dorado
    this.#addBox(2.6, 0.85, 10.6, x, yBase + 0.425, z, mats.creamSilk, false, false);
    this.#addBox(2.7, 0.08, 10.7, x, yBase + 0.86, z, mats.blushSilk, false, false);
    this.#addBox(0.75, 0.02, 10.5, x, yBase + 0.91, z, mats.roseGold, false, false);

    // 3 candelabros dorados con llamitas suaves
    const candBaseGeo = new THREE.CylinderGeometry(0.08, 0.24, 0.58, 10);
    const candArmGeo = new THREE.BoxGeometry(0.55, 0.06, 0.08);
    const candleGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8);
    this.#tempGeos.push(candBaseGeo, candArmGeo, candleGeo);

    for (const cz of [z - 3.3, z, z + 3.3]) {
      this.#addStaticMesh(candBaseGeo, mats.roseGold, x, yBase + 1.2, cz, false, true, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(candArmGeo, mats.roseGold, x, yBase + 1.45, cz, false, true, 0, 0, 0, 1, 1, 1, true);
      for (const ox of [-0.22, 0, 0.22]) {
        this.#addStaticMesh(candleGeo, mats.creamSilk, x + ox, yBase + 1.56, cz, false, true, 0, 0, 0, 1, 1, 1, true);
        this.#candleFlameRecords.push({
          chandelierIdx: -1,
          x: x + ox,
          y: yBase + 1.7,
          z: cz,
          baseScale: 0.64,
          phase: cz + ox * 5
        });
      }
    }

    // 2 tartas reales escalonadas
    const cake1Geo = new THREE.CylinderGeometry(0.36, 0.36, 0.16, 16);
    const cake2Geo = new THREE.CylinderGeometry(0.25, 0.25, 0.16, 16);
    const cake3Geo = new THREE.CylinderGeometry(0.14, 0.14, 0.14, 16);
    const cakeTopGeo = new THREE.OctahedronGeometry(0.06, 0);
    this.#tempGeos.push(cake1Geo, cake2Geo, cake3Geo, cakeTopGeo);

    for (const cz of [z - 1.65, z + 1.65]) {
      this.#addStaticMesh(cake1Geo, mats.pastryFrosting, x, yBase + 1.0, cz, false, true, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(cake2Geo, mats.blushSilk, x, yBase + 1.16, cz, false, true, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(cake3Geo, mats.pastryFrosting, x, yBase + 1.31, cz, false, true, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(cakeTopGeo, mats.rosePetal, x, yBase + 1.44, cz, false, true, 0, 0, 0, 1, 1, 1, true);
    }

    // Copas, platos y sillas integrados al batch estático por material
    const plateGeo = new THREE.CylinderGeometry(0.2, 0.16, 0.03, 14);
    const gobletGeo = new THREE.CylinderGeometry(0.07, 0.04, 0.2, 10);
    const seatGeo = new THREE.BoxGeometry(0.56, 0.52, 0.56);
    const backGeo = new THREE.BoxGeometry(0.56, 0.72, 0.12);
    this.#tempGeos.push(plateGeo, gobletGeo, seatGeo, backGeo);

    const chairTransforms = [];
    for (let i = 0; i < 4; i++) {
      const cz = z - 3.6 + i * 2.4;
      chairTransforms.push({ px: x - 1.65, pz: cz, rotY: Math.PI / 2, plateX: x - 0.92, plateZ: cz });
      chairTransforms.push({ px: x + 1.65, pz: cz, rotY: -Math.PI / 2, plateX: x + 0.92, plateZ: cz });
    }
    chairTransforms.push({ px: x, pz: z - 5.7, rotY: 0, plateX: x, plateZ: z - 4.75 });
    chairTransforms.push({ px: x, pz: z + 5.7, rotY: Math.PI, plateX: x, plateZ: z + 4.75 });

    for (let i = 0; i < chairTransforms.length; i++) {
      const c = chairTransforms[i];
      this.#addStaticMesh(plateGeo, mats.roseGold, c.plateX, yBase + 0.93, c.plateZ, false, true, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(gobletGeo, mats.crystal, c.plateX + (c.plateX > x ? -0.18 : 0.18), yBase + 1.02, c.plateZ + 0.15, false, false, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(seatGeo, mats.velvet, c.px, yBase + 0.26, c.pz, false, true, 0, c.rotY, 0, 1, 1, 1, true);

      const backOffsetX = -Math.sin(c.rotY) * 0.24;
      const backOffsetZ = -Math.cos(c.rotY) * 0.24;
      this.#addStaticMesh(backGeo, mats.roseGold, c.px + backOffsetX, yBase + 0.85, c.pz + backOffsetZ, false, true, 0, c.rotY, 0, 1, 1, 1, true);
    }

    // Un único collider AABB limpio alrededor del conjunto
    this.#collision.addBox(x - 2.1, x + 2.1, yBase, yBase + 1.2, z - 6.05, z + 6.05);
  }

  // =========================================================================
  // 5. BIBLIOTECA REAL Y SALA DE TÉ (Planta Alta Derecha, X ∈ [14.5, 36], Y = 7.5)
  // =========================================================================
  #buildRoyalLibraryAndTeaSalon(mats) {
    const y = 7.5;
    const bookRecords = [];

    // Estantería alta Norte (Z = -53.1, X ∈ [16.5, 34.5])
    this.#buildBookcaseRow(25.5, y, -53.1, 17.6, 5.2, 1.0, 0, mats, bookRecords);

    // Estanterías altas Este (muro X = 35.1, dejando libre puerta balcón Z ∈ [-38.1, -33.9])
    this.#buildBookcaseRow(35.1, y, -46.2, 11.4, 5.2, 1.0, Math.PI / 2, mats, bookRecords);
    this.#buildBookcaseRow(35.1, y, -27.5, 9.6, 5.2, 1.0, Math.PI / 2, mats, bookRecords);

    // InstancedMesh único para cientos de libros multicolores
    this.#buildInstancedBooks(bookRecords, mats);

    // 2 globos terráqueos dorados giratorios sobre pedestales
    const globePedGeo = new THREE.CylinderGeometry(0.55, 0.65, 1.25, 14);
    const globeRingGeo = new THREE.TorusGeometry(0.62, 0.045, 8, 24);
    const globeSphereGeo = this.#trackGeo(new THREE.SphereGeometry(0.52, 18, 14));
    this.#tempGeos.push(globePedGeo, globeRingGeo);

    for (let i = 0; i < 2; i++) {
      const gx = i === 0 ? 20.5 : 30.5;
      const gz = -49.0;
      this.#addStaticMesh(globePedGeo, mats.marble, gx, y + 0.625, gz, false, true, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(globeRingGeo, mats.roseGold, gx, y + 1.92, gz, false, true, 0, 0, 0, 1, 1, 1, true);
      const sphere = new THREE.Mesh(globeSphereGeo, mats.globeMat);
      sphere.position.set(gx, y + 1.92, gz);
      sphere.rotation.z = 0.28;
      sphere.castShadow = false;
      sphere.receiveShadow = true;
      this.#root.add(sphere);
      this.#globes.push(sphere);
      this.#collision.addCylinderCollider(gx, gz, 0.7, y, y + 2.6);
    }

    // Sala de Té en (26, 7.5, -31)
    this.#addStaticMesh(new THREE.CylinderGeometry(4.0, 4.0, 0.04, 32), mats.blushSilk, 26, y + 0.02, -31, false, true);
    this.#addStaticMesh(new THREE.CylinderGeometry(3.1, 3.1, 0.05, 32), mats.creamSilk, 26, y + 0.025, -31, false, true);

    // Mesa central de té con tetera de porcelana, tazas y bandeja de pastelitos
    this.#addStaticMesh(new THREE.CylinderGeometry(0.18, 0.42, 0.78, 12), mats.roseGold, 26, y + 0.39, -31, false, true);
    this.#addStaticMesh(new THREE.CylinderGeometry(1.32, 1.32, 0.08, 24), mats.marble, 26, y + 0.82, -31, false, true);
    this.#collision.addCylinderCollider(26, -31, 1.38, y, y + 1.4);

    this.#buildTeaService(26, y + 0.86, -31, mats);

    // 4 sillones de terciopelo alrededor de la mesa de té (todos con minY = 7.5)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const cx = 26 + Math.cos(a) * 2.55;
      const cz = -31 + Math.sin(a) * 2.55;
      this.#buildVelvetArmchair(cx, y, cz, Math.atan2(26 - cx, -31 - cz), mats);
    }

    this.#addGlowSpot(26, y, -33, 6.8);
    this.#addGlowSpot(25.5, y, -48, 5.8);
  }

  #buildBookcaseRow(x, yBase, z, length, height, depth, rotY, mats, bookRecords) {
    const parentMat = new THREE.Matrix4().compose(
      new THREE.Vector3(x, yBase, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
      new THREE.Vector3(1, 1, 1)
    );
    const localObj = new THREE.Object3D();
    const pushLocal = (geo, mat, lx, ly, lz, sharedGeo = false) => {
      localObj.position.set(lx, ly, lz);
      localObj.rotation.set(0, 0, 0);
      localObj.scale.set(1, 1, 1);
      localObj.updateMatrix();
      const worldMat = new THREE.Matrix4().multiplyMatrices(parentMat, localObj.matrix);
      this.#addStaticPiece(geo, mat, worldMat, false, true, sharedGeo);
    };

    // Trasera, laterales y cornisa
    pushLocal(new THREE.BoxGeometry(length, height, 0.14), mats.mahogany, 0, height / 2, -depth / 2 + 0.07);
    pushLocal(new THREE.BoxGeometry(length + 0.25, 0.24, depth + 0.15), mats.roseGold, 0, height + 0.12, 0);

    // Montantes verticales cada ~2.4m
    const bays = Math.max(2, Math.round(length / 2.4));
    const bayW = length / bays;
    const uprightGeo = new THREE.BoxGeometry(0.14, height, depth);
    this.#tempGeos.push(uprightGeo);
    for (let i = 0; i <= bays; i++) {
      pushLocal(uprightGeo, mats.mahogany, -length / 2 + i * bayW, height / 2, 0, true);
    }

    // 5 estantes horizontales
    const shelfLevels = [0.22, 1.18, 2.14, 3.1, 4.06];
    const shelfGeo = new THREE.BoxGeometry(length, 0.08, depth);
    this.#tempGeos.push(shelfGeo);
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);

    for (const sy of shelfLevels) {
      pushLocal(shelfGeo, mats.mahogany, 0, sy, 0, true);

      // Registrar libros por cada vano
      for (let b = 0; b < bays; b++) {
        const bayStart = -length / 2 + b * bayW + 0.14;
        const bayEnd = -length / 2 + (b + 1) * bayW - 0.14;
        let lx = bayStart;
        while (lx < bayEnd - 0.12) {
          const bw = 0.07 + ((Math.abs(Math.sin(lx * 13.7 + sy * 7.1)) * 0.07));
          const bh = 0.42 + ((Math.abs(Math.cos(lx * 9.3 + sy * 3.7)) * 0.34));
          const bd = 0.46 + ((Math.abs(Math.sin(lx * 5.1 + b)) * 0.12));
          const cxLocal = lx + bw / 2;
          const czLocal = 0.06;

          const wx = x + cxLocal * cos + czLocal * sin;
          const wz = z - cxLocal * sin + czLocal * cos;
          bookRecords.push({
            x: wx,
            y: yBase + sy + 0.04 + bh / 2,
            z: wz,
            w: bw,
            h: bh,
            d: bd,
            rotY
          });
          lx += bw + 0.012;
        }
      }
    }

    const absCos = Math.abs(cos);
    const absSin = Math.abs(sin);
    const hw = (length * absCos + depth * absSin) / 2;
    const hd = (length * absSin + depth * absCos) / 2;
    this.#collision.addBox(x - hw, x + hw, yBase, yBase + height + 0.2, z - hd, z + hd);
  }

  #buildInstancedBooks(bookRecords, mats) {
    if (bookRecords.length === 0) return;
    const geo = this.#trackGeo(new THREE.BoxGeometry(1, 1, 1));
    const inst = new THREE.InstancedMesh(geo, mats.bookMat, bookRecords.length);
    inst.castShadow = false;
    inst.receiveShadow = true;
    const dummy = this.#dummy;
    const palette = [
      new THREE.Color(0xc22b64),
      new THREE.Color(0xf28db8),
      new THREE.Color(0x5574b8),
      new THREE.Color(0x479472),
      new THREE.Color(0x8e5fb8),
      new THREE.Color(0xe6be7a),
      new THREE.Color(0xf5e8ea)
    ];

    for (let i = 0; i < bookRecords.length; i++) {
      const r = bookRecords[i];
      dummy.position.set(r.x, r.y, r.z);
      dummy.rotation.set(0, r.rotY, 0);
      dummy.scale.set(r.w, r.h, r.d);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      inst.setColorAt(i, palette[(i * 7 + Math.floor(r.y * 3)) % palette.length]);
    }

    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.matrixAutoUpdate = false;
    inst.updateMatrix();
    this.#root.add(inst);
    this.#instancedMeshes.push(inst);
  }

  #buildTeaService(x, yTop, z, mats) {
    // Tetera de porcelana
    this.#addStaticMesh(new THREE.SphereGeometry(0.18, 12, 10), mats.porcelain, x - 0.25, yTop + 0.16, z, false, true);
    this.#addStaticMesh(new THREE.SphereGeometry(0.06, 8, 8), mats.roseGold, x - 0.25, yTop + 0.35, z, false, true);
    this.#addStaticMesh(new THREE.CylinderGeometry(0.02, 0.04, 0.18, 8), mats.porcelain, x - 0.08, yTop + 0.2, z, false, true, 0, 0, -0.8);

    // Bandeja escalonada de pastelitos
    this.#addStaticMesh(new THREE.CylinderGeometry(0.025, 0.04, 0.36, 8), mats.roseGold, x + 0.3, yTop + 0.18, z - 0.12, false, true);
    this.#addStaticMesh(new THREE.CylinderGeometry(0.28, 0.28, 0.025, 14), mats.porcelain, x + 0.3, yTop + 0.14, z - 0.12, false, true);
    this.#addStaticMesh(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 14), mats.porcelain, x + 0.3, yTop + 0.3, z - 0.12, false, true);

    const pastryGeo = new THREE.SphereGeometry(0.045, 8, 6);
    const saucerGeo = new THREE.CylinderGeometry(0.11, 0.08, 0.02, 10);
    const cupGeo = new THREE.CylinderGeometry(0.065, 0.045, 0.08, 10);
    this.#tempGeos.push(pastryGeo, saucerGeo, cupGeo);

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      this.#addStaticMesh(pastryGeo, mats.pastryFrosting, x + 0.3 + Math.cos(a) * 0.16, yTop + 0.18, z - 0.12 + Math.sin(a) * 0.16, false, true, 0, 0, 0, 1, 1, 1, true);
    }

    // 4 tazas y platillos
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const cx = x + Math.cos(a) * 0.82;
      const cz = z + Math.sin(a) * 0.82;
      this.#addStaticMesh(saucerGeo, mats.porcelain, cx, yTop + 0.01, cz, false, true, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(cupGeo, mats.porcelain, cx, yTop + 0.06, cz, false, true, 0, 0, 0, 1, 1, 1, true);
    }
  }

  #buildVelvetArmchair(x, yBase, z, rotY, mats) {
    const parentMat = new THREE.Matrix4().compose(
      new THREE.Vector3(x, yBase, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
      new THREE.Vector3(1, 1, 1)
    );
    const localObj = new THREE.Object3D();
    const pushLocal = (geo, mat, lx, ly, lz, sharedGeo = false) => {
      localObj.position.set(lx, ly, lz);
      localObj.rotation.set(0, 0, 0);
      localObj.scale.set(1, 1, 1);
      localObj.updateMatrix();
      const worldMat = new THREE.Matrix4().multiplyMatrices(parentMat, localObj.matrix);
      this.#addStaticPiece(geo, mat, worldMat, false, true, sharedGeo);
    };

    pushLocal(new THREE.BoxGeometry(0.95, 0.44, 0.92), mats.velvet, 0, 0.28, 0);
    pushLocal(new THREE.BoxGeometry(0.95, 0.72, 0.2), mats.velvet, 0, 0.76, -0.36);
    const armGeo = new THREE.BoxGeometry(0.16, 0.36, 0.86);
    this.#tempGeos.push(armGeo);
    pushLocal(armGeo, mats.roseGold, -0.42, 0.54, 0, true);
    pushLocal(armGeo, mats.roseGold, 0.42, 0.54, 0, true);

    this.#collision.addCylinderCollider(x, z, 0.62, yBase, yBase + 1.25);
  }

  #buildInstancedDressesAndPerfumes(mats) {
    const dummy = this.#dummy;
    const col = new THREE.Color();

    if (this.#dressRecords.length > 0) {
      const skirtGeo = this.#trackGeo(new THREE.ConeGeometry(1, 1, 14));
      const bodiceGeo = this.#trackGeo(new THREE.CylinderGeometry(0.76, 1, 1, 12));
      const skirtInst = new THREE.InstancedMesh(skirtGeo, mats.dressMat, this.#dressRecords.length);
      const bodiceInst = new THREE.InstancedMesh(bodiceGeo, mats.dressMat, this.#dressRecords.length);

      for (let i = 0; i < this.#dressRecords.length; i++) {
        const d = this.#dressRecords[i];
        col.setHex(d.colorHex);

        dummy.rotation.set(0, 0, 0);
        dummy.position.set(d.x, d.skirtY, d.z);
        dummy.scale.set(d.skirtR, d.skirtH, d.skirtR);
        dummy.updateMatrix();
        skirtInst.setMatrixAt(i, dummy.matrix);
        skirtInst.setColorAt(i, col);

        dummy.position.set(d.x, d.bodiceY, d.z);
        dummy.scale.set(d.bodiceR, d.bodiceH, d.bodiceR);
        dummy.updateMatrix();
        bodiceInst.setMatrixAt(i, dummy.matrix);
        bodiceInst.setColorAt(i, col);
      }

      for (const inst of [skirtInst, bodiceInst]) {
        inst.castShadow = false;
        inst.receiveShadow = true;
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        inst.computeBoundingSphere();
        inst.matrixAutoUpdate = false;
        inst.updateMatrix();
        this.#root.add(inst);
        this.#instancedMeshes.push(inst);
      }
      this.#dressRecords.length = 0;
    }

    if (this.#perfumeRecords.length > 0) {
      const bottleGeo = this.#trackGeo(new THREE.CylinderGeometry(0.09, 0.11, 0.24, 10));
      const inst = new THREE.InstancedMesh(bottleGeo, mats.perfumeMat, this.#perfumeRecords.length);
      for (let i = 0; i < this.#perfumeRecords.length; i++) {
        const p = this.#perfumeRecords[i];
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
        col.setHex(p.colorHex);
        inst.setColorAt(i, col);
      }
      inst.castShadow = false;
      inst.receiveShadow = true;
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.computeBoundingSphere();
      inst.matrixAutoUpdate = false;
      inst.updateMatrix();
      this.#root.add(inst);
      this.#instancedMeshes.push(inst);
      this.#perfumeRecords.length = 0;
    }
  }

  #buildInstancedCandleFlames(mats) {
    if (this.#candleFlameRecords.length === 0) return;
    const flameGeo = this.#trackGeo(new THREE.SphereGeometry(0.075, 8, 8));
    const inst = new THREE.InstancedMesh(flameGeo, mats.flameMat, this.#candleFlameRecords.length);
    inst.castShadow = false;
    inst.receiveShadow = false;
    this.#candleFlameInst = inst;
    this.#updateCandleFlames(0);
    inst.computeBoundingSphere();
    this.#root.add(inst);
    this.#instancedMeshes.push(inst);
  }

  #updateCandleFlames(elapsed) {
    if (!this.#candleFlameInst || this.#candleFlameRecords.length === 0) return;
    const dummy = this.#dummy;
    dummy.rotation.set(0, 0, 0);

    for (let i = 0; i < this.#candleFlameRecords.length; i++) {
      const f = this.#candleFlameRecords[i];
      const pulse = 1.0 + Math.sin(elapsed * 6.5 + f.phase) * 0.12;
      const sx = 0.8 * f.baseScale * pulse;
      const sy = 1.35 * f.baseScale * pulse;
      if (f.chandelierIdx >= 0) {
        const meta = this.#chandelierMeta[f.chandelierIdx];
        const yaw = this.#chandeliers[f.chandelierIdx].rotation.y;
        const c = Math.cos(yaw);
        const s = Math.sin(yaw);
        dummy.position.set(
          meta.x + f.lx * c + f.lz * s,
          meta.y + f.ly,
          meta.z - f.lx * s + f.lz * c
        );
      } else {
        dummy.position.set(f.x, f.y, f.z);
      }
      dummy.scale.set(sx, sy, sx);
      dummy.updateMatrix();
      this.#candleFlameInst.setMatrixAt(i, dummy.matrix);
    }
    this.#candleFlameInst.instanceMatrix.needsUpdate = true;
  }

  #buildInstancedGlowDiscs() {
    if (this.#glowRecords.length === 0) return;
    const geo = this.#trackGeo(new THREE.PlaneGeometry(2, 2));
    geo.rotateX(-Math.PI / 2);
    const inst = new THREE.InstancedMesh(geo, this.#glowMat, this.#glowRecords.length);
    inst.castShadow = false;
    inst.receiveShadow = false;
    const dummy = this.#dummy;
    for (let i = 0; i < this.#glowRecords.length; i++) {
      const g = this.#glowRecords[i];
      dummy.position.set(g.x, g.y, g.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(g.radius, 1, g.radius);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.matrixAutoUpdate = false;
    inst.updateMatrix();
    this.#root.add(inst);
    this.#instancedMeshes.push(inst);
    this.#glowRecords.length = 0;
  }

  applyTheme(theme) {
    if (!theme) return;
    if (this.#crystalMat && typeof theme.crystalEmissive === 'number') {
      this.#crystalMat.emissiveIntensity = Math.min(0.75, theme.crystalEmissive);
    }
    if (this.#glowMat) {
      this.#glowMat.opacity = Math.min(0.42, 0.18 + (theme.lanternIntensity ?? 1) * 0.14);
    }
    for (const entry of this.#lights) {
      entry.light.intensity = entry.baseIntensity * (0.65 + (theme.lanternIntensity ?? 1) * 0.35);
    }
  }

  update(dt, elapsed) {
    for (let i = 0; i < this.#chandeliers.length; i++) {
      this.#chandeliers[i].rotation.y = Math.sin(elapsed * 0.35 + i * 1.1) * 0.14;
    }
    for (const gem of this.#floatingGems) {
      gem.mesh.rotation.y = elapsed * 0.9 + gem.phase;
      gem.mesh.position.y = gem.baseY + Math.sin(elapsed * 1.8 + gem.phase) * 0.12;
    }
    for (let i = 0; i < this.#globes.length; i++) {
      this.#globes[i].rotation.y = elapsed * (0.28 + i * 0.08);
    }
    this.#updateCandleFlames(elapsed);
  }

  dispose() {
    for (const inst of this.#instancedMeshes) {
      if (typeof inst.dispose === 'function') inst.dispose();
    }
    for (const g of this.#geometries) g.dispose();
    for (const g of this.#tempGeos) g.dispose();
    for (const m of this.#materials) m.dispose();
    for (const t of this.#ownedTextures) t.dispose();
    this.#instancedMeshes.length = 0;
    this.#geometries.length = 0;
    this.#tempGeos.length = 0;
    this.#materials.length = 0;
    this.#ownedTextures.length = 0;
    this.#staticBuckets.clear();
    this.#lights.length = 0;
    this.#glowRecords.length = 0;
    this.#glowMat = null;
    this.#chandeliers.length = 0;
    this.#chandelierMeta.length = 0;
    this.#floatingGems.length = 0;
    this.#globes.length = 0;
    this.#candleFlameRecords.length = 0;
    this.#candleFlameInst = null;
    this.#dressRecords.length = 0;
    this.#perfumeRecords.length = 0;
    this.#root = null;
  }
}
