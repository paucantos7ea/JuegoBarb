import * as THREE from 'three';
import { CastleRooms } from './CastleRooms.js';
import {
  bakeProceduralVertexAO,
  createLumenMaterial,
  createInstancedVolumetricHalos,
  ensureVertexColors
} from '../core/LumenArtPipeline.js';

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
  let hasColors = false;

  for (let i = 0; i < pieces.length; i++) {
    const { geometry, matrix } = pieces[i];
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (!g.attributes.normal) {
      g.computeVertexNormals();
    }
    if (g.attributes.color) {
      hasColors = true;
    }
    if (matrix) {
      g.applyMatrix4(matrix);
      if (matrix.determinant() < 0) {
        const pos = g.attributes.position;
        const norm = g.attributes.normal;
        const uv = g.attributes.uv;
        const col = g.attributes.color;
        for (let v = 0; v < pos.count; v += 3) {
          const v1 = v + 1;
          const v2 = v + 2;
          swapAttr3(pos, v1, v2);
          if (norm) swapAttr3(norm, v1, v2);
          if (uv) swapAttr2(uv, v1, v2);
          if (col) swapAttr3(col, v1, v2);
        }
      }
    }
    totalVerts += g.attributes.position.count;
    normalized.push(g);
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const colors = hasColors ? new Float32Array(totalVerts * 3) : null;

  let offset = 0;
  for (let i = 0; i < normalized.length; i++) {
    const g = normalized[i];
    const pos = g.attributes.position;
    const norm = g.attributes.normal;
    const uv = g.attributes.uv;
    const col = g.attributes.color;
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
      if (colors) {
        if (col) {
          colors[i3] = col.getX(v);
          colors[i3 + 1] = col.getY(v);
          colors[i3 + 2] = col.getZ(v);
        } else {
          colors[i3] = 1;
          colors[i3 + 1] = 1;
          colors[i3 + 2] = 1;
        }
      }
    }
    offset += count;
    g.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (colors) {
    merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

/**
 * Arquitecto del Gran Palacio de Cristal ("Reino Rosa Imperial"):
 * Cimentación, pórtico, muros con puertas amplias, doble escalinata curva,
 * galería perimetral superior, balcones, bóveda de cristal rosado, 6 torres
 * y coordinación con las 5 estancias reales de CastleRooms.
 */
export class CastleBuilder {
  #scene;
  #textures;
  #collision;
  #root = null;
  #rooms = null;
  #materials = [];
  #geometries = [];
  #instancedMeshes = [];
  #balusters = [];
  #staticBuckets = new Map();
  #tempGeos = [];
  #dummy = new THREE.Object3D();
  #danceFloorMat = null;
  #crystalMat = null;
  #vaultCrystalMat = null;
  #stainedMat = null;
  #lights = [];
  #elapsed = 0;

  constructor(scene, textureFactory, collisionSystem) {
    this.#scene = scene;
    this.#textures = textureFactory;
    this.#collision = collisionSystem;
  }

  init() {
    this.#root = new THREE.Group();
    this.#root.name = 'CrystalPalace';
    const mats = this.#createMaterials();

    this.#buildFoundationAndPortico(mats);
    this.#buildWallsAndArches(mats);
    this.#buildStaircaseAndUpperGallery(mats);
    this.#buildExteriorBalconies(mats);
    this.#buildVaultedRoofAndTowers(mats);
    this.#flushStaticBuckets();
    this.#buildInstancedBalusters(mats);
    this.#buildArchitecturalHalos();

    this.#rooms = new CastleRooms(this.#root, this.#textures, this.#collision, mats);
    this.#rooms.init();

    ensureVertexColors(this.#root, { aoStrength: 0.28, shadowTint: 0x261b48 });

    this.#root.matrixAutoUpdate = false;
    this.#root.updateMatrix();
    this.#scene.add(this.#root);
  }

  #createMaterials() {
    const marble = createLumenMaterial({
      map: this.#textures.getTexture('marble', 4, 3),
      roughness: 0.28,
      metalness: 0.04,
      vertexColors: true
    }, {
      rimStrength: 0.28,
      shadowLiftStrength: 0.15,
      cacheTag: 'castle_marble'
    });

    const marbleFloor = createLumenMaterial({
      map: this.#textures.getTexture('marbleFloor', 14, 9),
      roughness: 0.22,
      metalness: 0.06
    }, {
      rimStrength: 0.18,
      shadowLiftStrength: 0.14,
      cacheTag: 'castle_marble_floor'
    });

    const roseGold = createLumenMaterial({
      map: this.#textures.getTexture('roseGold', 1, 1),
      color: 0xf4b6a8,
      metalness: 0.88,
      roughness: 0.18,
      vertexColors: true
    }, {
      rimStrength: 0.28,
      shadowLiftStrength: 0.15,
      preserveRoughness: true,
      cacheTag: 'castle_rosegold'
    });

    const crystal = new THREE.MeshStandardMaterial({
      color: 0xffd9f2,
      emissive: 0xe684c4,
      emissiveIntensity: 0.42,
      roughness: 0.15,
      metalness: 0.25,
      transparent: true,
      opacity: 0.34
    });
    crystal.userData.preserveRoughness = true;

    const vaultCrystal = new THREE.MeshStandardMaterial({
      color: 0xffd2ec,
      emissive: 0xc95ea2,
      emissiveIntensity: 0.14,
      roughness: 0.15,
      metalness: 0.25,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    vaultCrystal.userData.preserveRoughness = true;

    const stained = createLumenMaterial({
      map: this.#textures.getTexture('stainedCrystal', 1, 2),
      emissive: 0xffb8df,
      emissiveIntensity: 0.22,
      roughness: 0.18,
      metalness: 0.12,
      transparent: true,
      opacity: 0.84
    }, {
      warmWindow: true,
      windowGlowStrength: 1.15,
      windowCoreColor: 0xffd082,
      windowEdgeColor: 0xf47ec4,
      preserveRoughness: true,
      cacheTag: 'castle_stained'
    });

    const carpet = new THREE.MeshStandardMaterial({
      map: this.#textures.getTexture('carpet', 1, 5),
      roughness: 0.85,
      metalness: 0.02
    });

    const danceFloor = new THREE.MeshStandardMaterial({
      map: this.#textures.getTexture('danceFloor', 4, 5),
      emissive: 0xd968b4,
      emissiveIntensity: 0.45,
      roughness: 0.12,
      metalness: 0.24
    });
    danceFloor.userData.preserveRoughness = true;

    const velvet = createLumenMaterial({
      color: 0xc23c81,
      roughness: 0.78,
      metalness: 0.05
    }, {
      rimStrength: 0.28,
      shadowLiftStrength: 0.15,
      cacheTag: 'castle_velvet'
    });

    this.#crystalMat = crystal;
    this.#vaultCrystalMat = vaultCrystal;
    this.#stainedMat = stained;
    this.#danceFloorMat = danceFloor;

    this.#materials.push(
      marble,
      marbleFloor,
      roseGold,
      crystal,
      vaultCrystal,
      stained,
      carpet,
      danceFloor,
      velvet
    );

    return {
      marble,
      marbleFloor,
      roseGold,
      crystal,
      vaultCrystal,
      stained,
      carpet,
      danceFloor,
      velvet
    };
  }

  #trackGeo(geo) {
    this.#geometries.push(geo);
    return geo;
  }

  #addMesh(geo, mat, x, y, z, castShadow = true, receiveShadow = true, rotX = 0, rotY = 0, rotZ = 0, sx = 1, sy = 1, sz = 1, sharedGeo = false) {
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

  #addBox(w, h, d, x, y, z, mat, castShadow = true, addCollider = false, receiveShadow = true) {
    this.#addMesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, castShadow, receiveShadow);
    if (addCollider) {
      this.#collision.addBox(x - w / 2, x + w / 2, y - h / 2, y + h / 2, z - d / 2, z + d / 2);
    }
  }

  #addWallSegment(minX, maxX, minY, maxY, minZ, maxZ, mat, castShadow = true) {
    const w = maxX - minX;
    const h = maxY - minY;
    const d = maxZ - minZ;
    this.#addBox(w, h, d, (minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2, mat, castShadow, true);
  }

  #addColumn(x, yBase, z, height, radius, mats, addCollider = true) {
    const shaftGeo = new THREE.CylinderGeometry(radius * 0.88, radius, height, 14, 3);
    const capGeo = new THREE.CylinderGeometry(radius * 1.32, radius * 0.92, 0.45, 14);
    bakeProceduralVertexAO(shaftGeo, { aoStrength: 0.42, baseWeight: 0.65, shadowTint: 0x261b48 });
    bakeProceduralVertexAO(capGeo, { aoStrength: 0.30, shadowTint: 0x261b48 });
    this.#tempGeos.push(shaftGeo, capGeo);

    this.#addMesh(shaftGeo, mats.marble, x, yBase + height / 2, z, true, true, 0, 0, 0, 1, 1, 1, true);
    this.#addMesh(capGeo, mats.roseGold, x, yBase + height - 0.18, z, false, true, 0, 0, 0, 1, 1, 1, true);
    this.#addMesh(capGeo, mats.roseGold, x, yBase + 0.2, z, false, true, 0, 0, 0, 1, 1, 1, true);

    if (addCollider) {
      this.#collision.addCylinderCollider(x, z, radius * 1.08, yBase, yBase + height);
    }
  }

  #addRailing(minX, maxX, minZ, maxZ, yBase, mats) {
    const dx = maxX - minX;
    const dz = maxZ - minZ;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const railH = 1.15;

    // Zócalo inferior y pasamano superior oro rosa
    this.#addBox(Math.max(0.22, dx), 0.16, Math.max(0.22, dz), cx, yBase + 0.08, cz, mats.marble, false, false);
    this.#addBox(Math.max(0.24, dx), 0.12, Math.max(0.24, dz), cx, yBase + railH, cz, mats.roseGold, false, false);
    this.#collision.addBox(
      cx - Math.max(0.15, dx / 2),
      cx + Math.max(0.15, dx / 2),
      yBase,
      yBase + 1.2,
      cz - Math.max(0.15, dz / 2),
      cz + Math.max(0.15, dz / 2)
    );

    // Registrar balaustres para el InstancedMesh
    const span = Math.max(dx, dz);
    const count = Math.max(2, Math.floor(span / 0.72));
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const bx = dx >= dz ? minX + dx * t : cx;
      const bz = dz > dx ? minZ + dz * t : cz;
      this.#balusters.push({ x: bx, y: yBase + 0.62, z: bz });
    }
  }

  // =========================================================================
  // 1. CIMENTACIÓN Y PÓRTICO
  // =========================================================================
  #buildFoundationAndPortico(mats) {
    // Cuerpo principal: 72 x 32 (X ∈ [-36, 36], Z ∈ [-54, -22], suelo Y = 1.0)
    this.#addBox(72, 1.0, 32, 0, 0.5, -38, mats.marbleFloor, false, false);
    this.#collision.addFlatSurface(-36, 36, -54, -22, 1.0);

    // Ábside Norte (Salón del Trono Real): 40 x 22 (X ∈ [-20, 20], Z ∈ [-76, -54], suelo Y = 1.0)
    this.#addBox(40, 1.0, 22, 0, 0.5, -65, mats.marbleFloor, false, false);
    this.#collision.addFlatSurface(-20, 20, -76, -54, 1.0);

    // Escalinata frontal exterior: X ∈ [-8.0, 8.0], Z ∈ [-22.0, -16.8], Y = 0.0 -> 1.0
    for (let i = 0; i < 5; i++) {
      const h = (i + 1) * 0.2;
      const zCenter = -17.3 - i * 1.0;
      const w = 16.0 - i * 0.1;
      const stepGeo = new THREE.BoxGeometry(w, h, 1.06);
      const trimGeo = new THREE.BoxGeometry(w + 0.06, 0.04, 0.14);
      bakeProceduralVertexAO(stepGeo, { aoStrength: 0.34, baseWeight: 0.65, shadowTint: 0x261b48 });
      bakeProceduralVertexAO(trimGeo, { aoStrength: 0.24, shadowTint: 0x261b48 });
      this.#addMesh(stepGeo, mats.marble, 0, h / 2, zCenter, true, true);
      this.#addMesh(trimGeo, mats.roseGold, 0, h, zCenter + 0.46, false, true);
    }
    this.#collision.addRampSurface(-7.8, 7.8, -22.3, -16.5, 'z', -16.8, -21.8, 0.0, 1.0);

    // Pedestales / terrazas laterales frontales en Z ∈ [-22.0, -17.6], X < -8 y X > 8
    this.#addBox(28.0, 1.1, 4.4, -22.0, 0.55, -19.8, mats.marble, true, true);
    this.#addBox(28.0, 1.1, 4.4, 22.0, 0.55, -19.8, mats.marble, true, true);
    this.#collision.addFlatSurface(-36.0, -8.0, -22.0, -17.6, 1.1);
    this.#collision.addFlatSurface(8.0, 36.0, -22.0, -17.6, 1.1);
    // Balaustrada frontal elegante en las terrazas laterales (despeja columnas en X = ±9.2)
    this.#addRailing(-35.4, -10.2, -18.0, -17.8, 1.1, mats);
    this.#addRailing(10.2, 35.4, -18.0, -17.8, 1.1, mats);

    // Escalera Este exterior desde Salón de Baile hacia Terraza Exterior
    // Puerta en X = 36, Z ∈ [-38.3, -33.7]; escalinata en X ∈ [36.0, 39.5]
    for (let i = 0; i < 5; i++) {
      const h = (i + 1) * 0.2;
      const xCenter = 39.06 - i * 0.68;
      const stepGeo = new THREE.BoxGeometry(0.72, h, 4.6);
      const trimGeo = new THREE.BoxGeometry(0.12, 0.04, 4.64);
      bakeProceduralVertexAO(stepGeo, { aoStrength: 0.34, baseWeight: 0.65, shadowTint: 0x261b48 });
      bakeProceduralVertexAO(trimGeo, { aoStrength: 0.24, shadowTint: 0x261b48 });
      this.#addMesh(stepGeo, mats.marble, xCenter, h / 2, -36.0, true, true);
      this.#addMesh(trimGeo, mats.roseGold, xCenter + 0.3, h, -36.0, false, true);
    }
    this.#collision.addRampSurface(35.8, 39.8, -38.3, -33.7, 'x', 39.4, 36.0, 0.0, 1.0);
    // Zancas laterales de la escalera exterior Este
    this.#addBox(3.6, 0.85, 0.28, 37.8, 0.425, -38.45, mats.roseGold, false, true);
    this.#addBox(3.6, 0.85, 0.28, 37.8, 0.425, -33.55, mats.roseGold, false, true);
  }

  // =========================================================================
  // 2. MUROS, VENTANALES Y PUERTAS AMPLIAS (>= 4.2m)
  // =========================================================================
  #buildWallsAndArches(mats) {
    // --- FACHADA SUR (Z = -22, Y = 1.0 -> 15.0) ---
    // Planta Baja (Y = 1.0 -> 7.5): Gran arco central abierto en X ∈ [-4.4, 4.4] (8.8m)
    this.#addWallSegment(-36.0, -4.4, 1.0, 7.5, -22.5, -21.5, mats.marble, true);
    this.#addWallSegment(4.4, 36.0, 1.0, 7.5, -22.5, -21.5, mats.marble, true);
    this.#addWallSegment(-4.4, 4.4, 7.2, 7.5, -22.55, -21.45, mats.roseGold, false);

    // Planta Alta (Y = 7.5 -> 15.0): Puerta al balcón abierta en X ∈ [-3.2, 3.2] (6.4m)
    this.#addWallSegment(-36.0, -3.2, 7.5, 15.0, -22.5, -21.5, mats.marble, true);
    this.#addWallSegment(3.2, 36.0, 7.5, 15.0, -22.5, -21.5, mats.marble, true);
    this.#addWallSegment(-3.2, 3.2, 13.5, 15.0, -22.5, -21.5, mats.marble, true);
    // Marcos dorados del pórtico
    this.#addBox(0.35, 6.2, 1.25, -4.4, 4.1, -22.0, mats.roseGold, false, false);
    this.#addBox(0.35, 6.2, 1.25, 4.4, 4.1, -22.0, mats.roseGold, false, false);
    this.#addBox(0.3, 6.0, 1.2, -3.2, 10.5, -22.0, mats.roseGold, false, false);
    this.#addBox(0.3, 6.0, 1.2, 3.2, 10.5, -22.0, mats.roseGold, false, false);
    this.#addBox(6.8, 0.45, 1.25, 0, 13.5, -22.0, mats.roseGold, false, false);

    // Ventanales fachada Sur (2 plantas)
    for (const wx of [-30, -24, -17.5, -10.5, 10.5, 17.5, 24, 30]) {
      this.#addStainedWindowZ(wx, 4.2, -21.45, 3.0, 4.4, mats);
      this.#addStainedWindowZ(wx, 11.0, -21.45, 3.0, 4.2, mats);
    }

    // --- MURO EXTERIOR OESTE (X = -36, Z ∈ [-54, -22]) ---
    // Planta Baja: muro completo
    this.#addWallSegment(-36.5, -35.5, 1.0, 7.5, -54.0, -22.0, mats.marble, true);
    // Planta Alta: puerta abierta al Balcón Oeste en Z ∈ [-38.1, -33.9] (4.2m)
    this.#addWallSegment(-36.5, -35.5, 7.5, 15.0, -33.9, -22.0, mats.marble, true);
    this.#addWallSegment(-36.5, -35.5, 7.5, 15.0, -54.0, -38.1, mats.marble, true);
    this.#addWallSegment(-36.5, -35.5, 13.5, 15.0, -38.1, -33.9, mats.marble, true);
    this.#addBox(1.2, 6.0, 0.3, -36.0, 10.5, -38.1, mats.roseGold, false, false);
    this.#addBox(1.2, 6.0, 0.3, -36.0, 10.5, -33.9, mats.roseGold, false, false);

    for (const wz of [-48, -42, -35, -28]) {
      this.#addStainedWindowX(-36.55, 4.2, wz, 3.2, 4.4, mats);
    }
    for (const wz of [-49, -43, -28]) {
      this.#addStainedWindowX(-36.55, 11.0, wz, 3.0, 4.2, mats);
    }

    // --- MURO EXTERIOR ESTE (X = +36, Z ∈ [-54, -22]) ---
    // Planta Baja: puerta abierta a escalera exterior Este en Z ∈ [-38.3, -33.7] (4.6m)
    this.#addWallSegment(35.5, 36.5, 1.0, 7.5, -33.7, -22.0, mats.marble, true);
    this.#addWallSegment(35.5, 36.5, 1.0, 7.5, -54.0, -38.3, mats.marble, true);
    this.#addWallSegment(35.5, 36.5, 6.8, 7.5, -38.3, -33.7, mats.marble, true);
    this.#addBox(1.2, 5.8, 0.3, 36.0, 3.9, -38.3, mats.roseGold, false, false);
    this.#addBox(1.2, 5.8, 0.3, 36.0, 3.9, -33.7, mats.roseGold, false, false);

    // Planta Alta: puerta abierta al Balcón Este en Z ∈ [-38.1, -33.9] (4.2m)
    this.#addWallSegment(35.5, 36.5, 7.5, 15.0, -33.9, -22.0, mats.marble, true);
    this.#addWallSegment(35.5, 36.5, 7.5, 15.0, -54.0, -38.1, mats.marble, true);
    this.#addWallSegment(35.5, 36.5, 13.5, 15.0, -38.1, -33.9, mats.marble, true);
    this.#addBox(1.2, 6.0, 0.3, 36.0, 10.5, -38.1, mats.roseGold, false, false);
    this.#addBox(1.2, 6.0, 0.3, 36.0, 10.5, -33.9, mats.roseGold, false, false);

    for (const wz of [-48, -43, -28]) {
      this.#addStainedWindowX(36.55, 4.2, wz, 3.2, 4.4, mats);
      this.#addStainedWindowX(36.55, 11.0, wz, 3.0, 4.2, mats);
    }

    // --- CONEXIÓN NORTE VESTÍBULO <-> SALÓN DEL TRONO (Z = -54) ---
    // Alas cerradas [-36, -20] y [20, 36]
    this.#addWallSegment(-36.0, -20.0, 1.0, 15.0, -54.5, -53.5, mats.marble, true);
    this.#addWallSegment(20.0, 36.0, 1.0, 15.0, -54.5, -53.5, mats.marble, true);
    // Muros del arco del ábside con gran arco imperial abierto X ∈ [-5.5, 5.5] (11.0m, Y libre hasta 9.0)
    this.#addWallSegment(-20.0, -5.5, 1.0, 15.0, -54.5, -53.5, mats.marble, true);
    this.#addWallSegment(5.5, 20.0, 1.0, 15.0, -54.5, -53.5, mats.marble, true);
    this.#addWallSegment(-5.5, 5.5, 9.0, 15.0, -54.5, -53.5, mats.marble, true);
    // Moldura dorada del arco imperial
    this.#addBox(0.4, 8.0, 1.25, -5.5, 5.0, -54.0, mats.roseGold, false, false);
    this.#addBox(0.4, 8.0, 1.25, 5.5, 5.0, -54.0, mats.roseGold, false, false);
    this.#addBox(11.4, 0.55, 1.25, 0, 9.0, -54.0, mats.roseGold, false, false);

    // --- MUROS PERIMETRALES DEL ÁBSIDE NORTE (X = ±20, Z = -76) ---
    this.#addWallSegment(-20.5, -19.5, 1.0, 15.0, -76.0, -54.0, mats.marble, true);
    this.#addWallSegment(19.5, 20.5, 1.0, 15.0, -76.0, -54.0, mats.marble, true);
    // Pared trasera con grandes ventanales hacia el bosque Norte
    this.#addWallSegment(-20.0, 20.0, 1.0, 2.8, -76.5, -75.5, mats.marble, true);
    this.#addWallSegment(-20.0, 20.0, 12.6, 15.0, -76.5, -75.5, mats.marble, true);
    for (const px of [-18.5, -11.0, -4.0, 4.0, 11.0, 18.5]) {
      this.#addWallSegment(px - 1.2, px + 1.2, 2.8, 12.6, -76.5, -75.5, mats.marble, true);
    }
    // Colisionador continuo en Z = -76 y ventanales góticos/imperiales translúcidos
    this.#collision.addBox(-20.0, 20.0, 1.0, 15.0, -76.5, -75.5);
    for (const wx of [-14.75, -7.5, 0, 7.5, 14.75]) {
      const ww = wx === 0 ? 5.6 : 4.6;
      this.#addStainedWindowZ(wx, 7.7, -76.0, ww, 9.4, mats);
    }
    for (const wz of [-70.5, -64.5, -58.5]) {
      this.#addStainedWindowX(-20.55, 5.0, wz, 3.0, 4.8, mats);
      this.#addStainedWindowX(20.55, 5.0, wz, 3.0, 4.8, mats);
    }

    // --- PARTICIONES INTERIORES PLANTA BAJA (X = -14 y X = +14, Y = 1.0 -> 7.5) ---
    // Dos grandes vanos abiertos de 4.8m: Z ∈ [-31.4, -26.6] y Z ∈ [-47.4, -42.6]
    for (const side of [-14, 14]) {
      this.#addWallSegment(side - 0.4, side + 0.4, 1.0, 7.5, -26.6, -22.0, mats.marble, true);
      this.#addWallSegment(side - 0.4, side + 0.4, 1.0, 7.5, -42.6, -31.4, mats.marble, true);
      this.#addWallSegment(side - 0.4, side + 0.4, 1.0, 7.5, -54.0, -47.4, mats.marble, true);
      // Dinteles superiores sobre los vanos (altura libre 5.4m)
      this.#addWallSegment(side - 0.4, side + 0.4, 6.4, 7.5, -31.4, -26.6, mats.roseGold, false);
      this.#addWallSegment(side - 0.4, side + 0.4, 6.4, 7.5, -47.4, -42.6, mats.roseGold, false);
    }

    // --- PARTICIONES INTERIORES PLANTA ALTA (X = -14.5 y X = +14.5, minY = 7.5 -> 14.8) ---
    // Dos vanos amplios de 4.4m: Z ∈ [-32.2, -27.8] y Z ∈ [-47.2, -42.8]
    for (const side of [-14.5, 14.5]) {
      this.#addWallSegment(side - 0.35, side + 0.35, 7.5, 14.8, -27.8, -22.0, mats.marble, true);
      this.#addWallSegment(side - 0.35, side + 0.35, 7.5, 14.8, -42.8, -32.2, mats.marble, true);
      this.#addWallSegment(side - 0.35, side + 0.35, 7.5, 14.8, -54.0, -47.2, mats.marble, true);
      // Dinteles superiores (altura libre 6.0m desde Y = 7.5)
      this.#addWallSegment(side - 0.35, side + 0.35, 13.5, 14.8, -32.2, -27.8, mats.roseGold, false);
      this.#addWallSegment(side - 0.35, side + 0.35, 13.5, 14.8, -47.2, -42.8, mats.roseGold, false);
    }
  }

  #addStainedWindowZ(x, y, z, w, h, mats) {
    this.#addBox(w, h, 0.18, x, y, z, mats.stained, false, false, false);
    this.#addBox(w + 0.28, 0.22, 0.28, x, y + h / 2, z, mats.roseGold, false, false);
    this.#addBox(w + 0.28, 0.22, 0.28, x, y - h / 2, z, mats.roseGold, false, false);
  }

  #addStainedWindowX(x, y, z, d, h, mats) {
    this.#addBox(0.18, h, d, x, y, z, mats.stained, false, false, false);
    this.#addBox(0.28, 0.22, d + 0.28, x, y + h / 2, z, mats.roseGold, false, false);
    this.#addBox(0.28, 0.22, d + 0.28, x, y - h / 2, z, mats.roseGold, false, false);
  }

  // =========================================================================
  // 3. GRAN ESCALINATA DOBLE CURVA Y GALERÍA PERIMETRAL SUPERIOR (Y = 1.0 -> 7.5)
  // =========================================================================
  #buildStaircaseAndUpperGallery(mats) {
    // Dos brazos simétricos laterales dejando X ∈ [-8.8, 8.8] completamente despejado hacia el Trono
    for (const dir of [-1, 1]) {
      // Tramo 1: X ∈ [9.0, 12.6] / [-12.6, -9.0], Z = -30.5 (Y=1.0) -> Z = -39.5 (Y=4.25)
      const f1Steps = 12;
      for (let i = 0; i < f1Steps; i++) {
        const t = (i + 1) / f1Steps;
        const h = 1.0 + t * 3.25;
        const zCenter = -30.5 - (i + 0.5) * (9.0 / f1Steps);
        const curveFlare = Math.sin(t * Math.PI) * 0.18;
        const stepW = 3.6 + (1 - t) * 0.25 - curveFlare;
        const xCenter = dir * (10.8 - curveFlare * 0.35);
        const stepGeo = new THREE.BoxGeometry(stepW, 0.29, 0.82);
        const trimGeo = new THREE.BoxGeometry(stepW + 0.04, 0.04, 0.12);
        bakeProceduralVertexAO(stepGeo, { aoStrength: 0.34, baseWeight: 0.6, shadowTint: 0x261b48 });
        bakeProceduralVertexAO(trimGeo, { aoStrength: 0.24, shadowTint: 0x261b48 });
        this.#addMesh(stepGeo, mats.marble, xCenter, h - 0.145, zCenter, true, true);
        this.#addMesh(trimGeo, mats.roseGold, xCenter, h, zCenter + 0.34, false, true);
      }
      this.#collision.addRampSurface(
        dir < 0 ? -12.6 : 9.0,
        dir < 0 ? -9.0 : 12.6,
        -39.8,
        -30.2,
        'z',
        -30.5,
        -39.5,
        1.0,
        4.25
      );
      // Zancas laterales del Tramo 1 (impiden atravesar los peldaños de costado)
      this.#collision.addBox(dir < 0 ? -9.05 : 8.85, dir < 0 ? -8.85 : 9.05, 1.0, 5.2, -39.5, -30.5);
      this.#collision.addBox(dir < 0 ? -12.75 : 12.55, dir < 0 ? -12.55 : 12.75, 1.0, 5.2, -39.5, -30.5);
      this.#addSlopedHandrail(dir * 8.95, -30.5, 2.05, -39.5, 5.3, mats);
      this.#addSlopedHandrail(dir * 12.65, -30.5, 2.05, -39.5, 5.3, mats);

      // Descansillo panorámico (Y = 4.25): Z ∈ [-43.0, -39.2], X ∈ [8.8, 12.8] / [-12.8, -8.8]
      this.#addBox(4.0, 0.42, 3.8, dir * 10.8, 4.04, -41.1, mats.marbleFloor, false, false);
      this.#collision.addFlatSurface(dir < 0 ? -12.8 : 8.8, dir < 0 ? -8.8 : 12.8, -43.0, -39.2, 4.25);
      // Barandilla en el borde interior y sur del descansillo (minY = 4.25)
      this.#addRailing(dir * 8.9, dir * 8.9, -43.0, -39.2, 4.25, mats);
      // Columna de apoyo del descansillo en X = ±8.95, Z = -41.1 (no obstruye el vano Z ∈ [-47.4, -42.6])
      this.#addColumn(dir * 8.95, 1.0, -41.1, 3.05, 0.24, mats, true);

      // Tramo 2: X ∈ [8.8, 12.0] / [-12.0, -8.8], Z = -42.8 (Y=4.25) -> Z = -51.8 (Y=7.5)
      const f2Steps = 12;
      for (let i = 0; i < f2Steps; i++) {
        const t = (i + 1) / f2Steps;
        const h = 4.25 + t * 3.25;
        const zCenter = -42.8 - (i + 0.5) * (9.0 / f2Steps);
        const curveFlare = Math.sin(t * Math.PI) * 0.12;
        const stepW = 3.2 - curveFlare;
        const xCenter = dir * (10.4 + curveFlare * 0.25);
        const stepGeo = new THREE.BoxGeometry(stepW, 0.29, 0.82);
        const trimGeo = new THREE.BoxGeometry(stepW + 0.04, 0.04, 0.12);
        bakeProceduralVertexAO(stepGeo, { aoStrength: 0.34, baseWeight: 0.6, shadowTint: 0x261b48 });
        bakeProceduralVertexAO(trimGeo, { aoStrength: 0.24, shadowTint: 0x261b48 });
        this.#addMesh(stepGeo, mats.marble, xCenter, h - 0.145, zCenter, true, true);
        this.#addMesh(trimGeo, mats.roseGold, xCenter, h, zCenter + 0.34, false, true);
      }
      this.#collision.addRampSurface(
        dir < 0 ? -12.0 : 8.8,
        dir < 0 ? -8.8 : 12.0,
        -52.2,
        -42.5,
        'z',
        -42.8,
        -51.8,
        4.25,
        7.5
      );
      // Zancas del Tramo 2 con minY = 4.25 para caminar libremente por debajo en Planta Baja
      this.#collision.addBox(dir < 0 ? -8.85 : 8.65, dir < 0 ? -8.65 : 8.85, 4.25, 8.6, -51.8, -42.8);
      this.#collision.addBox(dir < 0 ? -12.15 : 11.95, dir < 0 ? -11.95 : 12.15, 4.25, 8.6, -51.8, -42.8);
      this.#addSlopedHandrail(dir * 8.75, -42.8, 5.3, -51.8, 8.55, mats);
      this.#addSlopedHandrail(dir * 12.05, -42.8, 5.3, -51.8, 8.55, mats);
    }

    // --- GALERÍA PERIMETRAL SUPERIOR (Y = 7.5) ---
    // Pasarela Norte: X ∈ [-14.8, 14.8], Z ∈ [-54.0, -51.2]
    this.#addBox(29.6, 0.45, 2.8, 0, 7.275, -52.6, mats.marbleFloor, false, false);
    this.#collision.addFlatSurface(-14.8, 14.8, -54.0, -51.2, 7.5);

    // Puente Sur Superior: X ∈ [-14.8, 14.8], Z ∈ [-26.6, -22.0]
    this.#addBox(29.6, 0.45, 4.6, 0, 7.275, -24.3, mats.marbleFloor, false, false);
    this.#collision.addFlatSurface(-14.8, 14.8, -26.6, -22.0, 7.5);

    for (const dir of [-1, 1]) {
      // Pasarelas laterales Sur-Centro (Z ∈ [-42.5, -26.6], X ∈ [10.8, 14.8] / [-14.8, -10.8])
      this.#addBox(4.0, 0.45, 15.9, dir * 12.8, 7.275, -34.55, mats.marbleFloor, false, false);
      this.#collision.addFlatSurface(dir < 0 ? -14.8 : 10.8, dir < 0 ? -10.8 : 14.8, -42.5, -26.6, 7.5);

      // Corredores laterales junto al hueco del Tramo 2 (Z ∈ [-51.2, -42.5], X ∈ [12.1, 14.8] / [-14.8, -12.1])
      // Dejan libre el hueco de la escalera [8.8, 12.0] y dan un pasillo amplio de 2m hacia Suite/Biblioteca
      this.#addBox(2.7, 0.45, 8.7, dir * 13.45, 7.275, -46.85, mats.marbleFloor, false, false);
      this.#collision.addFlatSurface(dir < 0 ? -14.8 : 12.1, dir < 0 ? -12.1 : 14.8, -51.2, -42.5, 7.5);

      // Suelos completos de Suite Real (Oeste) y Biblioteca Real (Este) en Y = 7.5
      this.#addBox(21.6, 0.45, 32.0, dir * 25.2, 7.275, -38.0, mats.marbleFloor, false, false);
      this.#collision.addFlatSurface(dir < 0 ? -36.0 : 14.4, dir < 0 ? -14.4 : 36.0, -54.0, -22.0, 7.5);

      // Barandillas hacia el hueco central y huecos del Tramo 2 (minY = 7.5)
      this.#addRailing(dir * 10.9, dir * 10.9, -42.5, -26.6, 7.5, mats);
      this.#addRailing(dir < 0 ? -12.1 : 10.9, dir < 0 ? -10.9 : 12.1, -42.4, -42.4, 7.5, mats);
      this.#addRailing(dir * 12.15, dir * 12.15, -51.2, -42.5, 7.5, mats);
      this.#addRailing(dir * 8.75, dir * 8.75, -51.2, -42.8, 7.5, mats);
    }

    // Barandillas puente Sur, pasarela Norte y mirador al Salón del Trono
    this.#addRailing(-10.8, 10.8, -26.5, -26.5, 7.5, mats);
    this.#addRailing(-9.0, 9.0, -51.3, -51.3, 7.5, mats);
    this.#addRailing(-5.5, 5.5, -53.45, -53.45, 7.5, mats);
  }

  #addSlopedHandrail(x, zStart, yStart, zEnd, yEnd, mats) {
    const dz = zEnd - zStart;
    const dy = yEnd - yStart;
    const len = Math.hypot(dz, dy);
    const angle = Math.atan2(dy, -dz);
    this.#addMesh(
      new THREE.BoxGeometry(0.14, 0.1, len),
      mats.roseGold,
      x,
      (yStart + yEnd) / 2,
      (zStart + zEnd) / 2,
      false,
      true,
      angle
    );

    const posts = 6;
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      this.#balusters.push({
        x,
        y: yStart + dy * t - 0.52,
        z: zStart + dz * t
      });
    }
  }

  // =========================================================================
  // 4. BALCONES EXTERIORES (Y = 7.5)
  // =========================================================================
  #buildExteriorBalconies(mats) {
    // Balcón Frontal Sur: X ∈ [-10, 10], Z ∈ [-22.2, -16.8]
    this.#addBox(20.0, 0.55, 5.4, 0, 7.225, -19.5, mats.marbleFloor, false, false);
    this.#collision.addFlatSurface(-10.0, 10.0, -22.2, -16.8, 7.5);
    this.#addRailing(-9.9, 9.9, -16.95, -16.95, 7.5, mats);
    this.#addRailing(-9.85, -9.85, -22.0, -16.95, 7.5, mats);
    this.#addRailing(9.85, 9.85, -22.0, -16.95, 7.5, mats);

    // Columnas del pórtico frontal desde Y = 0 hasta Y = 7.1
    for (const cx of [-9.2, -5.2, 5.2, 9.2]) {
      this.#addColumn(cx, 0, -17.4, 7.1, 0.42, mats, true);
    }

    // Balcón Oeste Suite Real: X ∈ [-41.5, -36], Z ∈ [-42, -30]
    this.#addBox(5.7, 0.5, 12.0, -38.65, 7.25, -36.0, mats.marbleFloor, false, false);
    this.#collision.addFlatSurface(-41.5, -35.8, -42.0, -30.0, 7.5);
    this.#addRailing(-41.35, -41.35, -41.9, -30.1, 7.5, mats);
    this.#addRailing(-41.35, -36.0, -30.15, -30.15, 7.5, mats);
    this.#addRailing(-41.35, -36.0, -41.85, -41.85, 7.5, mats);
    this.#addColumn(-41.0, 0, -30.6, 7.1, 0.34, mats, true);
    this.#addColumn(-41.0, 0, -41.4, 7.1, 0.34, mats, true);

    // Balcón Este Biblioteca: X ∈ [36, 41.5], Z ∈ [-42, -30]
    this.#addBox(5.7, 0.5, 12.0, 38.65, 7.25, -36.0, mats.marbleFloor, false, false);
    this.#collision.addFlatSurface(35.8, 41.5, -42.0, -30.0, 7.5);
    this.#addRailing(41.35, 41.35, -41.9, -30.1, 7.5, mats);
    this.#addRailing(36.0, 41.35, -30.15, -30.15, 7.5, mats);
    this.#addRailing(36.0, 41.35, -41.85, -41.85, 7.5, mats);
    this.#addColumn(41.0, 0, -30.6, 7.1, 0.34, mats, true);
    this.#addColumn(41.0, 0, -41.4, 7.1, 0.34, mats, true);
  }

  // =========================================================================
  // 5. TECHO ABOVEDADO DE CRISTAL ROSADO, CÚPULA Y 6 TORRES
  // =========================================================================
  #buildVaultedRoofAndTowers(mats) {
    // Cubiertas planas de alas laterales (X ∈ [-36, -14] y [14, 36])
    this.#addBox(22.5, 0.55, 32.6, -25.25, 15.05, -38.0, mats.marble, true, false);
    this.#addBox(22.5, 0.55, 32.6, 25.25, 15.05, -38.0, mats.marble, true, false);
    this.#addBox(73.2, 0.5, 33.2, 0, 14.8, -38.0, mats.roseGold, false, false);

    // Bóveda semicilíndrica de cristal rosado sobre el Gran Vestíbulo (X ∈ [-14, 14], Y = 15 -> 20.5)
    const vaultGeo = new THREE.CylinderGeometry(14.0, 14.0, 32.0, 24, 1, true, -Math.PI / 2, Math.PI);
    this.#addMesh(vaultGeo, mats.vaultCrystal, 0, 15.0, -38.0, false, false, -Math.PI / 2, 0, 0, 1, 1, 5.5 / 14.0);

    // Costillas estructurales oro-rosa de la bóveda
    const ribGeo = new THREE.TorusGeometry(14.0, 0.22, 8, 28, Math.PI);
    bakeProceduralVertexAO(ribGeo, { aoStrength: 0.34, shadowTint: 0x261b48 });
    this.#tempGeos.push(ribGeo);
    for (const rz of [-54.0, -46.0, -38.0, -30.0, -22.0]) {
      this.#addMesh(ribGeo, mats.roseGold, 0, 15.0, rz, false, true, 0, 0, 0, 1, 5.5 / 14.0, 1, true);
    }

    // Cubierta y Cúpula del Salón del Trono (X ∈ [-20, 20], Z ∈ [-76, -54])
    this.#addBox(40.8, 0.6, 22.8, 0, 15.0, -65.0, mats.roseGold, false, false);
    const apseDomeGeo = new THREE.SphereGeometry(10.5, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    this.#addMesh(apseDomeGeo, mats.vaultCrystal, 0, 15.2, -65.0, false, false, 0, 0, 0, 1.15, 0.72, 0.95);
    const apseDrumGeo = new THREE.CylinderGeometry(2.6, 3.1, 1.8, 12);
    bakeProceduralVertexAO(apseDrumGeo, { aoStrength: 0.34, baseWeight: 0.6, shadowTint: 0x261b48 });
    this.#addMesh(apseDrumGeo, mats.roseGold, 0, 22.8, -65.0, false, true);
    this.#addMesh(new THREE.ConeGeometry(1.6, 4.8, 8), mats.crystal, 0, 26.0, -65.0, false, false);

    // 6 Torres esquineras: (-36,-22), (36,-22), (-36,-54), (36,-54), (-20,-76), (20,-76)
    const towerCoords = [
      [-36, -22], [36, -22],
      [-36, -54], [36, -54],
      [-20, -76], [20, -76]
    ];
    const towerShaftGeo = new THREE.CylinderGeometry(3.15, 3.45, 20.5, 8, 4);
    const towerCollarGeo = new THREE.CylinderGeometry(3.45, 3.25, 0.65, 8);
    const towerDomeGeo = new THREE.SphereGeometry(3.2, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const towerSpireGeo = new THREE.ConeGeometry(0.95, 5.6, 6);
    bakeProceduralVertexAO(towerShaftGeo, { aoStrength: 0.44, baseWeight: 0.68, shadowTint: 0x261b48 });
    bakeProceduralVertexAO(towerCollarGeo, { aoStrength: 0.32, shadowTint: 0x261b48 });
    bakeProceduralVertexAO(towerDomeGeo, { aoStrength: 0.36, shadowTint: 0x261b48, ridgeHighlight: 0.10 });
    this.#tempGeos.push(towerShaftGeo, towerCollarGeo, towerDomeGeo, towerSpireGeo);

    for (const [tx, tz] of towerCoords) {
      this.#addMesh(towerShaftGeo, mats.marble, tx, 10.25, tz, true, true, 0, 0, 0, 1, 1, 1, true);
      this.#collision.addCylinderCollider(tx, tz, 3.35, 0, 20.5);
      this.#addMesh(towerCollarGeo, mats.roseGold, tx, 20.5, tz, false, true, 0, 0, 0, 1, 1, 1, true);
      this.#addMesh(towerDomeGeo, mats.roseGold, tx, 20.8, tz, false, true, 0, 0, 0, 1, 1, 1, true);
      this.#addMesh(towerSpireGeo, mats.crystal, tx, 26.2, tz, false, false, 0, 0, 0, 1, 1, 1, true);
    }

    // Gran aguja imperial central sobre la bóveda
    const centralBaseGeo = new THREE.CylinderGeometry(4.8, 5.6, 3.4, 12, 2);
    bakeProceduralVertexAO(centralBaseGeo, { aoStrength: 0.36, baseWeight: 0.65, shadowTint: 0x261b48 });
    this.#addMesh(centralBaseGeo, mats.roseGold, 0, 21.8, -38.0, false, true);
    this.#addMesh(new THREE.OctahedronGeometry(3.8, 0), mats.crystal, 0, 27.6, -38.0, false, false, 0, 0, 0, 1, 1.7, 1);
    this.#addMesh(new THREE.ConeGeometry(2.6, 11.5, 8), mats.crystal, 0, 34.4, -38.0, false, false);
  }

  #buildInstancedBalusters(mats) {
    if (this.#balusters.length === 0) return;
    const geo = this.#trackGeo(new THREE.CylinderGeometry(0.06, 0.085, 0.96, 8));
    bakeProceduralVertexAO(geo, { aoStrength: 0.36, baseWeight: 0.6, shadowTint: 0x261b48 });
    const inst = new THREE.InstancedMesh(geo, mats.roseGold, this.#balusters.length);
    inst.castShadow = false;
    inst.receiveShadow = true;
    const dummy = this.#dummy;

    for (let i = 0; i < this.#balusters.length; i++) {
      const b = this.#balusters[i];
      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }

    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.matrixAutoUpdate = false;
    inst.updateMatrix();
    this.#root.add(inst);
    this.#instancedMeshes.push(inst);
  }

  #buildArchitecturalHalos() {
    const specs = [
      // 6 remates de las torres esquineras
      { x: -36, y: 28.5, z: -22, size: 3.4, color: 0xffb8e6, phase: 0.0, opacity: 0.30 },
      { x: 36, y: 28.5, z: -22, size: 3.4, color: 0xffb8e6, phase: 0.9, opacity: 0.30 },
      { x: -36, y: 28.5, z: -54, size: 3.4, color: 0xffb8e6, phase: 1.8, opacity: 0.30 },
      { x: 36, y: 28.5, z: -54, size: 3.4, color: 0xffb8e6, phase: 2.7, opacity: 0.30 },
      { x: -20, y: 28.5, z: -76, size: 3.4, color: 0xffb8e6, phase: 3.6, opacity: 0.30 },
      { x: 20, y: 28.5, z: -76, size: 3.4, color: 0xffb8e6, phase: 4.5, opacity: 0.30 },
      // Gran aguja imperial central
      { x: 0, y: 33.5, z: -38, size: 4.5, color: 0xffc6ec, phase: 1.1, opacity: 0.32 },
      { x: 0, y: 39.5, z: -38, size: 5.2, color: 0xffe4a8, phase: 2.4, opacity: 0.34 },
      // Remate cúpula del Salón del Trono
      { x: 0, y: 27.5, z: -65, size: 3.6, color: 0xffb8e6, phase: 3.1, opacity: 0.30 },
      // 4 puntos de cornisa del pórtico frontal
      { x: -9.2, y: 7.4, z: -17.4, size: 2.0, color: 0xffd496, phase: 0.4, opacity: 0.24 },
      { x: -5.2, y: 7.4, z: -17.4, size: 2.0, color: 0xffd496, phase: 1.4, opacity: 0.24 },
      { x: 5.2, y: 7.4, z: -17.4, size: 2.0, color: 0xffd496, phase: 2.4, opacity: 0.24 },
      { x: 9.2, y: 7.4, z: -17.4, size: 2.0, color: 0xffd496, phase: 3.4, opacity: 0.24 }
    ];

    const haloRes = createInstancedVolumetricHalos(specs, { opacity: 1.0 });
    const haloInst = haloRes?.isObject3D ? haloRes : haloRes?.mesh;
    if (haloInst) {
      if (haloInst.geometry) this.#trackGeo(haloInst.geometry);
      if (haloInst.material) this.#materials.push(haloInst.material);
      this.#instancedMeshes.push(haloInst);
      this.#root.add(haloInst);
    }
  }

  // =========================================================================
  // INTERFAZ PÚBLICA REQUERIDA
  // =========================================================================
  applyTheme(theme) {
    if (!theme) return;
    if (this.#crystalMat && typeof theme.crystalEmissive === 'number') {
      this.#crystalMat.emissiveIntensity = Math.min(0.75, theme.crystalEmissive);
    }
    if (this.#vaultCrystalMat && typeof theme.crystalEmissive === 'number') {
      this.#vaultCrystalMat.emissiveIntensity = Math.min(0.28, theme.crystalEmissive * 0.35);
    }
    if (this.#stainedMat && typeof theme.crystalEmissive === 'number') {
      this.#stainedMat.emissiveIntensity = Math.min(0.36, theme.crystalEmissive * 0.45);
    }
    for (const entry of this.#lights) {
      entry.light.intensity = entry.baseIntensity * (0.65 + (theme.lanternIntensity ?? 1) * 0.35);
    }
    if (this.#rooms) {
      this.#rooms.applyTheme(theme);
    }
  }

  pulseBallroom(amount = 1) {
    if (this.#danceFloorMat) {
      this.#danceFloorMat.emissiveIntensity = Math.min(0.92, 0.45 + amount * 0.45);
    }
  }

  update(dt) {
    this.#elapsed += dt;
    if (this.#danceFloorMat) {
      const target = 0.45 + Math.sin(this.#elapsed * 2.2) * 0.14;
      this.#danceFloorMat.emissiveIntensity += (target - this.#danceFloorMat.emissiveIntensity) * Math.min(1, dt * 4);
    }
    if (this.#rooms) {
      this.#rooms.update(dt, this.#elapsed);
    }
  }

  dispose() {
    if (this.#rooms) {
      this.#rooms.dispose();
      this.#rooms = null;
    }
    if (this.#root) {
      this.#scene.remove(this.#root);
      this.#root = null;
    }
    for (const inst of this.#instancedMeshes) {
      if (typeof inst.dispose === 'function') inst.dispose();
    }
    for (const g of this.#geometries) g.dispose();
    for (const g of this.#tempGeos) g.dispose();
    for (const m of this.#materials) m.dispose();
    this.#instancedMeshes.length = 0;
    this.#geometries.length = 0;
    this.#tempGeos.length = 0;
    this.#materials.length = 0;
    this.#balusters.length = 0;
    this.#staticBuckets.clear();
    this.#lights.length = 0;
  }
}
