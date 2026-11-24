import * as THREE from 'three';
import { CastleRooms } from './CastleRooms.js';

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
    this.#buildInstancedBalusters(mats);

    this.#rooms = new CastleRooms(this.#root, this.#textures, this.#collision, mats);
    this.#rooms.init();

    this.#scene.add(this.#root);
  }

  #createMaterials() {
    const marble = new THREE.MeshStandardMaterial({
      map: this.#textures.getTexture('marble', 4, 3),
      roughness: 0.28,
      metalness: 0.04
    });

    const marbleFloor = new THREE.MeshStandardMaterial({
      map: this.#textures.getTexture('marbleFloor', 14, 9),
      roughness: 0.22,
      metalness: 0.06
    });

    const roseGold = new THREE.MeshStandardMaterial({
      map: this.#textures.getTexture('roseGold', 1, 1),
      color: 0xf4b6a8,
      metalness: 0.88,
      roughness: 0.18
    });

    const crystal = new THREE.MeshPhysicalMaterial({
      color: 0xffd9f2,
      emissive: 0xe684c4,
      emissiveIntensity: 0.45,
      metalness: 0.12,
      roughness: 0.08,
      transmission: 0.55,
      thickness: 0.8,
      transparent: true,
      opacity: 0.88
    });

    const vaultCrystal = new THREE.MeshStandardMaterial({
      color: 0xffd2ec,
      emissive: 0xc95ea2,
      emissiveIntensity: 0.14,
      roughness: 0.12,
      metalness: 0.1,
      transparent: true,
      opacity: 0.46,
      side: THREE.DoubleSide
    });

    const stained = new THREE.MeshStandardMaterial({
      map: this.#textures.getTexture('stainedCrystal', 1, 2),
      emissive: 0xffb8df,
      emissiveIntensity: 0.22,
      roughness: 0.18,
      metalness: 0.12,
      transparent: true,
      opacity: 0.84
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

    const velvet = new THREE.MeshStandardMaterial({
      color: 0xc23c81,
      roughness: 0.78,
      metalness: 0.05
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

  #addMesh(geo, mat, x, y, z, castShadow = true, receiveShadow = true) {
    this.#trackGeo(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    this.#root.add(mesh);
    return mesh;
  }

  #addBox(w, h, d, x, y, z, mat, castShadow = true, addCollider = false) {
    const mesh = this.#addMesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, castShadow, true);
    if (addCollider) {
      this.#collision.addBox(x - w / 2, x + w / 2, y - h / 2, y + h / 2, z - d / 2, z + d / 2);
    }
    return mesh;
  }

  #addWallSegment(minX, maxX, minY, maxY, minZ, maxZ, mat, castShadow = true) {
    const w = maxX - minX;
    const h = maxY - minY;
    const d = maxZ - minZ;
    return this.#addBox(w, h, d, (minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2, mat, castShadow, true);
  }

  #addColumn(x, yBase, z, height, radius, mats, addCollider = true) {
    const shaftGeo = this.#trackGeo(new THREE.CylinderGeometry(radius * 0.88, radius, height, 14));
    const capGeo = this.#trackGeo(new THREE.CylinderGeometry(radius * 1.32, radius * 0.92, 0.45, 14));
    const shaft = new THREE.Mesh(shaftGeo, mats.marble);
    shaft.position.set(x, yBase + height / 2, z);
    shaft.castShadow = true;
    shaft.receiveShadow = true;

    const topCap = new THREE.Mesh(capGeo, mats.roseGold);
    topCap.position.set(x, yBase + height - 0.18, z);
    const baseCap = new THREE.Mesh(capGeo, mats.roseGold);
    baseCap.position.set(x, yBase + 0.2, z);

    this.#root.add(shaft, topCap, baseCap);
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
    this.#addBox(Math.max(0.24, dx), 0.12, Math.max(0.24, dz), cx, yBase + railH, cz, mats.roseGold, true, false);
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
      this.#addBox(w, h, 1.06, 0, h / 2, zCenter, mats.marble, true, false);
      this.#addBox(w + 0.06, 0.04, 0.14, 0, h, zCenter + 0.46, mats.roseGold, false, false);
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
      this.#addBox(0.72, h, 4.6, xCenter, h / 2, -36.0, mats.marble, true, false);
      this.#addBox(0.12, 0.04, 4.64, xCenter + 0.3, h, -36.0, mats.roseGold, false, false);
    }
    this.#collision.addRampSurface(35.8, 39.8, -38.3, -33.7, 'x', 39.4, 36.0, 0.0, 1.0);
    // Zancas laterales de la escalera exterior Este
    this.#addBox(3.6, 0.85, 0.28, 37.8, 0.425, -38.45, mats.roseGold, true, true);
    this.#addBox(3.6, 0.85, 0.28, 37.8, 0.425, -33.55, mats.roseGold, true, true);
  }

  // =========================================================================
  // 2. MUROS, VENTANALES Y PUERTAS AMPLIAS (>= 4.2m)
  // =========================================================================
  #buildWallsAndArches(mats) {
    // --- FACHADA SUR (Z = -22, Y = 1.0 -> 15.0) ---
    // Planta Baja (Y = 1.0 -> 7.5): Gran arco central abierto en X ∈ [-4.4, 4.4] (8.8m)
    this.#addWallSegment(-36.0, -4.4, 1.0, 7.5, -22.5, -21.5, mats.marble);
    this.#addWallSegment(4.4, 36.0, 1.0, 7.5, -22.5, -21.5, mats.marble);
    this.#addWallSegment(-4.4, 4.4, 7.2, 7.5, -22.55, -21.45, mats.roseGold);

    // Planta Alta (Y = 7.5 -> 15.0): Puerta al balcón abierta en X ∈ [-3.2, 3.2] (6.4m)
    this.#addWallSegment(-36.0, -3.2, 7.5, 15.0, -22.5, -21.5, mats.marble);
    this.#addWallSegment(3.2, 36.0, 7.5, 15.0, -22.5, -21.5, mats.marble);
    this.#addWallSegment(-3.2, 3.2, 13.5, 15.0, -22.5, -21.5, mats.marble);
    // Marcos dorados del pórtico
    this.#addBox(0.35, 6.2, 1.25, -4.4, 4.1, -22.0, mats.roseGold, true, false);
    this.#addBox(0.35, 6.2, 1.25, 4.4, 4.1, -22.0, mats.roseGold, true, false);
    this.#addBox(0.3, 6.0, 1.2, -3.2, 10.5, -22.0, mats.roseGold, true, false);
    this.#addBox(0.3, 6.0, 1.2, 3.2, 10.5, -22.0, mats.roseGold, true, false);
    this.#addBox(6.8, 0.45, 1.25, 0, 13.5, -22.0, mats.roseGold, true, false);

    // Ventanales fachada Sur (2 plantas)
    for (const wx of [-30, -24, -17.5, -10.5, 10.5, 17.5, 24, 30]) {
      this.#addStainedWindowZ(wx, 4.2, -21.45, 3.0, 4.4, mats);
      this.#addStainedWindowZ(wx, 11.0, -21.45, 3.0, 4.2, mats);
    }

    // --- MURO EXTERIOR OESTE (X = -36, Z ∈ [-54, -22]) ---
    // Planta Baja: muro completo
    this.#addWallSegment(-36.5, -35.5, 1.0, 7.5, -54.0, -22.0, mats.marble);
    // Planta Alta: puerta abierta al Balcón Oeste en Z ∈ [-38.1, -33.9] (4.2m)
    this.#addWallSegment(-36.5, -35.5, 7.5, 15.0, -33.9, -22.0, mats.marble);
    this.#addWallSegment(-36.5, -35.5, 7.5, 15.0, -54.0, -38.1, mats.marble);
    this.#addWallSegment(-36.5, -35.5, 13.5, 15.0, -38.1, -33.9, mats.marble);
    this.#addBox(1.2, 6.0, 0.3, -36.0, 10.5, -38.1, mats.roseGold, true, false);
    this.#addBox(1.2, 6.0, 0.3, -36.0, 10.5, -33.9, mats.roseGold, true, false);

    for (const wz of [-48, -42, -35, -28]) {
      this.#addStainedWindowX(-36.55, 4.2, wz, 3.2, 4.4, mats);
    }
    for (const wz of [-49, -43, -28]) {
      this.#addStainedWindowX(-36.55, 11.0, wz, 3.0, 4.2, mats);
    }

    // --- MURO EXTERIOR ESTE (X = +36, Z ∈ [-54, -22]) ---
    // Planta Baja: puerta abierta a escalera exterior Este en Z ∈ [-38.3, -33.7] (4.6m)
    this.#addWallSegment(35.5, 36.5, 1.0, 7.5, -33.7, -22.0, mats.marble);
    this.#addWallSegment(35.5, 36.5, 1.0, 7.5, -54.0, -38.3, mats.marble);
    this.#addWallSegment(35.5, 36.5, 6.8, 7.5, -38.3, -33.7, mats.marble);
    this.#addBox(1.2, 5.8, 0.3, 36.0, 3.9, -38.3, mats.roseGold, true, false);
    this.#addBox(1.2, 5.8, 0.3, 36.0, 3.9, -33.7, mats.roseGold, true, false);

    // Planta Alta: puerta abierta al Balcón Este en Z ∈ [-38.1, -33.9] (4.2m)
    this.#addWallSegment(35.5, 36.5, 7.5, 15.0, -33.9, -22.0, mats.marble);
    this.#addWallSegment(35.5, 36.5, 7.5, 15.0, -54.0, -38.1, mats.marble);
    this.#addWallSegment(35.5, 36.5, 13.5, 15.0, -38.1, -33.9, mats.marble);
    this.#addBox(1.2, 6.0, 0.3, 36.0, 10.5, -38.1, mats.roseGold, true, false);
    this.#addBox(1.2, 6.0, 0.3, 36.0, 10.5, -33.9, mats.roseGold, true, false);

    for (const wz of [-48, -43, -28]) {
      this.#addStainedWindowX(36.55, 4.2, wz, 3.2, 4.4, mats);
      this.#addStainedWindowX(36.55, 11.0, wz, 3.0, 4.2, mats);
    }

    // --- CONEXIÓN NORTE VESTÍBULO <-> SALÓN DEL TRONO (Z = -54) ---
    // Alas cerradas [-36, -20] y [20, 36]
    this.#addWallSegment(-36.0, -20.0, 1.0, 15.0, -54.5, -53.5, mats.marble);
    this.#addWallSegment(20.0, 36.0, 1.0, 15.0, -54.5, -53.5, mats.marble);
    // Muros del arco del ábside con gran arco imperial abierto X ∈ [-5.5, 5.5] (11.0m, Y libre hasta 9.0)
    this.#addWallSegment(-20.0, -5.5, 1.0, 15.0, -54.5, -53.5, mats.marble);
    this.#addWallSegment(5.5, 20.0, 1.0, 15.0, -54.5, -53.5, mats.marble);
    this.#addWallSegment(-5.5, 5.5, 9.0, 15.0, -54.5, -53.5, mats.marble);
    // Moldura dorada del arco imperial
    this.#addBox(0.4, 8.0, 1.25, -5.5, 5.0, -54.0, mats.roseGold, true, false);
    this.#addBox(0.4, 8.0, 1.25, 5.5, 5.0, -54.0, mats.roseGold, true, false);
    this.#addBox(11.4, 0.55, 1.25, 0, 9.0, -54.0, mats.roseGold, true, false);

    // --- MUROS PERIMETRALES DEL ÁBSIDE NORTE (X = ±20, Z = -76) ---
    this.#addWallSegment(-20.5, -19.5, 1.0, 15.0, -76.0, -54.0, mats.marble);
    this.#addWallSegment(19.5, 20.5, 1.0, 15.0, -76.0, -54.0, mats.marble);
    // Pared trasera con grandes ventanales hacia el bosque Norte
    this.#addWallSegment(-20.0, 20.0, 1.0, 2.8, -76.5, -75.5, mats.marble);
    this.#addWallSegment(-20.0, 20.0, 12.6, 15.0, -76.5, -75.5, mats.marble);
    for (const px of [-18.5, -11.0, -4.0, 4.0, 11.0, 18.5]) {
      this.#addWallSegment(px - 1.2, px + 1.2, 2.8, 12.6, -76.5, -75.5, mats.marble);
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
      this.#addWallSegment(side - 0.4, side + 0.4, 1.0, 7.5, -26.6, -22.0, mats.marble);
      this.#addWallSegment(side - 0.4, side + 0.4, 1.0, 7.5, -42.6, -31.4, mats.marble);
      this.#addWallSegment(side - 0.4, side + 0.4, 1.0, 7.5, -54.0, -47.4, mats.marble);
      // Dinteles superiores sobre los vanos (altura libre 5.4m)
      this.#addWallSegment(side - 0.4, side + 0.4, 6.4, 7.5, -31.4, -26.6, mats.roseGold);
      this.#addWallSegment(side - 0.4, side + 0.4, 6.4, 7.5, -47.4, -42.6, mats.roseGold);
    }

    // --- PARTICIONES INTERIORES PLANTA ALTA (X = -14.5 y X = +14.5, minY = 7.5 -> 14.8) ---
    // Dos vanos amplios de 4.4m: Z ∈ [-32.2, -27.8] y Z ∈ [-47.2, -42.8]
    for (const side of [-14.5, 14.5]) {
      this.#addWallSegment(side - 0.35, side + 0.35, 7.5, 14.8, -27.8, -22.0, mats.marble);
      this.#addWallSegment(side - 0.35, side + 0.35, 7.5, 14.8, -42.8, -32.2, mats.marble);
      this.#addWallSegment(side - 0.35, side + 0.35, 7.5, 14.8, -54.0, -47.2, mats.marble);
      // Dinteles superiores (altura libre 6.0m desde Y = 7.5)
      this.#addWallSegment(side - 0.35, side + 0.35, 13.5, 14.8, -32.2, -27.8, mats.roseGold);
      this.#addWallSegment(side - 0.35, side + 0.35, 13.5, 14.8, -47.2, -42.8, mats.roseGold);
    }
  }

  #addStainedWindowZ(x, y, z, w, h, mats) {
    this.#addBox(w, h, 0.18, x, y, z, mats.stained, false, false);
    this.#addBox(w + 0.28, 0.22, 0.28, x, y + h / 2, z, mats.roseGold, false, false);
    this.#addBox(w + 0.28, 0.22, 0.28, x, y - h / 2, z, mats.roseGold, false, false);
  }

  #addStainedWindowX(x, y, z, d, h, mats) {
    this.#addBox(0.18, h, d, x, y, z, mats.stained, false, false);
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
        this.#addBox(stepW, 0.29, 0.82, xCenter, h - 0.145, zCenter, mats.marble, true, false);
        this.#addBox(stepW + 0.04, 0.04, 0.12, xCenter, h, zCenter + 0.34, mats.roseGold, false, false);
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
      this.#addBox(4.0, 0.42, 3.8, dir * 10.8, 4.04, -41.1, mats.marbleFloor, true, false);
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
        this.#addBox(stepW, 0.29, 0.82, xCenter, h - 0.145, zCenter, mats.marble, true, false);
        this.#addBox(stepW + 0.04, 0.04, 0.12, xCenter, h, zCenter + 0.34, mats.roseGold, false, false);
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
    this.#addBox(29.6, 0.45, 2.8, 0, 7.275, -52.6, mats.marbleFloor, true, false);
    this.#collision.addFlatSurface(-14.8, 14.8, -54.0, -51.2, 7.5);

    // Puente Sur Superior: X ∈ [-14.8, 14.8], Z ∈ [-26.6, -22.0]
    this.#addBox(29.6, 0.45, 4.6, 0, 7.275, -24.3, mats.marbleFloor, true, false);
    this.#collision.addFlatSurface(-14.8, 14.8, -26.6, -22.0, 7.5);

    for (const dir of [-1, 1]) {
      // Pasarelas laterales Sur-Centro (Z ∈ [-42.5, -26.6], X ∈ [10.8, 14.8] / [-14.8, -10.8])
      this.#addBox(4.0, 0.45, 15.9, dir * 12.8, 7.275, -34.55, mats.marbleFloor, true, false);
      this.#collision.addFlatSurface(dir < 0 ? -14.8 : 10.8, dir < 0 ? -10.8 : 14.8, -42.5, -26.6, 7.5);

      // Corredores laterales junto al hueco del Tramo 2 (Z ∈ [-51.2, -42.5], X ∈ [12.1, 14.8] / [-14.8, -12.1])
      // Dejan libre el hueco de la escalera [8.8, 12.0] y dan un pasillo amplio de 2m hacia Suite/Biblioteca
      this.#addBox(2.7, 0.45, 8.7, dir * 13.45, 7.275, -46.85, mats.marbleFloor, true, false);
      this.#collision.addFlatSurface(dir < 0 ? -14.8 : 12.1, dir < 0 ? -12.1 : 14.8, -51.2, -42.5, 7.5);

      // Suelos completos de Suite Real (Oeste) y Biblioteca Real (Este) en Y = 7.5
      this.#addBox(21.6, 0.45, 32.0, dir * 25.2, 7.275, -38.0, mats.marbleFloor, true, false);
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
    const rail = this.#addMesh(
      new THREE.BoxGeometry(0.14, 0.1, len),
      mats.roseGold,
      x,
      (yStart + yEnd) / 2,
      (zStart + zEnd) / 2,
      true,
      false
    );
    rail.rotation.x = angle;

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
    this.#addBox(20.0, 0.55, 5.4, 0, 7.225, -19.5, mats.marbleFloor, true, false);
    this.#collision.addFlatSurface(-10.0, 10.0, -22.2, -16.8, 7.5);
    this.#addRailing(-9.9, 9.9, -16.95, -16.95, 7.5, mats);
    this.#addRailing(-9.85, -9.85, -22.0, -16.95, 7.5, mats);
    this.#addRailing(9.85, 9.85, -22.0, -16.95, 7.5, mats);

    // Columnas del pórtico frontal desde Y = 0 hasta Y = 7.1
    for (const cx of [-9.2, -5.2, 5.2, 9.2]) {
      this.#addColumn(cx, 0, -17.4, 7.1, 0.42, mats, true);
    }

    // Balcón Oeste Suite Real: X ∈ [-41.5, -36], Z ∈ [-42, -30]
    this.#addBox(5.7, 0.5, 12.0, -38.65, 7.25, -36.0, mats.marbleFloor, true, false);
    this.#collision.addFlatSurface(-41.5, -35.8, -42.0, -30.0, 7.5);
    this.#addRailing(-41.35, -41.35, -41.9, -30.1, 7.5, mats);
    this.#addRailing(-41.35, -36.0, -30.15, -30.15, 7.5, mats);
    this.#addRailing(-41.35, -36.0, -41.85, -41.85, 7.5, mats);
    this.#addColumn(-41.0, 0, -30.6, 7.1, 0.34, mats, true);
    this.#addColumn(-41.0, 0, -41.4, 7.1, 0.34, mats, true);

    // Balcón Este Biblioteca: X ∈ [36, 41.5], Z ∈ [-42, -30]
    this.#addBox(5.7, 0.5, 12.0, 38.65, 7.25, -36.0, mats.marbleFloor, true, false);
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
    this.#addBox(73.2, 0.5, 33.2, 0, 14.8, -38.0, mats.roseGold, true, false);

    // Bóveda semicilíndrica de cristal rosado sobre el Gran Vestíbulo (X ∈ [-14, 14], Y = 15 -> 20.5)
    const vaultGeo = this.#trackGeo(
      new THREE.CylinderGeometry(14.0, 14.0, 32.0, 24, 1, true, -Math.PI / 2, Math.PI)
    );
    const vault = new THREE.Mesh(vaultGeo, mats.vaultCrystal);
    vault.position.set(0, 15.0, -38.0);
    vault.rotation.x = -Math.PI / 2;
    vault.scale.set(1, 1, 5.5 / 14.0);
    this.#root.add(vault);

    // Costillas estructurales oro-rosa de la bóveda
    const ribGeo = this.#trackGeo(new THREE.TorusGeometry(14.0, 0.22, 8, 28, Math.PI));
    for (const rz of [-54.0, -46.0, -38.0, -30.0, -22.0]) {
      const rib = new THREE.Mesh(ribGeo, mats.roseGold);
      rib.position.set(0, 15.0, rz);
      rib.scale.set(1, 5.5 / 14.0, 1);
      this.#root.add(rib);
    }

    // Cubierta y Cúpula del Salón del Trono (X ∈ [-20, 20], Z ∈ [-76, -54])
    this.#addBox(40.8, 0.6, 22.8, 0, 15.0, -65.0, mats.roseGold, true, false);
    const apseDomeGeo = this.#trackGeo(new THREE.SphereGeometry(10.5, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2));
    const apseDome = new THREE.Mesh(apseDomeGeo, mats.vaultCrystal);
    apseDome.position.set(0, 15.2, -65.0);
    apseDome.scale.set(1.15, 0.72, 0.95);
    this.#root.add(apseDome);
    this.#addMesh(new THREE.CylinderGeometry(2.6, 3.1, 1.8, 12), mats.roseGold, 0, 22.8, -65.0, false);
    this.#addMesh(new THREE.ConeGeometry(1.6, 4.8, 8), mats.crystal, 0, 26.0, -65.0, false);

    // 6 Torres esquineras: (-36,-22), (36,-22), (-36,-54), (36,-54), (-20,-76), (20,-76)
    const towerCoords = [
      [-36, -22], [36, -22],
      [-36, -54], [36, -54],
      [-20, -76], [20, -76]
    ];
    for (const [tx, tz] of towerCoords) {
      this.#addMesh(new THREE.CylinderGeometry(3.15, 3.45, 20.5, 8), mats.marble, tx, 10.25, tz, true);
      this.#collision.addCylinderCollider(tx, tz, 3.35, 0, 20.5);
      this.#addMesh(new THREE.CylinderGeometry(3.45, 3.25, 0.65, 8), mats.roseGold, tx, 20.5, tz, false);
      this.#addMesh(
        new THREE.SphereGeometry(3.2, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        mats.roseGold,
        tx,
        20.8,
        tz,
        false
      );
      this.#addMesh(new THREE.ConeGeometry(0.95, 5.6, 6), mats.crystal, tx, 26.2, tz, false);
    }

    // Gran aguja imperial central sobre la bóveda
    this.#addMesh(new THREE.CylinderGeometry(4.8, 5.6, 3.4, 12), mats.roseGold, 0, 21.8, -38.0, false);
    const core = this.#addMesh(new THREE.OctahedronGeometry(3.8, 0), mats.crystal, 0, 27.6, -38.0, false);
    core.scale.set(1, 1.7, 1);
    this.#addMesh(new THREE.ConeGeometry(2.6, 11.5, 8), mats.crystal, 0, 34.4, -38.0, false);
  }

  #buildInstancedBalusters(mats) {
    if (this.#balusters.length === 0) return;
    const geo = this.#trackGeo(new THREE.CylinderGeometry(0.06, 0.085, 0.96, 8));
    const inst = new THREE.InstancedMesh(geo, mats.roseGold, this.#balusters.length);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < this.#balusters.length; i++) {
      const b = this.#balusters[i];
      dummy.position.set(b.x, b.y, b.z);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }

    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    this.#root.add(inst);
    this.#instancedMeshes.push(inst);
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
    for (const m of this.#materials) m.dispose();
    this.#instancedMeshes.length = 0;
    this.#geometries.length = 0;
    this.#materials.length = 0;
    this.#balusters.length = 0;
    this.#lights.length = 0;
  }
}
