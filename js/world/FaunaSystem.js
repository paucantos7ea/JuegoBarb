import * as THREE from 'three';

const CULL_DIST_SQ = 55 * 55;

export class FaunaSystem {
  #scene;
  #root = null;
  #geometries = [];
  #materials = [];

  #butterflies = [];
  #butterflyBodyInst = null;
  #butterflyLeftWingInst = null;
  #butterflyRightWingInst = null;

  #swans = [];
  #swanBodyInst = null;
  #swanNeckInst = null;
  #swanBeakInst = null;
  #swanEyeInst = null;

  #ducklings = [];
  #duckBodyInst = null;
  #duckBeakInst = null;

  #wakes = [];
  #wakePool = [];
  #wakeInst = null;
  #wakeTimer = 0;

  #birds = [];
  #perchNodes = [];
  #birdBodyInst = null;
  #birdBellyInst = null;
  #birdLeftWingInst = null;
  #birdRightWingInst = null;

  #deer = [];
  #deerTorsoInst = null;
  #deerTailInst = null;
  #deerHeadInst = null;
  #deerNoseInst = null;
  #deerAntlerInst = null;
  #deerLegInst = null;

  #bunnies = [];
  #bunnyBodyInst = null;
  #bunnyTailInst = null;
  #bunnyNoseInst = null;
  #bunnyEarInst = null;

  #dummy = new THREE.Object3D();
  #tmpColor = new THREE.Color();
  #tmpXZ = { x: 0, z: 0 };
  #tmpXZ2 = { x: 0, z: 0 };

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

  #mergeGeometries(pieces) {
    const normalized = [];
    let totalVerts = 0;

    for (const { geo: srcGeo, matrix } of pieces) {
      const g = srcGeo.index ? srcGeo.toNonIndexed() : srcGeo.clone();
      g.applyMatrix4(matrix);

      const posAttr = g.getAttribute('position');
      const count = posAttr.count;
      if (!g.getAttribute('normal')) {
        g.computeVertexNormals();
      }
      if (!g.getAttribute('uv')) {
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
      }

      if (matrix.determinant() < 0) {
        const pos = g.getAttribute('position');
        const norm = g.getAttribute('normal');
        const uv = g.getAttribute('uv');
        for (let v = 0; v < count; v += 3) {
          this.#swapAttrPair(pos, v + 1, v + 2, 3);
          this.#swapAttrPair(norm, v + 1, v + 2, 3);
          this.#swapAttrPair(uv, v + 1, v + 2, 2);
        }
      }

      normalized.push(g);
      totalVerts += count;
    }

    const posArr = new Float32Array(totalVerts * 3);
    const normArr = new Float32Array(totalVerts * 3);
    const uvArr = new Float32Array(totalVerts * 2);

    let offset3 = 0;
    let offset2 = 0;
    for (const g of normalized) {
      const p = g.getAttribute('position');
      const n = g.getAttribute('normal');
      const u = g.getAttribute('uv');
      const c = p.count;

      for (let i = 0; i < c; i++) {
        posArr[offset3] = p.getX(i);
        posArr[offset3 + 1] = p.getY(i);
        posArr[offset3 + 2] = p.getZ(i);

        normArr[offset3] = n.getX(i);
        normArr[offset3 + 1] = n.getY(i);
        normArr[offset3 + 2] = n.getZ(i);
        offset3 += 3;

        uvArr[offset2] = u.getX(i);
        uvArr[offset2 + 1] = u.getY(i);
        offset2 += 2;
      }
      g.dispose();
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
    merged.computeBoundingSphere();
    return merged;
  }

