import * as THREE from 'three';

export class CastleBuilder {
  #scene;
  #textures;
  #collision;
  #root = null;
  #materials = [];
  #geometries = [];
  #chandelier = null;
  #danceFloorMat = null;
  #crystalMat = null;
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
    this.#buildFoundationAndSteps(mats);
    this.#buildWallsAndWings(mats);
    this.#buildStaircaseAndUpperFloor(mats);
    this.#buildTowersAndCrystalSpire(mats);
    this.#buildInteriorDetails(mats);
    this.#scene.add(this.#root);
  }

  #createMaterials() {
    const marble = new THREE.MeshStandardMaterial({ map: this.#textures.getTexture('marble', 3, 2), roughness: 0.24, metalness: 0.05 });
    const marbleFloor = new THREE.MeshStandardMaterial({ map: this.#textures.getTexture('marbleFloor', 10, 7), roughness: 0.18, metalness: 0.08 });
    const roseGold = new THREE.MeshStandardMaterial({ map: this.#textures.getTexture('roseGold', 1, 1), color: 0xf4b6a8, metalness: 0.9, roughness: 0.15 });
    const crystal = new THREE.MeshPhysicalMaterial({
      color: 0xffd9f2, emissive: 0xe684c4, emissiveIntensity: 0.4,
      metalness: 0.12, roughness: 0.08, transmission: 0.55, thickness: 0.8, transparent: true, opacity: 0.88
    });
    const stained = new THREE.MeshStandardMaterial({ map: this.#textures.getTexture('stainedCrystal', 1, 2), emissive: 0xffc8e8, emissiveIntensity: 0.35, roughness: 0.16, metalness: 0.15 });
    const carpet = new THREE.MeshStandardMaterial({ map: this.#textures.getTexture('carpet', 1, 5), roughness: 0.85, metalness: 0.02 });
    const mirror = new THREE.MeshStandardMaterial({ color: 0xf4f8ff, metalness: 0.96, roughness: 0.04 });
    const danceFloor = new THREE.MeshStandardMaterial({ map: this.#textures.getTexture('danceFloor', 4, 5), emissive: 0xd968b4, emissiveIntensity: 0.45, roughness: 0.14, metalness: 0.22 });
    const velvet = new THREE.MeshStandardMaterial({ color: 0xc23c81, roughness: 0.78, metalness: 0.05 });

    this.#crystalMat = crystal;
    this.#danceFloorMat = danceFloor;
    this.#materials.push(marble, marbleFloor, roseGold, crystal, stained, carpet, mirror, danceFloor, velvet);
    return { marble, marbleFloor, roseGold, crystal, stained, carpet, mirror, danceFloor, velvet };
  }

  #addMesh(geo, mat, x, y, z, castShadow = true) {
    this.#geometries.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    this.#root.add(mesh);
    return mesh;
  }

  #addBox(w, h, d, x, y, z, mat, castShadow = true, addCollider = false) {
    const mesh = this.#addMesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, castShadow);
    if (addCollider) {
      this.#collision.addBox(x - w / 2, x + w / 2, y - h / 2, y + h / 2, z - d / 2, z + d / 2);
    }
    return mesh;
  }

  #addColumn(x, yBase, z, height, radius, mats, addCollider = true) {
    const capGeo = new THREE.CylinderGeometry(radius * 1.28, radius * 0.92, 0.45, 14);
    this.#geometries.push(capGeo);
    this.#addMesh(new THREE.CylinderGeometry(radius * 0.88, radius, height, 14), mats.marble, x, yBase + height / 2, z, true);
    const topCap = new THREE.Mesh(capGeo, mats.roseGold);
    topCap.position.set(x, yBase + height - 0.15, z);
    const baseCap = new THREE.Mesh(capGeo, mats.roseGold);
    baseCap.position.set(x, yBase + 0.18, z);
    this.#root.add(topCap, baseCap);
    if (addCollider) this.#collision.addCylinderCollider(x, z, radius * 1.05, yBase, yBase + height);
  }

  #buildFoundationAndSteps(mats) {
    this.#addBox(48, 1.0, 32, 0, 0.5, -38, mats.marbleFloor, false, false);
    this.#collision.addFlatSurface(-24, 24, -54, -22, 1.0);

    for (let i = 0; i < 5; i++) {
      const h = (i + 1) * 0.2;
      this.#addBox(14 - i * 0.2, h, 0.85, 0, h / 2, -18.4 - i * 0.8, mats.marble, true, false);
    }
    // Rampa alineada con la huella de cada peldaño (centro del peldaño i => altura 0.2·(i+1))
    this.#collision.addRampSurface(-7.2, 7.2, -22.2, -17.5, 'z', -17.6, -21.6, 0.0, 1.0);
    this.#addBox(16, 1.1, 4.2, -15.5, 0.55, -20, mats.marble, true, true);
    this.#addBox(16, 1.1, 4.2, 15.5, 0.55, -20, mats.marble, true, true);
    // Se puede saltar encima de los pedestales laterales sin atravesarlos
    this.#collision.addFlatSurface(-23.5, -7.5, -22.1, -17.9, 1.1);
    this.#collision.addFlatSurface(7.5, 23.5, -22.1, -17.9, 1.1);
    this.#addBox(4.4, 0.04, 19, 0, 1.02, -31.5, mats.carpet, false, false);
  }

  #buildWallsAndWings(mats) {
    const wallH = 13.0;
    const wallY = 1.0 + wallH / 2;

    // Fachada frontal con arco central abierto y arcos en planta alta
    this.#addBox(19.5, wallH, 1.0, -14.25, wallY, -22, mats.marble, true, true);
    this.#addBox(19.5, wallH, 1.0, 14.25, wallY, -22, mats.marble, true, true);
    this.#addBox(9.2, 0.75, 1.1, 0, 6.65, -22, mats.roseGold, true, false);
    this.#addBox(9.2, 1.9, 1.1, 0, 13.05, -22, mats.marble, true, false);

    // Muros laterales, trasero y cubierta con cornisa oro rosa
    this.#addBox(1.0, wallH, 32, -24, wallY, -38, mats.marble, true, true);
    this.#addBox(1.0, wallH, 32, 24, wallY, -38, mats.marble, true, true);
    this.#addBox(48, wallH, 1.0, 0, wallY, -54, mats.marble, true, true);
    this.#addBox(49.2, 0.7, 33.2, 0, 14.1, -38, mats.roseGold, true, false);
    this.#addBox(48, 0.6, 32, 0, 14.5, -38, mats.marble, false, false);

    // Particiones interiores (Vestidor Real Oeste y Salón de Baile Este con arcos de 7m)
    for (const side of [-12, 12]) {
      this.#addBox(0.8, 6.0, 7.5, side, 4.0, -25.75, mats.marble, true, true);
      this.#addBox(0.8, 6.0, 17.5, side, 4.0, -45.25, mats.marble, true, true);
      this.#addBox(0.9, 1.1, 7.2, side, 6.5, -33, mats.roseGold, false, false);
    }

    // Ventanales de cristal tintado
    for (const x of [-17.5, -11, 11, 17.5]) {
      this.#addBox(3.0, 4.4, 0.25, x, 4.2, -21.45, mats.stained, false, false);
      this.#addBox(3.0, 4.2, 0.25, x, 10.2, -21.45, mats.stained, false, false);
      this.#addBox(3.3, 0.25, 0.35, x, 6.5, -21.4, mats.roseGold, false, false);
    }
    for (const z of [-28, -35, -42, -48]) {
      this.#addBox(0.25, 4.8, 3.2, 23.45, 4.4, z, mats.stained, false, false);
      this.#addBox(0.25, 4.8, 3.2, -23.45, 4.4, z, mats.stained, false, false);
    }
  }

  #buildStaircaseAndUpperFloor(mats) {
    // Escalinata central (Y = 1 a 4)
    for (let i = 0; i < 10; i++) {
      const h = 1.0 + (i + 1) * 0.3;
      this.#addBox(6.2, 0.32, 0.76, 0, h - 0.16, -41.35 - i * 0.7, mats.marble, true, false);
    }
    this.#addBox(3.2, 0.04, 7.4, 0, 2.55, -44.5, mats.carpet, false, false).rotation.x = 0.404;
    // Rampa alineada con la huella de los peldaños (antes quedaba 15 cm por debajo)
    this.#collision.addRampSurface(-3.2, 3.2, -48.2, -40.4, 'z', -40.62, -47.62, 1.0, 4.0);
    // Zancas laterales invisibles: impiden atravesar los peldaños desde el lateral
    this.#collision.addBox(3.15, 3.45, 1.0, 3.9, -47.7, -40.6);
    this.#collision.addBox(-3.45, -3.15, 1.0, 3.9, -47.7, -40.6);

    // Descansillo y tramos dobles superiores (Y = 4 a 7)
    this.#addBox(12.2, 0.5, 5.4, 0, 3.75, -50.6, mats.marbleFloor, true, false);
    this.#collision.addFlatSurface(-6.2, 6.2, -53.3, -47.9, 4.0);
    for (const dir of [-1, 1]) {
      for (let i = 0; i < 10; i++) {
        const h = 4.0 + (i + 1) * 0.3;
        this.#addBox(0.7, 0.32, 3.6, dir * (5.3 + i * 0.65), h - 0.16, -50.3, mats.marble, true, false);
      }
      this.#collision.addRampSurface(dir < 0 ? -11.6 : 4.9, dir < 0 ? -4.9 : 11.6, -52.3, -48.2, 'x', dir * 4.65, dir * 11.15, 4.0, 7.0);
    }

    // Galerías superiores (Y = 7.0) y barandillas interiores
    this.#addBox(12.5, 0.55, 31.4, -17.5, 6.72, -38, mats.marbleFloor, true, false);
    this.#addBox(12.5, 0.55, 31.4, 17.5, 6.72, -38, mats.marbleFloor, true, false);
    this.#addBox(23.0, 0.55, 4.6, 0, 6.72, -24.4, mats.marbleFloor, true, false);
    this.#collision.addFlatSurface(-23.8, -11.0, -53.6, -22.2, 7.0);
    this.#collision.addFlatSurface(11.0, 23.8, -53.6, -22.2, 7.0);
    this.#collision.addFlatSurface(-11.5, 11.5, -26.8, -22.0, 7.0);

    this.#addBox(0.25, 1.15, 22, -11.3, 7.6, -37.6, mats.roseGold, false, true);
    this.#addBox(0.25, 1.15, 22, 11.3, 7.6, -37.6, mats.roseGold, false, true);
    this.#addBox(22.4, 1.15, 0.25, 0, 7.6, -26.5, mats.roseGold, false, true);

    // Balcón Real exterior y columnata frontal
    this.#addBox(18.0, 0.65, 5.0, 0, 6.68, -19.5, mats.marbleFloor, true, false);
    this.#collision.addFlatSurface(-9.0, 9.0, -22.2, -17.1, 7.0);
    this.#addBox(18.0, 1.15, 0.32, 0, 7.6, -17.1, mats.roseGold, true, true);
    this.#addBox(0.32, 1.15, 4.8, -8.85, 7.6, -19.5, mats.roseGold, true, true);
    this.#addBox(0.32, 1.15, 4.8, 8.85, 7.6, -19.5, mats.roseGold, true, true);
    // Las columnas del pórtico apoyan en el suelo (Y=0) y sostienen el balcón (base en Y≈6.35).
    // Antes nacían en Y=1 y quedaban flotando delante de la escalinata.
    for (const x of [-8.2, -4.6, 4.6, 8.2]) {
      this.#addColumn(x, 0, -17.6, 6.35, 0.42, mats, true);
    }
  }

  #buildTowersAndCrystalSpire(mats) {
    for (const [tx, tz] of [[-24, -22], [24, -22], [-24, -54], [24, -54]]) {
      this.#addMesh(new THREE.CylinderGeometry(3.2, 3.5, 18.5, 8), mats.marble, tx, 9.25, tz, true);
      this.#collision.addCylinderCollider(tx, tz, 3.35, 0, 18.5);
      this.#addMesh(new THREE.SphereGeometry(3.25, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), mats.roseGold, tx, 18.4, tz, false);
      this.#addMesh(new THREE.ConeGeometry(0.9, 5.2, 6), mats.crystal, tx, 23.8, tz, false);
    }
    this.#addMesh(new THREE.CylinderGeometry(5.6, 6.4, 3.5, 12), mats.roseGold, 0, 16.2, -38, false);
    const core = this.#addMesh(new THREE.OctahedronGeometry(4.4, 0), mats.crystal, 0, 22.8, -38, false);
    core.scale.set(1, 1.75, 1);
    this.#addMesh(new THREE.ConeGeometry(3.2, 12.5, 8), mats.crystal, 0, 29.8, -38, false);
  }

  #buildInteriorDetails(mats) {
    for (const [cx, cz] of [[-7.2, -28], [7.2, -28], [-7.2, -38], [7.2, -38]]) {
      this.#addColumn(cx, 1.0, cz, 12.8, 0.45, mats, true);
    }

    // Lámpara de araña monumental
    this.#chandelier = new THREE.Group();
    this.#chandelier.position.set(0, 11.4, -33);
    const gemGeo = new THREE.OctahedronGeometry(0.32, 0);
    const ringGeo = new THREE.TorusGeometry(2.6, 0.12, 10, 28);
    const chainGeo = new THREE.CylinderGeometry(0.08, 0.08, 3.2, 8);
    this.#geometries.push(gemGeo, ringGeo, chainGeo);

    const chain = new THREE.Mesh(chainGeo, mats.roseGold);
    chain.position.y = 1.6;
    const ring = new THREE.Mesh(ringGeo, mats.roseGold);
    ring.rotation.x = Math.PI / 2;
    this.#chandelier.add(chain, ring);

    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const drop = new THREE.Mesh(gemGeo, mats.crystal);
      drop.position.set(Math.cos(a) * 2.6, -0.45, Math.sin(a) * 2.6);
      this.#chandelier.add(drop);
    }
    const centerDrop = new THREE.Mesh(gemGeo, mats.crystal);
    centerDrop.scale.set(1.8, 2.6, 1.8);
    centerDrop.position.y = -0.9;
    this.#chandelier.add(centerDrop);
    this.#root.add(this.#chandelier);

    this.#addPointLight(0, 10.2, -33, 0xffe4f0, 22, 26);
    this.#addPointLight(-18, 5.4, -35, 0xffd7ea, 16, 18);
    this.#addPointLight(18, 5.4, -35, 0xf2c8ff, 18, 20);

    // Vestidor Real (Ala Oeste): espejos, podio y diván
    for (const z of [-29, -35, -41]) {
      this.#addBox(0.2, 3.6, 2.2, -23.3, 3.0, z, mats.roseGold, false, false);
      this.#addBox(0.08, 3.25, 1.85, -23.16, 3.0, z, mats.mirror, false, false);
    }
    this.#addMesh(new THREE.CylinderGeometry(2.1, 2.35, 0.22, 24), mats.roseGold, -18, 1.11, -35, false);
    this.#addBox(1.2, 0.65, 2.8, -15, 1.32, -41, mats.velvet, true, true);

    // Salón de Baile (Ala Este): pista iluminada y pilares de cristal
    this.#addBox(8.6, 0.06, 14.5, 18, 1.03, -35, mats.danceFloor, false, false);
    for (const [px, pz] of [[13.8, -28], [22.2, -28], [13.8, -42], [22.2, -42]]) {
      this.#addMesh(new THREE.CylinderGeometry(0.28, 0.34, 5.6, 8), mats.crystal, px, 3.8, pz, false);
    }
  }

  #addPointLight(x, y, z, color, intensity, distance) {
    const light = new THREE.PointLight(color, intensity, distance, 1.6);
    light.position.set(x, y, z);
    this.#root.add(light);
    this.#lights.push({ light, baseIntensity: intensity });
  }

  applyTheme(theme) {
    if (!theme) return;
    if (this.#crystalMat) this.#crystalMat.emissiveIntensity = theme.crystalEmissive;
    for (const entry of this.#lights) {
      entry.light.intensity = entry.baseIntensity * (0.65 + theme.lanternIntensity * 0.35);
    }
  }

  pulseBallroom(amount = 1) {
    if (this.#danceFloorMat) this.#danceFloorMat.emissiveIntensity = 0.45 + amount * 0.95;
  }

  update(dt) {
    this.#elapsed += dt;
    if (this.#chandelier) this.#chandelier.rotation.y = Math.sin(this.#elapsed * 0.35) * 0.14;
    if (this.#danceFloorMat) {
      const target = 0.45 + Math.sin(this.#elapsed * 2.2) * 0.15;
      this.#danceFloorMat.emissiveIntensity += (target - this.#danceFloorMat.emissiveIntensity) * Math.min(1, dt * 4);
    }
  }

  dispose() {
    if (this.#root) {
      this.#scene.remove(this.#root);
      this.#root = null;
    }
    for (const g of this.#geometries) g.dispose();
    for (const m of this.#materials) m.dispose();
    this.#geometries.length = 0;
    this.#materials.length = 0;
    this.#lights.length = 0;
  }
}
