import * as THREE from 'three';

export class FaunaSystem {
  #scene;
  #root = null;
  #geometries = [];
  #materials = [];

  #butterflies = [];
  #swans = [];
  #ducklings = [];
  #wakes = [];
  #wakePool = [];
  #wakeTimer = 0;
  #birds = [];
  #perchNodes = [];
  #deer = [];
  #bunnies = [];

  constructor(scene) {
    this.#scene = scene;
  }

  init() {
    this.#root = new THREE.Group();
    this.#root.name = 'RoyalFauna';

    this.#buildButterflies();
    this.#buildSwansAndDucklings();
    this.#buildWakePool();
    this.#buildSongbirds();
    this.#buildDeer();
    this.#buildBunnies();

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

  #buildButterflies() {
    // Geometrías compartidas para las ~50 mariposas
    const bodyGeo = this.#trackGeo(new THREE.CapsuleGeometry(0.014, 0.08, 4, 6));
    bodyGeo.rotateX(Math.PI / 2);

    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.bezierCurveTo(0.08, 0.11, 0.2, 0.09, 0.18, 0.01);
    wingShape.bezierCurveTo(0.16, -0.04, 0.12, -0.09, 0.06, -0.09);
    wingShape.bezierCurveTo(0.02, -0.09, 0.01, -0.03, 0, 0);
    const rightWingGeo = this.#trackGeo(new THREE.ShapeGeometry(wingShape, 6));
    rightWingGeo.rotateX(-Math.PI / 2);

    const leftWingGeo = this.#trackGeo(rightWingGeo.clone());
    leftWingGeo.scale(-1, 1, 1);

    const bodyMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0x3b2c35,
      roughness: 0.7
    }));

    const pastelColors = [0xff85c0, 0x7ad7ff, 0xffe066, 0xc89bff, 0xff9e80, 0x9bf6ff];
    const wingMats = pastelColors.map((hex) =>
      this.#trackMat(new THREE.MeshStandardMaterial({
        color: hex,
        roughness: 0.45,
        metalness: 0.05,
        side: THREE.DoubleSide
      }))
    );

    // Zonas de parterres para revolotear
    const anchors = [
      [16, 10], [-16, 10], [16, -10], [-16, -10],
      [0, 22], [32, -6], [-16, 30], [36, 16], [-33, 41], [-54, -44]
    ];

    const count = 50;
    for (let i = 0; i < count; i++) {
      const [ax, az] = anchors[i % anchors.length];
      const group = new THREE.Group();
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      group.add(body);

      const mat = wingMats[i % wingMats.length];
      const wingL = new THREE.Mesh(leftWingGeo, mat);
      const wingR = new THREE.Mesh(rightWingGeo, mat);
      wingL.position.x = -0.01;
      wingR.position.x = 0.01;
      group.add(wingL, wingR);

      const scale = 0.8 + (i % 4) * 0.18;
      group.scale.setScalar(scale);

      const radius = 2.0 + (i % 5) * 0.9;
      const baseY = 0.75 + (i % 6) * 0.28;
      group.position.set(ax, baseY, az);
      this.#root.add(group);

      this.#butterflies.push({
        group,
        wingL,
        wingR,
        ax,
        az,
        baseY,
        radius,
        speed: 0.55 + (i % 7) * 0.11,
        flapFreq: 13 + (i % 5) * 2.1,
        phase: i * 1.37
      });
    }
  }

  #buildSwansAndDucklings() {
    const whiteMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xf6f3ee,
      roughness: 0.58,
      metalness: 0.02
    }));
    const orangeMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xf4842c,
      roughness: 0.45
    }));
    const darkMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0x1e1e24,
      roughness: 0.4
    }));
    const duckGoldMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xfad250,
      roughness: 0.65
    }));

    // Geometrías de cisne
    const swanBodyGeo = this.#trackGeo(new THREE.SphereGeometry(0.42, 14, 10));
    swanBodyGeo.scale(0.85, 0.65, 1.45);
    const swanWingGeo = this.#trackGeo(new THREE.SphereGeometry(0.32, 10, 8));
    swanWingGeo.scale(0.45, 0.7, 1.3);
    const swanTailGeo = this.#trackGeo(new THREE.ConeGeometry(0.18, 0.4, 8));
    swanTailGeo.rotateX(-Math.PI / 2.6);

    const neckCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.14, 0.36),
      new THREE.Vector3(0, 0.48, 0.54),
      new THREE.Vector3(0, 0.85, 0.42),
      new THREE.Vector3(0, 1.02, 0.58)
    ]);
    const swanNeckGeo = this.#trackGeo(new THREE.TubeGeometry(neckCurve, 14, 0.068, 8, false));
    const swanHeadGeo = this.#trackGeo(new THREE.SphereGeometry(0.105, 10, 8));
    const swanBeakGeo = this.#trackGeo(new THREE.ConeGeometry(0.048, 0.16, 8));
    swanBeakGeo.rotateX(Math.PI / 2);

    const createSwan = () => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(swanBodyGeo, whiteMat);
      body.position.y = 0.18;
      body.castShadow = true;
      g.add(body);

      const wingL = new THREE.Mesh(swanWingGeo, whiteMat);
      wingL.position.set(-0.27, 0.25, -0.05);
      wingL.rotation.set(0.12, 0, 0.2);
      const wingR = new THREE.Mesh(swanWingGeo, whiteMat);
      wingR.position.set(0.27, 0.25, -0.05);
      wingR.rotation.set(0.12, 0, -0.2);
      g.add(wingL, wingR);

      const tail = new THREE.Mesh(swanTailGeo, whiteMat);
      tail.position.set(0, 0.26, -0.56);
      g.add(tail);

      const neckGroup = new THREE.Group();
      const neck = new THREE.Mesh(swanNeckGeo, whiteMat);
      neck.castShadow = true;
      const head = new THREE.Mesh(swanHeadGeo, whiteMat);
      head.position.set(0, 1.03, 0.62);
      const beak = new THREE.Mesh(swanBeakGeo, orangeMat);
      beak.position.set(0, 1.0, 0.76);
      const eyeL = new THREE.Mesh(this.#trackGeo(new THREE.SphereGeometry(0.018, 6, 6)), darkMat);
      eyeL.position.set(-0.07, 1.05, 0.68);
      const eyeR = eyeL.clone();
      eyeR.position.x = 0.07;
      neckGroup.add(neck, head, beak, eyeL, eyeR);
      g.add(neckGroup);

      this.#root.add(g);
      return { group: g, neckGroup };
    };

    // 2 cisnes en Estanque Este (46, 0.08, 26), 2 cisnes en orilla Lago Sur (±14, 0.08, 60)
    const swanPaths = [
      { cx: 46, cz: 26, rx: 6.4, rz: 4.5, speed: 0.24, phase: 0, figure8: true },
      { cx: 46, cz: 26, rx: 5.0, rz: 3.6, speed: 0.21, phase: Math.PI, figure8: false },
      { cx: -14, cz: 60, rx: 7.5, rz: 2.6, speed: 0.19, phase: 0.6, figure8: true },
      { cx: 14, cz: 60, rx: 7.5, rz: 2.6, speed: 0.19, phase: 2.8, figure8: false }
    ];

    swanPaths.forEach((p, idx) => {
      const s = createSwan();
      this.#swans.push({
        ...s,
        ...p,
        idx,
        lastX: p.cx,
        lastZ: p.cz
      });
    });

    // Geometrías de patito dorado
    const duckBodyGeo = this.#trackGeo(new THREE.SphereGeometry(0.14, 10, 8));
    duckBodyGeo.scale(0.85, 0.75, 1.25);
    const duckHeadGeo = this.#trackGeo(new THREE.SphereGeometry(0.085, 8, 8));
    const duckBeakGeo = this.#trackGeo(new THREE.ConeGeometry(0.032, 0.09, 6));
    duckBeakGeo.rotateX(Math.PI / 2);

    const createDuckling = () => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(duckBodyGeo, duckGoldMat);
      body.position.y = 0.08;
      body.castShadow = true;
      const head = new THREE.Mesh(duckHeadGeo, duckGoldMat);
      head.position.set(0, 0.19, 0.12);
      const beak = new THREE.Mesh(duckBeakGeo, orangeMat);
      beak.position.set(0, 0.18, 0.22);
      g.add(body, head, beak);
      this.#root.add(g);
      return g;
    };

    // 6 patitos dorados (3 siguiendo al cisne 0 en Estanque Este, 3 siguiendo al cisne 2/3 en Lago Sur)
    const duckConfigs = [
      { leaderIdx: 0, lag: 0.36, offsetSide: 0.28 },
      { leaderIdx: 0, lag: 0.64, offsetSide: -0.26 },
      { leaderIdx: 1, lag: 0.42, offsetSide: 0.22 },
      { leaderIdx: 2, lag: 0.36, offsetSide: 0.25 },
      { leaderIdx: 2, lag: 0.66, offsetSide: -0.25 },
      { leaderIdx: 3, lag: 0.40, offsetSide: 0.24 }
    ];

    duckConfigs.forEach((cfg, idx) => {
      this.#ducklings.push({
        group: createDuckling(),
        ...cfg,
        phase: idx * 1.1,
        lastX: 0,
        lastZ: 0
      });
    });
  }

  #buildWakePool() {
    // Estelas sutiles sobre el agua (aros translúcidos expansivos)
    const wakeGeo = this.#trackGeo(new THREE.RingGeometry(0.18, 0.26, 20));
    wakeGeo.rotateX(-Math.PI / 2);

    for (let i = 0; i < 26; i++) {
      const mat = this.#trackMat(new THREE.MeshBasicMaterial({
        color: 0xe8fbff,
        transparent: true,
        opacity: 0,
        depthWrite: false
      }));
      const mesh = new THREE.Mesh(wakeGeo, mat);
      mesh.visible = false;
      this.#root.add(mesh);
      this.#wakePool.push({ mesh, mat, active: false, age: 0, maxAge: 1.5, baseScale: 1 });
    }
    this.#wakes = this.#wakePool;
  }

  #spawnWake(x, z, baseScale = 1.0) {
    for (const w of this.#wakePool) {
      if (!w.active) {
        w.active = true;
        w.age = 0;
        w.baseScale = baseScale;
        w.mesh.position.set(x, 0.072, z);
        w.mesh.scale.setScalar(baseScale);
        w.mat.opacity = 0.36;
        w.mesh.visible = true;
        return;
      }
    }
  }

  #buildSongbirds() {
    // Posaderos en glorietas, mirador y copas de árboles
    this.#perchNodes = [
      new THREE.Vector3(35, 4.48, -5.2),
      new THREE.Vector3(37.5, 4.48, -8.5),
      new THREE.Vector3(-33, 4.48, 38.2),
      new THREE.Vector3(-35.4, 4.48, 42.1),
      new THREE.Vector3(-54, 4.48, -41.2),
      new THREE.Vector3(-51.5, 4.48, -45.6),
      new THREE.Vector3(0, 6.55, 39.8),
      new THREE.Vector3(4.5, 6.55, 42.0),
      new THREE.Vector3(-15, 4.9, -11),
      new THREE.Vector3(15, 4.9, -11),
      new THREE.Vector3(-15, 4.9, 13),
      new THREE.Vector3(44, 5.1, -10),
      new THREE.Vector3(50, 5.0, 7),
      new THREE.Vector3(-43, 5.1, 35),
      new THREE.Vector3(31, 5.1, 42),
      new THREE.Vector3(-48, 5.0, -28),
      new THREE.Vector3(56, 5.2, -24),
      new THREE.Vector3(58, 4.8, 22)
    ];

    const birdBodyGeo = this.#trackGeo(new THREE.SphereGeometry(0.11, 8, 8));
    birdBodyGeo.scale(0.85, 0.9, 1.35);
    const birdHeadGeo = this.#trackGeo(new THREE.SphereGeometry(0.075, 8, 8));
    const birdBeakGeo = this.#trackGeo(new THREE.ConeGeometry(0.025, 0.075, 6));
    birdBeakGeo.rotateX(Math.PI / 2);
    const birdTailGeo = this.#trackGeo(new THREE.BoxGeometry(0.08, 0.02, 0.16));
    const birdWingGeo = this.#trackGeo(new THREE.BoxGeometry(0.18, 0.015, 0.11));
    birdWingGeo.translate(0.09, 0, 0);

    const beakMat = this.#trackMat(new THREE.MeshStandardMaterial({ color: 0xf2b830, roughness: 0.5 }));
    const palettes = [
      { body: 0x4ea3eb, belly: 0xdcf0ff }, // Azulejo
      { body: 0xf2c641, belly: 0xfff3c4 }, // Jilguero
      { body: 0x70584c, belly: 0xe66845 }, // Petirrojo
      { body: 0xe87ab0, belly: 0xffe4f2 }  // Pinzón rosa real
    ];
    const paletteMats = palettes.map((p) => ({
      body: this.#trackMat(new THREE.MeshStandardMaterial({ color: p.body, roughness: 0.6 })),
      belly: this.#trackMat(new THREE.MeshStandardMaterial({ color: p.belly, roughness: 0.65 }))
    }));

    const count = 20;
    for (let i = 0; i < count; i++) {
      const pm = paletteMats[i % paletteMats.length];
      const group = new THREE.Group();

      const body = new THREE.Mesh(birdBodyGeo, pm.body);
      const belly = new THREE.Mesh(this.#trackGeo(new THREE.SphereGeometry(0.085, 7, 7)), pm.belly);
      belly.position.set(0, -0.02, 0.02);
      const tail = new THREE.Mesh(birdTailGeo, pm.body);
      tail.position.set(0, 0.03, -0.17);
      tail.rotation.x = 0.25;

      const headGroup = new THREE.Group();
      headGroup.position.set(0, 0.08, 0.11);
      const head = new THREE.Mesh(birdHeadGeo, pm.body);
      const beak = new THREE.Mesh(birdBeakGeo, beakMat);
      beak.position.set(0, -0.005, 0.08);
      headGroup.add(head, beak);

      const wingL = new THREE.Mesh(birdWingGeo, pm.body);
      wingL.position.set(-0.06, 0.03, 0);
      wingL.scale.x = -1;
      const wingR = new THREE.Mesh(birdWingGeo, pm.body);
      wingR.position.set(0.06, 0.03, 0);

      group.add(body, belly, tail, headGroup, wingL, wingR);

      const startIdx = i % this.#perchNodes.length;
      const startNode = this.#perchNodes[startIdx];
      group.position.copy(startNode);
      this.#root.add(group);

      this.#birds.push({
        group,
        headGroup,
        wingL,
        wingR,
        state: 'perched',
        timer: 1.5 + (i % 6) * 1.1,
        fromIdx: startIdx,
        toIdx: (startIdx + 3) % this.#perchNodes.length,
        flightTime: 0,
        flightDuration: 2.8,
        arcHeight: 2.5 + (i % 4) * 0.6,
        phase: i * 0.9
      });
    }
  }

  #buildDeer() {
    const coatMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xf4f0ea,
      roughness: 0.72,
      metalness: 0.02
    }));
    const bellyMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xfaf7f2,
      roughness: 0.75
    }));
    const antlerMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xd9b87c,
      roughness: 0.45,
      metalness: 0.18
    }));
    const noseMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0x3b2d2c,
      roughness: 0.5
    }));

    const torsoGeo = this.#trackGeo(new THREE.CapsuleGeometry(0.32, 0.85, 6, 10));
    torsoGeo.rotateX(Math.PI / 2);
    const neckGeo = this.#trackGeo(new THREE.CylinderGeometry(0.11, 0.16, 0.62, 8));
    const headGeo = this.#trackGeo(new THREE.SphereGeometry(0.16, 10, 8));
    headGeo.scale(0.85, 0.88, 1.35);
    const earGeo = this.#trackGeo(new THREE.ConeGeometry(0.055, 0.18, 6));
    const legGeo = this.#trackGeo(new THREE.CylinderGeometry(0.055, 0.04, 0.82, 7));
    legGeo.translate(0, -0.41, 0);
    const antlerStemGeo = this.#trackGeo(new THREE.CylinderGeometry(0.02, 0.028, 0.38, 6));
    const antlerTineGeo = this.#trackGeo(new THREE.CylinderGeometry(0.012, 0.018, 0.18, 5));

    const clearings = [
      [-54, -30, true],
      [62, -18, false],
      [64, 38, true],
      [-68, 36, false],
      [42, -64, true]
    ];

    clearings.forEach(([hx, hz, hasAntlers], idx) => {
      const root = new THREE.Group();
      root.position.set(hx, 0, hz);

      const torso = new THREE.Mesh(torsoGeo, coatMat);
      torso.position.set(0, 0.96, 0);
      torso.castShadow = true;
      root.add(torso);

      const tail = new THREE.Mesh(this.#trackGeo(new THREE.SphereGeometry(0.09, 6, 6)), bellyMat);
      tail.position.set(0, 1.06, -0.62);
      root.add(tail);

      // Cuello articulado para pastar
      const neckPivot = new THREE.Group();
      neckPivot.position.set(0, 1.08, 0.45);
      const neck = new THREE.Mesh(neckGeo, coatMat);
      neck.position.set(0, 0.24, 0.08);
      neck.rotation.x = 0.25;
      neck.castShadow = true;

      const head = new THREE.Mesh(headGeo, coatMat);
      head.position.set(0, 0.56, 0.22);
      head.castShadow = true;

      const nose = new THREE.Mesh(this.#trackGeo(new THREE.SphereGeometry(0.045, 6, 6)), noseMat);
      nose.position.set(0, 0.53, 0.42);

      const earL = new THREE.Mesh(earGeo, coatMat);
      earL.position.set(-0.11, 0.7, 0.12);
      earL.rotation.set(-0.2, 0, 0.55);
      const earR = new THREE.Mesh(earGeo, coatMat);
      earR.position.set(0.11, 0.7, 0.12);
      earR.rotation.set(-0.2, 0, -0.55);

      neckPivot.add(neck, head, nose, earL, earR);

      if (hasAntlers) {
        for (const side of [-1, 1]) {
          const stem = new THREE.Mesh(antlerStemGeo, antlerMat);
          stem.position.set(side * 0.09, 0.82, 0.16);
          stem.rotation.set(-0.2, 0, -side * 0.35);
          const tine = new THREE.Mesh(antlerTineGeo, antlerMat);
          tine.position.set(side * 0.15, 0.9, 0.24);
          tine.rotation.set(0.5, 0, -side * 0.2);
          neckPivot.add(stem, tine);
        }
      }
      root.add(neckPivot);

      // 4 patas articuladas
      const legOffsets = [
        [-0.15, 0.82, 0.36],
        [0.15, 0.82, 0.36],
        [-0.15, 0.82, -0.36],
        [0.15, 0.82, -0.36]
      ];
      const legs = legOffsets.map(([lx, ly, lz]) => {
        const leg = new THREE.Mesh(legGeo, coatMat);
        leg.position.set(lx, ly, lz);
        leg.castShadow = true;
        root.add(leg);
        return leg;
      });

      this.#root.add(root);

      this.#deer.push({
        root,
        neckPivot,
        earL,
        earR,
        legs,
        homeX: hx,
        homeZ: hz,
        x: hx,
        z: hz,
        yaw: idx * 1.4,
        state: 'graze',
        timer: 2.5 + idx * 0.9,
        targetX: hx,
        targetZ: hz,
        phase: idx * 1.7
      });
    });
  }

  #buildBunnies() {
    const coatHexes = [0xf6f3ee, 0xefe0cb, 0xc79468];
    const coatMats = coatHexes.map((hex) =>
      this.#trackMat(new THREE.MeshStandardMaterial({ color: hex, roughness: 0.8 }))
    );
    const tailMat = this.#trackMat(new THREE.MeshStandardMaterial({ color: 0xfaf8f5, roughness: 0.85 }));
    const pinkNoseMat = this.#trackMat(new THREE.MeshStandardMaterial({ color: 0xf29cb8, roughness: 0.6 }));

    const bodyGeo = this.#trackGeo(new THREE.SphereGeometry(0.18, 10, 8));
    bodyGeo.scale(0.85, 0.85, 1.2);
    const headGeo = this.#trackGeo(new THREE.SphereGeometry(0.12, 9, 8));
    const earGeo = this.#trackGeo(new THREE.CapsuleGeometry(0.028, 0.14, 4, 6));
    const tailGeo = this.#trackGeo(new THREE.SphereGeometry(0.065, 6, 6));
    const pawGeo = this.#trackGeo(new THREE.SphereGeometry(0.055, 6, 6));
    pawGeo.scale(0.8, 0.5, 1.4);

    const spots = [
      [-51, -28], [-57, -33], [60, -15], [64, -22],
      [62, 35], [66, 40], [-65, 34], [-71, 38],
      [40, -62], [-15, 25], [12, 31], [-41, 45]
    ];

    spots.forEach(([bx, bz], idx) => {
      const mat = coatMats[idx % coatMats.length];
      const root = new THREE.Group();
      root.position.set(bx, 0, bz);

      const body = new THREE.Mesh(bodyGeo, mat);
      body.position.set(0, 0.15, 0);
      body.castShadow = true;

      const head = new THREE.Mesh(headGeo, mat);
      head.position.set(0, 0.27, 0.17);
      head.castShadow = true;

      const nose = new THREE.Mesh(this.#trackGeo(new THREE.SphereGeometry(0.022, 6, 6)), pinkNoseMat);
      nose.position.set(0, 0.27, 0.29);

      const earL = new THREE.Mesh(earGeo, mat);
      earL.position.set(-0.048, 0.42, 0.14);
      earL.rotation.set(-0.15, 0, 0.16);
      const earR = new THREE.Mesh(earGeo, mat);
      earR.position.set(0.048, 0.42, 0.14);
      earR.rotation.set(-0.15, 0, -0.16);

      const tail = new THREE.Mesh(tailGeo, tailMat);
      tail.position.set(0, 0.17, -0.22);

      const pawL = new THREE.Mesh(pawGeo, mat);
      pawL.position.set(-0.09, 0.03, 0.08);
      const pawR = new THREE.Mesh(pawGeo, mat);
      pawR.position.set(0.09, 0.03, 0.08);

      root.add(body, head, nose, earL, earR, tail, pawL, pawR);
      this.#root.add(root);

      this.#bunnies.push({
        root,
        earL,
        earR,
        homeX: bx,
        homeZ: bz,
        x: bx,
        z: bz,
        yaw: idx * 1.1,
        state: 'idle',
        timer: 1.0 + (idx % 4) * 0.7,
        hopTime: 0,
        hopDuration: 0.42,
        startX: bx,
        startZ: bz,
        targetX: bx,
        targetZ: bz,
        phase: idx * 1.3
      });
    });
  }

  #lerpAngle(a, b, t) {
    let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }

  #pickClearingTarget(homeX, homeZ, maxRadius, seed) {
    const a = (Math.sin(seed * 43.17) * 0.5 + 0.5) * Math.PI * 2;
    const r = (Math.cos(seed * 19.73) * 0.5 + 0.5) * maxRadius;
    return [homeX + Math.cos(a) * r, homeZ + Math.sin(a) * r];
  }

  update(delta, elapsed, playerPos = null, isPlayerRunning = false) {
    const dt = Math.min(delta, 0.1);
    const t = elapsed ?? 0;

    // 1. Mariposas
    for (const b of this.#butterflies) {
      const a = t * b.speed + b.phase;
      const nx = b.ax + Math.sin(a) * b.radius + Math.cos(a * 1.7) * 0.55;
      const nz = b.az + Math.cos(a * 0.85) * b.radius + Math.sin(a * 1.3) * 0.55;
      const ny = b.baseY + Math.sin(t * 2.4 + b.phase) * 0.32;

      const dx = nx - b.group.position.x;
      const dz = nz - b.group.position.z;
      if (dx * dx + dz * dz > 1e-6) {
        b.group.rotation.y = Math.atan2(dx, dz);
      }
      b.group.position.set(nx, ny, nz);

      const flap = Math.sin(t * b.flapFreq + b.phase) * 0.92;
      b.wingL.rotation.z = -flap;
      b.wingR.rotation.z = flap;
    }

    // 2. Cisnes, patitos y estelas
    this.#wakeTimer += dt;
    const emitWake = this.#wakeTimer >= 0.38;
    if (emitWake) this.#wakeTimer = 0;

    const evalSwanPos = (s, timeVal) => {
      const a = timeVal * s.speed + s.phase;
      const x = s.cx + Math.cos(a) * s.rx;
      const z = s.cz + (s.figure8 ? Math.sin(a * 2) * 0.65 : Math.sin(a)) * s.rz;
      return [x, z];
    };

    for (const s of this.#swans) {
      const [nx, nz] = evalSwanPos(s, t);
      const dx = nx - s.lastX;
      const dz = nz - s.lastZ;
      if (dx * dx + dz * dz > 1e-6) {
        s.group.rotation.y = Math.atan2(dx, dz);
      }
      s.group.position.set(nx, 0.055 + Math.sin(t * 2.0 + s.phase) * 0.012, nz);
      s.neckGroup.rotation.x = Math.sin(t * 1.4 + s.phase) * 0.08;
      if (emitWake) this.#spawnWake(nx, nz, 1.15);
      s.lastX = nx;
      s.lastZ = nz;
    }

    for (const d of this.#ducklings) {
      const leader = this.#swans[d.leaderIdx];
      const [lx, lz] = evalSwanPos(leader, t - d.lag);
      const [aheadX, aheadZ] = evalSwanPos(leader, t - d.lag + 0.05);
      const dirX = aheadX - lx;
      const dirZ = aheadZ - lz;
      const len = Math.hypot(dirX, dirZ) || 1;
      const nx = lx - (dirZ / len) * d.offsetSide;
      const nz = lz + (dirX / len) * d.offsetSide;

      d.group.rotation.y = Math.atan2(dirX, dirZ);
      d.group.position.set(nx, 0.06 + Math.sin(t * 3.8 + d.phase) * 0.01, nz);
      if (emitWake && (d.phase % 2 < 1.2)) this.#spawnWake(nx, nz, 0.55);
      d.lastX = nx;
      d.lastZ = nz;
    }

    for (const w of this.#wakes) {
      if (!w.active) continue;
      w.age += dt;
      const p = w.age / w.maxAge;
      if (p >= 1) {
        w.active = false;
        w.mesh.visible = false;
      } else {
        w.mesh.scale.setScalar(w.baseScale * (1 + p * 2.6));
        w.mat.opacity = 0.36 * (1 - p);
      }
    }

    // 3. Pajaritos cantores
    for (const b of this.#birds) {
      if (b.state === 'perched') {
        b.timer -= dt;
        const perch = this.#perchNodes[b.fromIdx];
        b.group.position.set(perch.x, perch.y + Math.abs(Math.sin(t * 3.2 + b.phase)) * 0.025, perch.z);
        b.headGroup.rotation.y = Math.sin(t * 2.6 + b.phase) * 0.55;
        b.headGroup.rotation.x = Math.sin(t * 4.1 + b.phase) * 0.15;
        b.wingL.rotation.z = 0.15;
        b.wingR.rotation.z = -0.15;

        if (b.timer <= 0) {
          b.state = 'flying';
          b.flightTime = 0;
          b.toIdx = (b.fromIdx + 1 + Math.floor((Math.sin(t * 7.3 + b.phase) * 0.5 + 0.5) * 6)) % this.#perchNodes.length;
          if (b.toIdx === b.fromIdx) b.toIdx = (b.fromIdx + 1) % this.#perchNodes.length;
          const dist = this.#perchNodes[b.fromIdx].distanceTo(this.#perchNodes[b.toIdx]);
          b.flightDuration = Math.max(1.6, Math.min(4.8, dist / 9.5));
        }
      } else {
        b.flightTime += dt;
        const p = Math.min(1, b.flightTime / b.flightDuration);
        const start = this.#perchNodes[b.fromIdx];
        const end = this.#perchNodes[b.toIdx];

        const prevX = b.group.position.x;
        const prevZ = b.group.position.z;
        const nx = THREE.MathUtils.lerp(start.x, end.x, p);
        const nz = THREE.MathUtils.lerp(start.z, end.z, p);
        const ny = THREE.MathUtils.lerp(start.y, end.y, p) + Math.sin(p * Math.PI) * b.arcHeight;

        b.group.position.set(nx, ny, nz);
        const vx = nx - prevX;
        const vz = nz - prevZ;
        if (vx * vx + vz * vz > 1e-6) {
          b.group.rotation.y = Math.atan2(vx, vz);
        }
        const flap = Math.sin(t * 24 + b.phase) * 0.85;
        b.wingL.rotation.z = -flap;
        b.wingR.rotation.z = flap;

        if (p >= 1) {
          b.fromIdx = b.toIdx;
          b.state = 'perched';
          b.timer = 2.5 + (b.phase % 4);
        }
      }
    }

    // 4. Ciervos blancos reales (reacción al jugador + pastoreo)
    const deerTriggerDist = isPlayerRunning ? 7.2 : 5.2;
    for (const d of this.#deer) {
      if (playerPos) {
        const dxp = d.x - playerPos.x;
        const dzp = d.z - playerPos.z;
        const dist = Math.hypot(dxp, dzp);
        if (dist < deerTriggerDist && d.state !== 'flee') {
          d.state = 'flee';
          d.timer = 2.4;
          const len = dist || 1;
          // Huir alejándose del jugador pero manteniendo al ciervo dentro de su claro
          let tx = d.x + (dxp / len) * 5.5;
          let tz = d.z + (dzp / len) * 5.5;
          const fromHome = Math.hypot(tx - d.homeX, tz - d.homeZ);
          if (fromHome > 7.5) {
            tx = d.homeX + ((tx - d.homeX) / fromHome) * 7.5;
            tz = d.homeZ + ((tz - d.homeZ) / fromHome) * 7.5;
          }
          d.targetX = tx;
          d.targetZ = tz;
        }
      }

      d.timer -= dt;
      if (d.state === 'graze') {
        d.neckPivot.rotation.x = 0.65 + Math.sin(t * 2.1 + d.phase) * 0.12;
        d.earL.rotation.z = 0.55 + Math.sin(t * 4.5 + d.phase) * 0.12;
        d.earR.rotation.z = -0.55 - Math.cos(t * 4.2 + d.phase) * 0.12;
        for (const leg of d.legs) leg.rotation.x = THREE.MathUtils.lerp(leg.rotation.x, 0, dt * 6);

        if (d.timer <= 0) {
          d.state = 'wander';
          d.timer = 3.5 + (d.phase % 2.5);
          const [tx, tz] = this.#pickClearingTarget(d.homeX, d.homeZ, 5.5, t + d.phase);
          d.targetX = tx;
          d.targetZ = tz;
        }
      } else {
        const speed = d.state === 'flee' ? 3.8 : 1.45;
        const dx = d.targetX - d.x;
        const dz = d.targetZ - d.z;
        const dist = Math.hypot(dx, dz);

        if (dist > 0.25 && d.timer > 0) {
          const desiredYaw = Math.atan2(dx, dz);
          d.yaw = this.#lerpAngle(d.yaw, desiredYaw, Math.min(1, dt * 5.5));
          const step = Math.min(dist, speed * dt);
          d.x += (dx / dist) * step;
          d.z += (dz / dist) * step;

          d.neckPivot.rotation.x = THREE.MathUtils.lerp(d.neckPivot.rotation.x, 0.08, dt * 6);
          const gaitFreq = d.state === 'flee' ? 11 : 6;
          const swing = Math.sin(t * gaitFreq + d.phase) * 0.42;
          d.legs[0].rotation.x = swing;
          d.legs[1].rotation.x = -swing;
          d.legs[2].rotation.x = -swing;
          d.legs[3].rotation.x = swing;
        } else {
          d.state = 'graze';
          d.timer = 3.2 + (d.phase % 3);
        }
      }
      d.root.position.set(d.x, 0, d.z);
      d.root.rotation.y = d.yaw;
    }

    // 5. Conejitos (saltitos + reacción al jugador)
    const bunnyTriggerDist = isPlayerRunning ? 7.0 : 5.0;
    for (const b of this.#bunnies) {
      if (playerPos && b.state !== 'flee') {
        const dxp = b.x - playerPos.x;
        const dzp = b.z - playerPos.z;
        const dist = Math.hypot(dxp, dzp);
        if (dist < bunnyTriggerDist) {
          b.state = 'flee';
          b.hopTime = 0;
          b.hopDuration = 0.32;
          b.startX = b.x;
          b.startZ = b.z;
          const len = dist || 1;
          let tx = b.x + (dxp / len) * 3.6;
          let tz = b.z + (dzp / len) * 3.6;
          const fromHome = Math.hypot(tx - b.homeX, tz - b.homeZ);
          if (fromHome > 6.5) {
            tx = b.homeX + ((tx - b.homeX) / fromHome) * 6.5;
            tz = b.homeZ + ((tz - b.homeZ) / fromHome) * 6.5;
          }
          b.targetX = tx;
          b.targetZ = tz;
          b.yaw = Math.atan2(tx - b.x, tz - b.z);
        }
      }

      if (b.state === 'idle') {
        b.timer -= dt;
        b.root.position.set(b.x, 0, b.z);
        b.earL.rotation.x = -0.15 + Math.sin(t * 5.2 + b.phase) * 0.14;
        b.earR.rotation.x = -0.15 + Math.cos(t * 4.8 + b.phase) * 0.14;

        if (b.timer <= 0) {
          b.state = 'hop';
          b.hopTime = 0;
          b.hopDuration = 0.44;
          b.startX = b.x;
          b.startZ = b.z;
          const [tx, tz] = this.#pickClearingTarget(b.homeX, b.homeZ, 4.2, t * 1.3 + b.phase);
          b.targetX = b.x + (tx - b.x) * 0.45;
          b.targetZ = b.z + (tz - b.z) * 0.45;
          b.yaw = Math.atan2(b.targetX - b.x, b.targetZ - b.z);
        }
      } else {
        b.hopTime += dt;
        const p = Math.min(1, b.hopTime / b.hopDuration);
        b.x = THREE.MathUtils.lerp(b.startX, b.targetX, p);
        b.z = THREE.MathUtils.lerp(b.startZ, b.targetZ, p);
        const hopHeight = b.state === 'flee' ? 0.48 : 0.28;
        const y = Math.sin(p * Math.PI) * hopHeight;
        b.root.position.set(b.x, y, b.z);
        b.root.rotation.y = b.yaw;

        if (p >= 1) {
          b.root.position.y = 0;
          if (b.state === 'flee' && playerPos && Math.hypot(b.x - playerPos.x, b.z - playerPos.z) < bunnyTriggerDist + 1.2) {
            // Segundo saltito si aún está muy cerca
            const dxp = b.x - playerPos.x;
            const dzp = b.z - playerPos.z;
            const len = Math.hypot(dxp, dzp) || 1;
            b.hopTime = 0;
            b.startX = b.x;
            b.startZ = b.z;
            let tx = b.x + (dxp / len) * 2.8;
            let tz = b.z + (dzp / len) * 2.8;
            const fromHome = Math.hypot(tx - b.homeX, tz - b.homeZ);
            if (fromHome > 6.5) {
              tx = b.homeX + ((tx - b.homeX) / fromHome) * 6.5;
              tz = b.homeZ + ((tz - b.homeZ) / fromHome) * 6.5;
            }
            b.targetX = tx;
            b.targetZ = tz;
            b.yaw = Math.atan2(tx - b.x, tz - b.z);
          } else {
            b.state = 'idle';
            b.timer = 1.4 + (b.phase % 2.4);
          }
        }
      }
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
    this.#butterflies.length = 0;
    this.#swans.length = 0;
    this.#ducklings.length = 0;
    this.#wakes.length = 0;
    this.#wakePool.length = 0;
    this.#birds.length = 0;
    this.#perchNodes.length = 0;
    this.#deer.length = 0;
    this.#bunnies.length = 0;
  }
}
