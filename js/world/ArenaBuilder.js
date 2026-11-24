import * as THREE from 'three';

/**
 * Constructor de pistas monumentales de espectáculo, pasarela en T con gradas reales
 * y público animado por InstancedMesh para "Reino Rosa Imperial: El Palacio de Cristal".
 */
export class ArenaBuilder {
  #scene;
  #textures;
  #collision;

  #group = null;
  #geometries = new Set();
  #materials = new Set();
  #customTextures = new Set();
  #instancedMeshes = new Set();

  // Elementos animados
  #medallions = [];
  #spotlights = [];
  #pennantMesh = null;
  #pennants = [];

  // Público 3D animado (InstancedMesh)
  #spectatorData = [];
  #spectatorTorsoMesh = null;
  #spectatorHeadMesh = null;
  #spectatorHatMesh = null;
  #spectatorLeftArmMesh = null;
  #spectatorRightArmMesh = null;
  #dummy = new THREE.Object3D();

  // Estado de animación y temática
  #time = 0;
  #runwayShowActive = false;
  #cheerTimer = 0;
  #cheerIntensity = 0;
  #themeEmissiveColor = new THREE.Color(0xffb4d8);
  #themeGoldEmissive = new THREE.Color(0xffbe6b);

  constructor(scene, textureFactory, collisionSystem) {
    this.#scene = scene;
    this.#textures = textureFactory;
    this.#collision = collisionSystem;
    this.#dummy.rotation.order = 'YXZ';
  }

  init() {
    this.dispose();
    this.#group = new THREE.Group();
    this.#group.name = 'ImperialArenasGroup';

    this.#buildRunwayArena();
    this.#buildRaceArena();
    this.#buildBallroomGalaRotunda();
    this.#buildAnimatedPennants();

    this.#scene.add(this.#group);
  }

