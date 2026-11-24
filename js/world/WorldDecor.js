import * as THREE from 'three';

export class WorldDecor {
  #scene;
  #textures;
  #collision;
  #root = null;
  #geometries = [];
  #materials = [];
  #waterMesh = null;
  #lakeMesh = null;
  #fountainDrops = null;
  #dropPhases = null;
  #lanternLights = [];
  #lanternMat = null;
  #elapsed = 0;

  constructor(scene, textureFactory, collisionSystem) {
    this.#scene = scene;
    this.#textures = textureFactory;
    this.#collision = collisionSystem;
  }

  init() {
    this.#root = new THREE.Group();
    this.#root.name = 'RoyalGardens';

    const mats = this.#createMaterials();
    this.#buildGroundAndPromenade(mats);
    this.#buildMonumentalFountain(mats);
    this.#buildFashionRunway(mats);
    this.#buildGeometricGardens(mats);
    this.#buildMiradorAndLake(mats);
    this.#buildEstatePerimeterAndLanterns(mats);

    this.#scene.add(this.#root);
  }

  #createMaterials() {
    const grass = new THREE.MeshStandardMaterial({
      map: this.#textures.getTexture('grass', 22, 22),
      roughness: 0.92,
      metalness: 0.0
    });
    const marble = new THREE.MeshStandardMaterial({
      map: this.#textures.getTexture('marble', 2, 2),
      roughness: 0.25,
      metalness: 0.06
    });
    const plazaFloor = new THREE.MeshStandardMaterial({
      map: this.#textures.getTexture('marbleFloor', 6, 6),
      roughness: 0.2,
      metalness: 0.08
    });
    const roseGold = new THREE.MeshStandardMaterial({
      map: this.#textures.getTexture('roseGold', 1, 1),
      color: 0xf4b6a8,
      metalness: 0.9,
      roughness: 0.15
    });
    const hedge = new THREE.MeshStandardMaterial({
      map: this.#textures.getTexture('hedge', 2, 2),
      roughness: 0.88,
      metalness: 0.02
    });
    const water = new THREE.MeshPhysicalMaterial({
      map: this.#textures.getTexture('water', 3, 3),
      color: 0x8be4ff,
      roughness: 0.08,
      metalness: 0.12,
      transmission: 0.45,
      transparent: true,
      opacity: 0.88
    });
    const roseBlossom = new THREE.MeshStandardMaterial({
      color: 0xff8bc4,
      emissive: 0x6b1846,
      emissiveIntensity: 0.22,
      roughness: 0.45
    });
    const runwayCarpet = new THREE.MeshStandardMaterial({
      map: this.#textures.getTexture('carpet', 1, 8),
      roughness: 0.55,
      metalness: 0.12
    });
    const lantern = new THREE.MeshStandardMaterial({
      color: 0xfff3d4,
      emissive: 0xffd28c,
      emissiveIntensity: 1.2,
      roughness: 0.15
    });
    const crystalDome = new THREE.MeshPhysicalMaterial({
      color: 0xffd8f0,
      emissive: 0xe384c6,
      emissiveIntensity: 0.3,
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 0.72
    });