  #swapAttrPair(attr, a, b, itemSize) {
    for (let k = 0; k < itemSize; k++) {
      const idxA = a * itemSize + k;
      const idxB = b * itemSize + k;
      const tmp = attr.array[idxA];
      attr.array[idxA] = attr.array[idxB];
      attr.array[idxB] = tmp;
    }
  }

  #buildButterflies() {
    // Geometrías compartidas para las 50 mariposas instanciadas
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
    const wingMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.45,
      metalness: 0.05,
      side: THREE.DoubleSide
    }));

    const pastelColors = [0xff85c0, 0x7ad7ff, 0xffe066, 0xc89bff, 0xff9e80, 0x9bf6ff];

    // Zonas de parterres para revolotear
    const anchors = [
      [16, 10], [-16, 10], [16, -10], [-16, -10],
      [0, 22], [32, -6], [-16, 30], [36, 16], [-33, 41], [-54, -44]
    ];

    const count = 50;
    const bodyInst = new THREE.InstancedMesh(bodyGeo, bodyMat, count);
    const leftWingInst = new THREE.InstancedMesh(leftWingGeo, wingMat, count);
    const rightWingInst = new THREE.InstancedMesh(rightWingGeo, wingMat, count);

    bodyInst.name = 'FaunaButterflyBodies';
    leftWingInst.name = 'FaunaButterflyLeftWings';
    rightWingInst.name = 'FaunaButterflyRightWings';

    bodyInst.frustumCulled = false;
    leftWingInst.frustumCulled = false;
    rightWingInst.frustumCulled = false;
    bodyInst.castShadow = false;
    leftWingInst.castShadow = false;
    rightWingInst.castShadow = false;

    const dummy = this.#dummy;
    for (let i = 0; i < count; i++) {
      const [ax, az] = anchors[i % anchors.length];
      const scale = 0.8 + (i % 4) * 0.18;
      const radius = 2.0 + (i % 5) * 0.9;
      const baseY = 0.75 + (i % 6) * 0.28;

      this.#tmpColor.setHex(pastelColors[i % pastelColors.length]);
      leftWingInst.setColorAt(i, this.#tmpColor);
      rightWingInst.setColorAt(i, this.#tmpColor);

      dummy.position.set(ax, baseY, az);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      bodyInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(ax - 0.01 * scale, baseY, az);
      dummy.updateMatrix();
      leftWingInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(ax + 0.01 * scale, baseY, az);
      dummy.updateMatrix();
      rightWingInst.setMatrixAt(i, dummy.matrix);

      this.#butterflies.push({
        ax,
        az,
        baseY,
        radius,
        scale,
        x: ax,
        z: az,
        yaw: 0,
        speed: 0.55 + (i % 7) * 0.11,
        flapFreq: 13 + (i % 5) * 2.1,
        phase: i * 1.37
      });
    }

    bodyInst.instanceMatrix.needsUpdate = true;
    leftWingInst.instanceMatrix.needsUpdate = true;
    rightWingInst.instanceMatrix.needsUpdate = true;
    if (leftWingInst.instanceColor) leftWingInst.instanceColor.needsUpdate = true;
    if (rightWingInst.instanceColor) rightWingInst.instanceColor.needsUpdate = true;

    this.#butterflyBodyInst = bodyInst;
    this.#butterflyLeftWingInst = leftWingInst;
    this.#butterflyRightWingInst = rightWingInst;
    this.#root.add(bodyInst, leftWingInst, rightWingInst);
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

    // Geometrías fusionadas de cisne (InstancedMesh)
    const rawBody = new THREE.SphereGeometry(0.42, 14, 10);
    rawBody.scale(0.85, 0.65, 1.45);
    const rawWing = new THREE.SphereGeometry(0.32, 10, 8);
    rawWing.scale(0.45, 0.7, 1.3);
    const rawTail = new THREE.ConeGeometry(0.18, 0.4, 8);
    rawTail.rotateX(-Math.PI / 2.6);

    const mBody = new THREE.Matrix4().makeTranslation(0, 0.18, 0);
    const mWingL = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.12, 0, 0.2)).setPosition(-0.27, 0.25, -0.05);
    const mWingR = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.12, 0, -0.2)).setPosition(0.27, 0.25, -0.05);
    const mTail = new THREE.Matrix4().makeTranslation(0, 0.26, -0.56);

    const swanBodyGeo = this.#trackGeo(this.#mergeGeometries([
      { geo: rawBody, matrix: mBody },
      { geo: rawWing, matrix: mWingL },
      { geo: rawWing, matrix: mWingR },
      { geo: rawTail, matrix: mTail }
    ]));
    rawBody.dispose(); rawWing.dispose(); rawTail.dispose();

    const neckCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.14, 0.36),
      new THREE.Vector3(0, 0.48, 0.54),
      new THREE.Vector3(0, 0.85, 0.42),
      new THREE.Vector3(0, 1.02, 0.58)
    ]);
    const rawNeck = new THREE.TubeGeometry(neckCurve, 14, 0.068, 8, false);
    const rawHead = new THREE.SphereGeometry(0.105, 10, 8);
    const swanNeckGeo = this.#trackGeo(this.#mergeGeometries([
      { geo: rawNeck, matrix: new THREE.Matrix4() },
      { geo: rawHead, matrix: new THREE.Matrix4().makeTranslation(0, 1.03, 0.62) }
    ]));
    rawNeck.dispose(); rawHead.dispose();

    const swanBeakGeo = this.#trackGeo(new THREE.ConeGeometry(0.048, 0.16, 8));
    swanBeakGeo.rotateX(Math.PI / 2);
    swanBeakGeo.translate(0, 1.0, 0.76);

    const rawEye = new THREE.SphereGeometry(0.018, 6, 6);
    const swanEyesGeo = this.#trackGeo(this.#mergeGeometries([
      { geo: rawEye, matrix: new THREE.Matrix4().makeTranslation(-0.07, 1.05, 0.68) },
      { geo: rawEye, matrix: new THREE.Matrix4().makeTranslation(0.07, 1.05, 0.68) }
    ]));
    rawEye.dispose();

    // 2 cisnes en Estanque Este (46, 0.08, 26), 2 cisnes en orilla Lago Sur (±14, 0.08, 60)
    const swanPaths = [
      { cx: 46, cz: 26, rx: 6.4, rz: 4.5, speed: 0.24, phase: 0, figure8: true },
      { cx: 46, cz: 26, rx: 5.0, rz: 3.6, speed: 0.21, phase: Math.PI, figure8: false },
      { cx: -14, cz: 60, rx: 7.5, rz: 2.6, speed: 0.19, phase: 0.6, figure8: true },
      { cx: 14, cz: 60, rx: 7.5, rz: 2.6, speed: 0.19, phase: 2.8, figure8: false }
    ];

    const swanCount = swanPaths.length;
    this.#swanBodyInst = new THREE.InstancedMesh(swanBodyGeo, whiteMat, swanCount);
    this.#swanNeckInst = new THREE.InstancedMesh(swanNeckGeo, whiteMat, swanCount);
    this.#swanBeakInst = new THREE.InstancedMesh(swanBeakGeo, orangeMat, swanCount);
    this.#swanEyeInst = new THREE.InstancedMesh(swanEyesGeo, darkMat, swanCount);

    for (const inst of [this.#swanBodyInst, this.#swanNeckInst, this.#swanBeakInst, this.#swanEyeInst]) {
      inst.frustumCulled = false;
      inst.castShadow = inst === this.#swanBodyInst || inst === this.#swanNeckInst;
      this.#root.add(inst);
    }

    const dummy = this.#dummy;
    swanPaths.forEach((p, idx) => {
      this.#evalSwanPos(p, 0, this.#tmpXZ);
      dummy.position.set(this.#tmpXZ.x, 0.055, this.#tmpXZ.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.#swanBodyInst.setMatrixAt(idx, dummy.matrix);
      this.#swanNeckInst.setMatrixAt(idx, dummy.matrix);
      this.#swanBeakInst.setMatrixAt(idx, dummy.matrix);
      this.#swanEyeInst.setMatrixAt(idx, dummy.matrix);

      this.#swans.push({
        ...p,
        idx,
        yaw: 0,
        lastX: this.#tmpXZ.x,
        lastZ: this.#tmpXZ.z
      });
    });
    this.#swanBodyInst.instanceMatrix.needsUpdate = true;
    this.#swanNeckInst.instanceMatrix.needsUpdate = true;
    this.#swanBeakInst.instanceMatrix.needsUpdate = true;
    this.#swanEyeInst.instanceMatrix.needsUpdate = true;

    // Geometrías fusionadas de patito dorado (InstancedMesh)
    const rawDuckBody = new THREE.SphereGeometry(0.14, 10, 8);
    rawDuckBody.scale(0.85, 0.75, 1.25);
    const rawDuckHead = new THREE.SphereGeometry(0.085, 8, 8);
    const duckBodyGeo = this.#trackGeo(this.#mergeGeometries([
      { geo: rawDuckBody, matrix: new THREE.Matrix4().makeTranslation(0, 0.08, 0) },
      { geo: rawDuckHead, matrix: new THREE.Matrix4().makeTranslation(0, 0.19, 0.12) }
    ]));
    rawDuckBody.dispose(); rawDuckHead.dispose();

    const duckBeakGeo = this.#trackGeo(new THREE.ConeGeometry(0.032, 0.09, 6));
    duckBeakGeo.rotateX(Math.PI / 2);
    duckBeakGeo.translate(0, 0.18, 0.22);

    // 6 patitos dorados (3 siguiendo al cisne 0 en Estanque Este, 3 siguiendo al cisne 2/3 en Lago Sur)
    const duckConfigs = [
      { leaderIdx: 0, lag: 0.36, offsetSide: 0.28 },
      { leaderIdx: 0, lag: 0.64, offsetSide: -0.26 },
      { leaderIdx: 1, lag: 0.42, offsetSide: 0.22 },
      { leaderIdx: 2, lag: 0.36, offsetSide: 0.25 },
      { leaderIdx: 2, lag: 0.66, offsetSide: -0.25 },
      { leaderIdx: 3, lag: 0.40, offsetSide: 0.24 }
    ];

    this.#duckBodyInst = new THREE.InstancedMesh(duckBodyGeo, duckGoldMat, duckConfigs.length);
    this.#duckBeakInst = new THREE.InstancedMesh(duckBeakGeo, orangeMat, duckConfigs.length);
    for (const inst of [this.#duckBodyInst, this.#duckBeakInst]) {
      inst.frustumCulled = false;
      inst.castShadow = false;
      this.#root.add(inst);
    }

    duckConfigs.forEach((cfg, idx) => {
      const leader = this.#swans[cfg.leaderIdx];
      this.#evalSwanPos(leader, -cfg.lag, this.#tmpXZ);
      this.#evalSwanPos(leader, -cfg.lag + 0.05, this.#tmpXZ2);
      const dirX = this.#tmpXZ2.x - this.#tmpXZ.x;
      const dirZ = this.#tmpXZ2.z - this.#tmpXZ.z;
      const len = Math.hypot(dirX, dirZ) || 1;
      const initX = this.#tmpXZ.x - (dirZ / len) * cfg.offsetSide;
      const initZ = this.#tmpXZ.z + (dirX / len) * cfg.offsetSide;
      const yaw = Math.atan2(dirX, dirZ);

      dummy.position.set(initX, 0.06, initZ);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.#duckBodyInst.setMatrixAt(idx, dummy.matrix);
      this.#duckBeakInst.setMatrixAt(idx, dummy.matrix);

      this.#ducklings.push({
        ...cfg,
        yaw,
        phase: idx * 1.1,
        lastX: initX,
        lastZ: initZ
      });
    });
    this.#duckBodyInst.instanceMatrix.needsUpdate = true;
    this.#duckBeakInst.instanceMatrix.needsUpdate = true;
  }

  #buildWakePool() {
    // Estelas sutiles sobre el agua (1 InstancedMesh de 26 aros)
    const wakeGeo = this.#trackGeo(new THREE.RingGeometry(0.18, 0.26, 20));
    wakeGeo.rotateX(-Math.PI / 2);

    const wakeMat = this.#trackMat(new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.36,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));

    const wakeCount = 26;
    const wakeInst = new THREE.InstancedMesh(wakeGeo, wakeMat, wakeCount);
    wakeInst.name = 'FaunaWaterWakes';
    wakeInst.frustumCulled = false;
    wakeInst.castShadow = false;
    wakeInst.visible = false;

    const dummy = this.#dummy;
    dummy.position.set(0, 0.072, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    this.#tmpColor.setHex(0xe8fbff);

    for (let i = 0; i < wakeCount; i++) {
      wakeInst.setMatrixAt(i, dummy.matrix);
      wakeInst.setColorAt(i, this.#tmpColor);
      this.#wakePool.push({
        active: false,
        x: 0,
        z: 0,
        age: 0,
        maxAge: 1.5,
        baseScale: 1
      });
    }
    wakeInst.instanceMatrix.needsUpdate = true;
    if (wakeInst.instanceColor) wakeInst.instanceColor.needsUpdate = true;

    this.#wakeInst = wakeInst;
    this.#wakes = this.#wakePool;
    this.#root.add(wakeInst);
  }

  #spawnWake(x, z, baseScale = 1.0) {
    for (let i = 0; i < this.#wakePool.length; i++) {
      const w = this.#wakePool[i];
      if (!w.active) {
        w.active = true;
        w.x = x;
        w.z = z;
        w.age = 0;
        w.baseScale = baseScale;
        if (this.#wakeInst) this.#wakeInst.visible = true;
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

    const rawBodyGeo = new THREE.SphereGeometry(0.11, 8, 8);
    rawBodyGeo.scale(0.85, 0.9, 1.35);
    const rawHeadGeo = new THREE.SphereGeometry(0.075, 8, 8);
    const rawBeakGeo = new THREE.ConeGeometry(0.025, 0.075, 6);
    rawBeakGeo.rotateX(Math.PI / 2);
    const rawTailGeo = new THREE.BoxGeometry(0.08, 0.02, 0.16);

    const mBody = new THREE.Matrix4();
    const mTail = new THREE.Matrix4().makeRotationX(0.25).setPosition(0, 0.03, -0.17);
    const mHead = new THREE.Matrix4().makeTranslation(0, 0.08, 0.11);
    const mBeak = new THREE.Matrix4().makeTranslation(0, 0.075, 0.19);

    const birdBodyGeo = this.#trackGeo(this.#mergeGeometries([
      { geo: rawBodyGeo, matrix: mBody },
      { geo: rawTailGeo, matrix: mTail },
      { geo: rawHeadGeo, matrix: mHead },
      { geo: rawBeakGeo, matrix: mBeak }
    ]));
    rawBodyGeo.dispose();
    rawHeadGeo.dispose();
    rawBeakGeo.dispose();
    rawTailGeo.dispose();

    const birdBellyGeo = this.#trackGeo(new THREE.SphereGeometry(0.085, 7, 7));
    const birdRightWingGeo = this.#trackGeo(new THREE.BoxGeometry(0.18, 0.015, 0.11));
    birdRightWingGeo.translate(0.09, 0, 0);
    const birdLeftWingGeo = this.#trackGeo(new THREE.BoxGeometry(0.18, 0.015, 0.11));
    birdLeftWingGeo.translate(-0.09, 0, 0);

    const birdBodyMat = this.#trackMat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
    const birdBellyMat = this.#trackMat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65 }));

    const palettes = [
      { body: 0x4ea3eb, belly: 0xdcf0ff }, // Azulejo
      { body: 0xf2c641, belly: 0xfff3c4 }, // Jilguero
      { body: 0x70584c, belly: 0xe66845 }, // Petirrojo
      { body: 0xe87ab0, belly: 0xffe4f2 }  // Pinzón rosa real
    ];

    const count = 20;
    const bodyInst = new THREE.InstancedMesh(birdBodyGeo, birdBodyMat, count);
    const bellyInst = new THREE.InstancedMesh(birdBellyGeo, birdBellyMat, count);
    const leftWingInst = new THREE.InstancedMesh(birdLeftWingGeo, birdBodyMat, count);
    const rightWingInst = new THREE.InstancedMesh(birdRightWingGeo, birdBodyMat, count);

    bodyInst.name = 'FaunaBirdBodies';
    bellyInst.name = 'FaunaBirdBellies';
    leftWingInst.name = 'FaunaBirdLeftWings';
    rightWingInst.name = 'FaunaBirdRightWings';

    bodyInst.frustumCulled = false;
    bellyInst.frustumCulled = false;
    leftWingInst.frustumCulled = false;
    rightWingInst.frustumCulled = false;
    bodyInst.castShadow = false;
    bellyInst.castShadow = false;
    leftWingInst.castShadow = false;
    rightWingInst.castShadow = false;

    const dummy = this.#dummy;
    for (let i = 0; i < count; i++) {
      const pal = palettes[i % palettes.length];
      this.#tmpColor.setHex(pal.body);
      bodyInst.setColorAt(i, this.#tmpColor);
      leftWingInst.setColorAt(i, this.#tmpColor);
      rightWingInst.setColorAt(i, this.#tmpColor);
      this.#tmpColor.setHex(pal.belly);
      bellyInst.setColorAt(i, this.#tmpColor);

      const startIdx = i % this.#perchNodes.length;
      const startNode = this.#perchNodes[startIdx];

      dummy.position.set(startNode.x, startNode.y, startNode.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      bodyInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(startNode.x, startNode.y - 0.02, startNode.z + 0.02);
      dummy.updateMatrix();
      bellyInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(startNode.x - 0.06, startNode.y + 0.03, startNode.z);
      dummy.rotation.set(0, 0, 0.15);
      dummy.updateMatrix();
      leftWingInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(startNode.x + 0.06, startNode.y + 0.03, startNode.z);
      dummy.rotation.set(0, 0, -0.15);
      dummy.updateMatrix();
      rightWingInst.setMatrixAt(i, dummy.matrix);

      this.#birds.push({
        x: startNode.x,
        y: startNode.y,
        z: startNode.z,
        yaw: 0,
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

    bodyInst.instanceMatrix.needsUpdate = true;
    bellyInst.instanceMatrix.needsUpdate = true;
    leftWingInst.instanceMatrix.needsUpdate = true;
    rightWingInst.instanceMatrix.needsUpdate = true;
    if (bodyInst.instanceColor) bodyInst.instanceColor.needsUpdate = true;
    if (bellyInst.instanceColor) bellyInst.instanceColor.needsUpdate = true;
    if (leftWingInst.instanceColor) leftWingInst.instanceColor.needsUpdate = true;
    if (rightWingInst.instanceColor) rightWingInst.instanceColor.needsUpdate = true;

    this.#birdBodyInst = bodyInst;
    this.#birdBellyInst = bellyInst;
    this.#birdLeftWingInst = leftWingInst;
    this.#birdRightWingInst = rightWingInst;
    this.#root.add(bodyInst, bellyInst, leftWingInst, rightWingInst);
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
    torsoGeo.translate(0, 0.96, 0);

    const tailGeo = this.#trackGeo(new THREE.SphereGeometry(0.09, 6, 6));
    tailGeo.translate(0, 1.06, -0.62);

    const rawNeck = new THREE.CylinderGeometry(0.11, 0.16, 0.62, 8);
    const rawHead = new THREE.SphereGeometry(0.16, 10, 8);
    rawHead.scale(0.85, 0.88, 1.35);
    const rawEar = new THREE.ConeGeometry(0.055, 0.18, 6);
    const deerHeadGeo = this.#trackGeo(this.#mergeGeometries([
      { geo: rawNeck, matrix: new THREE.Matrix4().makeRotationX(0.25).setPosition(0, 0.24, 0.08) },
      { geo: rawHead, matrix: new THREE.Matrix4().makeTranslation(0, 0.56, 0.22) },
      { geo: rawEar, matrix: new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-0.2, 0, 0.55)).setPosition(-0.11, 0.7, 0.12) },
      { geo: rawEar, matrix: new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-0.2, 0, -0.55)).setPosition(0.11, 0.7, 0.12) }
    ]));
    rawNeck.dispose(); rawHead.dispose(); rawEar.dispose();

    const deerNoseGeo = this.#trackGeo(new THREE.SphereGeometry(0.045, 6, 6));
    deerNoseGeo.translate(0, 0.53, 0.42);

    const rawStem = new THREE.CylinderGeometry(0.02, 0.028, 0.38, 6);
    const rawTine = new THREE.CylinderGeometry(0.012, 0.018, 0.18, 5);
    const antlerPieces = [];
    for (const side of [-1, 1]) {
      antlerPieces.push({
        geo: rawStem,
        matrix: new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-0.2, 0, -side * 0.35)).setPosition(side * 0.09, 0.82, 0.16)
      });
      antlerPieces.push({
        geo: rawTine,
        matrix: new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.5, 0, -side * 0.2)).setPosition(side * 0.15, 0.9, 0.24)
      });
    }
    const deerAntlerGeo = this.#trackGeo(this.#mergeGeometries(antlerPieces));
    rawStem.dispose(); rawTine.dispose();

    const legGeo = this.#trackGeo(new THREE.CylinderGeometry(0.055, 0.04, 0.82, 7));
    legGeo.translate(0, -0.41, 0);

    const clearings = [
      [-54, -30, true],
      [62, -18, false],
      [64, 38, true],
      [-68, 36, false],
      [42, -64, true]
    ];

    const count = clearings.length;
    this.#deerTorsoInst = new THREE.InstancedMesh(torsoGeo, coatMat, count);
    this.#deerTailInst = new THREE.InstancedMesh(tailGeo, bellyMat, count);
    this.#deerHeadInst = new THREE.InstancedMesh(deerHeadGeo, coatMat, count);
    this.#deerNoseInst = new THREE.InstancedMesh(deerNoseGeo, noseMat, count);
    this.#deerAntlerInst = new THREE.InstancedMesh(deerAntlerGeo, antlerMat, count);
    this.#deerLegInst = new THREE.InstancedMesh(legGeo, coatMat, count * 4);

    for (const inst of [
      this.#deerTorsoInst, this.#deerTailInst, this.#deerHeadInst,
      this.#deerNoseInst, this.#deerAntlerInst, this.#deerLegInst
    ]) {
      inst.frustumCulled = false;
      inst.castShadow = inst === this.#deerTorsoInst;
      this.#root.add(inst);
    }

    clearings.forEach(([hx, hz, hasAntlers], idx) => {
      const d = {
        hasAntlers,
        homeX: hx,
        homeZ: hz,
        x: hx,
        z: hz,
        yaw: idx * 1.4,
        neckRotX: 0.65,
        legAngles: [0, 0, 0, 0],
        state: 'graze',
        timer: 2.5 + idx * 0.9,
        targetX: hx,
        targetZ: hz,
        phase: idx * 1.7
      };
      this.#deer.push(d);
      this.#syncDeerInstance(idx, d);
    });

    for (const inst of [
      this.#deerTorsoInst, this.#deerTailInst, this.#deerHeadInst,
      this.#deerNoseInst, this.#deerAntlerInst, this.#deerLegInst
    ]) {
      inst.instanceMatrix.needsUpdate = true;
    }
  }

  #syncDeerInstance(idx, d) {
    const dummy = this.#dummy;
    const cosY = Math.cos(d.yaw);
    const sinY = Math.sin(d.yaw);

    dummy.position.set(d.x, 0, d.z);
    dummy.rotation.set(0, d.yaw, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    this.#deerTorsoInst.setMatrixAt(idx, dummy.matrix);
    this.#deerTailInst.setMatrixAt(idx, dummy.matrix);

    // Neck pivot at local (0, 1.08, 0.45)
    const nx = d.x + 0.45 * sinY;
    const nz = d.z + 0.45 * cosY;
    dummy.position.set(nx, 1.08, nz);
    dummy.rotation.set(d.neckRotX, d.yaw, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    this.#deerHeadInst.setMatrixAt(idx, dummy.matrix);
    this.#deerNoseInst.setMatrixAt(idx, dummy.matrix);

    if (!d.hasAntlers) dummy.scale.setScalar(0);
    dummy.updateMatrix();
    this.#deerAntlerInst.setMatrixAt(idx, dummy.matrix);

    const legOffsets = [
      [-0.15, 0.82, 0.36],
      [0.15, 0.82, 0.36],
      [-0.15, 0.82, -0.36],
      [0.15, 0.82, -0.36]
    ];
    dummy.scale.setScalar(1);
    for (let l = 0; l < 4; l++) {
      const [lx, ly, lz] = legOffsets[l];
      const wx = d.x + lx * cosY + lz * sinY;
      const wz = d.z - lx * sinY + lz * cosY;
      dummy.position.set(wx, ly, wz);
      dummy.rotation.set(d.legAngles[l], d.yaw, 0);
      dummy.updateMatrix();
      this.#deerLegInst.setMatrixAt(idx * 4 + l, dummy.matrix);
    }
  }

  #buildBunnies() {
    const coatHexes = [0xf6f3ee, 0xefe0cb, 0xc79468];
    const coatMat = this.#trackMat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }));
    const tailMat = this.#trackMat(new THREE.MeshStandardMaterial({ color: 0xfaf8f5, roughness: 0.85 }));
    const pinkNoseMat = this.#trackMat(new THREE.MeshStandardMaterial({ color: 0xf29cb8, roughness: 0.6 }));

    const rawBody = new THREE.SphereGeometry(0.18, 10, 8);
    rawBody.scale(0.85, 0.85, 1.2);
    const rawHead = new THREE.SphereGeometry(0.12, 9, 8);
    const rawPaw = new THREE.SphereGeometry(0.055, 6, 6);
    rawPaw.scale(0.8, 0.5, 1.4);

    const bunnyBodyGeo = this.#trackGeo(this.#mergeGeometries([
      { geo: rawBody, matrix: new THREE.Matrix4().makeTranslation(0, 0.15, 0) },
      { geo: rawHead, matrix: new THREE.Matrix4().makeTranslation(0, 0.27, 0.17) },
      { geo: rawPaw, matrix: new THREE.Matrix4().makeTranslation(-0.09, 0.03, 0.08) },
      { geo: rawPaw, matrix: new THREE.Matrix4().makeTranslation(0.09, 0.03, 0.08) }
    ]));
    rawBody.dispose(); rawHead.dispose(); rawPaw.dispose();

    const tailGeo = this.#trackGeo(new THREE.SphereGeometry(0.065, 6, 6));
    tailGeo.translate(0, 0.17, -0.22);
    const noseGeo = this.#trackGeo(new THREE.SphereGeometry(0.022, 6, 6));
    noseGeo.translate(0, 0.27, 0.29);
    const earGeo = this.#trackGeo(new THREE.CapsuleGeometry(0.028, 0.14, 4, 6));

    const spots = [
      [-51, -28], [-57, -33], [60, -15], [64, -22],
      [62, 35], [66, 40], [-65, 34], [-71, 38],
      [40, -62], [-15, 25], [12, 31], [-41, 45]
    ];

    const count = spots.length;
    this.#bunnyBodyInst = new THREE.InstancedMesh(bunnyBodyGeo, coatMat, count);
    this.#bunnyTailInst = new THREE.InstancedMesh(tailGeo, tailMat, count);
    this.#bunnyNoseInst = new THREE.InstancedMesh(noseGeo, pinkNoseMat, count);
    this.#bunnyEarInst = new THREE.InstancedMesh(earGeo, coatMat, count * 2);

    for (const inst of [this.#bunnyBodyInst, this.#bunnyTailInst, this.#bunnyNoseInst, this.#bunnyEarInst]) {
      inst.frustumCulled = false;
      inst.castShadow = false;
      this.#root.add(inst);
    }

    spots.forEach(([bx, bz], idx) => {
      this.#tmpColor.setHex(coatHexes[idx % coatHexes.length]);
      this.#bunnyBodyInst.setColorAt(idx, this.#tmpColor);
      this.#bunnyEarInst.setColorAt(idx * 2, this.#tmpColor);
      this.#bunnyEarInst.setColorAt(idx * 2 + 1, this.#tmpColor);

      const b = {
        homeX: bx,
        homeZ: bz,
        x: bx,
        y: 0,
        z: bz,
        yaw: idx * 1.1,
        earLX: -0.15,
        earRX: -0.15,
        state: 'idle',
        timer: 1.0 + (idx % 4) * 0.7,
        hopTime: 0,
        hopDuration: 0.42,
        startX: bx,
        startZ: bz,
        targetX: bx,
        targetZ: bz,
        phase: idx * 1.3
      };
      this.#bunnies.push(b);
      this.#syncBunnyInstance(idx, b);
    });

    for (const inst of [this.#bunnyBodyInst, this.#bunnyTailInst, this.#bunnyNoseInst, this.#bunnyEarInst]) {
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    }
  }

  #syncBunnyInstance(idx, b) {
    const dummy = this.#dummy;
    const cosY = Math.cos(b.yaw);
    const sinY = Math.sin(b.yaw);

    dummy.position.set(b.x, b.y, b.z);
    dummy.rotation.set(0, b.yaw, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    this.#bunnyBodyInst.setMatrixAt(idx, dummy.matrix);
    this.#bunnyTailInst.setMatrixAt(idx, dummy.matrix);
    this.#bunnyNoseInst.setMatrixAt(idx, dummy.matrix);

    // Left ear at (-0.048, 0.42, 0.14), Right ear at (+0.048, 0.42, 0.14)
    dummy.position.set(b.x - 0.048 * cosY + 0.14 * sinY, b.y + 0.42, b.z + 0.048 * sinY + 0.14 * cosY);
    dummy.rotation.set(b.earLX, b.yaw, 0.16);
    dummy.updateMatrix();
    this.#bunnyEarInst.setMatrixAt(idx * 2, dummy.matrix);

    dummy.position.set(b.x + 0.048 * cosY + 0.14 * sinY, b.y + 0.42, b.z - 0.048 * sinY + 0.14 * cosY);
    dummy.rotation.set(b.earRX, b.yaw, -0.16);
    dummy.updateMatrix();
    this.#bunnyEarInst.setMatrixAt(idx * 2 + 1, dummy.matrix);
  }

  #lerpAngle(a, b, t) {
    let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }

  #pickClearingTarget(homeX, homeZ, maxRadius, seed, out) {
    const a = (Math.sin(seed * 43.17) * 0.5 + 0.5) * Math.PI * 2;
    const r = (Math.cos(seed * 19.73) * 0.5 + 0.5) * maxRadius;
    out.x = homeX + Math.cos(a) * r;
    out.z = homeZ + Math.sin(a) * r;
  }

  #evalSwanPos(s, timeVal, out) {
    const a = timeVal * s.speed + s.phase;
    out.x = s.cx + Math.cos(a) * s.rx;
    out.z = s.cz + (s.figure8 ? Math.sin(a * 2) * 0.65 : Math.sin(a)) * s.rz;
  }

  update(delta, elapsed, playerPos = null, isPlayerRunning = false) {
    const dt = Math.min(delta, 0.1);
    const t = elapsed ?? 0;
    const hasPlayer = playerPos !== null;
    const dummy = this.#dummy;

    // 1. Mariposas (instanciadas + LOD 55u)
    let butterflyDirty = false;
    for (let i = 0; i < this.#butterflies.length; i++) {
      const b = this.#butterflies[i];
      if (hasPlayer) {
        const dxp = b.x - playerPos.x;
        const dzp = b.z - playerPos.z;
        if (dxp * dxp + dzp * dzp > CULL_DIST_SQ) continue;
      }

      const a = t * b.speed + b.phase;
      const nx = b.ax + Math.sin(a) * b.radius + Math.cos(a * 1.7) * 0.55;
      const nz = b.az + Math.cos(a * 0.85) * b.radius + Math.sin(a * 1.3) * 0.55;
      const ny = b.baseY + Math.sin(t * 2.4 + b.phase) * 0.32;

      const dx = nx - b.x;
      const dz = nz - b.z;
      if (dx * dx + dz * dz > 1e-6) {
        b.yaw = Math.atan2(dx, dz);
      }
      b.x = nx;
      b.z = nz;

      const flap = Math.sin(t * b.flapFreq + b.phase) * 0.92;
      const cosY = Math.cos(b.yaw);
      const sinY = Math.sin(b.yaw);
      const wingOffset = 0.01 * b.scale;

      dummy.position.set(nx, ny, nz);
      dummy.rotation.set(0, b.yaw, 0);
      dummy.scale.setScalar(b.scale);
      dummy.updateMatrix();
      this.#butterflyBodyInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(nx - wingOffset * cosY, ny, nz + wingOffset * sinY);
      dummy.rotation.set(0, b.yaw, -flap);
      dummy.updateMatrix();
      this.#butterflyLeftWingInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(nx + wingOffset * cosY, ny, nz - wingOffset * sinY);
      dummy.rotation.set(0, b.yaw, flap);
      dummy.updateMatrix();
      this.#butterflyRightWingInst.setMatrixAt(i, dummy.matrix);

      butterflyDirty = true;
    }

    if (butterflyDirty) {
      this.#butterflyBodyInst.instanceMatrix.needsUpdate = true;
      this.#butterflyLeftWingInst.instanceMatrix.needsUpdate = true;
      this.#butterflyRightWingInst.instanceMatrix.needsUpdate = true;
    }

    // 2. Cisnes, patitos y estelas
    this.#wakeTimer += dt;
    const emitWake = this.#wakeTimer >= 0.38;
    if (emitWake) this.#wakeTimer = 0;

    let swanDirty = false;
    for (let i = 0; i < this.#swans.length; i++) {
      const s = this.#swans[i];
      if (hasPlayer) {
        const dxp = s.lastX - playerPos.x;
        const dzp = s.lastZ - playerPos.z;
        if (dxp * dxp + dzp * dzp > CULL_DIST_SQ) continue;
      }

      this.#evalSwanPos(s, t, this.#tmpXZ);
      const nx = this.#tmpXZ.x;
      const nz = this.#tmpXZ.z;
      const dx = nx - s.lastX;
      const dz = nz - s.lastZ;
      if (dx * dx + dz * dz > 1e-6) {
        s.yaw = Math.atan2(dx, dz);
      }
      const sy = 0.055 + Math.sin(t * 2.0 + s.phase) * 0.012;
      const neckX = Math.sin(t * 1.4 + s.phase) * 0.08;

      dummy.position.set(nx, sy, nz);
      dummy.rotation.set(0, s.yaw, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.#swanBodyInst.setMatrixAt(i, dummy.matrix);

      dummy.rotation.set(neckX, s.yaw, 0);
      dummy.updateMatrix();
      this.#swanNeckInst.setMatrixAt(i, dummy.matrix);
      this.#swanBeakInst.setMatrixAt(i, dummy.matrix);
      this.#swanEyeInst.setMatrixAt(i, dummy.matrix);

      if (emitWake) this.#spawnWake(nx, nz, 1.15);
      s.lastX = nx;
      s.lastZ = nz;
      swanDirty = true;
    }
    if (swanDirty) {
      this.#swanBodyInst.instanceMatrix.needsUpdate = true;
      this.#swanNeckInst.instanceMatrix.needsUpdate = true;
      this.#swanBeakInst.instanceMatrix.needsUpdate = true;
      this.#swanEyeInst.instanceMatrix.needsUpdate = true;
    }

    let duckDirty = false;
    for (let i = 0; i < this.#ducklings.length; i++) {
      const d = this.#ducklings[i];
      if (hasPlayer) {
        const dxp = d.lastX - playerPos.x;
        const dzp = d.lastZ - playerPos.z;
        if (dxp * dxp + dzp * dzp > CULL_DIST_SQ) continue;
      }

      const leader = this.#swans[d.leaderIdx];
      this.#evalSwanPos(leader, t - d.lag, this.#tmpXZ);
      this.#evalSwanPos(leader, t - d.lag + 0.05, this.#tmpXZ2);
      const lx = this.#tmpXZ.x;
      const lz = this.#tmpXZ.z;
      const dirX = this.#tmpXZ2.x - lx;
      const dirZ = this.#tmpXZ2.z - lz;
      const len = Math.hypot(dirX, dirZ) || 1;
      const nx = lx - (dirZ / len) * d.offsetSide;
      const nz = lz + (dirX / len) * d.offsetSide;
      const yaw = Math.atan2(dirX, dirZ);

      dummy.position.set(nx, 0.06 + Math.sin(t * 3.8 + d.phase) * 0.01, nz);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.#duckBodyInst.setMatrixAt(i, dummy.matrix);
      this.#duckBeakInst.setMatrixAt(i, dummy.matrix);

      if (emitWake && (d.phase % 2 < 1.2)) this.#spawnWake(nx, nz, 0.55);
      d.lastX = nx;
      d.lastZ = nz;
      duckDirty = true;
    }
    if (duckDirty) {
      this.#duckBodyInst.instanceMatrix.needsUpdate = true;
      this.#duckBeakInst.instanceMatrix.needsUpdate = true;
    }

    if (this.#wakeInst) {
      let activeWakes = 0;
      let wakeDirty = false;
      for (let i = 0; i < this.#wakePool.length; i++) {
        const w = this.#wakePool[i];
        if (!w.active) continue;
        wakeDirty = true;
        w.age += dt;
        const p = w.age / w.maxAge;
        if (p >= 1) {
          w.active = false;
          dummy.position.set(w.x, 0.072, w.z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          this.#wakeInst.setMatrixAt(i, dummy.matrix);
        } else {
          activeWakes++;
          dummy.position.set(w.x, 0.072, w.z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(w.baseScale * (1 + p * 2.6));
          dummy.updateMatrix();
          this.#wakeInst.setMatrixAt(i, dummy.matrix);

          const fade = 1 - p;
          this.#tmpColor.setRGB(0.91 * fade, 0.98 * fade, fade);
          this.#wakeInst.setColorAt(i, this.#tmpColor);
        }
      }
      this.#wakeInst.visible = activeWakes > 0;
      if (wakeDirty) {
        this.#wakeInst.instanceMatrix.needsUpdate = true;
        if (activeWakes > 0 && this.#wakeInst.instanceColor) {
          this.#wakeInst.instanceColor.needsUpdate = true;
        }
      }
    }

    // 3. Pajaritos cantores (instanciados + LOD 55u)
    let birdDirty = false;
    for (let i = 0; i < this.#birds.length; i++) {
      const b = this.#birds[i];
      if (hasPlayer) {
        const dxp = b.x - playerPos.x;
        const dzp = b.z - playerPos.z;
        if (dxp * dxp + dzp * dzp > CULL_DIST_SQ) continue;
      }

      let flapL = 0.15;
      let flapR = -0.15;

      if (b.state === 'perched') {
        b.timer -= dt;
        const perch = this.#perchNodes[b.fromIdx];
        b.x = perch.x;
        b.y = perch.y + Math.abs(Math.sin(t * 3.2 + b.phase)) * 0.025;
        b.z = perch.z;
        b.yaw = Math.sin(t * 2.6 + b.phase) * 0.35;

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

        const prevX = b.x;
        const prevZ = b.z;
        const nx = THREE.MathUtils.lerp(start.x, end.x, p);
        const nz = THREE.MathUtils.lerp(start.z, end.z, p);
        const ny = THREE.MathUtils.lerp(start.y, end.y, p) + Math.sin(p * Math.PI) * b.arcHeight;

        b.x = nx;
        b.y = ny;
        b.z = nz;
        const vx = nx - prevX;
        const vz = nz - prevZ;
        if (vx * vx + vz * vz > 1e-6) {
          b.yaw = Math.atan2(vx, vz);
        }
        const flap = Math.sin(t * 24 + b.phase) * 0.85;
        flapL = -flap;
        flapR = flap;

        if (p >= 1) {
          b.fromIdx = b.toIdx;
          b.state = 'perched';
          b.timer = 2.5 + (b.phase % 4);
        }
      }

      const cosY = Math.cos(b.yaw);
      const sinY = Math.sin(b.yaw);

      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(0, b.yaw, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.#birdBodyInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(b.x + 0.02 * sinY, b.y - 0.02, b.z + 0.02 * cosY);
      dummy.updateMatrix();
      this.#birdBellyInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(b.x - 0.06 * cosY, b.y + 0.03, b.z + 0.06 * sinY);
      dummy.rotation.set(0, b.yaw, flapL);
      dummy.updateMatrix();
      this.#birdLeftWingInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(b.x + 0.06 * cosY, b.y + 0.03, b.z - 0.06 * sinY);
      dummy.rotation.set(0, b.yaw, flapR);
      dummy.updateMatrix();
      this.#birdRightWingInst.setMatrixAt(i, dummy.matrix);

      birdDirty = true;
    }

    if (birdDirty) {
      this.#birdBodyInst.instanceMatrix.needsUpdate = true;
      this.#birdBellyInst.instanceMatrix.needsUpdate = true;
      this.#birdLeftWingInst.instanceMatrix.needsUpdate = true;
      this.#birdRightWingInst.instanceMatrix.needsUpdate = true;
    }

    // 4. Ciervos blancos reales (instanciados + LOD 55u)
    const deerTriggerDist = isPlayerRunning ? 7.2 : 5.2;
    const deerTriggerDistSq = deerTriggerDist * deerTriggerDist;
    let deerDirty = false;
    for (let i = 0; i < this.#deer.length; i++) {
      const d = this.#deer[i];
      if (hasPlayer) {
        const dxp = d.x - playerPos.x;
        const dzp = d.z - playerPos.z;
        const distSq = dxp * dxp + dzp * dzp;
        if (distSq > CULL_DIST_SQ) continue;

        if (distSq < deerTriggerDistSq && d.state !== 'flee') {
          d.state = 'flee';
          d.timer = 2.4;
          const len = Math.sqrt(distSq) || 1;
          let tx = d.x + (dxp / len) * 5.5;
          let tz = d.z + (dzp / len) * 5.5;
          const hdx = tx - d.homeX;
          const hdz = tz - d.homeZ;
          const fromHomeSq = hdx * hdx + hdz * hdz;
          if (fromHomeSq > 7.5 * 7.5) {
            const fromHome = Math.sqrt(fromHomeSq);
            tx = d.homeX + (hdx / fromHome) * 7.5;
            tz = d.homeZ + (hdz / fromHome) * 7.5;
          }
          d.targetX = tx;
          d.targetZ = tz;
        }
      }

      d.timer -= dt;
      if (d.state === 'graze') {
        d.neckRotX = 0.65 + Math.sin(t * 2.1 + d.phase) * 0.12;
        for (let l = 0; l < 4; l++) {
          d.legAngles[l] = THREE.MathUtils.lerp(d.legAngles[l], 0, dt * 6);
        }

        if (d.timer <= 0) {
          d.state = 'wander';
          d.timer = 3.5 + (d.phase % 2.5);
          this.#pickClearingTarget(d.homeX, d.homeZ, 5.5, t + d.phase, this.#tmpXZ);
          d.targetX = this.#tmpXZ.x;
          d.targetZ = this.#tmpXZ.z;
        }
      } else {
        const speed = d.state === 'flee' ? 3.8 : 1.45;
        const dx = d.targetX - d.x;
        const dz = d.targetZ - d.z;
        const distSq = dx * dx + dz * dz;

        if (distSq > 0.25 * 0.25 && d.timer > 0) {
          const dist = Math.sqrt(distSq);
          const desiredYaw = Math.atan2(dx, dz);
          d.yaw = this.#lerpAngle(d.yaw, desiredYaw, Math.min(1, dt * 5.5));
          const step = Math.min(dist, speed * dt);
          d.x += (dx / dist) * step;
          d.z += (dz / dist) * step;

          d.neckRotX = THREE.MathUtils.lerp(d.neckRotX, 0.08, dt * 6);
          const gaitFreq = d.state === 'flee' ? 11 : 6;
          const swing = Math.sin(t * gaitFreq + d.phase) * 0.42;
          d.legAngles[0] = swing;
          d.legAngles[1] = -swing;
          d.legAngles[2] = -swing;
          d.legAngles[3] = swing;
        } else {
          d.state = 'graze';
          d.timer = 3.2 + (d.phase % 3);
        }
      }
      this.#syncDeerInstance(i, d);
      deerDirty = true;
    }
    if (deerDirty) {
      this.#deerTorsoInst.instanceMatrix.needsUpdate = true;
      this.#deerTailInst.instanceMatrix.needsUpdate = true;
      this.#deerHeadInst.instanceMatrix.needsUpdate = true;
      this.#deerNoseInst.instanceMatrix.needsUpdate = true;
      this.#deerAntlerInst.instanceMatrix.needsUpdate = true;
      this.#deerLegInst.instanceMatrix.needsUpdate = true;
    }

    // 5. Conejitos (instanciados + LOD 55u)
    const bunnyTriggerDist = isPlayerRunning ? 7.0 : 5.0;
    const bunnyTriggerDistSq = bunnyTriggerDist * bunnyTriggerDist;
    const bunnyFollowDistSq = (bunnyTriggerDist + 1.2) * (bunnyTriggerDist + 1.2);
    let bunnyDirty = false;
    for (let i = 0; i < this.#bunnies.length; i++) {
      const b = this.#bunnies[i];
      if (hasPlayer) {
        const dxp = b.x - playerPos.x;
        const dzp = b.z - playerPos.z;
        const distSq = dxp * dxp + dzp * dzp;
        if (distSq > CULL_DIST_SQ) continue;

        if (b.state !== 'flee' && distSq < bunnyTriggerDistSq) {
          b.state = 'flee';
          b.hopTime = 0;
          b.hopDuration = 0.32;
          b.startX = b.x;
          b.startZ = b.z;
          const len = Math.sqrt(distSq) || 1;
          let tx = b.x + (dxp / len) * 3.6;
          let tz = b.z + (dzp / len) * 3.6;
          const hdx = tx - b.homeX;
          const hdz = tz - b.homeZ;
          const fromHomeSq = hdx * hdx + hdz * hdz;
          if (fromHomeSq > 6.5 * 6.5) {
            const fromHome = Math.sqrt(fromHomeSq);
            tx = b.homeX + (hdx / fromHome) * 6.5;
            tz = b.homeZ + (hdz / fromHome) * 6.5;
          }
          b.targetX = tx;
          b.targetZ = tz;
          b.yaw = Math.atan2(tx - b.x, tz - b.z);
        }
      }

      if (b.state === 'idle') {
        b.timer -= dt;
        b.y = 0;
        b.earLX = -0.15 + Math.sin(t * 5.2 + b.phase) * 0.14;
        b.earRX = -0.15 + Math.cos(t * 4.8 + b.phase) * 0.14;

        if (b.timer <= 0) {
          b.state = 'hop';
          b.hopTime = 0;
          b.hopDuration = 0.44;
          b.startX = b.x;
          b.startZ = b.z;
          this.#pickClearingTarget(b.homeX, b.homeZ, 4.2, t * 1.3 + b.phase, this.#tmpXZ);
          b.targetX = b.x + (this.#tmpXZ.x - b.x) * 0.45;
          b.targetZ = b.z + (this.#tmpXZ.z - b.z) * 0.45;
          b.yaw = Math.atan2(b.targetX - b.x, b.targetZ - b.z);
        }
      } else {
        b.hopTime += dt;
        const p = Math.min(1, b.hopTime / b.hopDuration);
        b.x = THREE.MathUtils.lerp(b.startX, b.targetX, p);
        b.z = THREE.MathUtils.lerp(b.startZ, b.targetZ, p);
        const hopHeight = b.state === 'flee' ? 0.48 : 0.28;
        b.y = Math.sin(p * Math.PI) * hopHeight;

        if (p >= 1) {
          b.y = 0;
          if (b.state === 'flee' && hasPlayer) {
            const dxp = b.x - playerPos.x;
            const dzp = b.z - playerPos.z;
            const distSq = dxp * dxp + dzp * dzp;
            if (distSq < bunnyFollowDistSq) {
              const len = Math.sqrt(distSq) || 1;
              b.hopTime = 0;
              b.startX = b.x;
              b.startZ = b.z;
              let tx = b.x + (dxp / len) * 2.8;
              let tz = b.z + (dzp / len) * 2.8;
              const hdx = tx - b.homeX;
              const hdz = tz - b.homeZ;
              const fromHomeSq = hdx * hdx + hdz * hdz;
              if (fromHomeSq > 6.5 * 6.5) {
                const fromHome = Math.sqrt(fromHomeSq);
                tx = b.homeX + (hdx / fromHome) * 6.5;
                tz = b.homeZ + (hdz / fromHome) * 6.5;
              }
              b.targetX = tx;
              b.targetZ = tz;
              b.yaw = Math.atan2(tx - b.x, tz - b.z);
              this.#syncBunnyInstance(i, b);
              bunnyDirty = true;
              continue;
            }
          }
          b.state = 'idle';
          b.timer = 1.4 + (b.phase % 2.4);
        }
      }
      this.#syncBunnyInstance(i, b);
      bunnyDirty = true;
    }
    if (bunnyDirty) {
      this.#bunnyBodyInst.instanceMatrix.needsUpdate = true;
      this.#bunnyTailInst.instanceMatrix.needsUpdate = true;
      this.#bunnyNoseInst.instanceMatrix.needsUpdate = true;
      this.#bunnyEarInst.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    if (this.#root) {
      this.#scene.remove(this.#root);
      this.#root = null;
    }
    for (const inst of [
      this.#butterflyBodyInst, this.#butterflyLeftWingInst, this.#butterflyRightWingInst,
      this.#wakeInst,
      this.#birdBodyInst, this.#birdBellyInst, this.#birdLeftWingInst, this.#birdRightWingInst,
      this.#swanBodyInst, this.#swanNeckInst, this.#swanBeakInst, this.#swanEyeInst,
      this.#duckBodyInst, this.#duckBeakInst,
      this.#deerTorsoInst, this.#deerTailInst, this.#deerHeadInst,
      this.#deerNoseInst, this.#deerAntlerInst, this.#deerLegInst,
      this.#bunnyBodyInst, this.#bunnyTailInst, this.#bunnyNoseInst, this.#bunnyEarInst
    ]) {
      inst?.dispose?.();
    }
    this.#butterflyBodyInst = null;
    this.#butterflyLeftWingInst = null;
    this.#butterflyRightWingInst = null;
    this.#wakeInst = null;
    this.#birdBodyInst = null;
    this.#birdBellyInst = null;
    this.#birdLeftWingInst = null;
    this.#birdRightWingInst = null;
    this.#swanBodyInst = null;
    this.#swanNeckInst = null;
    this.#swanBeakInst = null;
    this.#swanEyeInst = null;
    this.#duckBodyInst = null;
    this.#duckBeakInst = null;
    this.#deerTorsoInst = null;
    this.#deerTailInst = null;
    this.#deerHeadInst = null;
    this.#deerNoseInst = null;
    this.#deerAntlerInst = null;
    this.#deerLegInst = null;
    this.#bunnyBodyInst = null;
    this.#bunnyTailInst = null;
    this.#bunnyNoseInst = null;
    this.#bunnyEarInst = null;

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