  #trackGeo(geo) {
    this.#geometries.add(geo);
    return geo;
  }

  #trackMat(mat) {
    this.#materials.add(mat);
    return mat;
  }

  #trackTex(tex) {
    this.#customTextures.add(tex);
    return tex;
  }

  #trackInstanced(mesh) {
    this.#instancedMeshes.add(mesh);
    return mesh;
  }

  #makeSignTexture(title, subtitle, accent = '#d9488f') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 512, 256);
    grad.addColorStop(0, '#fff4fa');
    grad.addColorStop(0.5, '#ffe1f0');
    grad.addColorStop(1, '#fff6eb');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);

    ctx.strokeStyle = '#d69c5e';
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, 492, 236);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(22, 22, 468, 212);

    ctx.fillStyle = '#7c2151';
    ctx.font = 'bold 40px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, 256, 114);

    ctx.fillStyle = '#a44a6e';
    ctx.font = '600 24px Georgia, serif';
    ctx.fillText(subtitle, 256, 168);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return this.#trackTex(tex);
  }

  // =========================================================================
  // 1. GRAN PASARELA DE MODELAJE EN T CON GRADAS REALES Y PÚBLICO 3D
  //    X ∈ [-65, -28], Z ∈ [-17, 27]
  // =========================================================================
  #buildRunwayArena() {
    const arena = new THREE.Group();

    const marbleMap = this.#textures.getTexture('marble', 4, 4);
    const floorMap = this.#textures.getTexture('marbleFloor', 3, 12);
    const crossFloorMap = this.#textures.getTexture('marbleFloor', 6, 2);
    const roseGoldMap = this.#textures.getTexture('roseGold', 2, 2);
    const carpetMap = this.#textures.getTexture('carpet', 1, 14);
    const crossCarpetMap = this.#textures.getTexture('carpet', 1, 6);
    const crystalMap = this.#textures.getTexture('stainedCrystal', 2, 2);

    const baseMarbleMat = this.#trackMat(new THREE.MeshStandardMaterial({
      map: marbleMap,
      color: 0xf7ebf1,
      roughness: 0.42,
      metalness: 0.08
    }));

    const runwayDeckMat = this.#trackMat(new THREE.MeshStandardMaterial({
      map: floorMap,
      color: 0xffeef6,
      roughness: 0.14,
      metalness: 0.22
    }));
    runwayDeckMat.userData.preserveRoughness = true;

    const runwayCrossMat = this.#trackMat(new THREE.MeshStandardMaterial({
      map: crossFloorMap,
      color: 0xffeef6,
      roughness: 0.14,
      metalness: 0.22
    }));
    runwayCrossMat.userData.preserveRoughness = true;

    const goldMat = this.#trackMat(new THREE.MeshStandardMaterial({
      map: roseGoldMap,
      color: 0xf3c28d,
      roughness: 0.24,
      metalness: 0.82
    }));
    goldMat.userData.preserveRoughness = true;

    const edgeGlowMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xffd79e,
      emissive: 0xffb866,
      emissiveIntensity: 0.58,
      roughness: 0.22,
      metalness: 0.72
    }));

    const carpetMainMat = this.#trackMat(new THREE.MeshStandardMaterial({
      map: carpetMap,
      color: 0xd9488f,
      roughness: 0.76,
      metalness: 0.05
    }));

    const carpetCrossMat = this.#trackMat(new THREE.MeshStandardMaterial({
      map: crossCarpetMap,
      color: 0xd9488f,
      roughness: 0.76,
      metalness: 0.05
    }));

    const velvetCurtainMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xb8276b,
      roughness: 0.78,
      metalness: 0.06
    }));

    // --- Pasarela elevada en T (Y = 0.65) ---
    // Tramo principal: X ∈ [-48.8, -43.2] (5.6m), Z ∈ [-13.5, 19.0] (32.5m)
    const mainPlinth = new THREE.Mesh(
      this.#trackGeo(new THREE.BoxGeometry(5.6, 0.58, 32.5)),
      baseMarbleMat
    );
    mainPlinth.position.set(-46, 0.29, 2.75);
    mainPlinth.receiveShadow = true;
    arena.add(mainPlinth);

    const mainTop = new THREE.Mesh(
      this.#trackGeo(new THREE.BoxGeometry(5.64, 0.07, 32.5)),
      runwayDeckMat
    );
    mainTop.position.set(-46, 0.615, 2.75);
    mainTop.receiveShadow = true;
    arena.add(mainTop);

    // Travesaño frontal en T: X ∈ [-54.5, -37.5] (17m), Z ∈ [19.0, 24.0] (5m)
    const crossPlinth = new THREE.Mesh(
      this.#trackGeo(new THREE.BoxGeometry(17.0, 0.58, 5.0)),
      baseMarbleMat
    );
    crossPlinth.position.set(-46, 0.29, 21.5);
    crossPlinth.receiveShadow = true;
    arena.add(crossPlinth);

    const crossTop = new THREE.Mesh(
      this.#trackGeo(new THREE.BoxGeometry(17.04, 0.07, 5.04)),
      runwayCrossMat
    );
    crossTop.position.set(-46, 0.615, 21.5);
    crossTop.receiveShadow = true;
    arena.add(crossTop);

    // Colisiones exactas de superficie de pasarela
    this.#collision.addFlatSurface(-48.8, -43.2, -13.5, 19.0, 0.65);
    this.#collision.addFlatSurface(-54.5, -37.5, 19.0, 24.0, 0.65);

    // Alfombra imperial central y en T
    const mainCarpet = new THREE.Mesh(
      this.#trackGeo(new THREE.BoxGeometry(2.6, 0.014, 34.4)),
      carpetMainMat
    );
    mainCarpet.position.set(-46, 0.657, 3.7);
    mainCarpet.receiveShadow = true;
    arena.add(mainCarpet);

    const crossCarpet = new THREE.Mesh(
      this.#trackGeo(new THREE.BoxGeometry(15.6, 0.012, 2.5)),
      carpetCrossMat
    );
    crossCarpet.position.set(-46, 0.656, 21.5);
    crossCarpet.receiveShadow = true;
    arena.add(crossCarpet);

    // Bordes dorados iluminados de la T
    const edgeSpecs = [
      [-48.82, 0.665, 2.75, 0.14, 0.05, 32.5],
      [-43.18, 0.665, 2.75, 0.14, 0.05, 32.5],
      [-46.0, 0.665, 24.02, 17.16, 0.05, 0.14],
      [-51.65, 0.665, 19.0, 5.7, 0.05, 0.14],
      [-40.35, 0.665, 19.0, 5.7, 0.05, 0.14],
      [-54.52, 0.665, 21.5, 0.14, 0.05, 5.1],
      [-37.48, 0.665, 21.5, 0.14, 0.05, 5.1]
    ];
    for (const [x, y, z, w, h, d] of edgeSpecs) {
      const strip = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(w, h, d)), edgeGlowMat);
      strip.position.set(x, y, z);
      arena.add(strip);
    }

    // 4 Medallones de pose iluminados
    const medallionZ = [-4.0, 4.0, 12.0, 21.5];
    const outerMedGeo = this.#trackGeo(new THREE.CylinderGeometry(1.18, 1.26, 0.04, 32));
    const innerMedGeo = this.#trackGeo(new THREE.CylinderGeometry(0.88, 0.92, 0.05, 28));
    const ringMedGeo = this.#trackGeo(new THREE.TorusGeometry(1.06, 0.045, 10, 32));

    medallionZ.forEach((mz, idx) => {
      const innerMat = this.#trackMat(new THREE.MeshStandardMaterial({
        map: crystalMap,
        color: 0xffd9ec,
        emissive: 0xff8dc4,
        emissiveIntensity: 0.55,
        roughness: 0.18,
        metalness: 0.25
      }));
      innerMat.userData.preserveRoughness = true;

      const medGroup = new THREE.Group();
      medGroup.position.set(-46, 0.68, mz);

      const outer = new THREE.Mesh(outerMedGeo, goldMat);
      const inner = new THREE.Mesh(innerMedGeo, innerMat);
      inner.position.y = 0.006;
      const ring = new THREE.Mesh(ringMedGeo, edgeGlowMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.025;

      medGroup.add(outer, inner, ring);
      arena.add(medGroup);
      this.#medallions.push({ mat: innerMat, ring, phase: idx * 0.9 });
    });

    // --- Escaleras de acceso a la pasarela ---
    // Escalera Este del travesaño: X ∈ [-37.5, -35.0], Z ∈ [19.5, 23.5]
    this.#buildVisualStair({
      parent: arena,
      steps: 5,
      startX: -35.0,
      endX: -37.5,
      startZ: 19.5,
      endZ: 23.5,
      axis: 'x',
      maxHeight: 0.65,
      stepMat: baseMarbleMat,
      trimMat: goldMat
    });
    this.#collision.addRampSurface(-37.7, -34.8, 19.5, 23.5, 'x', -34.9, -37.5, 0.0, 0.65);

    // Escalera trasera de backstage: X ∈ [-48.0, -44.0], Z ∈ [-16.0, -13.5]
    this.#buildVisualStair({
      parent: arena,
      steps: 5,
      startX: -48.0,
      endX: -44.0,
      startZ: -16.0,
      endZ: -13.5,
      axis: 'z',
      maxHeight: 0.65,
      stepMat: baseMarbleMat,
      trimMat: goldMat
    });
    this.#collision.addRampSurface(-48.0, -44.0, -16.2, -13.3, 'z', -15.9, -13.5, 0.0, 0.65);

    // --- Arco Monumental Backstage (X = -46, Z = -14.5) ---
    this.#buildBackstageArch(arena, baseMarbleMat, goldMat, edgeGlowMat, velvetCurtainMat, crystalMap);

    // --- Puente de luces adicional y focos cenitales sobre la pasarela ---
    this.#buildRunwayLightRig(arena, goldMat, edgeGlowMat);

    // --- Pasillo Central VIP (Z ∈ [-3.5, 3.5] completamente despejado hacia la pasarela) ---
    const vipRunner = new THREE.Mesh(
      this.#trackGeo(new THREE.BoxGeometry(15.2, 0.018, 3.2)),
      carpetCrossMat
    );
    vipRunner.position.set(-35.6, 0.01, 0);
    vipRunner.receiveShadow = true;
    arena.add(vipRunner);

    for (const zTrim of [-1.68, 1.68]) {
      const border = new THREE.Mesh(
        this.#trackGeo(new THREE.BoxGeometry(15.2, 0.025, 0.14)),
        goldMat
      );
      border.position.set(-35.6, 0.015, zTrim);
      arena.add(border);
    }

    // --- Gradas Escalonadas Reales + Asientos Instanciados + Público 3D ---
    this.#buildGrandstandsAndCrowd(arena, baseMarbleMat, goldMat, edgeGlowMat);

    this.#group.add(arena);
  }

  #buildVisualStair({ parent, steps, startX, endX, startZ, endZ, axis, maxHeight, stepMat, trimMat }) {
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minZ = Math.min(startZ, endZ);
    const maxZ = Math.max(startZ, endZ);
    const sizeX = maxX - minX;
    const sizeZ = maxZ - minZ;

    for (let i = 0; i < steps; i++) {
      const frac0 = i / steps;
      const frac1 = (i + 1) / steps;
      const h = frac1 * maxHeight;

      let sx = sizeX;
      let sz = sizeZ;
      let px = (minX + maxX) * 0.5;
      let pz = (minZ + maxZ) * 0.5;

      if (axis === 'x') {
        const x0 = startX + (endX - startX) * frac0;
        const x1 = startX + (endX - startX) * frac1;
        sx = Math.abs(x1 - x0);
        px = (x0 + x1) * 0.5;
      } else {
        const z0 = startZ + (endZ - startZ) * frac0;
        const z1 = startZ + (endZ - startZ) * frac1;
        sz = Math.abs(z1 - z0);
        pz = (z0 + z1) * 0.5;
      }

      const stepMesh = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(sx, h, sz)), stepMat);
      stepMesh.position.set(px, h * 0.5, pz);
      stepMesh.receiveShadow = true;
      parent.add(stepMesh);

      const nosing = new THREE.Mesh(
        this.#trackGeo(new THREE.BoxGeometry(axis === 'x' ? 0.07 : sx, 0.035, axis === 'z' ? 0.07 : sz)),
        trimMat
      );
      const nosingX = axis === 'x' ? startX + (endX - startX) * frac0 : px;
      const nosingZ = axis === 'z' ? startZ + (endZ - startZ) * frac0 : pz;
      nosing.position.set(nosingX, h + 0.005, nosingZ);
      parent.add(nosing);
    }
  }

  #buildBackstageArch(parent, marbleMat, goldMat, glowMat, curtainMat, crystalMap) {
    const archGroup = new THREE.Group();
    archGroup.position.set(-46, 0, -14.5);

    // Dobles columnas a cada lado dejando libre X ∈ [-48.0, -44.0] para escalera backstage
    const colPositions = [
      [-3.7, -0.45],
      [-2.7, 0.35],
      [2.7, 0.35],
      [3.7, -0.45]
    ];

    const plinthGeo = this.#trackGeo(new THREE.BoxGeometry(0.86, 0.72, 0.86));
    const shaftGeo = this.#trackGeo(new THREE.CylinderGeometry(0.28, 0.34, 4.9, 16));
    const capGeo = this.#trackGeo(new THREE.BoxGeometry(0.9, 0.36, 0.9));

    for (const [cx, cz] of colPositions) {
      const plinth = new THREE.Mesh(plinthGeo, marbleMat);
      plinth.position.set(cx, 0.36, cz);
      const shaft = new THREE.Mesh(shaftGeo, goldMat);
      shaft.position.set(cx, 3.15, cz);
      shaft.castShadow = true;
      const cap = new THREE.Mesh(capGeo, marbleMat);
      cap.position.set(cx, 5.75, cz);
      archGroup.add(plinth, shaft, cap);

      this.#collision.addCylinderCollider(-46 + cx, -14.5 + cz, 0.45, 0, 5.8);
    }

    // Dintel y gran arco iluminado superior
    const beam = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(8.8, 0.55, 1.35)), marbleMat);
    beam.position.set(0, 6.15, 0);
    archGroup.add(beam);

    const archTorus = new THREE.Mesh(
      this.#trackGeo(new THREE.TorusGeometry(2.6, 0.24, 14, 36, Math.PI)),
      goldMat
    );
    archTorus.position.set(0, 6.35, 0.15);
    archGroup.add(archTorus);

    const archGlowRing = new THREE.Mesh(
      this.#trackGeo(new THREE.TorusGeometry(2.35, 0.08, 10, 32, Math.PI)),
      glowMat
    );
    archGlowRing.position.set(0, 6.35, 0.32);
    archGroup.add(archGlowRing);

    // Medallón de cristal en el tímpano del arco
    const crestMat = this.#trackMat(new THREE.MeshStandardMaterial({
      map: crystalMap,
      color: 0xffd9ef,
      emissive: 0xff92c8,
      emissiveIntensity: 0.52,
      roughness: 0.2,
      metalness: 0.25
    }));
    const crest = new THREE.Mesh(
      this.#trackGeo(new THREE.CylinderGeometry(1.1, 1.1, 0.18, 24)),
      crestMat
    );
    crest.rotation.x = Math.PI / 2;
    crest.position.set(0, 7.45, 0.25);
    archGroup.add(crest);

    // Cortinas de terciopelo rosa imperial recogidas a ambos lados
    for (const side of [-1, 1]) {
      const topDrape = new THREE.Mesh(
        this.#trackGeo(new THREE.CylinderGeometry(0.58, 0.36, 3.1, 14)),
        curtainMat
      );
      topDrape.position.set(side * 2.25, 4.35, 0.55);
      topDrape.rotation.z = side * -0.14;
      archGroup.add(topDrape);

      const botDrape = new THREE.Mesh(
        this.#trackGeo(new THREE.CylinderGeometry(0.32, 0.62, 2.35, 14)),
        curtainMat
      );
      botDrape.position.set(side * 2.52, 1.85, 0.55);
      botDrape.rotation.z = side * 0.1;
      archGroup.add(botDrape);

      const tieback = new THREE.Mesh(
        this.#trackGeo(new THREE.TorusGeometry(0.35, 0.06, 8, 20)),
        goldMat
      );
      tieback.rotation.x = Math.PI / 2;
      tieback.position.set(side * 2.42, 2.95, 0.55);
      archGroup.add(tieback);
    }

    // Valance superior del telón
    const valance = new THREE.Mesh(
      this.#trackGeo(new THREE.BoxGeometry(5.2, 0.65, 0.38)),
      curtainMat
    );
    valance.position.set(0, 5.6, 0.55);
    archGroup.add(valance);

    // Cartel "PASARELA IMPERIAL" sobre el pórtico
    const signTex = this.#makeSignTexture('✦ PASARELA IMPERIAL ✦', 'Gran Desfile del Palacio');
    const signMat = this.#trackMat(new THREE.MeshStandardMaterial({
      map: signTex,
      roughness: 0.35,
      metalness: 0.12
    }));
    const signBoard = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(3.8, 1.15, 0.14)), signMat);
    signBoard.position.set(0, 6.22, 0.72);
    archGroup.add(signBoard);

    parent.add(archGroup);
  }

  #buildRunwayLightRig(parent, goldMat, glowMat) {
    // Puentes de luces cenitales sobre la pasarela
    const gantryPositions = [-12.5, 4.0, 18.6];
    const postGeo = this.#trackGeo(new THREE.CylinderGeometry(0.11, 0.14, 6.4, 10));
    const trussGeo = this.#trackGeo(new THREE.BoxGeometry(8.6, 0.24, 0.28));

    for (const gz of gantryPositions) {
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, goldMat);
        post.position.set(-46 + side * 4.15, 3.2, gz);
        parent.add(post);
      }
      const truss = new THREE.Mesh(trussGeo, goldMat);
      truss.position.set(-46, 6.35, gz);
      parent.add(truss);
    }

    // Focos cenitales con haces cónicos traslúcidos suaves (opacity 0.09–0.14, depthWrite: false)
    const housingGeo = this.#trackGeo(new THREE.CylinderGeometry(0.16, 0.22, 0.42, 12));
    const lensGeo = this.#trackGeo(new THREE.CircleGeometry(0.2, 12));
    const beamGeo = this.#trackGeo(new THREE.ConeGeometry(1.75, 6.4, 20, 1, true));
    // Mover el origen del cono al vértice superior para pivotar desde el foco
    beamGeo.translate(0, -3.2, 0);

    const beamSpecs = [
      { pos: [-48.2, 6.2, -12.5], targetZ: -4.0, color: 0xffd4eb, baseOpacity: 0.11, phase: 0.0 },
      { pos: [-43.8, 6.2, -12.5], targetZ: -4.0, color: 0xffe4b8, baseOpacity: 0.10, phase: 1.4 },
      { pos: [-48.2, 6.2, 4.0], targetZ: 4.0, color: 0xffe6f4, baseOpacity: 0.12, phase: 2.3 },
      { pos: [-43.8, 6.2, 4.0], targetZ: 12.0, color: 0xffdeb0, baseOpacity: 0.11, phase: 3.1 },
      { pos: [-48.5, 6.2, 18.6], targetZ: 21.5, color: 0xffc8e8, baseOpacity: 0.12, phase: 4.0 },
      { pos: [-43.5, 6.2, 18.6], targetZ: 21.5, color: 0xffe7b8, baseOpacity: 0.12, phase: 5.2 }
    ];

    for (const spec of beamSpecs) {
      const pivot = new THREE.Group();
      pivot.position.set(...spec.pos);

      const housing = new THREE.Mesh(housingGeo, goldMat);
      housing.rotation.x = Math.PI * 0.15;
      pivot.add(housing);

      const lens = new THREE.Mesh(lensGeo, glowMat);
      lens.rotation.x = Math.PI / 2;
      lens.position.y = -0.22;
      pivot.add(lens);

      const beamMat = this.#trackMat(new THREE.MeshBasicMaterial({
        color: spec.color,
        transparent: true,
        opacity: spec.baseOpacity,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      const beam = new THREE.Mesh(beamGeo, beamMat);
      pivot.add(beam);

      const baseRotX = Math.atan2(spec.targetZ - spec.pos[2], 5.6);
      const baseRotZ = Math.atan2(-46 - spec.pos[0], 5.6);
      pivot.rotation.set(baseRotX, 0, baseRotZ);

      parent.add(pivot);
      this.#spotlights.push({
        pivot,
        beamMat,
        baseRotX,
        baseRotZ,
        baseOpacity: spec.baseOpacity,
        phase: spec.phase
      });
    }
  }

  #buildGrandstandsAndCrowd(parent, marbleMat, goldMat, glowMat) {
    const tierHeights = [0.55, 1.10, 1.65, 2.20, 2.75];
    const seatPositions = [];

    // Helper para construir un bloque de gradas escalonadas con escalera de acceso, colisiones y barandillas
    const buildStandBlock = ({ minZ, maxZ, outerX, innerX, dirX, stairMinZ, stairMaxZ, railMinZ, railMaxZ }) => {
      // dirX = -1 para Oeste (sube hacia -X desde -52.5 a -62.5)
      // dirX = +1 para Este (sube hacia +X desde -39.5 a -29.5)
      const lenZ = maxZ - minZ;
      const centerZ = (minZ + maxZ) * 0.5;

      // Base de mármol sólida para los 5 escalones
      for (let t = 0; t < 5; t++) {
        const h = tierHeights[t];
        const xA = innerX + dirX * (t * 2.0);
        const xB = innerX + dirX * ((t + 1) * 2.0);
        const xMin = Math.min(xA, xB);
        const xMax = Math.max(xA, xB);
        const cx = (xMin + xMax) * 0.5;

        const block = new THREE.Mesh(
          this.#trackGeo(new THREE.BoxGeometry(2.0, h, lenZ)),
          marbleMat
        );
        block.position.set(cx, h * 0.5, centerZ);
        block.receiveShadow = true;
        block.castShadow = true;
        parent.add(block);

        // Moldura dorada en el borde frontal de cada escalón
        const trim = new THREE.Mesh(
          this.#trackGeo(new THREE.BoxGeometry(0.08, 0.06, lenZ)),
          goldMat
        );
        trim.position.set(xA, h - 0.01, centerZ);
        parent.add(trim);

        // Superficie caminable plana de cada nivel
        this.#collision.addFlatSurface(xMin, xMax, minZ, maxZ, h);
      }

      // Escalera de acceso (rampa suave + escalones visuales)
      const stairX0 = innerX - dirX * 1.4; // entrada a nivel del suelo
      const stairX1 = innerX;               // unión con nivel 1 (0.55)
      const stairX5 = innerX + dirX * 8.0;  // borde frontal nivel 5 (2.75)

      this.#buildVisualStair({
        parent,
        steps: 4,
        startX: stairX0,
        endX: stairX1,
        startZ: stairMinZ,
        endZ: stairMaxZ,
        axis: 'x',
        maxHeight: 0.55,
        stepMat: marbleMat,
        trimMat: goldMat
      });

      this.#collision.addRampSurface(
        Math.min(stairX0, stairX1),
        Math.max(stairX0, stairX1),
        stairMinZ,
        stairMaxZ,
        'x',
        stairX0,
        stairX1,
        0.0,
        0.55
      );

      // Escalones sobre los niveles 1..4 hasta nivel 5
      for (let t = 0; t < 4; t++) {
        const sx0 = innerX + dirX * (t * 2.0);
        const sx1 = innerX + dirX * ((t + 1) * 2.0);
        const baseY = tierHeights[t];
        for (let s = 0; s < 3; s++) {
          const f0 = s / 3;
          const f1 = (s + 1) / 3;
          const p0 = sx0 + (sx1 - sx0) * f0;
          const p1 = sx0 + (sx1 - sx0) * f1;
          const stepH = baseY + f1 * 0.55;
          const stepMesh = new THREE.Mesh(
            this.#trackGeo(new THREE.BoxGeometry(Math.abs(p1 - p0), 0.19, stairMaxZ - stairMinZ)),
            goldMat
          );
          stepMesh.position.set((p0 + p1) * 0.5, stepH - 0.09, (stairMinZ + stairMaxZ) * 0.5);
          parent.add(stepMesh);
        }
      }

      this.#collision.addRampSurface(
        Math.min(stairX1, stairX5),
        Math.max(stairX1, stairX5),
        stairMinZ,
        stairMaxZ,
        'x',
        stairX1,
        stairX5,
        0.55,
        2.75
      );

      // Barandilla dorada trasera en el borde externo + colisión sólida
      const backRailX = outerX - dirX * 0.14;
      const backTopRail = new THREE.Mesh(
        this.#trackGeo(new THREE.BoxGeometry(0.1, 0.09, lenZ)),
        goldMat
      );
      backTopRail.position.set(backRailX, 3.72, centerZ);
      parent.add(backTopRail);

      const postCount = Math.max(3, Math.round(lenZ / 3.2));
      const postGeo = this.#trackGeo(new THREE.CylinderGeometry(0.055, 0.065, 1.0, 8));
      for (let p = 0; p <= postCount; p++) {
        const pz = minZ + 0.25 + (lenZ - 0.5) * (p / postCount);
        const post = new THREE.Mesh(postGeo, goldMat);
        post.position.set(backRailX, 3.25, pz);
        parent.add(post);
      }

      // Colisión trasera (desde suelo hasta arriba de la barandilla para no caerse ni entrar debajo)
      this.#collision.addBox(
        Math.min(outerX, outerX - dirX * 0.35),
        Math.max(outerX, outerX - dirX * 0.35),
        0,
        4.0,
        minZ - 0.1,
        maxZ + 0.1
      );

      // Barandillas laterales escalonadas + colisiones laterales
      for (const sideZ of [railMinZ, railMaxZ]) {
        if (sideZ === null) continue;
        for (let t = 0; t < 5; t++) {
          const xA = innerX + dirX * (t * 2.0);
          const xB = innerX + dirX * ((t + 1) * 2.0);
          const cx = (xA + xB) * 0.5;
          const h = tierHeights[t];

          const sideRail = new THREE.Mesh(
            this.#trackGeo(new THREE.BoxGeometry(2.0, 0.08, 0.09)),
            goldMat
          );
          sideRail.position.set(cx, h + 0.92, sideZ);
          parent.add(sideRail);

          const sidePost = new THREE.Mesh(postGeo, goldMat);
          sidePost.position.set(xB - dirX * 0.15, h + 0.48, sideZ);
          parent.add(sidePost);

          this.#collision.addBox(
            Math.min(xA, xB),
            Math.max(xA, xB),
            0,
            h + 1.15,
            sideZ - 0.18,
            sideZ + 0.18
          );
        }
      }
    };

    // Grada Oeste continua: X ∈ [-62.5, -52.5], Z ∈ [-10, 17], escalera central Z ∈ [2.2, 4.8]
    buildStandBlock({
      minZ: -10,
      maxZ: 17,
      outerX: -62.5,
      innerX: -52.5,
      dirX: -1,
      stairMinZ: 2.2,
      stairMaxZ: 4.8,
      railMinZ: -9.9,
      railMaxZ: 16.9
    });

    // Grada Este Bloque Norte: X ∈ [-39.5, -29.5], Z ∈ [-10, -3.5], escalera junto a pasillo VIP Z ∈ [-5.3, -3.5]
    buildStandBlock({
      minZ: -10,
      maxZ: -3.5,
      outerX: -29.5,
      innerX: -39.5,
      dirX: 1,
      stairMinZ: -5.3,
      stairMaxZ: -3.5,
      railMinZ: -9.9,
      railMaxZ: -3.55
    });

    // Grada Este Bloque Sur: X ∈ [-39.5, -29.5], Z ∈ [3.5, 17], escalera junto a pasillo VIP Z ∈ [3.5, 5.3]
    buildStandBlock({
      minZ: 3.5,
      maxZ: 17,
      outerX: -29.5,
      innerX: -39.5,
      dirX: 1,
      stairMinZ: 3.5,
      stairMaxZ: 5.3,
      railMinZ: 3.55,
      railMaxZ: 16.9
    });

    // --- Recopilar coordenadas de asientos en ambas gradas ---
    const westCols = [-8.4, -5.6, -2.8, 0.0, 6.4, 9.2, 12.0, 14.8]; // 8 cols × 5 niveles = 40 asientos
    for (let t = 0; t < 5; t++) {
      const seatX = -53.55 - t * 2.0;
      const seatY = tierHeights[t];
      for (const sz of westCols) {
        seatPositions.push({ x: seatX, y: seatY, z: sz, yaw: Math.PI * 0.5 });
      }
    }

    const eastNorthCols = [-8.7, -6.5]; // 2 cols × 5 niveles = 10 asientos
    const eastSouthCols = [6.6, 9.4, 12.2, 15.0]; // 4 cols × 5 niveles = 20 asientos
    for (let t = 0; t < 5; t++) {
      const seatX = -38.45 + t * 2.0;
      const seatY = tierHeights[t];
      for (const sz of [...eastNorthCols, ...eastSouthCols]) {
        seatPositions.push({ x: seatX, y: seatY, z: sz, yaw: -Math.PI * 0.5 });
      }
    }

    // --- InstancedMesh para los 70 asientos tapizados ---
    const seatCount = seatPositions.length;
    const cushionGeo = this.#trackGeo(new THREE.BoxGeometry(0.68, 0.24, 0.72));
    const backGeo = this.#trackGeo(new THREE.BoxGeometry(0.16, 0.54, 0.72));
    const frameGeo = this.#trackGeo(new THREE.BoxGeometry(0.74, 0.14, 0.78));

    const cushionMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.65,
      metalness: 0.08
    }));
    const backMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.62,
      metalness: 0.08
    }));

    const cushionMesh = this.#trackInstanced(new THREE.InstancedMesh(cushionGeo, cushionMat, seatCount));
    const backMesh = this.#trackInstanced(new THREE.InstancedMesh(backGeo, backMat, seatCount));
    const frameMesh = this.#trackInstanced(new THREE.InstancedMesh(frameGeo, goldMat, seatCount));
    cushionMesh.castShadow = true;
    cushionMesh.receiveShadow = true;

    const seatColorA = new THREE.Color(0xc93b7d);
    const seatColorB = new THREE.Color(0xdf6aa3);
    const dummy = this.#dummy;

    seatPositions.forEach((sp, i) => {
      const dir = Math.sin(sp.yaw); // +1 oeste mira a +X, -1 este mira a -X
      dummy.position.set(sp.x, sp.y + 0.16, sp.z);
      dummy.rotation.set(0, sp.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      cushionMesh.setMatrixAt(i, dummy.matrix);

      dummy.position.set(sp.x, sp.y + 0.07, sp.z);
      dummy.updateMatrix();
      frameMesh.setMatrixAt(i, dummy.matrix);

      dummy.position.set(sp.x - dir * 0.28, sp.y + 0.48, sp.z);
      dummy.updateMatrix();
      backMesh.setMatrixAt(i, dummy.matrix);

      const col = i % 2 === 0 ? seatColorA : seatColorB;
      cushionMesh.setColorAt(i, col);
      backMesh.setColorAt(i, col);
    });

    cushionMesh.instanceMatrix.needsUpdate = true;
    frameMesh.instanceMatrix.needsUpdate = true;
    backMesh.instanceMatrix.needsUpdate = true;
    if (cushionMesh.instanceColor) cushionMesh.instanceColor.needsUpdate = true;
    if (backMesh.instanceColor) backMesh.instanceColor.needsUpdate = true;
    parent.add(cushionMesh, frameMesh, backMesh);

    // --- Seleccionar 56 espectadores sentados en ambas gradas (InstancedMesh animado) ---
    const chosenSeats = [];
    for (let i = 0; i < seatPositions.length && chosenSeats.length < 56; i++) {
      // Distribución natural dejando 14 huecos repartidos por todas las filas
      if ((i * 7 + 3) % 5 === 0 && seatPositions.length - i > 56 - chosenSeats.length) continue;
      chosenSeats.push(seatPositions[i]);
    }
    this.#buildAnimatedCrowd(parent, chosenSeats, glowMat);
  }

  #buildAnimatedCrowd(parent, seats, _glowMat) {
    const count = seats.length;
    this.#spectatorData = seats.map((s, idx) => ({
      x: s.x,
      y: s.y + 0.28,
      z: s.z,
      yaw: s.yaw,
      phase: idx * 0.67,
      speed: 2.2 + (idx % 5) * 0.28,
      hasHat: idx % 3 !== 1
    }));

    const torsoGeo = this.#trackGeo(new THREE.CylinderGeometry(0.16, 0.23, 0.52, 10));
    torsoGeo.translate(0, 0.26, 0);
    const headGeo = this.#trackGeo(new THREE.SphereGeometry(0.145, 10, 8));
    const hatGeo = this.#trackGeo(new THREE.ConeGeometry(0.14, 0.16, 8));

    // Pivote en el hombro (y = 0) para levantar y aplaudir con precisión
    const armGeo = this.#trackGeo(new THREE.CylinderGeometry(0.045, 0.04, 0.36, 7));
    armGeo.translate(0, -0.17, 0);

    const clothMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.55,
      metalness: 0.12
    }));
    const skinMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.6,
      metalness: 0.02
    }));
    const hatMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0.45
    }));

    this.#spectatorTorsoMesh = this.#trackInstanced(new THREE.InstancedMesh(torsoGeo, clothMat, count));
    this.#spectatorHeadMesh = this.#trackInstanced(new THREE.InstancedMesh(headGeo, skinMat, count));
    this.#spectatorHatMesh = this.#trackInstanced(new THREE.InstancedMesh(hatGeo, hatMat, count));
    this.#spectatorLeftArmMesh = this.#trackInstanced(new THREE.InstancedMesh(armGeo, clothMat, count));
    this.#spectatorRightArmMesh = this.#trackInstanced(new THREE.InstancedMesh(armGeo, clothMat, count));

    this.#spectatorTorsoMesh.castShadow = true;

    const outfitPalette = [
      0xee6da8, 0xf7a8c8, 0xb788f5, 0xf4c778, 0x8ad2e8, 0xd84688, 0xfaf0f5
    ].map((c) => new THREE.Color(c));
    const skinPalette = [
      0xfad4c0, 0xf1bfa4, 0xd89b78, 0xb87654, 0xffe0cc
    ].map((c) => new THREE.Color(c));
    const hatPalette = [
      0xf5c970, 0xf47db7, 0xd4a4ff, 0xfff0f7
    ].map((c) => new THREE.Color(c));

    for (let i = 0; i < count; i++) {
      const outfit = outfitPalette[i % outfitPalette.length];
      const skin = skinPalette[(i * 3) % skinPalette.length];
      const hat = hatPalette[(i * 5) % hatPalette.length];

      this.#spectatorTorsoMesh.setColorAt(i, outfit);
      this.#spectatorLeftArmMesh.setColorAt(i, outfit);
      this.#spectatorRightArmMesh.setColorAt(i, outfit);
      this.#spectatorHeadMesh.setColorAt(i, skin);
      this.#spectatorHatMesh.setColorAt(i, hat);
    }

    for (const m of [
      this.#spectatorTorsoMesh,
      this.#spectatorHeadMesh,
      this.#spectatorHatMesh,
      this.#spectatorLeftArmMesh,
      this.#spectatorRightArmMesh
    ]) {
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      parent.add(m);
    }

    this.#updateCrowdPose(0);
  }

  // =========================================================================
  // 2. ARENA DE SALIDA/META DE CARRERA Y EQUITACIÓN REAL
  //    X ∈ [13.5, 26.5], Z ∈ [8.5, 20.5], centro (18, 0, 14)
  // =========================================================================
  #buildRaceArena() {
    const race = new THREE.Group();

    const marbleMap = this.#textures.getTexture('marble', 2, 2);
    const roseGoldMap = this.#textures.getTexture('roseGold', 2, 2);
    const floorMap = this.#textures.getTexture('marbleFloor', 4, 1);

    const whiteFenceMat = this.#trackMat(new THREE.MeshStandardMaterial({
      map: marbleMap,
      color: 0xfff7fa,
      roughness: 0.36,
      metalness: 0.08
    }));
    const goldMat = this.#trackMat(new THREE.MeshStandardMaterial({
      map: roseGoldMap,
      color: 0xf4c288,
      roughness: 0.25,
      metalness: 0.82
    }));
    goldMat.userData.preserveRoughness = true;

    const canopyMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xd94b90,
      roughness: 0.65,
      metalness: 0.08
    }));
    const lineMat = this.#trackMat(new THREE.MeshStandardMaterial({
      map: floorMap,
      color: 0xffeff6,
      roughness: 0.22,
      metalness: 0.2
    }));
    lineMat.userData.preserveRoughness = true;

    // Franja ceremonial de salida/meta en el suelo bajo el arco (18, 0, 14)
    const startStrip = new THREE.Mesh(
      this.#trackGeo(new THREE.BoxGeometry(6.6, 0.025, 1.3)),
      lineMat
    );
    startStrip.position.set(18, 0.012, 14);
    startStrip.receiveShadow = true;
    race.add(startStrip);

    // Gran Arco de Salida/Meta en (18, 0, 14): pilares en X = 14.5 y X = 21.5 (paso libre de 7m!)
    const pillarGeo = this.#trackGeo(new THREE.CylinderGeometry(0.32, 0.4, 4.9, 16));
    const plinthGeo = this.#trackGeo(new THREE.BoxGeometry(0.95, 0.6, 0.95));
    const finialGeo = this.#trackGeo(new THREE.OctahedronGeometry(0.36, 1));

    for (const px of [14.5, 21.5]) {
      const plinth = new THREE.Mesh(plinthGeo, whiteFenceMat);
      plinth.position.set(px, 0.3, 14);
      const pillar = new THREE.Mesh(pillarGeo, goldMat);
      pillar.position.set(px, 2.75, 14);
      pillar.castShadow = true;
      const finial = new THREE.Mesh(finialGeo, goldMat);
      finial.position.set(px, 5.55, 14);
      race.add(plinth, pillar, finial);

      this.#collision.addCylinderCollider(px, 14, 0.48, 0, 5.2);
    }

    const archBeam = new THREE.Mesh(
      this.#trackGeo(new THREE.BoxGeometry(8.2, 0.48, 0.85)),
      whiteFenceMat
    );
    archBeam.position.set(18, 5.18, 14);
    race.add(archBeam);

    const archCrown = new THREE.Mesh(
      this.#trackGeo(new THREE.TorusGeometry(2.3, 0.16, 12, 30, Math.PI)),
      goldMat
    );
    archCrown.position.set(18, 5.35, 14);
    race.add(archCrown);

    const bannerTex = this.#makeSignTexture('♛ SALIDA · META REAL ♛', 'Gran Circuito del Reino', '#c83a82');
    const bannerMat = this.#trackMat(new THREE.MeshStandardMaterial({
      map: bannerTex,
      roughness: 0.38,
      metalness: 0.1
    }));
    const banner = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(4.8, 1.15, 0.16)), bannerMat);
    banner.position.set(18, 5.85, 14);
    race.add(banner);

    // Vallas ornamentales blancas y doradas en X = 14.2 y X = 21.8 (Z ∈ [9.5, 18.5])
    const postGeo = this.#trackGeo(new THREE.CylinderGeometry(0.09, 0.11, 1.12, 10));
    const capBallGeo = this.#trackGeo(new THREE.SphereGeometry(0.13, 10, 8));
    const railGeo = this.#trackGeo(new THREE.BoxGeometry(0.08, 0.1, 9.0));

    for (const fx of [14.2, 21.8]) {
      for (let z = 9.5; z <= 18.51; z += 1.8) {
        const post = new THREE.Mesh(postGeo, whiteFenceMat);
        post.position.set(fx, 0.56, z);
        post.castShadow = true;
        const ball = new THREE.Mesh(capBallGeo, goldMat);
        ball.position.set(fx, 1.16, z);
        race.add(post, ball);
      }
      for (const ry of [0.46, 0.92]) {
        const rail = new THREE.Mesh(railGeo, whiteFenceMat);
        rail.position.set(fx, ry, 14.0);
        race.add(rail);
      }
      this.#collision.addBox(fx - 0.18, fx + 0.18, 0, 1.4, 9.5, 18.5);
    }

    // Postes de señalización dorados en las entradas Norte (Z = 8.9) y Sur (Z = 19.1)
    const signPostGeo = this.#trackGeo(new THREE.CylinderGeometry(0.11, 0.14, 2.2, 10));
    const lanternGeo = this.#trackGeo(new THREE.OctahedronGeometry(0.22, 0));
    const lanternMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xffe4a8,
      emissive: 0xffb85c,
      emissiveIntensity: 0.65,
      roughness: 0.2,
      metalness: 0.3
    }));

    for (const [sx, sz] of [[14.0, 8.9], [22.0, 8.9], [14.0, 19.1], [22.0, 19.1]]) {
      const sp = new THREE.Mesh(signPostGeo, goldMat);
      sp.position.set(sx, 1.1, sz);
      const lt = new THREE.Mesh(lanternGeo, lanternMat);
      lt.position.set(sx, 2.35, sz);
      race.add(sp, lt);
      this.#collision.addCylinderCollider(sx, sz, 0.24, 0, 2.5);
    }

    // 2 tribunas pequeñas cubiertas en el lateral Este (X = 24.5, Z = 11.2 y Z = 16.8)
    for (const tz of [11.2, 16.8]) {
      this.#buildMiniTribune(race, 24.5, tz, -Math.PI * 0.5, whiteFenceMat, goldMat, canopyMat);
    }

    // Saltos / obstáculos ecuestres decorativos fuera del pasillo de paso (lateral Este entre tribunas)
    for (const jz of [9.6, 14.0, 18.4]) {
      this.#buildEquestrianJump(race, 23.0, jz, whiteFenceMat, goldMat, canopyMat);
    }

    this.#group.add(race);
  }

  #buildMiniTribune(parent, x, z, yaw, marbleMat, goldMat, canopyMat) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;

    const deck = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(3.4, 0.42, 2.3)), marbleMat);
    deck.position.set(0, 0.21, 0);
    deck.receiveShadow = true;
    g.add(deck);

    const bench = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(2.8, 0.28, 0.72)), canopyMat);
    bench.position.set(0, 0.56, -0.35);
    const benchBack = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(2.8, 0.48, 0.16)), canopyMat);
    benchBack.position.set(0, 0.88, -0.68);
    g.add(bench, benchBack);

    const colGeo = this.#trackGeo(new THREE.CylinderGeometry(0.06, 0.075, 2.35, 8));
    for (const [cx, cz] of [[-1.55, -0.98], [1.55, -0.98], [-1.55, 0.98], [1.55, 0.98]]) {
      const col = new THREE.Mesh(colGeo, goldMat);
      col.position.set(cx, 1.58, cz);
      g.add(col);
    }

    const roof = new THREE.Mesh(this.#trackGeo(new THREE.ConeGeometry(2.35, 0.85, 4)), canopyMat);
    roof.rotation.y = Math.PI * 0.25;
    roof.position.set(0, 3.12, 0);
    roof.castShadow = true;
    g.add(roof);

    const roofTrim = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(3.55, 0.14, 2.45)), goldMat);
    roofTrim.position.set(0, 2.74, 0);
    g.add(roofTrim);

    parent.add(g);

    // Colisión orientada (para yaw = ±PI/2, ancho/fondo se intercambian)
    const rotated = Math.abs(Math.sin(yaw)) > 0.7;
    const halfX = rotated ? 1.2 : 1.75;
    const halfZ = rotated ? 1.75 : 1.2;
    this.#collision.addBox(x - halfX, x + halfX, 0, 3.2, z - halfZ, z + halfZ);
  }

  #buildEquestrianJump(parent, x, z, whiteMat, goldMat, pinkMat) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);

    const wingGeo = this.#trackGeo(new THREE.BoxGeometry(0.14, 1.05, 0.34));
    for (const sz of [-0.62, 0.62]) {
      const wing = new THREE.Mesh(wingGeo, whiteMat);
      wing.position.set(0, 0.525, sz);
      const cap = new THREE.Mesh(this.#trackGeo(new THREE.SphereGeometry(0.1, 8, 6)), goldMat);
      cap.position.set(0, 1.1, sz);
      g.add(wing, cap);
    }

    const barGeo = this.#trackGeo(new THREE.CylinderGeometry(0.055, 0.055, 1.26, 8));
    barGeo.rotateX(Math.PI / 2);
    const bar1 = new THREE.Mesh(barGeo, pinkMat);
    bar1.position.set(0, 0.48, 0);
    const bar2 = new THREE.Mesh(barGeo, goldMat);
    bar2.position.set(0, 0.82, 0);
    g.add(bar1, bar2);

    parent.add(g);
    this.#collision.addBox(x - 0.3, x + 0.3, 0, 1.2, z - 0.8, z + 0.8);
  }

  // =========================================================================
  // 3. ROTONDA EXTERIOR DE GALA / SEÑALIZACIÓN DEL SALÓN DE BAILE
  //    X ∈ [37, 49], Z ∈ [-42, -30], pista circular en (43, 0.04, -36) r = 5.6
  // =========================================================================
  #buildBallroomGalaRotunda() {
    const gala = new THREE.Group();
    const cx = 43;
    const cz = -36;
    const radius = 5.6;

    const danceMap = this.#textures.getTexture('danceFloor', 3, 3);
    const marbleMap = this.#textures.getTexture('marble', 2, 2);
    const roseGoldMap = this.#textures.getTexture('roseGold', 2, 2);

    const discMat = this.#trackMat(new THREE.MeshStandardMaterial({
      map: danceMap,
      color: 0xffd7ee,
      roughness: 0.16,
      metalness: 0.25
    }));
    discMat.userData.preserveRoughness = true;

    const goldMat = this.#trackMat(new THREE.MeshStandardMaterial({
      map: roseGoldMap,
      color: 0xf4c28a,
      roughness: 0.24,
      metalness: 0.82
    }));
    goldMat.userData.preserveRoughness = true;

    const marbleMat = this.#trackMat(new THREE.MeshStandardMaterial({
      map: marbleMap,
      color: 0xf9edf3,
      roughness: 0.4,
      metalness: 0.08
    }));

    const velvetMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xb6276c,
      roughness: 0.78,
      metalness: 0.05
    }));

    const disc = new THREE.Mesh(
      this.#trackGeo(new THREE.CylinderGeometry(radius, radius + 0.12, 0.08, 48)),
      discMat
    );
    disc.position.set(cx, 0.04, cz);
    disc.receiveShadow = true;
    gala.add(disc);

    const rim = new THREE.Mesh(
      this.#trackGeo(new THREE.TorusGeometry(radius + 0.05, 0.09, 10, 48)),
      goldMat
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(cx, 0.08, cz);
    gala.add(rim);

    this.#collision.addDiscSurface(cx, cz, radius, 0.08);

    // Postes dorados con cordones de terciopelo (dejando entrada amplia al Oeste hacia el Salón de Baile)
    const postCount = 12;
    const postGeo = this.#trackGeo(new THREE.CylinderGeometry(0.06, 0.08, 1.05, 10));
    const sphereGeo = this.#trackGeo(new THREE.SphereGeometry(0.1, 10, 8));
    const postCoords = [];

    for (let i = 0; i < postCount; i++) {
      const a = (i / postCount) * Math.PI * 2;
      // Dejar abertura Oeste (hacia el Salón de Baile, cos(a) < -0.78) y hueco frente a la tribuna Este
      const skipWestEntrance = Math.cos(a) < -0.75;
      const skipEastTribune = Math.cos(a) > 0.88;
      if (skipWestEntrance || skipEastTribune) {
        postCoords.push(null);
        continue;
      }

      const px = cx + Math.cos(a) * (radius + 0.18);
      const pz = cz + Math.sin(a) * (radius + 0.18);
      postCoords.push(new THREE.Vector3(px, 0.88, pz));

      const post = new THREE.Mesh(postGeo, goldMat);
      post.position.set(px, 0.525, pz);
      const orb = new THREE.Mesh(sphereGeo, goldMat);
      orb.position.set(px, 1.1, pz);
      gala.add(post, orb);
      this.#collision.addCylinderCollider(px, pz, 0.18, 0, 1.2);
    }

    // Cordones de terciopelo entre postes contiguos
    for (let i = 0; i < postCount; i++) {
      const p1 = postCoords[i];
      const p2 = postCoords[(i + 1) % postCount];
      if (!p1 || !p2) continue;

      const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      mid.y -= 0.24;
      const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
      const rope = new THREE.Mesh(
        this.#trackGeo(new THREE.TubeGeometry(curve, 12, 0.042, 8, false)),
        velvetMat
      );
      gala.add(rope);
    }

    // 4 mástiles altos con guirnaldas de banderines luminosos en lo alto
    const mastGeo = this.#trackGeo(new THREE.CylinderGeometry(0.08, 0.12, 4.1, 10));
    const mastAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
    const mastTops = [];
    for (const a of mastAngles) {
      const mx = cx + Math.cos(a) * (radius + 0.35);
      const mz = cz + Math.sin(a) * (radius + 0.35);
      const mast = new THREE.Mesh(mastGeo, goldMat);
      mast.position.set(mx, 2.05, mz);
      gala.add(mast);
      mastTops.push(new THREE.Vector3(mx, 3.95, mz));
      this.#collision.addCylinderCollider(mx, mz, 0.22, 0, 4.0);
    }

    for (let i = 0; i < mastTops.length; i++) {
      const a = mastTops[i];
      const b = mastTops[(i + 1) % mastTops.length];
      const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
      mid.y -= 0.45;
      const garland = new THREE.QuadraticBezierCurve3(a, mid, b);
      const cord = new THREE.Mesh(
        this.#trackGeo(new THREE.TubeGeometry(garland, 14, 0.025, 6, false)),
        goldMat
      );
      gala.add(cord);

      // Registrar banderines colgantes a lo largo de la guirnalda
      for (let k = 1; k <= 5; k++) {
        const pt = garland.getPoint(k / 6);
        const tangent = garland.getTangent(k / 6);
        this.#pennants.push({
          pos: pt,
          yaw: Math.atan2(tangent.x, tangent.z) + Math.PI * 0.5,
          phase: i * 1.3 + k * 0.6,
          colorIdx: (i + k) % 4
        });
      }
    }

    // Pequeña tribuna real en (48.5, 0, -36) mirando hacia la rotonda (-X)
    this.#buildMiniTribune(gala, 48.5, -36, -Math.PI * 0.5, marbleMat, goldMat, velvetMat);

    // Cartel ornamental indicando la entrada al Salón de Baile
    const signGroup = new THREE.Group();
    signGroup.position.set(37.6, 0, -31.8);
    signGroup.rotation.y = Math.PI * 0.22;

    const signFrame = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(2.3, 1.35, 0.14)), goldMat);
    signFrame.position.y = 1.65;
    const signTex = this.#makeSignTexture('♪ SALÓN DE BAILE ♪', 'Entrada Real · Pista de Gala');
    const signMat = this.#trackMat(new THREE.MeshStandardMaterial({
      map: signTex,
      roughness: 0.35,
      metalness: 0.12
    }));
    const signFace = new THREE.Mesh(this.#trackGeo(new THREE.PlaneGeometry(2.1, 1.15)), signMat);
    signFace.position.set(0, 1.65, 0.08);
    const signFaceBack = new THREE.Mesh(this.#trackGeo(new THREE.PlaneGeometry(2.1, 1.15)), signMat);
    signFaceBack.rotation.y = Math.PI;
    signFaceBack.position.set(0, 1.65, -0.08);

    const legGeo = this.#trackGeo(new THREE.CylinderGeometry(0.05, 0.06, 2.2, 8));
    for (const lx of [-0.9, 0.9]) {
      const leg = new THREE.Mesh(legGeo, goldMat);
      leg.position.set(lx, 1.1, 0);
      signGroup.add(leg);
    }
    signGroup.add(signFrame, signFace, signFaceBack);
    gala.add(signGroup);
    this.#collision.addBox(36.9, 38.3, 0, 2.4, -32.6, -31.0);

    this.#group.add(gala);
  }

  #buildAnimatedPennants() {
    // Añadir también banderines festivos al arco de carrera (18, 0, 14) y pasarela (-46, 0, -14.5)
    for (let i = 0; i < 8; i++) {
      const t = (i + 0.5) / 8;
      this.#pennants.push({
        pos: new THREE.Vector3(14.8 + t * 6.4, 4.92 - Math.sin(t * Math.PI) * 0.18, 14.0),
        yaw: 0,
        phase: i * 0.7,
        colorIdx: i % 4
      });
    }
    for (let i = 0; i < 8; i++) {
      const t = (i + 0.5) / 8;
      this.#pennants.push({
        pos: new THREE.Vector3(-49.6 + t * 7.2, 5.82 - Math.sin(t * Math.PI) * 0.15, -13.9),
        yaw: 0,
        phase: i * 0.8 + 1.2,
        colorIdx: (i + 2) % 4
      });
    }

    if (this.#pennants.length === 0) return;

    const pennantGeo = this.#trackGeo(new THREE.ConeGeometry(0.18, 0.42, 4));
    pennantGeo.rotateX(Math.PI);
    pennantGeo.translate(0, -0.21, 0);

    const pennantMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xff8ec4,
      emissiveIntensity: 0.48,
      roughness: 0.35,
      metalness: 0.25
    }));

    this.#pennantMesh = this.#trackInstanced(
      new THREE.InstancedMesh(pennantGeo, pennantMat, this.#pennants.length)
    );

    const colors = [
      new THREE.Color(0xff7ec0),
      new THREE.Color(0xffd27a),
      new THREE.Color(0xd19eff),
      new THREE.Color(0xfff0f8)
    ];

    this.#pennants.forEach((p, idx) => {
      this.#pennantMesh.setColorAt(idx, colors[p.colorIdx]);
    });
    if (this.#pennantMesh.instanceColor) this.#pennantMesh.instanceColor.needsUpdate = true;
    this.#group.add(this.#pennantMesh);
  }

  // =========================================================================
  // API PÚBLICA
  // =========================================================================
  applyTheme(theme) {
    if (!theme) return;
    if (theme.accent) {
      this.#themeEmissiveColor.set(theme.accent);
    }
    if (theme.gold) {
      this.#themeGoldEmissive.set(theme.gold);
    }
    const nightBoost = theme.isNight || theme.night ? 0.12 : 0;
    for (const m of this.#medallions) {
      m.mat.emissive.copy(this.#themeEmissiveColor);
      m.mat.emissiveIntensity = Math.min(0.82, 0.55 + nightBoost);
    }
    for (const s of this.#spotlights) {
      s.beamMat.opacity = Math.min(0.14, s.baseOpacity + nightBoost * 0.15);
    }
  }

  triggerCrowdCheer(intensity = 1) {
    this.#cheerIntensity = Math.max(this.#cheerIntensity, Math.min(2.0, intensity));
    this.#cheerTimer = Math.max(this.#cheerTimer, 3.2);
  }

  setRunwayShowActive(active) {
    this.#runwayShowActive = Boolean(active);
    if (this.#runwayShowActive) {
      this.triggerCrowdCheer(0.95);
    }
  }

  update(dt) {
    this.#time += dt;

    if (this.#cheerTimer > 0) {
      this.#cheerTimer = Math.max(0, this.#cheerTimer - dt);
      if (this.#cheerTimer === 0) {
        this.#cheerIntensity = 0;
      }
    }

    // Animar medallones de pose
    for (const m of this.#medallions) {
      const pulse = 0.5 + 0.5 * Math.sin(this.#time * 3.1 + m.phase);
      const showBoost = this.#runwayShowActive ? 0.18 : 0;
      m.mat.emissiveIntensity = Math.min(0.82, 0.45 + pulse * 0.22 + showBoost);
      const s = 1 + pulse * 0.035;
      m.ring.scale.set(s, s, 1);
    }

    // Animar focos cenitales
    for (const s of this.#spotlights) {
      const sweepSpeed = this.#runwayShowActive ? 1.85 : 0.75;
      const sweepAmp = this.#runwayShowActive ? 0.14 : 0.05;
      s.pivot.rotation.x = s.baseRotX + Math.sin(this.#time * sweepSpeed + s.phase) * sweepAmp;
      s.pivot.rotation.z = s.baseRotZ + Math.cos(this.#time * sweepSpeed * 0.8 + s.phase) * sweepAmp * 0.7;

      const targetOpacity = this.#runwayShowActive
        ? Math.min(0.14, s.baseOpacity + 0.03)
        : s.baseOpacity;
      s.beamMat.opacity += (targetOpacity - s.beamMat.opacity) * Math.min(1, dt * 4);
    }

    // Animar banderines
    if (this.#pennantMesh) {
      const dummy = this.#dummy;
      this.#pennants.forEach((p, idx) => {
        const sway = Math.sin(this.#time * 3.4 + p.phase) * 0.22;
        dummy.position.copy(p.pos);
        dummy.rotation.set(sway, p.yaw, sway * 0.4);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        this.#pennantMesh.setMatrixAt(idx, dummy.matrix);
      });
      this.#pennantMesh.instanceMatrix.needsUpdate = true;
    }

    // Animar público 3D en gradas
    this.#updateCrowdPose(dt);
  }

  #updateCrowdPose(_dt) {
    if (!this.#spectatorTorsoMesh || this.#spectatorData.length === 0) return;

    const cheerFade = this.#cheerTimer > 0 ? Math.min(1, this.#cheerTimer * 0.75) : 0;
    const energy = Math.max(this.#runwayShowActive ? 0.55 : 0.0, cheerFade * this.#cheerIntensity);
    const dummy = this.#dummy;

    for (let i = 0; i < this.#spectatorData.length; i++) {
      const sp = this.#spectatorData[i];
      // Ola que recorre las gradas a lo largo de Z
      const stadiumWave = Math.max(0, Math.sin(this.#time * 5.2 - sp.z * 0.28 + sp.x * 0.05));
      const localEnergy = Math.min(1.35, energy * (0.65 + 0.55 * stadiumWave));

      const idleBob = Math.sin(this.#time * sp.speed + sp.phase) * 0.015;
      const cheerJump = localEnergy * Math.abs(Math.sin(this.#time * 6.8 + sp.phase)) * 0.14;
      const y = sp.y + idleBob + cheerJump;

      const swayYaw = sp.yaw + Math.sin(this.#time * 1.7 + sp.phase) * (0.06 + localEnergy * 0.08);
      const dirX = Math.sin(swayYaw);
      const dirZ = Math.cos(swayYaw);
      // Vector lateral del espectador (derecha/izquierda relativa a su mirada)
      const sideX = Math.cos(swayYaw);
      const sideZ = -Math.sin(swayYaw);

      // Torso
      dummy.position.set(sp.x, y, sp.z);
      dummy.rotation.set(0, swayYaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      this.#spectatorTorsoMesh.setMatrixAt(i, dummy.matrix);

      // Cabeza
      dummy.position.set(sp.x, y + 0.65, sp.z);
      dummy.rotation.set(Math.sin(this.#time * 3.2 + sp.phase) * (0.05 + localEnergy * 0.08), swayYaw, 0);
      dummy.updateMatrix();
      this.#spectatorHeadMesh.setMatrixAt(i, dummy.matrix);

      // Sombrero / corona (escala 0 para espectadores sin sombrero)
      dummy.position.set(sp.x, y + 0.83, sp.z);
      dummy.rotation.set(0, swayYaw, 0);
      dummy.scale.setScalar(sp.hasHat ? 1 : 0.001);
      dummy.updateMatrix();
      this.#spectatorHatMesh.setMatrixAt(i, dummy.matrix);

      // Brazos izquierdo y derecho articulados (aplauso en reposo, vítores arriba en desfile/cheer)
      const clapWave = Math.sin(this.#time * (4.0 + localEnergy * 7.5) + sp.phase);
      const raiseAngle = -0.7 - localEnergy * 1.75; // -0.7 adelante, hasta -2.65 arriba
      const clapSpread = 0.25 + (1 - localEnergy * 0.5) * clapWave * 0.22 + localEnergy * 0.24 * clapWave;

      // Brazo Izquierdo
      dummy.position.set(sp.x + sideX * 0.2 + dirX * 0.04, y + 0.47, sp.z + sideZ * 0.2 + dirZ * 0.04);
      dummy.rotation.set(raiseAngle, swayYaw, clapSpread);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      this.#spectatorLeftArmMesh.setMatrixAt(i, dummy.matrix);

      // Brazo Derecho
      dummy.position.set(sp.x - sideX * 0.2 + dirX * 0.04, y + 0.47, sp.z - sideZ * 0.2 + dirZ * 0.04);
      dummy.rotation.set(raiseAngle + localEnergy * clapWave * 0.15, swayYaw, -clapSpread);
      dummy.updateMatrix();
      this.#spectatorRightArmMesh.setMatrixAt(i, dummy.matrix);
    }

    this.#spectatorTorsoMesh.instanceMatrix.needsUpdate = true;
    this.#spectatorHeadMesh.instanceMatrix.needsUpdate = true;
    this.#spectatorHatMesh.instanceMatrix.needsUpdate = true;
    this.#spectatorLeftArmMesh.instanceMatrix.needsUpdate = true;
    this.#spectatorRightArmMesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    if (this.#group) {
      this.#scene.remove(this.#group);
      this.#group = null;
    }

    for (const im of this.#instancedMeshes) {
      im.dispose?.();
    }
    this.#instancedMeshes.clear();

    for (const geo of this.#geometries) {
      geo.dispose();
    }
    this.#geometries.clear();

    for (const mat of this.#materials) {
      mat.dispose();
    }
    this.#materials.clear();

    for (const tex of this.#customTextures) {
      tex.dispose();
    }
    this.#customTextures.clear();

    this.#medallions.length = 0;
    this.#spotlights.length = 0;
    this.#pennants.length = 0;
    this.#pennantMesh = null;
    this.#spectatorData.length = 0;
    this.#spectatorTorsoMesh = null;
    this.#spectatorHeadMesh = null;
    this.#spectatorHatMesh = null;
    this.#spectatorLeftArmMesh = null;
    this.#spectatorRightArmMesh = null;
  }
}
