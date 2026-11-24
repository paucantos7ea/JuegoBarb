import * as THREE from 'three';

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
  #instancedMeshes = [];
  #lights = [];
  #chandeliers = [];
  #floatingGems = [];
  #globes = [];
  #candleFlames = [];
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

    const gemMat = new THREE.MeshPhysicalMaterial({
      color: 0xff9bd4,
      emissive: 0xe664b4,
      emissiveIntensity: 0.62,
      metalness: 0.15,
      roughness: 0.06,
      transmission: 0.5,
      thickness: 0.6,
      transparent: true,
      opacity: 0.92
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
      globeMat,
      rosePetal,
      foliage,
      pastryFrosting,
      mirror
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
      globeMat,
      rosePetal,
      foliage,
      pastryFrosting,
      mirror
    };
  }

  #trackGeo(geo) {
    this.#geometries.push(geo);
    return geo;
  }

  #addMesh(geo, mat, x, y, z, castShadow = true, receiveShadow = true, parent = this.#root) {
    this.#trackGeo(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    parent.add(mesh);
    return mesh;
  }

  #addBox(w, h, d, x, y, z, mat, castShadow = true, addCollider = false, parent = this.#root) {
    const mesh = this.#addMesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, castShadow, true, parent);
    if (addCollider) {
      this.#collision.addBox(x - w / 2, x + w / 2, y - h / 2, y + h / 2, z - d / 2, z + d / 2);
    }
    return mesh;
  }

  #addColumn(x, yBase, z, height, radius, mats, addCollider = true) {
    const shaftGeo = this.#trackGeo(new THREE.CylinderGeometry(radius * 0.88, radius, height, 14));
    const capGeo = this.#trackGeo(new THREE.CylinderGeometry(radius * 1.3, radius * 0.92, 0.42, 14));
    const shaft = new THREE.Mesh(shaftGeo, mats.marble);
    shaft.position.set(x, yBase + height / 2, z);
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    const topCap = new THREE.Mesh(capGeo, mats.roseGold);
    topCap.position.set(x, yBase + height - 0.21, z);
    const baseCap = new THREE.Mesh(capGeo, mats.roseGold);
    baseCap.position.set(x, yBase + 0.21, z);
    this.#root.add(shaft, topCap, baseCap);
    if (addCollider) {
      this.#collision.addCylinderCollider(x, z, radius * 1.08, yBase, yBase + height);
    }
  }

  #addPointLight(x, y, z, color, intensity, distance) {
    const light = new THREE.PointLight(color, intensity, distance, 1.6);
    light.position.set(x, y, z);
    this.#root.add(light);
    this.#lights.push({ light, baseIntensity: intensity });
    return light;
  }

  #addChandelier(x, y, z, radius, chainLength, mats, lightIntensity = 20) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const chainGeo = this.#trackGeo(new THREE.CylinderGeometry(0.06, 0.06, chainLength, 8));
    const upperRingGeo = this.#trackGeo(new THREE.TorusGeometry(radius * 0.62, 0.08, 8, 24));
    const mainRingGeo = this.#trackGeo(new THREE.TorusGeometry(radius, 0.11, 10, 28));
    const dropGeo = this.#trackGeo(new THREE.OctahedronGeometry(0.24, 0));
    const candleGeo = this.#trackGeo(new THREE.CylinderGeometry(0.05, 0.05, 0.26, 8));
    const flameGeo = this.#trackGeo(new THREE.SphereGeometry(0.075, 8, 8));

    const chain = new THREE.Mesh(chainGeo, mats.roseGold);
    chain.position.y = chainLength / 2;
    const mainRing = new THREE.Mesh(mainRingGeo, mats.roseGold);
    mainRing.rotation.x = Math.PI / 2;
    const upperRing = new THREE.Mesh(upperRingGeo, mats.roseGold);
    upperRing.rotation.x = Math.PI / 2;
    upperRing.position.y = 0.85;
    group.add(chain, mainRing, upperRing);

    const arms = 10;
    for (let i = 0; i < arms; i++) {
      const a = (i / arms) * Math.PI * 2;
      const cx = Math.cos(a) * radius;
      const cz = Math.sin(a) * radius;

      const drop = new THREE.Mesh(dropGeo, mats.crystal);
      drop.position.set(cx, -0.38, cz);
      group.add(drop);

      const candle = new THREE.Mesh(candleGeo, mats.creamSilk);
      candle.position.set(cx, 0.18, cz);
      const flame = new THREE.Mesh(flameGeo, mats.flameMat);
      flame.position.set(cx, 0.36, cz);
      flame.scale.set(0.8, 1.35, 0.8);
      group.add(candle, flame);
      this.#candleFlames.push({ mesh: flame, baseY: 0.36, phase: i * 0.7 + z });
    }

    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const innerDrop = new THREE.Mesh(dropGeo, mats.crystal);
      innerDrop.position.set(Math.cos(a) * radius * 0.62, 0.5, Math.sin(a) * radius * 0.62);
      group.add(innerDrop);
    }

    const finial = new THREE.Mesh(dropGeo, mats.crystal);
    finial.scale.set(1.6, 2.4, 1.6);
    finial.position.y = -0.85;
    group.add(finial);

    this.#root.add(group);
    this.#chandeliers.push(group);
    this.#addPointLight(x, y - 1.1, z, 0xffe4f0, lightIntensity, 26);
  }

  #addFlowerUrn(x, yBase, z, mats) {
    // Pedestal + ánfora + ramo de rosas
    this.#addBox(0.9, 1.0, 0.9, x, yBase + 0.5, z, mats.marble, true, true);
    this.#addMesh(new THREE.CylinderGeometry(0.36, 0.22, 0.75, 12), mats.roseGold, x, yBase + 1.375, z, true);
    this.#addMesh(new THREE.SphereGeometry(0.45, 10, 8), mats.foliage, x, yBase + 1.85, z, false);
    const petalGeo = this.#trackGeo(new THREE.DodecahedronGeometry(0.14, 0));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const rose = new THREE.Mesh(petalGeo, mats.rosePetal);
      rose.position.set(x + Math.cos(a) * 0.26, yBase + 2.02 + (i % 2) * 0.1, z + Math.sin(a) * 0.26);
      this.#root.add(rose);
    }
  }

  #addVelvetDivan(x, yBase, z, rotY, mats, addCollider = true) {
    const g = new THREE.Group();
    g.position.set(x, yBase, z);
    g.rotation.y = rotY;

    const legGeo = this.#trackGeo(new THREE.CylinderGeometry(0.05, 0.03, 0.28, 8));
    for (const [lx, lz] of [[-0.55, -1.2], [0.55, -1.2], [-0.55, 1.2], [0.55, 1.2]]) {
      const leg = new THREE.Mesh(legGeo, mats.roseGold);
      leg.position.set(lx, 0.14, lz);
      g.add(leg);
    }

    const base = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(1.3, 0.36, 2.8)), mats.velvet);
    base.position.y = 0.42;
    base.castShadow = true;
    const back = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(0.28, 0.72, 2.7)), mats.velvet);
    back.position.set(-0.5, 0.85, 0);
    back.castShadow = true;

    const bolsterGeo = this.#trackGeo(new THREE.CylinderGeometry(0.16, 0.16, 1.12, 10));
    const b1 = new THREE.Mesh(bolsterGeo, mats.blushSilk);
    b1.rotation.z = Math.PI / 2;
    b1.position.set(0, 0.72, -1.2);
    const b2 = new THREE.Mesh(bolsterGeo, mats.blushSilk);
    b2.rotation.z = Math.PI / 2;
    b2.position.set(0, 0.72, 1.2);

    g.add(base, back, b1, b2);
    this.#root.add(g);

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
    this.#addChandelier(0, 12.2, -31.0, 2.6, 5.4, mats, 22);
    this.#addChandelier(0, 12.2, -44.0, 2.6, 5.4, mats, 22);

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
      this.#addBox(0.08, 3.75, 2.1, -35.12, 3.2, z, mats.mirror, false, false);
    }

    // Podio oro-rosa en (-22, 1.0, -35)
    this.#addMesh(new THREE.CylinderGeometry(2.25, 2.45, 0.24, 28), mats.roseGold, -22, 1.12, -35, true);
    this.#addMesh(new THREE.CylinderGeometry(2.0, 2.0, 0.04, 28), mats.blushSilk, -22, 1.25, -35, false);
    this.#collision.addDiscSurface(-22, -35, 2.35, 1.26);

    // Diván de terciopelo en (-18, 1.0, -41)
    this.#addVelvetDivan(-18, 1.0, -41, 0, mats, true);

    // Maniquíes y exhibidores de vestidos al fondo del Atelier
    for (const [mx, mz, dressColor] of [
      [-31.5, -51.0, 0xf284b8],
      [-26.5, -51.0, 0xd8a8ff],
      [-21.5, -51.0, 0xffd2b8]
    ]) {
      this.#addMesh(new THREE.CylinderGeometry(0.75, 0.85, 0.22, 16), mats.marble, mx, 1.11, mz, true);
      this.#addMesh(new THREE.CylinderGeometry(0.06, 0.08, 1.1, 8), mats.roseGold, mx, 1.75, mz, false);
      const skirtMat = new THREE.MeshStandardMaterial({ color: dressColor, roughness: 0.45, metalness: 0.08 });
      this.#materials.push(skirtMat);
      this.#addMesh(new THREE.ConeGeometry(0.62, 1.35, 16), skirtMat, mx, 2.0, mz, true);
      this.#addMesh(new THREE.CylinderGeometry(0.18, 0.24, 0.55, 12), skirtMat, mx, 2.8, mz, true);
      this.#collision.addCylinderCollider(mx, mz, 0.85, 1.0, 3.2);
    }

    this.#addPointLight(-25, 5.8, -35, 0xffd9eb, 20, 24);
    this.#addPointLight(-26, 5.8, -48, 0xffe4f2, 14, 18);
  }

  // =========================================================================
  // 2. SALÓN DEL TRONO REAL (X ∈ [-20, 20], Z ∈ [-76, -54], Y = 1.0)
  // =========================================================================
  #buildThroneRoom(mats) {
    // Estrado real de 3 peldaños al fondo (Z ∈ [-73.5, -67.5], Y = 1.6)
    this.#addBox(19.0, 0.2, 8.2, 0, 1.1, -69.4, mats.marble, true, false);
    this.#addBox(19.0, 0.2, 7.4, 0, 1.3, -69.8, mats.marble, true, false);
    this.#addBox(19.0, 0.2, 6.0, 0, 1.5, -70.5, mats.marbleFloor, true, false);
    this.#addBox(18.6, 0.04, 5.6, 0, 1.61, -70.5, mats.crimsonVelvet, false, false);
    this.#collision.addFlatSurface(-9.5, 9.5, -73.5, -67.5, 1.6);
    this.#collision.addRampSurface(-9.5, 9.5, -67.5, -65.3, 'z', -65.3, -67.5, 1.0, 1.6);

    // Dos tronos reales detallados
    for (const tx of [-2.2, 2.2]) {
      this.#buildSingleThrone(tx, 1.6, -71.0, mats);
    }

    // Gran dosel imperial con 4 postes dorados y cortinajes
    const postGeo = this.#trackGeo(new THREE.CylinderGeometry(0.14, 0.16, 5.4, 12));
    for (const [px, pz] of [[-4.8, -68.8], [4.8, -68.8], [-4.8, -73.0], [4.8, -73.0]]) {
      const post = new THREE.Mesh(postGeo, mats.roseGold);
      post.position.set(px, 4.3, pz);
      post.castShadow = true;
      this.#root.add(post);
      this.#collision.addCylinderCollider(px, pz, 0.25, 1.6, 7.0);
    }
    this.#addBox(10.0, 0.45, 4.6, 0, 7.1, -70.9, mats.roseGold, true, false);
    this.#addMesh(new THREE.ConeGeometry(2.2, 1.6, 8), mats.roseGold, 0, 8.1, -70.9, false);
    this.#addMesh(new THREE.OctahedronGeometry(0.55, 0), mats.gemMat, 0, 9.15, -70.9, false);

    // Cortinajes laterales del dosel
    const drapeGeo = this.#trackGeo(new THREE.CylinderGeometry(0.32, 0.52, 5.1, 10));
    for (const [dx, dz] of [[-4.55, -69.0], [4.55, -69.0], [-4.55, -72.8], [4.55, -72.8]]) {
      const drape = new THREE.Mesh(drapeGeo, mats.crimsonVelvet);
      drape.position.set(dx, 4.25, dz);
      this.#root.add(drape);
    }
    this.#addBox(9.6, 0.65, 0.22, 0, 6.65, -68.85, mats.crimsonVelvet, false, false);

    // 6 estandartes colgantes reales (3 en muro Oeste, 3 en muro Este)
    for (const side of [-1, 1]) {
      for (const bz of [-58.5, -64.5, -70.5]) {
        const bx = side * 19.15;
        this.#addBox(0.25, 0.12, 2.2, bx, 12.2, bz, mats.roseGold, false, false);
        this.#addBox(0.08, 5.4, 1.8, bx - side * 0.05, 9.4, bz, mats.crimsonVelvet, true, false);
        this.#addBox(0.1, 0.35, 1.85, bx - side * 0.06, 6.75, bz, mats.roseGold, false, false);
        this.#addMesh(new THREE.OctahedronGeometry(0.34, 0), mats.roseGold, bx - side * 0.12, 9.8, bz, false);
      }
    }

    // 4 pedestales de mármol con gemas flotantes giratorias
    const pedPositions = [
      [-11.5, -59.5], [11.5, -59.5],
      [-11.5, -67.5], [11.5, -67.5]
    ];
    for (let i = 0; i < pedPositions.length; i++) {
      const [px, pz] = pedPositions[i];
      this.#addMesh(new THREE.CylinderGeometry(0.62, 0.72, 1.45, 14), mats.marble, px, 1.725, pz, true);
      this.#addMesh(new THREE.CylinderGeometry(0.74, 0.66, 0.18, 14), mats.roseGold, px, 2.48, pz, false);
      this.#collision.addCylinderCollider(px, pz, 0.76, 1.0, 3.4);

      const gem = this.#addMesh(new THREE.OctahedronGeometry(0.42, 0), mats.gemMat, px, 3.25, pz, false);
      gem.scale.set(0.85, 1.35, 0.85);
      this.#floatingGems.push({ mesh: gem, baseY: 3.25, phase: i * 1.57 });
    }

    // Araña de cristal del Salón del Trono
    this.#addChandelier(0, 12.6, -63.5, 2.4, 4.8, mats, 24);
    this.#addPointLight(0, 6.2, -70.5, 0xffe4d8, 16, 20);
  }

  #buildSingleThrone(x, yBase, z, mats) {
    this.#addBox(1.5, 0.65, 1.3, x, yBase + 0.325, z, mats.roseGold, true, false);
    this.#addBox(1.25, 0.24, 1.15, x, yBase + 0.75, z + 0.05, mats.crimsonVelvet, false, false);
    // Respaldo alto tallado
    this.#addBox(1.45, 2.2, 0.25, x, yBase + 1.75, z - 0.52, mats.roseGold, true, false);
    this.#addBox(1.15, 1.85, 0.14, x, yBase + 1.75, z - 0.38, mats.crimsonVelvet, false, false);
    this.#addMesh(new THREE.CylinderGeometry(0.72, 0.72, 0.22, 16, 1, false, 0, Math.PI), mats.roseGold, x, yBase + 2.85, z - 0.52, true).rotation.x = Math.PI / 2;
    this.#addMesh(new THREE.OctahedronGeometry(0.24, 0), mats.gemMat, x, yBase + 3.45, z - 0.5, false);
    // Reposabrazos
    this.#addBox(0.22, 0.48, 1.15, x - 0.65, yBase + 0.95, z, mats.roseGold, true, false);
    this.#addBox(0.22, 0.48, 1.15, x + 0.65, yBase + 0.95, z, mats.roseGold, true, false);

    this.#collision.addBox(x - 0.85, x + 0.85, yBase, yBase + 3.2, z - 0.72, z + 0.72);
  }

  // =========================================================================
  // 3. SUITE REAL / DORMITORIO DE PRINCESA (Planta Alta Izquierda, Y = 7.5)
  // =========================================================================
  #buildRoyalSuite(mats) {
    const y = 7.5;

    // Cama real con dosel y cortinas translúcidas en (-29, 7.5, -46)
    this.#addBox(3.8, 0.6, 4.4, -29, y + 0.3, -46, mats.roseGold, true, false);
    this.#addBox(3.4, 0.38, 4.0, -29, y + 0.78, -46, mats.creamSilk, false, false);
    this.#addBox(3.45, 0.42, 2.5, -29, y + 0.84, -45.2, mats.blushSilk, false, false);
    // Cabecero tapizado
    this.#addBox(3.8, 2.1, 0.28, -29, y + 1.45, -48.1, mats.roseGold, true, false);
    this.#addBox(3.3, 1.65, 0.14, -29, y + 1.48, -47.92, mats.velvet, false, false);
    // Almohadas
    this.#addBox(1.1, 0.24, 0.65, -29.85, y + 1.08, -47.4, mats.creamSilk, false, false);
    this.#addBox(1.1, 0.24, 0.65, -28.15, y + 1.08, -47.4, mats.creamSilk, false, false);
    // Postes y dosel translúcido
    const postGeo = this.#trackGeo(new THREE.CylinderGeometry(0.1, 0.12, 3.8, 10));
    for (const [px, pz] of [[-30.8, -48.0], [-27.2, -48.0], [-30.8, -44.0], [-27.2, -44.0]]) {
      const p = new THREE.Mesh(postGeo, mats.roseGold);
      p.position.set(px, y + 1.9, pz);
      this.#root.add(p);
      const curtain = new THREE.Mesh(this.#trackGeo(new THREE.CylinderGeometry(0.28, 0.45, 3.4, 10)), mats.tulleCanopy);
      curtain.position.set(px + (px < -29 ? 0.15 : -0.15), y + 1.9, pz + (pz < -46 ? 0.15 : -0.15));
      this.#root.add(curtain);
    }
    this.#addBox(3.9, 0.22, 4.3, -29, y + 3.85, -46, mats.roseGold, true, false);
    this.#collision.addBox(-31.0, -27.0, y, y + 4.0, -48.3, -43.7);

    // Mesillas de noche con lámparas de cristal
    for (const mx of [-31.7, -26.3]) {
      this.#addBox(0.85, 0.78, 0.75, mx, y + 0.39, -47.7, mats.mahogany, true, true);
      this.#addMesh(new THREE.CylinderGeometry(0.14, 0.2, 0.35, 10), mats.roseGold, mx, y + 0.95, -47.7, false);
      this.#addMesh(new THREE.SphereGeometry(0.16, 10, 8), mats.flameMat, mx, y + 1.2, -47.7, false);
    }

    // Tocador con espejo iluminado y frascos de perfume (despeja puerta balcón Z ∈ [-38.1, -33.9])
    this.#addBox(1.1, 0.95, 2.8, -34.2, y + 0.475, -29.5, mats.creamSilk, true, false);
    this.#addBox(1.16, 0.1, 2.9, -34.2, y + 0.98, -29.5, mats.marble, false, false);
    this.#addBox(0.16, 1.85, 2.1, -34.65, y + 1.95, -29.5, mats.roseGold, false, false);
    this.#addBox(0.06, 1.6, 1.8, -34.55, y + 1.95, -29.5, mats.mirror, false, false);
    // Bombillas alrededor del espejo
    for (let i = 0; i < 6; i++) {
      this.#addMesh(new THREE.SphereGeometry(0.06, 8, 8), mats.flameMat, -34.54, y + 2.72, -30.3 + i * 0.32, false);
    }
    // Frascos de perfume
    for (const [pz, col] of [[-30.2, 0xff9bd4], [-29.8, 0xa8e0ff], [-28.8, 0xffe09b]]) {
      const pMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.15, metalness: 0.2 });
      this.#materials.push(pMat);
      this.#addMesh(new THREE.CylinderGeometry(0.09, 0.11, 0.24, 10), pMat, -33.95, y + 1.15, pz, false);
    }
    // Taburete del tocador
    this.#addMesh(new THREE.CylinderGeometry(0.36, 0.32, 0.56, 12), mats.velvet, -33.1, y + 0.28, -29.5, true);
    this.#collision.addBox(-34.9, -32.6, y, y + 2.9, -31.0, -28.0);

    // Armario vestidor abierto con vestidos 3D expuestos en (-22, 7.5, -51.8)
    this.#addBox(5.4, 4.1, 1.5, -22, y + 2.05, -52.2, mats.mahogany, true, false);
    this.#addBox(5.6, 0.22, 1.65, -22, y + 4.15, -52.2, mats.roseGold, true, false);
    this.#addMesh(new THREE.CylinderGeometry(0.04, 0.04, 4.8, 8), mats.roseGold, -22, y + 3.45, -51.8, false).rotation.z = Math.PI / 2;
    const gownColors = [0xf67db8, 0xc79bff, 0x8ad6ff, 0xffcaa6, 0xf2b5d4];
    for (let i = 0; i < gownColors.length; i++) {
      const gx = -23.8 + i * 0.9;
      const gMat = new THREE.MeshStandardMaterial({ color: gownColors[i], roughness: 0.45, metalness: 0.08 });
      this.#materials.push(gMat);
      this.#addMesh(new THREE.ConeGeometry(0.34, 1.45, 12), gMat, gx, y + 2.2, -51.8, false);
      this.#addMesh(new THREE.CylinderGeometry(0.14, 0.18, 0.45, 10), gMat, gx, y + 3.05, -51.8, false);
    }
    this.#collision.addBox(-24.8, -19.2, y, y + 4.2, -53.1, -51.3);

    // Alfombra circular peluda en (-25, 7.52, -38)
    this.#addMesh(new THREE.CylinderGeometry(4.2, 4.2, 0.04, 32), mats.blushSilk, -25, y + 0.02, -38, false);
    this.#addMesh(new THREE.CylinderGeometry(3.2, 3.2, 0.05, 32), mats.creamSilk, -25, y + 0.025, -38, false);

    // Diván de lectura en la Suite (minY = 7.5)
    this.#addVelvetDivan(-20.2, y, -36.0, Math.PI, mats, true);

    this.#addPointLight(-26, y + 5.2, -38, 0xffdef0, 18, 22);
    this.#addPointLight(-28, y + 4.8, -48, 0xffe8e0, 12, 16);
  }

  // =========================================================================
  // 4. SALÓN DE BAILE Y BANQUETES (Planta Baja Derecha, X ∈ [14, 36], Y = 1.0)
  // =========================================================================
  #buildBallroomAndBanquet(mats) {
    // Pista de baile pulida e iluminada centrada en (23, 1.03, -33) (10 x 13m)
    this.#addBox(10.6, 0.05, 13.6, 23, 1.015, -33, mats.roseGold, false, false);
    this.#addBox(10.0, 0.06, 13.0, 23, 1.03, -33, mats.danceFloor, false, false);

    // Columnas de cristal iluminadas en las esquinas de la pista
    for (const [cx, cz] of [
      [18.1, -26.6], [27.9, -26.6],
      [18.1, -39.4], [27.9, -39.4]
    ]) {
      this.#addMesh(new THREE.CylinderGeometry(0.4, 0.45, 0.35, 12), mats.roseGold, cx, 1.175, cz, true);
      this.#addMesh(new THREE.CylinderGeometry(0.28, 0.32, 5.8, 10), mats.crystal, cx, 4.25, cz, false);
      this.#addMesh(new THREE.CylinderGeometry(0.45, 0.35, 0.35, 12), mats.roseGold, cx, 7.25, cz, false);
      this.#collision.addCylinderCollider(cx, cz, 0.45, 1.0, 7.4);
    }

    // Piano de cola blanco y dorado en (18.5, 1.0, -24.8) + arpa dorada y banqueta
    this.#buildGrandPianoAndHarp(18.5, 1.0, -24.8, mats);

    // Mesa imperial de banquetes en (31.5, 1.0, -44.0) (despeja puerta Este Z ∈ [-38.3, -33.7])
    this.#buildImperialBanquetTable(31.5, 1.0, -44.0, mats);

    this.#addPointLight(23, 5.8, -33, 0xf2c8ff, 22, 24);
    this.#addPointLight(31.5, 5.4, -44, 0xffe4d0, 16, 18);
  }

  #buildGrandPianoAndHarp(x, yBase, z, mats) {
    const piano = new THREE.Group();
    piano.position.set(x, yBase, z);

    // Silueta curva del piano de cola
    const shape = new THREE.Shape();
    shape.moveTo(-1.15, -0.9);
    shape.lineTo(1.15, -0.9);
    shape.lineTo(1.15, 0.25);
    shape.bezierCurveTo(1.15, 0.85, 0.35, 1.05, 0.1, 1.55);
    shape.bezierCurveTo(-0.15, 2.05, -1.15, 1.9, -1.15, 0.9);
    shape.closePath();

    const bodyGeo = this.#trackGeo(new THREE.ExtrudeGeometry(shape, { depth: 0.42, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 }));
    bodyGeo.rotateX(Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, mats.pianoLacquer);
    body.position.y = 1.24;
    body.castShadow = true;
    piano.add(body);

    // Tapa levantada brillante (preserveRoughness = true en mats.pianoLacquer)
    const lidGeo = this.#trackGeo(new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false }));
    lidGeo.rotateX(Math.PI / 2);
    const lid = new THREE.Mesh(lidGeo, mats.pianoLacquer);
    lid.position.set(0, 1.28, 0);
    lid.rotation.z = 0.48;
    lid.castShadow = true;
    piano.add(lid);

    // Puntal dorado de la tapa
    const prop = new THREE.Mesh(this.#trackGeo(new THREE.CylinderGeometry(0.025, 0.025, 0.95, 8)), mats.roseGold);
    prop.position.set(0.68, 1.66, 0.1);
    prop.rotation.z = -0.18;
    piano.add(prop);

    // Patas torneadas
    const legGeo = this.#trackGeo(new THREE.CylinderGeometry(0.07, 0.04, 0.84, 10));
    for (const [lx, lz] of [[-0.95, -0.75], [0.95, -0.75], [-0.55, 1.35]]) {
      const leg = new THREE.Mesh(legGeo, mats.roseGold);
      leg.position.set(lx, 0.42, lz);
      piano.add(leg);
    }

    // Teclado blanco y negro + atril
    const keyBed = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(1.9, 0.1, 0.36)), mats.pianoKeysWhite);
    keyBed.position.set(0, 0.96, -1.04);
    const blackKeys = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(1.72, 0.06, 0.16)), mats.pianoKeysBlack);
    blackKeys.position.set(0, 1.03, -0.96);
    const stand = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(0.95, 0.34, 0.04)), mats.roseGold);
    stand.position.set(0, 1.42, -0.78);
    stand.rotation.x = -0.25;
    piano.add(keyBed, blackKeys, stand);

    // Banqueta del piano
    const bench = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(1.1, 0.18, 0.48)), mats.velvet);
    bench.position.set(0, 0.56, -1.72);
    piano.add(bench);

    // Arpa dorada al lado del piano
    const harpX = -2.1;
    const harpBase = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(0.5, 0.25, 0.85)), mats.roseGold);
    harpBase.position.set(harpX, 0.125, 0.2);
    const harpPillar = new THREE.Mesh(this.#trackGeo(new THREE.CylinderGeometry(0.05, 0.07, 1.9, 10)), mats.roseGold);
    harpPillar.position.set(harpX, 1.1, -0.18);
    const harpNeck = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(0.08, 0.14, 0.95)), mats.roseGold);
    harpNeck.position.set(harpX, 1.95, 0.25);
    harpNeck.rotation.x = 0.22;
    const harpBoard = new THREE.Mesh(this.#trackGeo(new THREE.CylinderGeometry(0.06, 0.12, 1.8, 10)), mats.roseGold);
    harpBoard.position.set(harpX, 0.98, 0.42);
    harpBoard.rotation.x = -0.3;
    piano.add(harpBase, harpPillar, harpNeck, harpBoard);

    for (let s = 0; s < 7; s++) {
      const str = new THREE.Mesh(this.#trackGeo(new THREE.CylinderGeometry(0.008, 0.008, 1.35, 6)), mats.creamSilk);
      str.position.set(harpX, 1.25, -0.05 + s * 0.09);
      piano.add(str);
    }

    this.#root.add(piano);
    this.#collision.addBox(x - 2.6, x + 1.4, yBase, yBase + 2.4, z - 2.0, z + 1.95);
  }

  #buildImperialBanquetTable(x, yBase, z, mats) {
    // Mesa imperial (2.6 x 10.6m) con mantel elegante y camino dorado
    this.#addBox(2.6, 0.85, 10.6, x, yBase + 0.425, z, mats.creamSilk, true, false);
    this.#addBox(2.7, 0.08, 10.7, x, yBase + 0.86, z, mats.blushSilk, false, false);
    this.#addBox(0.75, 0.02, 10.5, x, yBase + 0.91, z, mats.roseGold, false, false);

    // 3 candelabros dorados con llamitas suaves
    for (const cz of [z - 3.3, z, z + 3.3]) {
      this.#addMesh(new THREE.CylinderGeometry(0.08, 0.24, 0.58, 10), mats.roseGold, x, yBase + 1.2, cz, false);
      this.#addBox(0.55, 0.06, 0.08, x, yBase + 1.45, cz, mats.roseGold, false, false);
      for (const ox of [-0.22, 0, 0.22]) {
        this.#addMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8), mats.creamSilk, x + ox, yBase + 1.56, cz, false);
        const fl = this.#addMesh(new THREE.SphereGeometry(0.048, 8, 8), mats.flameMat, x + ox, yBase + 1.7, cz, false);
        fl.scale.set(0.8, 1.3, 0.8);
        this.#candleFlames.push({ mesh: fl, baseY: yBase + 1.7, phase: cz + ox * 5 });
      }
    }

    // 2 tartas reales escalonadas
    for (const cz of [z - 1.65, z + 1.65]) {
      this.#addMesh(new THREE.CylinderGeometry(0.36, 0.36, 0.16, 16), mats.pastryFrosting, x, yBase + 1.0, cz, false);
      this.#addMesh(new THREE.CylinderGeometry(0.25, 0.25, 0.16, 16), mats.blushSilk, x, yBase + 1.16, cz, false);
      this.#addMesh(new THREE.CylinderGeometry(0.14, 0.14, 0.14, 16), mats.pastryFrosting, x, yBase + 1.31, cz, false);
      this.#addMesh(new THREE.OctahedronGeometry(0.06, 0), mats.rosePetal, x, yBase + 1.44, cz, false);
    }

    // Copas y platos instanciados (10 puestos)
    const plateGeo = this.#trackGeo(new THREE.CylinderGeometry(0.2, 0.16, 0.03, 14));
    const gobletGeo = this.#trackGeo(new THREE.CylinderGeometry(0.07, 0.04, 0.2, 10));
    const plates = new THREE.InstancedMesh(plateGeo, mats.roseGold, 10);
    const goblets = new THREE.InstancedMesh(gobletGeo, mats.crystal, 10);
    const dummy = new THREE.Object3D();

    // 10 sillas tapizadas instanciadas (4 por lado + 2 cabeceras)
    const seatGeo = this.#trackGeo(new THREE.BoxGeometry(0.56, 0.52, 0.56));
    const backGeo = this.#trackGeo(new THREE.BoxGeometry(0.56, 0.72, 0.12));
    const seats = new THREE.InstancedMesh(seatGeo, mats.velvet, 10);
    const backs = new THREE.InstancedMesh(backGeo, mats.roseGold, 10);

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
      dummy.position.set(c.plateX, yBase + 0.93, c.plateZ);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      plates.setMatrixAt(i, dummy.matrix);

      dummy.position.set(c.plateX + (c.plateX > x ? -0.18 : 0.18), yBase + 1.02, c.plateZ + 0.15);
      dummy.updateMatrix();
      goblets.setMatrixAt(i, dummy.matrix);

      dummy.position.set(c.px, yBase + 0.26, c.pz);
      dummy.rotation.set(0, c.rotY, 0);
      dummy.updateMatrix();
      seats.setMatrixAt(i, dummy.matrix);

      const backOffsetX = -Math.sin(c.rotY) * 0.24;
      const backOffsetZ = -Math.cos(c.rotY) * 0.24;
      dummy.position.set(c.px + backOffsetX, yBase + 0.85, c.pz + backOffsetZ);
      dummy.rotation.set(0, c.rotY, 0);
      dummy.updateMatrix();
      backs.setMatrixAt(i, dummy.matrix);
    }

    for (const inst of [plates, goblets, seats, backs]) {
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      this.#root.add(inst);
      this.#instancedMeshes.push(inst);
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
    for (let i = 0; i < 2; i++) {
      const gx = i === 0 ? 20.5 : 30.5;
      const gz = -49.0;
      this.#addMesh(new THREE.CylinderGeometry(0.55, 0.65, 1.25, 14), mats.marble, gx, y + 0.625, gz, true);
      this.#addMesh(new THREE.TorusGeometry(0.62, 0.045, 8, 24), mats.roseGold, gx, y + 1.92, gz, false);
      const sphere = this.#addMesh(new THREE.SphereGeometry(0.52, 18, 14), mats.globeMat, gx, y + 1.92, gz, true);
      sphere.rotation.z = 0.28;
      this.#globes.push(sphere);
      this.#collision.addCylinderCollider(gx, gz, 0.7, y, y + 2.6);
    }

    // Sala de Té en (26, 7.5, -31)
    this.#addMesh(new THREE.CylinderGeometry(4.0, 4.0, 0.04, 32), mats.blushSilk, 26, y + 0.02, -31, false);
    this.#addMesh(new THREE.CylinderGeometry(3.1, 3.1, 0.05, 32), mats.creamSilk, 26, y + 0.025, -31, false);

    // Mesa central de té con tetera de porcelana, tazas y bandeja de pastelitos
    this.#addMesh(new THREE.CylinderGeometry(0.18, 0.42, 0.78, 12), mats.roseGold, 26, y + 0.39, -31, true);
    this.#addMesh(new THREE.CylinderGeometry(1.32, 1.32, 0.08, 24), mats.marble, 26, y + 0.82, -31, true);
    this.#collision.addCylinderCollider(26, -31, 1.38, y, y + 1.4);

    this.#buildTeaService(26, y + 0.86, -31, mats);

    // 4 sillones de terciopelo alrededor de la mesa de té (todos con minY = 7.5)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const cx = 26 + Math.cos(a) * 2.55;
      const cz = -31 + Math.sin(a) * 2.55;
      this.#buildVelvetArmchair(cx, y, cz, Math.atan2(26 - cx, -31 - cz), mats);
    }

    this.#addPointLight(26, y + 5.2, -33, 0xffe6f0, 18, 22);
    this.#addPointLight(25.5, y + 5.0, -48, 0xffe2d2, 14, 18);
  }

  #buildBookcaseRow(x, yBase, z, length, height, depth, rotY, mats, bookRecords) {
    const g = new THREE.Group();
    g.position.set(x, yBase, z);
    g.rotation.y = rotY;

    // Trasera, laterales y cornisa
    const back = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(length, height, 0.14)), mats.mahogany);
    back.position.set(0, height / 2, -depth / 2 + 0.07);
    const crown = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(length + 0.25, 0.24, depth + 0.15)), mats.roseGold);
    crown.position.set(0, height + 0.12, 0);
    g.add(back, crown);

    // Montantes verticales cada ~2.4m
    const bays = Math.max(2, Math.round(length / 2.4));
    const bayW = length / bays;
    const uprightGeo = this.#trackGeo(new THREE.BoxGeometry(0.14, height, depth));
    for (let i = 0; i <= bays; i++) {
      const u = new THREE.Mesh(uprightGeo, mats.mahogany);
      u.position.set(-length / 2 + i * bayW, height / 2, 0);
      g.add(u);
    }

    // 5 estantes horizontales
    const shelfLevels = [0.22, 1.18, 2.14, 3.1, 4.06];
    const shelfGeo = this.#trackGeo(new THREE.BoxGeometry(length, 0.08, depth));
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);

    for (const sy of shelfLevels) {
      const shelf = new THREE.Mesh(shelfGeo, mats.mahogany);
      shelf.position.set(0, sy, 0);
      g.add(shelf);

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

    this.#root.add(g);

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
    const dummy = new THREE.Object3D();
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
    this.#root.add(inst);
    this.#instancedMeshes.push(inst);
  }

  #buildTeaService(x, yTop, z, mats) {
    // Tetera de porcelana
    this.#addMesh(new THREE.SphereGeometry(0.18, 12, 10), mats.porcelain, x - 0.25, yTop + 0.16, z, false);
    this.#addMesh(new THREE.SphereGeometry(0.06, 8, 8), mats.roseGold, x - 0.25, yTop + 0.35, z, false);
    const spout = this.#addMesh(new THREE.CylinderGeometry(0.02, 0.04, 0.18, 8), mats.porcelain, x - 0.08, yTop + 0.2, z, false);
    spout.rotation.z = -0.8;

    // Bandeja escalonada de pastelitos
    this.#addMesh(new THREE.CylinderGeometry(0.025, 0.04, 0.36, 8), mats.roseGold, x + 0.3, yTop + 0.18, z - 0.12, false);
    this.#addMesh(new THREE.CylinderGeometry(0.28, 0.28, 0.025, 14), mats.porcelain, x + 0.3, yTop + 0.14, z - 0.12, false);
    this.#addMesh(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 14), mats.porcelain, x + 0.3, yTop + 0.3, z - 0.12, false);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      this.#addMesh(new THREE.SphereGeometry(0.045, 8, 6), mats.pastryFrosting, x + 0.3 + Math.cos(a) * 0.16, yTop + 0.18, z - 0.12 + Math.sin(a) * 0.16, false);
    }

    // 4 tazas y platillos
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const cx = x + Math.cos(a) * 0.82;
      const cz = z + Math.sin(a) * 0.82;
      this.#addMesh(new THREE.CylinderGeometry(0.11, 0.08, 0.02, 10), mats.porcelain, cx, yTop + 0.01, cz, false);
      this.#addMesh(new THREE.CylinderGeometry(0.065, 0.045, 0.08, 10), mats.porcelain, cx, yTop + 0.06, cz, false);
    }
  }

  #buildVelvetArmchair(x, yBase, z, rotY, mats) {
    const g = new THREE.Group();
    g.position.set(x, yBase, z);
    g.rotation.y = rotY;

    const seat = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(0.95, 0.44, 0.92)), mats.velvet);
    seat.position.y = 0.28;
    seat.castShadow = true;
    const back = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(0.95, 0.72, 0.2)), mats.velvet);
    back.position.set(0, 0.76, -0.36);
    back.castShadow = true;
    const armL = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(0.16, 0.36, 0.86)), mats.roseGold);
    armL.position.set(-0.42, 0.54, 0);
    const armR = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(0.16, 0.36, 0.86)), mats.roseGold);
    armR.position.set(0.42, 0.54, 0);

    g.add(seat, back, armL, armR);
    this.#root.add(g);
    this.#collision.addCylinderCollider(x, z, 0.62, yBase, yBase + 1.25);
  }

  applyTheme(theme) {
    if (!theme) return;
    if (this.#crystalMat && typeof theme.crystalEmissive === 'number') {
      this.#crystalMat.emissiveIntensity = Math.min(0.75, theme.crystalEmissive);
    }
    const mult = 0.65 + (theme.lanternIntensity ?? 1) * 0.35;
    for (const entry of this.#lights) {
      entry.light.intensity = entry.baseIntensity * mult;
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
    for (const f of this.#candleFlames) {
      const pulse = 1.0 + Math.sin(elapsed * 6.5 + f.phase) * 0.12;
      f.mesh.scale.set(0.8 * pulse, 1.35 * pulse, 0.8 * pulse);
    }
  }

  dispose() {
    for (const inst of this.#instancedMeshes) {
      if (typeof inst.dispose === 'function') inst.dispose();
    }
    for (const g of this.#geometries) g.dispose();
    for (const m of this.#materials) m.dispose();
    this.#instancedMeshes.length = 0;
    this.#geometries.length = 0;
    this.#materials.length = 0;
    this.#lights.length = 0;
    this.#chandeliers.length = 0;
    this.#floatingGems.length = 0;
    this.#globes.length = 0;
    this.#candleFlames.length = 0;
    this.#root = null;
  }
}