    this.#lanternMat = lantern;
    this.#materials.push(grass, marble, plazaFloor, roseGold, hedge, water, roseBlossom, runwayCarpet, lantern, crystalDome);
    return { grass, marble, plazaFloor, roseGold, hedge, water, roseBlossom, runwayCarpet, lantern, crystalDome };
  }

  #addMesh(geo, mat, x, y, z, castShadow = true, receiveShadow = true) {
    this.#geometries.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = castShadow;
    m.receiveShadow = receiveShadow;
    this.#root.add(m);
    return m;
  }

  #buildGroundAndPromenade(mats) {
    // Césped señorial
    const groundGeo = new THREE.PlaneGeometry(170, 170);
    const ground = this.#addMesh(groundGeo, mats.grass, 0, 0, -4, false, true);
    ground.rotation.x = -Math.PI / 2;

    // Paseo Central Norte-Sur (Castillo <-> Fuente <-> Mirador)
    this.#addMesh(new THREE.BoxGeometry(9.6, 0.08, 62), mats.plazaFloor, 0, 0.02, 10, false, true);
    // Paseos transversales hacia Pasarela (Oeste) y Jardines Geométricos (Este)
    this.#addMesh(new THREE.BoxGeometry(58, 0.08, 6.2), mats.plazaFloor, 0, 0.02, 0, false, true);
  }

  #buildMonumentalFountain(mats) {
    // Plaza octogonal de mármol
    this.#addMesh(new THREE.CylinderGeometry(12.2, 12.6, 0.14, 16), mats.plazaFloor, 0, 0.07, 0, false, true);
    this.#addMesh(new THREE.TorusGeometry(12.1, 0.14, 8, 48), mats.roseGold, 0, 0.18, 0, false, true).rotation.x = Math.PI / 2;

    // Estanque principal y niveles de la fuente
    this.#addMesh(new THREE.CylinderGeometry(4.2, 4.5, 0.75, 24), mats.marble, 0, 0.38, 0, true, true);
    this.#addMesh(new THREE.TorusGeometry(4.2, 0.16, 10, 32), mats.roseGold, 0, 0.78, 0, false, true).rotation.x = Math.PI / 2;
    this.#collision.addCylinderCollider(0, 0, 4.45, 0, 4.5);

    this.#waterMesh = this.#addMesh(new THREE.CylinderGeometry(3.92, 3.92, 0.12, 24), mats.water, 0, 0.64, 0, false, false);

    // Pedestal central y 2 copas superpuestas
    this.#addMesh(new THREE.CylinderGeometry(0.65, 0.95, 2.2, 16), mats.marble, 0, 1.6, 0, true, true);
    this.#addMesh(new THREE.CylinderGeometry(2.15, 0.85, 0.45, 20), mats.marble, 0, 2.65, 0, true, true);
    this.#addMesh(new THREE.CylinderGeometry(0.36, 0.5, 1.5, 14), mats.roseGold, 0, 3.55, 0, true, true);
    this.#addMesh(new THREE.CylinderGeometry(1.15, 0.4, 0.32, 16), mats.marble, 0, 4.25, 0, true, true);
    this.#addMesh(new THREE.OctahedronGeometry(0.55, 0), mats.crystalDome, 0, 5.0, 0, false, false);

    // Chorro animado de gotas cristalinas
    const dropCount = 96;
    const pos = new Float32Array(dropCount * 3);
    this.#dropPhases = new Float32Array(dropCount * 3);
    for (let i = 0; i < dropCount; i++) {
      this.#dropPhases[i * 3] = Math.random() * Math.PI * 2; // ángulo
      this.#dropPhases[i * 3 + 1] = Math.random(); // fase ciclo
      this.#dropPhases[i * 3 + 2] = 0.7 + Math.random() * 0.6; // velocidad
    }
    const dropGeo = new THREE.BufferGeometry();
    dropGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.#geometries.push(dropGeo);
    const dropMat = new THREE.PointsMaterial({
      color: 0xd9f7ff,
      size: 0.24,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.#materials.push(dropMat);
    this.#fountainDrops = new THREE.Points(dropGeo, dropMat);
    this.#root.add(this.#fountainDrops);
  }

  #buildFashionRunway(mats) {
    // Plataforma Pasarela de Moda Real (X = -26, Z ∈ [-8, 20], Y = 0.35)
    this.#addMesh(new THREE.BoxGeometry(5.2, 0.35, 28), mats.marble, -26, 0.175, 6, true, true);
    this.#addMesh(new THREE.BoxGeometry(3.6, 0.04, 27.6), mats.runwayCarpet, -26, 0.37, 6, false, true);
    this.#collision.addFlatSurface(-28.6, -23.4, -8.1, 20.1, 0.35);

    // Rampas de acceso Norte y Sur
    this.#collision.addRampSurface(-28.4, -23.6, -10.2, -8.0, 'z', -10.0, -8.0, 0.0, 0.35);
    this.#collision.addRampSurface(-28.4, -23.6, 20.0, 22.2, 'z', 22.0, 20.0, 0.0, 0.35);

    // Arcos luminosos oro rosa sobre la pasarela
    for (const z of [-6, 0, 6, 12, 18]) {
      const arch = this.#addMesh(new THREE.TorusGeometry(3.15, 0.13, 10, 26, Math.PI), mats.roseGold, -26, 0.35, z, true, false);
      arch.rotation.y = 0;
      this.#addMesh(new THREE.SphereGeometry(0.24, 10, 10), mats.lantern, -26, 3.5, z, false, false);
    }

    // Bancos de espectadores a ambos lados
    for (const side of [-31.2, -20.8]) {
      for (const z of [-2, 6, 14]) {
        this.#addMesh(new THREE.BoxGeometry(1.1, 0.55, 4.2), mats.marble, side, 0.28, z, true, true);
        this.#collision.addBox(side - 0.55, side + 0.55, 0, 0.65, z - 2.1, z + 2.1);
      }
    }
  }

  #buildGeometricGardens(mats) {
    // Setos simétricos con macizos de rosas (Lado Este)
    const hedgeCoords = [
      [20, -4, 4.5, 1.3, 1.4],
      [36, -4, 4.5, 1.3, 1.4],
      [20, 16, 4.5, 1.3, 1.4],
      [36, 16, 4.5, 1.3, 1.4],
      [19, 6, 1.4, 1.3, 7.2],
      [37, 6, 1.4, 1.3, 7.2]
    ];
    for (const [hx, hz, w, h, d] of hedgeCoords) {
      this.#addMesh(new THREE.BoxGeometry(w, h, d), mats.hedge, hx, h / 2, hz, true, true);
      this.#addMesh(new THREE.BoxGeometry(w * 0.85, 0.25, d * 0.85), mats.roseBlossom, hx, h + 0.08, hz, false, false);
      this.#collision.addBox(hx - w / 2, hx + w / 2, 0, h + 0.4, hz - d / 2, hz + d / 2);
    }

    // Pabellón de Rosas central en (28, 0, 6)
    this.#addMesh(new THREE.CylinderGeometry(4.4, 4.6, 0.14, 16), mats.plazaFloor, 28, 0.07, 6, false, true);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const cx = 28 + Math.cos(a) * 3.4;
      const cz = 6 + Math.sin(a) * 3.4;
      this.#addMesh(new THREE.CylinderGeometry(0.22, 0.25, 4.2, 10), mats.roseGold, cx, 2.1, cz, true, true);
      this.#collision.addCylinderCollider(cx, cz, 0.35, 0, 4.2);
    }
    this.#addMesh(new THREE.SphereGeometry(3.6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats.crystalDome, 28, 4.15, 6, false, false);

    // Árboles ornamentales topiarios distribuidos por el jardín
    const trees = [
      [-15, -12], [15, -12], [-15, 14], [15, 18],
      [-38, -14], [42, -14], [-38, 28], [38, 28],
      [-18, 36], [18, 36]
    ];
    for (const [tx, tz] of trees) {
      this.#addMesh(new THREE.CylinderGeometry(0.28, 0.36, 2.2, 8), mats.roseGold, tx, 1.1, tz, true, true);
      this.#addMesh(new THREE.SphereGeometry(1.55, 12, 10), mats.hedge, tx, 3.1, tz, true, true);
      this.#addMesh(new THREE.SphereGeometry(0.95, 10, 8), mats.roseBlossom, tx, 4.55, tz, true, false);
      this.#collision.addCylinderCollider(tx, tz, 0.5, 0, 3.5);
    }
  }

  #buildMiradorAndLake(mats) {
    // Mirador Real al Sur (0, 1.2, 44)
    this.#addMesh(new THREE.CylinderGeometry(7.2, 7.7, 1.2, 24), mats.marble, 0, 0.6, 44, true, true);
    this.#addMesh(new THREE.CylinderGeometry(6.8, 6.8, 0.06, 24), mats.plazaFloor, 0, 1.22, 44, false, true);
    // Suelo circular (antes era un cuadrado: se podía "flotar" en las esquinas)
    this.#collision.addDiscSurface(0, 44, 7.2, 1.2);
    // Zócalo sólido: desde el césped no se atraviesa la plataforma; solo se sube por la escalinata.
    // maxY bajo (0.95) para que quien sube la escalinata pase por encima sin engancharse.
    this.#collision.addCylinderCollider(0, 44, 7.2, 0, 0.95);

    // Escalinata de subida al Mirador (Z = 34.5 a 37.5)
    for (let i = 0; i < 4; i++) {
      const h = (i + 1) * 0.3;
      this.#addMesh(new THREE.BoxGeometry(6.2, h, 0.78), mats.marble, 0, h / 2, 34.8 + i * 0.75, true, true);
    }
    this.#collision.addRampSurface(-3.4, 3.4, 33.9, 37.6, 'z', 34.05, 37.05, 0.0, 1.2);

    // 8 columnas y cúpula de cristal del Mirador
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const cx = Math.cos(a) * 6.2;
      const cz = 44 + Math.sin(a) * 6.2;
      this.#addMesh(new THREE.CylinderGeometry(0.24, 0.28, 5.2, 12), mats.marble, cx, 3.8, cz, true, true);
      this.#collision.addCylinderCollider(cx, cz, 0.35, 1.2, 6.4);
    }
    this.#addMesh(new THREE.TorusGeometry(6.25, 0.22, 10, 32), mats.roseGold, 0, 6.4, 44, false, false).rotation.x = Math.PI / 2;
    this.#addMesh(new THREE.SphereGeometry(6.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mats.crystalDome, 0, 6.4, 44, false, false);

    // Lago Real reflectante detrás del Mirador
    const lakeGeo = new THREE.PlaneGeometry(150, 52);
    this.#lakeMesh = this.#addMesh(lakeGeo, mats.water, 0, 0.08, 76, false, false);
    this.#lakeMesh.rotation.x = -Math.PI / 2;
  }

  #buildEstatePerimeterAndLanterns(mats) {
    // Muros bajos perimetrales con setos
    this.#addMesh(new THREE.BoxGeometry(124, 2.2, 1.4), mats.marble, 0, 1.1, -58, true, true);
    this.#addMesh(new THREE.BoxGeometry(1.4, 2.2, 114), mats.marble, -60, 1.1, -3, true, true);
    this.#addMesh(new THREE.BoxGeometry(1.4, 2.2, 114), mats.marble, 60, 1.1, -3, true, true);

    // Faroles cristalinos a lo largo del paseo y la plaza
    const lanternPositions = [
      [-6.5, -13], [6.5, -13], [-12.5, -6], [12.5, -6],
      [-12.5, 6], [12.5, 6], [-6.5, 22], [6.5, 22],
      [-6.5, 32], [6.5, 32]
    ];
    for (let i = 0; i < lanternPositions.length; i++) {
      const [lx, lz] = lanternPositions[i];
      this.#addMesh(new THREE.CylinderGeometry(0.11, 0.16, 3.4, 8), mats.roseGold, lx, 1.7, lz, true, false);
      this.#addMesh(new THREE.OctahedronGeometry(0.32, 0), mats.lantern, lx, 3.65, lz, false, false);
      this.#collision.addCylinderCollider(lx, lz, 0.25, 0, 3.5);

      if (i % 2 === 0) {
        const pt = new THREE.PointLight(0xffd9ad, 6, 16, 1.8);
        pt.position.set(lx, 3.8, lz);
        this.#root.add(pt);
        this.#lanternLights.push(pt);
      }
    }
  }

  applyTheme(theme) {
    if (!theme) return;
    if (this.#lanternMat) {
      this.#lanternMat.emissiveIntensity = 0.7 + theme.lanternIntensity * 0.75;
    }
    for (const light of this.#lanternLights) {
      light.intensity = 4.5 * theme.lanternIntensity;
    }
  }

  update(dt) {
    this.#elapsed += dt;
    if (this.#waterMesh?.material?.map) {
      this.#waterMesh.material.map.offset.x += dt * 0.06;
      this.#waterMesh.material.map.offset.y += dt * 0.04;
    }
    if (this.#fountainDrops) {
      const pos = this.#fountainDrops.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const angle = this.#dropPhases[i * 3];
        let phase = (this.#dropPhases[i * 3 + 1] + dt * this.#dropPhases[i * 3 + 2]) % 1;
        this.#dropPhases[i * 3 + 1] = phase;
        const r = 0.25 + phase * 3.1;
        const y = 4.7 + Math.sin(phase * Math.PI) * 1.4 - phase * 4.0;
        pos.setXYZ(i, Math.cos(angle) * r, Math.max(0.7, y), Math.sin(angle) * r);
      }
      pos.needsUpdate = true;
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
    this.#lanternLights.length = 0;
  }
}
