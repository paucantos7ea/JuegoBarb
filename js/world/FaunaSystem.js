import * as THREE from 'three';
import { getSharedContactShadowTexture } from '../core/Engine.js';

const NEAR_LOD_DIST_SQ = 45 * 45; // 2025: < 45u anima a 60 Hz
const FAR_LOD_DIST_SQ = 85 * 85;  // 7225: 45-85u a 1/3 fotogramas; > 85u en pausa

const DEER_LEG_LX = new Float32Array([-0.15, 0.15, -0.15, 0.15]);
const DEER_LEG_LY = new Float32Array([0.82, 0.82, 0.82, 0.82]);
const DEER_LEG_LZ = new Float32Array([0.36, 0.36, -0.36, -0.36]);

function riverCenterX(z) {
  return 97.5 + Math.sin(z * 0.07) * 7.5 * Math.min(1, (z * z) / 144);
}

export class FaunaSystem {
  #scene;
  #root = null;
  #geometries = [];
  #materials = [];
  #instancedMeshes = [];

  #butterflies = [];
  #butterflyBodyInst = null;
  #butterflyLeftWingInst = null;
  #butterflyRightWingInst = null;

  #dragonflies = [];
  #dragonflyBodyInst = null;
  #dragonflyLeftWingInst = null;
  #dragonflyRightWingInst = null;

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
  #deerSpotsInst = null;
  #deerHeadInst = null;
  #deerNoseInst = null;
  #deerAntlerInst = null;
  #deerLegInst = null;
  #deerShadowInst = null;

  #bunnies = [];
  #bunnyBodyInst = null;
  #bunnyTailInst = null;
  #bunnyNoseInst = null;
  #bunnyEarInst = null;
  #bunnyShadowInst = null;
  #shadowGeo = null;
  #shadowMat = null;

  #squirrels = [];
  #squirrelBodyInst = null;
  #squirrelBellyInst = null;
  #squirrelDarkInst = null;
  #squirrelTailInst = null;

  #koi = [];
  #koiBodyInst = null;
  #koiPatternInst = null;
  #koiTailInst = null;

  #fireflies = [];
  #fireflyInst = null;
  #fireflyMat = null;
  #fireflyScaleMul = 0.78;
  #fireflyPulseAmp = 0.50;
  #explicitThemeApplied = false;
  #lastFogR = -1;
  #lastFogG = -1;

  #frameCount = 0;
  #dummy = new THREE.Object3D();
  #tmpColor = new THREE.Color();
  #tmpXZ = { x: 0, z: 0 };
  #tmpXZ2 = { x: 0, z: 0 };
  #waterSystem = null;
  #buoyOut = { y: 0, pitch: 0, roll: 0 };
  #waterSample = { inWater: false, surfaceY: 0, depth: 0, flowX: 0, flowZ: 0, distToBank: 99 };

  constructor(scene) {
    this.#scene = scene;
  }

  setWaterSystem(waterSystem) {
    this.#waterSystem = waterSystem || null;
  }

  getNearestDeerPosition(refPos, outVec) {
    if (!refPos || !outVec || this.#deer.length === 0) return false;
    let bestDistSq = Infinity;
    let found = false;
    for (let i = 0; i < this.#deer.length; i++) {
      const d = this.#deer[i];
      const dx = d.x - refPos.x;
      const dz = d.z - refPos.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        outVec.set(d.x, 0, d.z);
        found = true;
      }
    }
    return found;
  }

  init() {
    this.#root = new THREE.Group();
    this.#root.name = 'RoyalFauna';

    this.#buildButterflies();
    this.#buildDragonflies();
    this.#buildSwansAndDucklings();
    this.#buildWakePool();
    this.#buildSongbirdsAndDoves();
    this.#buildDeerAndFawns();
    this.#buildBunnies();
    this.#buildSquirrels();
    this.#buildKoiFish();
    this.#buildFireflies();

    this.#scene.add(this.#root);
  }

  /**
   * Adapta el brillo mágico y la presencia de las luciérnagas según el tema activo:
   * - 'gala_imperial' (Noche Estrellada): protagonismo mágico máximo (~0.95)
   * - 'jardines_perla' (Atardecer Rosa): brillo cálido intermedio (~0.55)
   * - 'palacio_cristal' (Hora Dorada / Día): sutiles motas de luz (~0.18)
   */
  applyTheme(theme) {
    if (!theme) return;
    this.#explicitThemeApplied = true;
    const id = typeof theme === 'string' ? theme : theme.id;
    this.#applyFireflyPreset(id);
  }

  #applyFireflyPreset(id) {
    if (id === 'gala_imperial') {
      this.#fireflyScaleMul = 1.32;
      this.#fireflyPulseAmp = 0.95;
      if (this.#fireflyMat) this.#fireflyMat.opacity = 0.95;
    } else if (id === 'jardines_perla') {
      this.#fireflyScaleMul = 1.06;
      this.#fireflyPulseAmp = 0.74;
      if (this.#fireflyMat) this.#fireflyMat.opacity = 0.55;
    } else {
      this.#fireflyScaleMul = 0.78;
      this.#fireflyPulseAmp = 0.50;
      if (this.#fireflyMat) this.#fireflyMat.opacity = 0.18;
    }
  }

  #trackGeo(geo) {
    this.#geometries.push(geo);
    return geo;
  }

  #trackMat(mat) {
    this.#materials.push(mat);
    return mat;
  }

  #trackInst(inst) {
    this.#instancedMeshes.push(inst);
    return inst;
  }

  #getFaunaShadowAssets() {
    if (!this.#shadowGeo) {
      const g = new THREE.PlaneGeometry(1, 1);
      g.rotateX(-Math.PI / 2);
      this.#shadowGeo = this.#trackGeo(g);
    }
    if (!this.#shadowMat) {
      this.#shadowMat = this.#trackMat(new THREE.MeshBasicMaterial({
        map: getSharedContactShadowTexture(),
        color: 0xffffff,
        transparent: true,
        opacity: 0.44,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      }));
    }
    return { geo: this.#shadowGeo, mat: this.#shadowMat };
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

  #detectBasinKoiY(x, z, fallbackY = 0.025) {
    const gardens = this.#scene?.getObjectByName?.('RoyalGardens');
    if (!gardens) return fallbackY;

    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(x, 2.2, z),
      new THREE.Vector3(0, -1, 0),
      0.1,
      2.3
    );
    const hits = raycaster.intersectObjects(gardens.children, true);
    let waterY = -1;
    let solidTopY = -1;

    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      const py = h.point.y;
      if (py > 1.2) continue;
      const mat = h.object?.material;
      if (mat && mat.transparent && mat.opacity < 0.95) {
        if (py > waterY) waterY = py;
      } else if (py > solidTopY) {
        solidTopY = py;
      }
    }

    if (waterY > 0.04 && waterY > solidTopY + 0.015) {
      return Math.max(0.025, waterY - 0.042);
    }
    return fallbackY;
  }

  // ---------------------------------------------------------------------------
  // 1. Mariposas de Colores (90 instancias)
  // ---------------------------------------------------------------------------
  #buildButterflies() {
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
      roughness: 0.42,
      metalness: 0.06,
      side: THREE.DoubleSide
    }));

    const pastelColors = [
      0xff85c0, 0x7ad7ff, 0xffe066, 0xc89bff,
      0xff9e80, 0x9bf6ff, 0xffb3d9, 0xa8f0c6
    ];

    // Parterres del Palacio, Pasarela, Bulevar Imperial, Riberas del Río y Casino VIP
    const anchors = [
      [12.2, 11.8], [-12.2, 11.8], [12.2, -11.2], [-12.2, -11.2],
      [-20.0, -14.2], [20.0, -14.2], [-7.6, 23.0], [7.6, 23.0],
      [-21.0, 4.8], [-21.0, -4.8], [-36.0, -6.0], [-36.0, 6.0],
      [31.0, -4.8], [32.0, 4.8], [35.0, -13.6], [40.8, -8.0],
      [-33.0, 46.8], [-54.0, -49.8], [-66.0, 35.0], [10.5, 44.0],
      [56.0, -8.5], [56.0, 8.5], [72.0, -9.5], [72.0, 9.5],
      [86.0, -13.0], [86.0, 13.0], [89.0, -24.0], [91.0, 16.0],
      [106.0, -18.0], [112.0, 33.0], [94.0, 48.0], [120.0, 44.0],
      [124.0, -13.0], [124.0, 13.0], [136.0, -24.0], [136.0, 24.0],
      [148.0, -36.0], [148.0, 36.0], [162.0, -40.0], [162.0, 40.0],
      [178.0, -36.0], [178.0, 36.0], [196.0, -18.0], [196.0, 18.0],
      [208.0, -22.0], [208.0, 22.0]
    ];

    const count = 90;
    const bodyInst = this.#trackInst(new THREE.InstancedMesh(bodyGeo, bodyMat, count));
    const leftWingInst = this.#trackInst(new THREE.InstancedMesh(leftWingGeo, wingMat, count));
    const rightWingInst = this.#trackInst(new THREE.InstancedMesh(rightWingGeo, wingMat, count));

    bodyInst.name = 'FaunaButterflyBodies';
    leftWingInst.name = 'FaunaButterflyLeftWings';
    rightWingInst.name = 'FaunaButterflyRightWings';

    for (const inst of [bodyInst, leftWingInst, rightWingInst]) {
      inst.frustumCulled = false;
      inst.castShadow = false;
      inst.receiveShadow = false;
      this.#root.add(inst);
    }

    const dummy = this.#dummy;
    for (let i = 0; i < count; i++) {
      const [ax, az] = anchors[i % anchors.length];
      const scale = 0.78 + (i % 4) * 0.17;
      const radius = 1.8 + (i % 5) * 0.82;
      const baseY = 0.72 + (i % 6) * 0.26;

      this.#tmpColor.setHex(pastelColors[i % pastelColors.length]);
      leftWingInst.setColorAt(i, this.#tmpColor);
      rightWingInst.setColorAt(i, this.#tmpColor);

      dummy.position.set(ax, baseY, az);
      dummy.rotation.set(0, 0, 0, 'YXZ');
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
  }

  // ---------------------------------------------------------------------------
  // 2. Libélulas Cristalinas (42 instancias con doble par de alas rápidas)
  // ---------------------------------------------------------------------------
  #buildDragonflies() {
    const rawAbdomen = new THREE.CylinderGeometry(0.011, 0.005, 0.23, 6);
    rawAbdomen.rotateX(Math.PI / 2);
    const rawThorax = new THREE.SphereGeometry(0.024, 7, 6);
    rawThorax.scale(0.9, 0.85, 1.35);
    const rawHead = new THREE.SphereGeometry(0.021, 7, 6);
    rawHead.scale(1.38, 0.9, 0.9);

    const dfBodyGeo = this.#trackGeo(this.#mergeGeometries([
      { geo: rawAbdomen, matrix: new THREE.Matrix4().makeTranslation(0, 0, -0.095) },
      { geo: rawThorax, matrix: new THREE.Matrix4().makeTranslation(0, 0.006, 0.04) },
      { geo: rawHead, matrix: new THREE.Matrix4().makeTranslation(0, 0.01, 0.095) }
    ]));
    rawAbdomen.dispose();
    rawThorax.dispose();
    rawHead.dispose();

    // Doble par de alas esbeltas (ala anterior + ala posterior por lado)
    const rawForeWing = new THREE.BoxGeometry(0.18, 0.004, 0.032);
    const rawHindWing = new THREE.BoxGeometry(0.155, 0.004, 0.028);

    const rightWingsGeo = this.#trackGeo(this.#mergeGeometries([
      {
        geo: rawForeWing,
        matrix: new THREE.Matrix4()
          .makeRotationFromEuler(new THREE.Euler(0, -0.18, 0.06))
          .setPosition(0.09, 0, 0.018)
      },
      {
        geo: rawHindWing,
        matrix: new THREE.Matrix4()
          .makeRotationFromEuler(new THREE.Euler(0, 0.16, -0.05))
          .setPosition(0.078, -0.003, -0.022)
      }
    ]));
    const leftWingsGeo = this.#trackGeo(this.#mergeGeometries([
      {
        geo: rawForeWing,
        matrix: new THREE.Matrix4()
          .makeRotationFromEuler(new THREE.Euler(0, 0.18, -0.06))
          .setPosition(-0.09, 0, 0.018)
      },
      {
        geo: rawHindWing,
        matrix: new THREE.Matrix4()
          .makeRotationFromEuler(new THREE.Euler(0, -0.16, 0.05))
          .setPosition(-0.078, -0.003, -0.022)
      }
    ]));
    rawForeWing.dispose();
    rawHindWing.dispose();

    const bodyMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.24,
      metalness: 0.52
    }));
    const wingMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xe6fbff,
      roughness: 0.18,
      metalness: 0.15,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide
    }));

    const iridescentPalette = [
      0x1ee3cf, // Turquesa imperial
      0x38bdf8, // Azul zafiro cristal
      0xa855f7, // Violeta amatista
      0xfbbf24, // Dorado solar
      0x2dd4bf, // Aguamarina
      0xc084fc  // Lavanda iridiscente
    ];

    const specs = [];
    // 14 sobre el Río Cristalino
    for (let i = 0; i < 14; i++) {
      const zCenter = -64 + i * 7.2;
      specs.push({
        mode: 'river',
        cx: riverCenterX(zCenter),
        cz: zCenter,
        rx: 2.3,
        rz: 4.2,
        baseY: 0.34 + (i % 3) * 0.11
      });
    }
    // 12 sobre el Lago de los Cisnes (106, 45)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      specs.push({
        mode: 'zone',
        cx: 106 + Math.cos(a) * 10.5,
        cz: 45 + Math.sin(a) * 5.8,
        rx: 4.2,
        rz: 3.0,
        baseY: 0.34 + (i % 3) * 0.12
      });
    }
    // 8 sobre el Estanque Este (46, 26)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      specs.push({
        mode: 'zone',
        cx: 46 + Math.cos(a) * 6.2,
        cz: 26 + Math.sin(a) * 4.6,
        rx: 2.8,
        rz: 2.4,
        baseY: 0.33 + (i % 3) * 0.1
      });
    }
    // 4 sobre las Fuentes Laterales VIP del Casino (162, ±48)
    specs.push(
      { mode: 'zone', cx: 162, cz: -48, rx: 2.8, rz: 2.8, baseY: 0.92 },
      { mode: 'zone', cx: 162, cz: -48, rx: 2.4, rz: 2.4, baseY: 1.06 },
      { mode: 'zone', cx: 162, cz: 48, rx: 2.8, rz: 2.8, baseY: 0.92 },
      { mode: 'zone', cx: 162, cz: 48, rx: 2.4, rz: 2.4, baseY: 1.06 }
    );
    // 4 sobre las Fuentes del Bulevar (80, ±10.5)
    specs.push(
      { mode: 'zone', cx: 80, cz: -10.5, rx: 2.2, rz: 2.2, baseY: 0.88 },
      { mode: 'zone', cx: 80, cz: -10.5, rx: 1.9, rz: 1.9, baseY: 1.02 },
      { mode: 'zone', cx: 80, cz: 10.5, rx: 2.2, rz: 2.2, baseY: 0.88 },
      { mode: 'zone', cx: 80, cz: 10.5, rx: 1.9, rz: 1.9, baseY: 1.02 }
    );

    const count = specs.length; // 42
    const bodyInst = this.#trackInst(new THREE.InstancedMesh(dfBodyGeo, bodyMat, count));
    const leftInst = this.#trackInst(new THREE.InstancedMesh(leftWingsGeo, wingMat, count));
    const rightInst = this.#trackInst(new THREE.InstancedMesh(rightWingsGeo, wingMat, count));

    bodyInst.name = 'FaunaDragonflyBodies';
    leftInst.name = 'FaunaDragonflyLeftWings';
    rightInst.name = 'FaunaDragonflyRightWings';

    for (const inst of [bodyInst, leftInst, rightInst]) {
      inst.frustumCulled = false;
      inst.castShadow = false;
      inst.receiveShadow = false;
      this.#root.add(inst);
    }

    const dummy = this.#dummy;
    for (let i = 0; i < count; i++) {
      const sp = specs[i];
      const scale = 0.92 + (i % 3) * 0.14;
      this.#tmpColor.setHex(iridescentPalette[i % iridescentPalette.length]);
      bodyInst.setColorAt(i, this.#tmpColor);

      dummy.position.set(sp.cx, sp.baseY, sp.cz);
      dummy.rotation.set(0, 0, 0, 'YXZ');
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      bodyInst.setMatrixAt(i, dummy.matrix);
      leftInst.setMatrixAt(i, dummy.matrix);
      rightInst.setMatrixAt(i, dummy.matrix);

      this.#dragonflies.push({
        mode: sp.mode,
        cx: sp.cx,
        cz: sp.cz,
        rx: sp.rx,
        rz: sp.rz,
        baseY: sp.baseY,
        scale,
        x: sp.cx,
        y: sp.baseY,
        z: sp.cz,
        startX: sp.cx,
        startZ: sp.cz,
        targetX: sp.cx,
        targetZ: sp.cz,
        yaw: (i * 1.3) % (Math.PI * 2),
        state: 'hover',
        timer: 0.4 + (i % 5) * 0.25,
        dartTime: 0,
        dartDuration: 0.38,
        flapFreq: 35 + (i % 4) * 3.2,
        phase: i * 1.71
      });
    }

    bodyInst.instanceMatrix.needsUpdate = true;
    leftInst.instanceMatrix.needsUpdate = true;
    rightInst.instanceMatrix.needsUpdate = true;
    if (bodyInst.instanceColor) bodyInst.instanceColor.needsUpdate = true;

    this.#dragonflyBodyInst = bodyInst;
    this.#dragonflyLeftWingInst = leftInst;
    this.#dragonflyRightWingInst = rightInst;
  }

  // ---------------------------------------------------------------------------
  // 3. Cisnes Reales (9) y Familias de Patitos Dorados (14) + Estelas (64)
  // ---------------------------------------------------------------------------
  #buildSwansAndDucklings() {
    const whiteMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xf6f3ee,
      roughness: 0.56,
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
      roughness: 0.64
    }));

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
    rawBody.dispose();
    rawWing.dispose();
    rawTail.dispose();

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
    rawNeck.dispose();
    rawHead.dispose();

    const swanBeakGeo = this.#trackGeo(new THREE.ConeGeometry(0.048, 0.16, 8));
    swanBeakGeo.rotateX(Math.PI / 2);
    swanBeakGeo.translate(0, 1.0, 0.76);

    const rawEye = new THREE.SphereGeometry(0.018, 6, 6);
    const swanEyesGeo = this.#trackGeo(this.#mergeGeometries([
      { geo: rawEye, matrix: new THREE.Matrix4().makeTranslation(-0.07, 1.05, 0.68) },
      { geo: rawEye, matrix: new THREE.Matrix4().makeTranslation(0.07, 1.05, 0.68) }
    ]));
    rawEye.dispose();

    // 0..2: Lago de los Cisnes (106, 45) | 3..4: Río Cristalino | 5..6: Estanque Este | 7..8: Lago Sur
    const swanPaths = [
      // Lago de los Cisnes (106, 45) — radio seguro rx<=16.5, rz<=9.0
      { mode: 'ellipse', cx: 106, cz: 45, rx: 13.8, rz: 7.4, speed: 0.16, phase: 0.0, figure8: false, waterY: 0.062 },
      { mode: 'ellipse', cx: 106, cz: 45, rx: 11.2, rz: 6.2, speed: 0.19, phase: 2.2, figure8: true, waterY: 0.062 },
      { mode: 'ellipse', cx: 106, cz: 45, rx: 8.6, rz: 4.8, speed: -0.17, phase: 4.3, figure8: false, waterY: 0.062 },
      // Río Cristalino Real — tramos tranquilos entre puentes (z=-38, z=0, z=27)
      { mode: 'river', zMin: -30, zMax: -8, laneOffset: 0.85, speed: 0.13, phase: 0.4, waterY: 0.062 },
      { mode: 'river', zMin: 8, zMax: 22, laneOffset: 0.78, speed: 0.17, phase: 2.6, waterY: 0.062 },
      // Estanque Este (46, 26)
      { mode: 'ellipse', cx: 46, cz: 26, rx: 6.4, rz: 4.5, speed: 0.24, phase: 0.0, figure8: true, waterY: 0.055 },
      { mode: 'ellipse', cx: 46, cz: 26, rx: 5.0, rz: 3.6, speed: 0.21, phase: Math.PI, figure8: false, waterY: 0.055 },
      // Lago Imperial Sur (±14, 60)
      { mode: 'ellipse', cx: -14, cz: 60, rx: 7.5, rz: 2.6, speed: 0.19, phase: 0.6, figure8: true, waterY: 0.055 },
      { mode: 'ellipse', cx: 14, cz: 60, rx: 7.5, rz: 2.6, speed: 0.19, phase: 2.8, figure8: false, waterY: 0.055 }
    ];

    const swanCount = swanPaths.length;
    this.#swanBodyInst = this.#trackInst(new THREE.InstancedMesh(swanBodyGeo, whiteMat, swanCount));
    this.#swanNeckInst = this.#trackInst(new THREE.InstancedMesh(swanNeckGeo, whiteMat, swanCount));
    this.#swanBeakInst = this.#trackInst(new THREE.InstancedMesh(swanBeakGeo, orangeMat, swanCount));
    this.#swanEyeInst = this.#trackInst(new THREE.InstancedMesh(swanEyesGeo, darkMat, swanCount));

    for (const inst of [this.#swanBodyInst, this.#swanNeckInst, this.#swanBeakInst, this.#swanEyeInst]) {
      inst.frustumCulled = false;
      inst.castShadow = inst === this.#swanBodyInst || inst === this.#swanNeckInst;
      inst.receiveShadow = false;
      this.#root.add(inst);
    }

    const dummy = this.#dummy;
    swanPaths.forEach((p, idx) => {
      this.#evalSwanPos(p, 0, this.#tmpXZ);
      this.#evalSwanPos(p, 0.05, this.#tmpXZ2);
      const initYaw = Math.atan2(this.#tmpXZ2.x - this.#tmpXZ.x, this.#tmpXZ2.z - this.#tmpXZ.z);

      dummy.position.set(this.#tmpXZ.x, p.waterY, this.#tmpXZ.z);
      dummy.rotation.set(0, initYaw, 0, 'YXZ');
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.#swanBodyInst.setMatrixAt(idx, dummy.matrix);
      this.#swanNeckInst.setMatrixAt(idx, dummy.matrix);
      this.#swanBeakInst.setMatrixAt(idx, dummy.matrix);
      this.#swanEyeInst.setMatrixAt(idx, dummy.matrix);

      this.#swans.push({
        ...p,
        idx,
        yaw: initYaw,
        lastX: this.#tmpXZ.x,
        lastZ: this.#tmpXZ.z
      });
    });

    this.#swanBodyInst.instanceMatrix.needsUpdate = true;
    this.#swanNeckInst.instanceMatrix.needsUpdate = true;
    this.#swanBeakInst.instanceMatrix.needsUpdate = true;
    this.#swanEyeInst.instanceMatrix.needsUpdate = true;

    // Patitos dorados
    const rawDuckBody = new THREE.SphereGeometry(0.14, 10, 8);
    rawDuckBody.scale(0.85, 0.75, 1.25);
    const rawDuckHead = new THREE.SphereGeometry(0.085, 8, 8);
    const duckBodyGeo = this.#trackGeo(this.#mergeGeometries([
      { geo: rawDuckBody, matrix: new THREE.Matrix4().makeTranslation(0, 0.08, 0) },
      { geo: rawDuckHead, matrix: new THREE.Matrix4().makeTranslation(0, 0.19, 0.12) }
    ]));
    rawDuckBody.dispose();
    rawDuckHead.dispose();

    const duckBeakGeo = this.#trackGeo(new THREE.ConeGeometry(0.032, 0.09, 6));
    duckBeakGeo.rotateX(Math.PI / 2);
    duckBeakGeo.translate(0, 0.18, 0.22);

    const duckConfigs = [
      // Lago de los Cisnes: 5 patitos en fila india siguiendo al Cisne Real 0
      { leaderIdx: 0, lag: 0.44, offsetSide: 0.0 },
      { leaderIdx: 0, lag: 0.72, offsetSide: 0.04 },
      { leaderIdx: 0, lag: 1.00, offsetSide: -0.04 },
      { leaderIdx: 0, lag: 1.28, offsetSide: 0.03 },
      { leaderIdx: 0, lag: 1.56, offsetSide: -0.03 },
      // Río Cristalino: 3 patitos (2 tras el Cisne 3 en tramo norte, 1 tras el Cisne 4 en tramo sur)
      { leaderIdx: 3, lag: 0.56, offsetSide: 0.0 },
      { leaderIdx: 3, lag: 0.94, offsetSide: 0.05 },
      { leaderIdx: 4, lag: 0.62, offsetSide: 0.0 },
      // Estanque Este: 3 patitos
      { leaderIdx: 5, lag: 0.36, offsetSide: 0.26 },
      { leaderIdx: 5, lag: 0.64, offsetSide: -0.24 },
      { leaderIdx: 6, lag: 0.42, offsetSide: 0.20 },
      // Lago Imperial Sur: 3 patitos
      { leaderIdx: 7, lag: 0.36, offsetSide: 0.25 },
      { leaderIdx: 7, lag: 0.66, offsetSide: -0.25 },
      { leaderIdx: 8, lag: 0.40, offsetSide: 0.24 }
    ];

    this.#duckBodyInst = this.#trackInst(new THREE.InstancedMesh(duckBodyGeo, duckGoldMat, duckConfigs.length));
    this.#duckBeakInst = this.#trackInst(new THREE.InstancedMesh(duckBeakGeo, orangeMat, duckConfigs.length));
    for (const inst of [this.#duckBodyInst, this.#duckBeakInst]) {
      inst.frustumCulled = false;
      inst.castShadow = false;
      inst.receiveShadow = false;
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

      dummy.position.set(initX, leader.waterY + 0.005, initZ);
      dummy.rotation.set(0, yaw, 0, 'YXZ');
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.#duckBodyInst.setMatrixAt(idx, dummy.matrix);
      this.#duckBeakInst.setMatrixAt(idx, dummy.matrix);

      this.#ducklings.push({
        ...cfg,
        waterY: leader.waterY + 0.005,
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
    const wakeGeo = this.#trackGeo(new THREE.RingGeometry(0.18, 0.26, 20));
    wakeGeo.rotateX(-Math.PI / 2);

    const wakeMat = this.#trackMat(new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.36,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));

    const wakeCount = 64;
    const wakeInst = this.#trackInst(new THREE.InstancedMesh(wakeGeo, wakeMat, wakeCount));
    wakeInst.name = 'FaunaWaterWakes';
    wakeInst.frustumCulled = false;
    wakeInst.castShadow = false;
    wakeInst.receiveShadow = false;
    wakeInst.visible = false;

    const dummy = this.#dummy;
    dummy.position.set(0, 0.075, 0);
    dummy.rotation.set(0, 0, 0, 'YXZ');
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    this.#tmpColor.setHex(0xe8fbff);

    for (let i = 0; i < wakeCount; i++) {
      wakeInst.setMatrixAt(i, dummy.matrix);
      wakeInst.setColorAt(i, this.#tmpColor);
      this.#wakePool.push({
        active: false,
        x: 0,
        y: 0.075,
        z: 0,
        age: 0,
        maxAge: 1.55,
        baseScale: 1
      });
    }
    wakeInst.instanceMatrix.needsUpdate = true;
    if (wakeInst.instanceColor) wakeInst.instanceColor.needsUpdate = true;

    this.#wakeInst = wakeInst;
    this.#wakes = this.#wakePool;
    this.#root.add(wakeInst);
  }

  #spawnWake(x, y, z, baseScale = 1.0) {
    for (let i = 0; i < this.#wakePool.length; i++) {
      const w = this.#wakePool[i];
      if (!w.active) {
        w.active = true;
        w.x = x;
        w.y = y;
        w.z = z;
        w.age = 0;
        w.baseScale = baseScale;
        if (this.#wakeInst) this.#wakeInst.visible = true;
        return;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Pajaritos Cantores y Palomas Reales Blancas (34 aves)
  // ---------------------------------------------------------------------------
  #buildSongbirdsAndDoves() {
    const rawNodes = [
      // Glorietas clásicas y Mirador Sur
      [35.0, 4.48, -5.2], [37.5, 4.48, -8.5],
      [-33.0, 4.48, 38.2], [-35.4, 4.48, 42.1],
      [-54.0, 4.48, -41.2], [-51.5, 4.48, -45.6],
      [0.0, 6.55, 39.8], [4.5, 6.55, 42.0],
      // Copas de árboles Palacio, Bosque y Estanque Este
      [-15.0, 4.9, -11.0], [15.0, 4.9, -11.0], [-15.0, 4.9, 13.0],
      [44.0, 5.1, -10.0], [50.0, 5.0, 7.0], [-43.0, 5.1, 35.0],
      [-48.0, 5.0, -28.0], [58.0, 4.8, 22.0],
      // Bordes de las Fuentes del Bulevar (80, ±10.5)
      [80.0, 0.80, -7.8], [82.7, 0.80, -10.5],
      [80.0, 0.80, 7.8], [82.7, 0.80, 10.5],
      // Barandillas de los 3 nuevos puentes del Río Cristalino
      [97.5, 1.64, -2.2], [97.5, 1.64, 2.2],    // Puente Central (97.5, 0)
      [94.0, 1.62, -39.8], [94.0, 1.62, -36.2], // Puente Norte (94, -38)
      [104.5, 1.62, 25.2], [104.5, 1.62, 28.8], // Puente Sur (104.5, 27)
      // Copas de la Ribera del Río y Lago de los Cisnes
      [88.0, 5.0, -18.0], [90.0, 5.1, 14.0], [118.0, 5.0, 38.0], [106.0, 5.2, 57.0],
      // Bordes de las Fuentes Laterales VIP del Casino (162, ±48)
      [162.0, 0.82, -44.2], [165.8, 0.82, -48.0], [158.2, 0.82, -48.0],
      [162.0, 0.82, 44.2], [165.8, 0.82, 48.0], [158.2, 0.82, 48.0],
      // Glorietas VIP del Casino (208, ±22) y arboledas VIP
      [208.0, 4.48, -19.2], [210.5, 4.48, -22.0],
      [208.0, 4.48, 19.2], [210.5, 4.48, 22.0],
      [138.0, 5.1, -38.0], [138.0, 5.1, 38.0], [192.0, 5.0, -36.0], [192.0, 5.0, 36.0]
    ];

    this.#perchNodes = rawNodes.map(([x, y, z]) => ({ x, y, z, neighbors: [] }));
    for (let i = 0; i < this.#perchNodes.length; i++) {
      const a = this.#perchNodes[i];
      for (let j = 0; j < this.#perchNodes.length; j++) {
        if (i === j) continue;
        const b = this.#perchNodes[j];
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d >= 5.0 && d <= 56.0) {
          a.neighbors.push(j);
        }
      }
      if (a.neighbors.length === 0) {
        a.neighbors.push((i + 1) % this.#perchNodes.length);
      }
    }

    const rawBodyGeo = new THREE.SphereGeometry(0.11, 8, 8);
    rawBodyGeo.scale(0.85, 0.9, 1.35);
    const rawHeadGeo = new THREE.SphereGeometry(0.075, 8, 8);
    const rawBeakGeo = new THREE.ConeGeometry(0.025, 0.075, 6);
    rawBeakGeo.rotateX(Math.PI / 2);
    const rawTailGeo = new THREE.BoxGeometry(0.085, 0.02, 0.17);

    const birdBodyGeo = this.#trackGeo(this.#mergeGeometries([
      { geo: rawBodyGeo, matrix: new THREE.Matrix4() },
      { geo: rawTailGeo, matrix: new THREE.Matrix4().makeRotationX(0.24).setPosition(0, 0.03, -0.17) },
      { geo: rawHeadGeo, matrix: new THREE.Matrix4().makeTranslation(0, 0.08, 0.11) },
      { geo: rawBeakGeo, matrix: new THREE.Matrix4().makeTranslation(0, 0.075, 0.19) }
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

    const birdBodyMat = this.#trackMat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.56 }));
    const birdBellyMat = this.#trackMat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62 }));

    const palettes = [
      { body: 0x4ea3eb, belly: 0xdcf0ff, scale: 1.0, flapFreq: 24 },  // Azulejo real
      { body: 0xf7f4f0, belly: 0xffffff, scale: 1.34, flapFreq: 17 }, // Paloma Real blanca perlada
      { body: 0xf2c641, belly: 0xfff3c4, scale: 0.96, flapFreq: 25 }, // Jilguero dorado
      { body: 0xe87ab0, belly: 0xffe4f2, scale: 1.0, flapFreq: 24 },  // Pinzón rosa real
      { body: 0xf4eff5, belly: 0xfffaf7, scale: 1.30, flapFreq: 18 }, // Paloma Real perlada rosada
      { body: 0x70584c, belly: 0xe66845, scale: 0.98, flapFreq: 25 }  // Petirrojo
    ];

    const count = 34;
    const bodyInst = this.#trackInst(new THREE.InstancedMesh(birdBodyGeo, birdBodyMat, count));
    const bellyInst = this.#trackInst(new THREE.InstancedMesh(birdBellyGeo, birdBellyMat, count));
    const leftWingInst = this.#trackInst(new THREE.InstancedMesh(birdLeftWingGeo, birdBodyMat, count));
    const rightWingInst = this.#trackInst(new THREE.InstancedMesh(birdRightWingGeo, birdBodyMat, count));

    bodyInst.name = 'FaunaBirdBodies';
    bellyInst.name = 'FaunaBirdBellies';
    leftWingInst.name = 'FaunaBirdLeftWings';
    rightWingInst.name = 'FaunaBirdRightWings';

    for (const inst of [bodyInst, bellyInst, leftWingInst, rightWingInst]) {
      inst.frustumCulled = false;
      inst.castShadow = false;
      inst.receiveShadow = false;
      this.#root.add(inst);
    }

    const dummy = this.#dummy;
    for (let i = 0; i < count; i++) {
      const pal = palettes[i % palettes.length];
      const sc = pal.scale;
      this.#tmpColor.setHex(pal.body);
      bodyInst.setColorAt(i, this.#tmpColor);
      leftWingInst.setColorAt(i, this.#tmpColor);
      rightWingInst.setColorAt(i, this.#tmpColor);
      this.#tmpColor.setHex(pal.belly);
      bellyInst.setColorAt(i, this.#tmpColor);

      const startIdx = Math.floor((i * this.#perchNodes.length) / count) % this.#perchNodes.length;
      const startNode = this.#perchNodes[startIdx];
      const nextIdx = startNode.neighbors[i % startNode.neighbors.length];

      dummy.position.set(startNode.x, startNode.y, startNode.z);
      dummy.rotation.set(0, 0, 0, 'YXZ');
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      bodyInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(startNode.x, startNode.y - 0.02 * sc, startNode.z + 0.02 * sc);
      dummy.updateMatrix();
      bellyInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(startNode.x - 0.06 * sc, startNode.y + 0.03 * sc, startNode.z);
      dummy.rotation.set(0, 0, 0.15, 'YXZ');
      dummy.updateMatrix();
      leftWingInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(startNode.x + 0.06 * sc, startNode.y + 0.03 * sc, startNode.z);
      dummy.rotation.set(0, 0, -0.15, 'YXZ');
      dummy.updateMatrix();
      rightWingInst.setMatrixAt(i, dummy.matrix);

      this.#birds.push({
        x: startNode.x,
        y: startNode.y,
        z: startNode.z,
        scale: sc,
        flapFreq: pal.flapFreq,
        yaw: 0,
        state: 'perched',
        timer: 1.2 + (i % 7) * 0.95,
        fromIdx: startIdx,
        toIdx: nextIdx,
        flightTime: 0,
        flightDuration: 2.8,
        arcHeight: 2.3 + (i % 4) * 0.65,
        phase: i * 0.93
      });
    }

    for (const inst of [bodyInst, bellyInst, leftWingInst, rightWingInst]) {
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    }

    this.#birdBodyInst = bodyInst;
    this.#birdBellyInst = bellyInst;
    this.#birdLeftWingInst = leftWingInst;
    this.#birdRightWingInst = rightWingInst;
  }

  // ---------------------------------------------------------------------------
  // 5. Ciervos Blancos Imperiales y Cervatos con Motas (15 ejemplares)
  // ---------------------------------------------------------------------------
  #buildDeerAndFawns() {
    const coatMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.72,
      metalness: 0.02
    }));
    const bellyMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xfaf7f2,
      roughness: 0.75
    }));
    const spotMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xfffdf9,
      roughness: 0.7
    }));
    const antlerMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xd9b87c,
      roughness: 0.42,
      metalness: 0.22
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

    // Motas blancas dorsales para los cervatos
    const rawSpot = new THREE.SphereGeometry(0.046, 6, 5);
    rawSpot.scale(0.55, 0.85, 1.15);
    const spotCoords = [
      [-0.29, 1.08, -0.32], [0.29, 1.08, -0.32],
      [-0.305, 1.03, -0.10], [0.305, 1.03, -0.10],
      [-0.29, 1.12, 0.08], [0.29, 1.12, 0.08],
      [-0.27, 0.99, -0.24], [0.27, 0.99, -0.24],
      [-0.275, 1.06, 0.22], [0.275, 1.06, 0.22]
    ];
    const deerSpotsGeo = this.#trackGeo(this.#mergeGeometries(
      spotCoords.map(([sx, sy, sz]) => ({
        geo: rawSpot,
        matrix: new THREE.Matrix4().makeTranslation(sx, sy, sz)
      }))
    ));
    rawSpot.dispose();

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
    rawNeck.dispose();
    rawHead.dispose();
    rawEar.dispose();

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
    rawStem.dispose();
    rawTine.dispose();

    const legGeo = this.#trackGeo(new THREE.CylinderGeometry(0.055, 0.04, 0.82, 7));
    legGeo.translate(0, -0.41, 0);

    // Manadas en las 6 praderas del reino: [homeX, homeZ, initOffsetX, initOffsetZ, hasAntlers, isFawn, meadowRadius]
    const herdSpecs = [
      // 1. Bosque NO (-54, -30): 2 adultos + 1 cervato
      [-54, -30, -1.8, -1.0, true, false, 7.0],
      [-54, -30, 1.9, -0.6, false, false, 7.0],
      [-54, -30, 0.6, 1.5, false, true, 6.2],
      // 2. Claro Este (62, -18): 1 adulto + 1 cervato
      [62, -18, -1.2, -0.8, true, false, 6.5],
      [62, -18, 1.3, 1.1, false, true, 5.8],
      // 3. Pradera de la Ribera del Río (78, 24): 2 adultos + 1 cervato
      [78, 24, -1.9, -1.2, true, false, 6.8],
      [78, 24, 1.6, -0.4, false, false, 6.8],
      [78, 24, 0.4, 1.6, false, true, 6.0],
      // 4. Pradera Norte del Casino (138, -54): 2 adultos + 1 cervato
      [138, -54, -1.8, 0.8, true, false, 7.2],
      [138, -54, 1.8, -0.9, false, false, 7.2],
      [138, -54, 0.3, 1.7, false, true, 6.4],
      // 5. Jardín Este/SE del Casino (192, 42): 1 adulto + 1 cervato
      [192, 42, -1.3, -0.9, true, false, 6.8],
      [192, 42, 1.2, 1.1, false, true, 6.0],
      // 6. Claro Cerezos SO (-68, 36): 1 adulto + 1 cervato
      [-68, 36, -1.2, -0.8, false, false, 6.5],
      [-68, 36, 1.3, 1.0, false, true, 5.8]
    ];

    const count = herdSpecs.length; // 15
    this.#deerTorsoInst = this.#trackInst(new THREE.InstancedMesh(torsoGeo, coatMat, count));
    this.#deerTailInst = this.#trackInst(new THREE.InstancedMesh(tailGeo, bellyMat, count));
    this.#deerSpotsInst = this.#trackInst(new THREE.InstancedMesh(deerSpotsGeo, spotMat, count));
    this.#deerHeadInst = this.#trackInst(new THREE.InstancedMesh(deerHeadGeo, coatMat, count));
    this.#deerNoseInst = this.#trackInst(new THREE.InstancedMesh(deerNoseGeo, noseMat, count));
    this.#deerAntlerInst = this.#trackInst(new THREE.InstancedMesh(deerAntlerGeo, antlerMat, count));
    this.#deerLegInst = this.#trackInst(new THREE.InstancedMesh(legGeo, coatMat, count * 4));
    const deerShadowAssets = this.#getFaunaShadowAssets();
    this.#deerShadowInst = this.#trackInst(new THREE.InstancedMesh(deerShadowAssets.geo, deerShadowAssets.mat, count));

    for (const inst of [
      this.#deerTorsoInst, this.#deerTailInst, this.#deerSpotsInst,
      this.#deerHeadInst, this.#deerNoseInst, this.#deerAntlerInst, this.#deerLegInst,
      this.#deerShadowInst
    ]) {
      inst.frustumCulled = false;
      inst.castShadow = inst === this.#deerTorsoInst;
      inst.receiveShadow = false;
      this.#root.add(inst);
    }

    herdSpecs.forEach(([hx, hz, ox, oz, hasAntlers, isFawn, meadowRadius], idx) => {
      const coatHex = isFawn ? 0xe9d4b4 : (hasAntlers ? 0xf5f1eb : 0xf8f5f0);
      this.#tmpColor.setHex(coatHex);
      this.#deerTorsoInst.setColorAt(idx, this.#tmpColor);
      this.#deerHeadInst.setColorAt(idx, this.#tmpColor);
      for (let l = 0; l < 4; l++) {
        this.#deerLegInst.setColorAt(idx * 4 + l, this.#tmpColor);
      }

      const scale = isFawn ? 0.62 : (hasAntlers ? 1.04 : 0.96);
      const d = {
        hasAntlers,
        isFawn,
        scale,
        meadowRadius,
        homeX: hx,
        homeZ: hz,
        x: hx + ox,
        z: hz + oz,
        yaw: idx * 1.4,
        headYawOffset: 0,
        neckRotX: 0.65,
        legAngles: [0, 0, 0, 0],
        state: 'graze',
        timer: 2.2 + (idx % 5) * 0.85,
        targetX: hx + ox,
        targetZ: hz + oz,
        phase: idx * 1.7
      };
      this.#deer.push(d);
      this.#syncDeerInstance(idx, d);
    });

    for (const inst of [
      this.#deerTorsoInst, this.#deerTailInst, this.#deerSpotsInst,
      this.#deerHeadInst, this.#deerNoseInst, this.#deerAntlerInst, this.#deerLegInst
    ]) {
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    }
  }

  #syncDeerInstance(idx, d) {
    const dummy = this.#dummy;
    const s = d.scale;
    const cosY = Math.cos(d.yaw);
    const sinY = Math.sin(d.yaw);

    dummy.position.set(d.x, 0, d.z);
    dummy.rotation.set(0, d.yaw, 0, 'YXZ');
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    this.#deerTorsoInst.setMatrixAt(idx, dummy.matrix);
    this.#deerTailInst.setMatrixAt(idx, dummy.matrix);

    dummy.scale.setScalar(d.isFawn ? s : 0);
    dummy.updateMatrix();
    this.#deerSpotsInst.setMatrixAt(idx, dummy.matrix);

    const nx = d.x + 0.45 * s * sinY;
    const nz = d.z + 0.45 * s * cosY;
    const headYaw = d.yaw + d.headYawOffset;
    dummy.position.set(nx, 1.08 * s, nz);
    dummy.rotation.set(d.neckRotX, headYaw, 0, 'YXZ');
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    this.#deerHeadInst.setMatrixAt(idx, dummy.matrix);
    this.#deerNoseInst.setMatrixAt(idx, dummy.matrix);

    dummy.scale.setScalar(d.hasAntlers ? s : 0);
    dummy.updateMatrix();
    this.#deerAntlerInst.setMatrixAt(idx, dummy.matrix);

    dummy.scale.setScalar(s);
    const legBase = idx * 4;
    for (let l = 0; l < 4; l++) {
      const lx = DEER_LEG_LX[l] * s;
      const ly = DEER_LEG_LY[l] * s;
      const lz = DEER_LEG_LZ[l] * s;
      const wx = d.x + lx * cosY + lz * sinY;
      const wz = d.z - lx * sinY + lz * cosY;
      dummy.position.set(wx, ly, wz);
      dummy.rotation.set(d.legAngles[l], d.yaw, 0, 'YXZ');
      dummy.updateMatrix();
      this.#deerLegInst.setMatrixAt(legBase + l, dummy.matrix);
    }

    if (this.#deerShadowInst) {
      let shadowScale = s * 1.18;
      if (this.#waterSystem) {
        this.#waterSystem.sampleWater(d.x, d.z, this.#waterSample);
        if (this.#waterSample.inWater && this.#waterSample.depth > 0.25) {
          shadowScale = 0;
        }
      }
      dummy.position.set(d.x, 0.025, d.z);
      dummy.rotation.set(0, d.yaw, 0, 'YXZ');
      dummy.scale.set(shadowScale, 1, shadowScale * 1.25);
      dummy.updateMatrix();
      this.#deerShadowInst.setMatrixAt(idx, dummy.matrix);
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Conejitos Pastel (24 instancias)
  // ---------------------------------------------------------------------------
  #buildBunnies() {
    const coatHexes = [
      0xf8f5f0, // Blanco perla
      0xf3e3c9, // Crema suave
      0xf9cadb, // Rosa pálido pastel
      0xd6a47c  // Canela suave
    ];
    const coatMat = this.#trackMat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }));
    const tailMat = this.#trackMat(new THREE.MeshStandardMaterial({ color: 0xfaf8f5, roughness: 0.85 }));
    const pinkNoseMat = this.#trackMat(new THREE.MeshStandardMaterial({ color: 0xf29cb8, roughness: 0.58 }));

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
    rawBody.dispose();
    rawHead.dispose();
    rawPaw.dispose();

    const tailGeo = this.#trackGeo(new THREE.SphereGeometry(0.065, 6, 6));
    tailGeo.translate(0, 0.17, -0.22);
    const noseGeo = this.#trackGeo(new THREE.SphereGeometry(0.024, 6, 6));
    noseGeo.translate(0, 0.27, 0.29);
    const earGeo = this.#trackGeo(new THREE.CapsuleGeometry(0.028, 0.14, 4, 6));

    // [bx, bz, maxRadius] — Palacio, Bulevar Imperial y anillo alrededor de la Cúpula del Casino
    const spots = [
      // Parterres del Palacio y Fuente Central
      [-20.0, -13.2, 3.2], [20.0, -13.2, 3.2],
      [-13.0, 12.0, 2.8], [13.0, 12.0, 2.8],
      [-8.5, 23.0, 2.6], [8.5, 23.0, 2.6],
      [34.0, -13.2, 3.0], [-33.0, 46.2, 3.0],
      // Bulevar Imperial y praderas antes/después del Río
      [58.0, -10.5, 2.8], [58.0, 10.5, 2.8],
      [86.0, -13.0, 2.6], [86.0, 13.0, 2.6],
      [114.0, -12.5, 2.8], [114.0, 12.5, 2.8],
      // Alrededor de la Cúpula del Casino (R_OUTER = 35 en centro 162, 0)
      [136.0, -24.0, 2.6], [136.0, 24.0, 2.6],
      [162.0, -39.0, 2.5], [162.0, 39.0, 2.5],
      [198.0, -14.0, 2.8], [198.0, 14.0, 2.8],
      [182.0, -34.0, 2.8], [182.0, 34.0, 2.8],
      // Claros del Bosque y Cerezos
      [-51.0, -28.0, 4.2], [-65.0, 34.0, 4.2]
    ];

    const count = spots.length; // 24
    this.#bunnyBodyInst = this.#trackInst(new THREE.InstancedMesh(bunnyBodyGeo, coatMat, count));
    this.#bunnyTailInst = this.#trackInst(new THREE.InstancedMesh(tailGeo, tailMat, count));
    this.#bunnyNoseInst = this.#trackInst(new THREE.InstancedMesh(noseGeo, pinkNoseMat, count));
    this.#bunnyEarInst = this.#trackInst(new THREE.InstancedMesh(earGeo, coatMat, count * 2));
    const bunnyShadowAssets = this.#getFaunaShadowAssets();
    this.#bunnyShadowInst = this.#trackInst(new THREE.InstancedMesh(bunnyShadowAssets.geo, bunnyShadowAssets.mat, count));

    for (const inst of [this.#bunnyBodyInst, this.#bunnyTailInst, this.#bunnyNoseInst, this.#bunnyEarInst, this.#bunnyShadowInst]) {
      inst.frustumCulled = false;
      inst.castShadow = false;
      inst.receiveShadow = false;
      this.#root.add(inst);
    }

    spots.forEach(([bx, bz, maxRadius], idx) => {
      this.#tmpColor.setHex(coatHexes[idx % coatHexes.length]);
      this.#bunnyBodyInst.setColorAt(idx, this.#tmpColor);
      this.#bunnyEarInst.setColorAt(idx * 2, this.#tmpColor);
      this.#bunnyEarInst.setColorAt(idx * 2 + 1, this.#tmpColor);

      const b = {
        homeX: bx,
        homeZ: bz,
        maxRadius,
        x: bx,
        y: 0,
        z: bz,
        yaw: idx * 1.1,
        bodyPitch: 0,
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
    dummy.rotation.set(b.bodyPitch, b.yaw, 0, 'YXZ');
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    this.#bunnyBodyInst.setMatrixAt(idx, dummy.matrix);
    this.#bunnyTailInst.setMatrixAt(idx, dummy.matrix);
    this.#bunnyNoseInst.setMatrixAt(idx, dummy.matrix);

    const earY = b.y + 0.42;
    const earZ = 0.14 - b.bodyPitch * 0.18;
    dummy.position.set(b.x - 0.048 * cosY + earZ * sinY, earY, b.z + 0.048 * sinY + earZ * cosY);
    dummy.rotation.set(b.earLX + b.bodyPitch, b.yaw, 0.16, 'YXZ');
    dummy.updateMatrix();
    this.#bunnyEarInst.setMatrixAt(idx * 2, dummy.matrix);

    dummy.position.set(b.x + 0.048 * cosY + earZ * sinY, earY, b.z - 0.048 * sinY + earZ * cosY);
    dummy.rotation.set(b.earRX + b.bodyPitch, b.yaw, -0.16, 'YXZ');
    dummy.updateMatrix();
    this.#bunnyEarInst.setMatrixAt(idx * 2 + 1, dummy.matrix);

    if (this.#bunnyShadowInst) {
      const bunnyScale = Math.max(0.45, 1.0 - b.y * 0.85) * 0.44;
      dummy.position.set(b.x, 0.022, b.z);
      dummy.rotation.set(0, b.yaw, 0, 'YXZ');
      dummy.scale.set(bunnyScale, 1, bunnyScale * 1.15);
      dummy.updateMatrix();
      this.#bunnyShadowInst.setMatrixAt(idx, dummy.matrix);
    }
  }

  // ---------------------------------------------------------------------------
  // 7. Ardillas Reales Estilizadas (16 instancias con gran cola en S)
  // ---------------------------------------------------------------------------
  #buildSquirrels() {
    const furMat = this.#trackMat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.76 }));
    const bellyMat = this.#trackMat(new THREE.MeshStandardMaterial({ color: 0xf7ebd9, roughness: 0.8 }));
    const darkMat = this.#trackMat(new THREE.MeshStandardMaterial({ color: 0x221a18, roughness: 0.45 }));

    const rawTorso = new THREE.CapsuleGeometry(0.085, 0.13, 5, 8);
    const rawHead = new THREE.SphereGeometry(0.082, 8, 8);
    rawHead.scale(0.92, 0.92, 1.15);
    const rawEar = new THREE.ConeGeometry(0.028, 0.075, 5);
    const rawHindPaw = new THREE.SphereGeometry(0.045, 6, 6);
    rawHindPaw.scale(0.75, 0.55, 1.35);
    const rawFrontPaw = new THREE.SphereGeometry(0.03, 6, 5);

    const squirrelBodyGeo = this.#trackGeo(this.#mergeGeometries([
      { geo: rawTorso, matrix: new THREE.Matrix4().makeRotationX(0.95).setPosition(0, 0.12, 0.01) },
      { geo: rawHead, matrix: new THREE.Matrix4().makeTranslation(0, 0.23, 0.13) },
      { geo: rawEar, matrix: new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-0.1, 0, 0.25)).setPosition(-0.046, 0.31, 0.10) },
      { geo: rawEar, matrix: new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-0.1, 0, -0.25)).setPosition(0.046, 0.31, 0.10) },
      { geo: rawHindPaw, matrix: new THREE.Matrix4().makeTranslation(-0.068, 0.03, -0.02) },
      { geo: rawHindPaw, matrix: new THREE.Matrix4().makeTranslation(0.068, 0.03, -0.02) },
      { geo: rawFrontPaw, matrix: new THREE.Matrix4().makeTranslation(-0.045, 0.09, 0.11) },
      { geo: rawFrontPaw, matrix: new THREE.Matrix4().makeTranslation(0.045, 0.09, 0.11) }
    ]));
    rawTorso.dispose();
    rawHead.dispose();
    rawEar.dispose();
    rawHindPaw.dispose();
    rawFrontPaw.dispose();

    const rawBelly = new THREE.SphereGeometry(0.068, 7, 7);
    rawBelly.scale(0.8, 1.15, 0.75);
    const squirrelBellyGeo = this.#trackGeo(this.#mergeGeometries([
      { geo: rawBelly, matrix: new THREE.Matrix4().makeRotationX(0.55).setPosition(0, 0.13, 0.065) }
    ]));
    rawBelly.dispose();

    const rawEye = new THREE.SphereGeometry(0.015, 6, 5);
    const rawNose = new THREE.SphereGeometry(0.016, 6, 5);
    const squirrelDarkGeo = this.#trackGeo(this.#mergeGeometries([
      { geo: rawEye, matrix: new THREE.Matrix4().makeTranslation(-0.046, 0.245, 0.185) },
      { geo: rawEye, matrix: new THREE.Matrix4().makeTranslation(0.046, 0.245, 0.185) },
      { geo: rawNose, matrix: new THREE.Matrix4().makeTranslation(0, 0.225, 0.225) }
    ]));
    rawEye.dispose();
    rawNose.dispose();

    // Gran cola esponjosa curvada en S con penacho mullido
    const tailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.0, 0.0),
      new THREE.Vector3(0, 0.07, -0.10),
      new THREE.Vector3(0, 0.21, -0.14),
      new THREE.Vector3(0, 0.33, -0.05),
      new THREE.Vector3(0, 0.40, -0.13)
    ]);
    const rawTailTube = new THREE.TubeGeometry(tailCurve, 12, 0.058, 8, false);
    const rawPlumeMid = new THREE.SphereGeometry(0.076, 8, 7);
    rawPlumeMid.scale(0.88, 1.15, 1.05);
    const rawPlumeTip = new THREE.SphereGeometry(0.082, 8, 7);
    const squirrelTailGeo = this.#trackGeo(this.#mergeGeometries([
      { geo: rawTailTube, matrix: new THREE.Matrix4() },
      { geo: rawPlumeMid, matrix: new THREE.Matrix4().makeTranslation(0, 0.25, -0.11) },
      { geo: rawPlumeTip, matrix: new THREE.Matrix4().makeTranslation(0, 0.38, -0.11) }
    ]));
    rawTailTube.dispose();
    rawPlumeMid.dispose();
    rawPlumeTip.dispose();

    const bodyPalette = [0xa85d34, 0xc98243, 0xb5653b, 0x9c552e];
    const tailPalette = [0xb86b3e, 0xd99250, 0xc47245, 0xad6136];

    const groves = [
      // Arboledas del Bosque NO y Cerezos SO
      [-48.0, -24.0], [-58.0, -38.0], [-44.0, -48.0],
      [-62.0, 28.0], [-52.0, 42.0], [-72.0, 18.0],
      // Arboledas de la Ribera del Río Cristalino
      [86.0, -28.0], [88.0, -6.0], [89.0, 18.0],
      [108.0, -22.0], [112.0, 6.0],
      // Arboledas de los Jardines VIP del Casino
      [128.0, -42.0], [150.0, -58.0], [196.0, -34.0],
      [204.0, 12.0], [146.0, 56.0]
    ];

    const count = groves.length; // 16
    this.#squirrelBodyInst = this.#trackInst(new THREE.InstancedMesh(squirrelBodyGeo, furMat, count));
    this.#squirrelBellyInst = this.#trackInst(new THREE.InstancedMesh(squirrelBellyGeo, bellyMat, count));
    this.#squirrelDarkInst = this.#trackInst(new THREE.InstancedMesh(squirrelDarkGeo, darkMat, count));
    this.#squirrelTailInst = this.#trackInst(new THREE.InstancedMesh(squirrelTailGeo, furMat, count));

    for (const inst of [this.#squirrelBodyInst, this.#squirrelBellyInst, this.#squirrelDarkInst, this.#squirrelTailInst]) {
      inst.frustumCulled = false;
      inst.castShadow = false;
      inst.receiveShadow = false;
      this.#root.add(inst);
    }

    groves.forEach(([gx, gz], idx) => {
      this.#tmpColor.setHex(bodyPalette[idx % bodyPalette.length]);
      this.#squirrelBodyInst.setColorAt(idx, this.#tmpColor);
      this.#tmpColor.setHex(tailPalette[idx % tailPalette.length]);
      this.#squirrelTailInst.setColorAt(idx, this.#tmpColor);

      const s = {
        homeX: gx,
        homeZ: gz,
        x: gx,
        y: 0,
        z: gz,
        scale: 0.94 + (idx % 3) * 0.08,
        yaw: idx * 1.5,
        bodyPitch: 0,
        tailPitch: 0,
        tailWagZ: 0,
        state: 'perk',
        timer: 0.8 + (idx % 5) * 0.5,
        targetX: gx,
        targetZ: gz,
        phase: idx * 1.83
      };
      this.#squirrels.push(s);
      this.#syncSquirrelInstance(idx, s);
    });

    for (const inst of [this.#squirrelBodyInst, this.#squirrelBellyInst, this.#squirrelDarkInst, this.#squirrelTailInst]) {
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    }
  }

  #syncSquirrelInstance(idx, s) {
    const dummy = this.#dummy;
    const sc = s.scale;
    const cosY = Math.cos(s.yaw);
    const sinY = Math.sin(s.yaw);

    dummy.position.set(s.x, s.y, s.z);
    dummy.rotation.set(s.bodyPitch, s.yaw, 0, 'YXZ');
    dummy.scale.setScalar(sc);
    dummy.updateMatrix();
    this.#squirrelBodyInst.setMatrixAt(idx, dummy.matrix);
    this.#squirrelBellyInst.setMatrixAt(idx, dummy.matrix);
    this.#squirrelDarkInst.setMatrixAt(idx, dummy.matrix);

    const tx = s.x - 0.11 * sc * sinY;
    const ty = s.y + 0.10 * sc;
    const tz = s.z - 0.11 * sc * cosY;
    dummy.position.set(tx, ty, tz);
    dummy.rotation.set(s.tailPitch, s.yaw, s.tailWagZ, 'YXZ');
    dummy.scale.setScalar(sc);
    dummy.updateMatrix();
    this.#squirrelTailInst.setMatrixAt(idx, dummy.matrix);
  }

  // ---------------------------------------------------------------------------
  // 8. Peces Koi Imperiales de Colores (48 instancias con aleta caudal ondulante)
  // ---------------------------------------------------------------------------
  #buildKoiFish() {
    const rawBody = new THREE.SphereGeometry(0.11, 10, 8);
    rawBody.scale(0.64, 0.32, 1.85);
    const rawDorsal = new THREE.BoxGeometry(0.012, 0.042, 0.13);
    const rawPecFin = new THREE.SphereGeometry(0.052, 6, 5);
    rawPecFin.scale(1.25, 0.10, 0.62);

    const koiBodyGeo = this.#trackGeo(this.#mergeGeometries([
      { geo: rawBody, matrix: new THREE.Matrix4() },
      { geo: rawDorsal, matrix: new THREE.Matrix4().makeRotationX(-0.28).setPosition(0, 0.036, -0.02) },
      {
        geo: rawPecFin,
        matrix: new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, 0.35, -0.15)).setPosition(-0.075, -0.01, 0.04)
      },
      {
        geo: rawPecFin,
        matrix: new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, -0.35, 0.15)).setPosition(0.075, -0.01, 0.04)
      }
    ]));
    rawBody.dispose();
    rawDorsal.dispose();
    rawPecFin.dispose();

    // Manchas dorsales Kohaku / destello imperial
    const rawPatch1 = new THREE.SphereGeometry(0.062, 7, 6);
    rawPatch1.scale(0.85, 0.24, 1.15);
    const rawPatch2 = new THREE.SphereGeometry(0.048, 7, 6);
    rawPatch2.scale(0.8, 0.22, 1.0);
    const koiPatternGeo = this.#trackGeo(this.#mergeGeometries([
      { geo: rawPatch1, matrix: new THREE.Matrix4().makeTranslation(0.005, 0.026, 0.065) },
      { geo: rawPatch2, matrix: new THREE.Matrix4().makeTranslation(-0.006, 0.024, -0.075) }
    ]));
    rawPatch1.dispose();
    rawPatch2.dispose();

    // Aleta caudal en velo ahorquillada con pivote en (0, 0, 0) extendida hacia -Z (sumergida y visible desde arriba)
    const tailShape = new THREE.Shape();
    tailShape.moveTo(0, 0);
    tailShape.quadraticCurveTo(0.055, 0.05, 0.082, 0.155);
    tailShape.quadraticCurveTo(0.022, 0.115, 0, 0.125);
    tailShape.quadraticCurveTo(-0.022, 0.115, -0.082, 0.155);
    tailShape.quadraticCurveTo(-0.055, 0.05, 0, 0);
    const koiTailGeo = this.#trackGeo(new THREE.ShapeGeometry(tailShape, 5));
    koiTailGeo.rotateX(-Math.PI / 2);
    koiTailGeo.rotateZ(0.16);

    const koiMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.26,
      metalness: 0.08
    }));
    const koiTailMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.30,
      side: THREE.DoubleSide
    }));

    const koiPalettes = [
      { body: 0xf26419, pattern: 0xff9f4a, tail: 0xff7b29 }, // Naranja imperial
      { body: 0xfaf8f5, pattern: 0xe03124, tail: 0xfaf8f5 }, // Blanco-rojo Kohaku
      { body: 0xf7b825, pattern: 0xffe47a, tail: 0xfcc438 }, // Dorado solar
      { body: 0xf46b8a, pattern: 0xffb8ca, tail: 0xff85a1 }  // Rosa coral
    ];

    const centralFountainY = this.#detectBasinKoiY(0, 3.2, 0.025);
    const casinoNorthFountainY = this.#detectBasinKoiY(162, -45.5, 0.025);
    const casinoSouthFountainY = this.#detectBasinKoiY(162, 45.5, 0.025);

    const specs = [];
    // 14 Koi en el Río Cristalino (Y = 0.025)
    for (let i = 0; i < 14; i++) {
      const zMid = -62 + i * 7.0;
      specs.push({
        mode: 'river',
        zMid,
        zAmp: 4.5 + (i % 3) * 1.4,
        laneAmp: 1.1 + (i % 3) * 0.42,
        y: 0.025,
        speed: 0.32 + (i % 4) * 0.06,
        phase: i * 1.19
      });
    }
    // 14 Koi en el Lago de los Cisnes (106, 45)
    for (let i = 0; i < 14; i++) {
      specs.push({
        mode: 'orbit',
        cx: 106 + ((i % 3) - 1) * 3.8,
        cz: 45 + ((i % 2) - 0.5) * 2.4,
        rx: 3.6 + (i % 5) * 1.9,
        rz: 2.4 + (i % 4) * 1.2,
        figure8: i % 2 === 0,
        y: 0.025,
        speed: (i % 2 === 0 ? 1 : -1) * (0.28 + (i % 4) * 0.05),
        phase: i * 0.95
      });
    }
    // 8 Koi en el Estanque Este (46, 26)
    for (let i = 0; i < 8; i++) {
      specs.push({
        mode: 'orbit',
        cx: 46,
        cz: 26,
        rx: 3.0 + (i % 4) * 1.45,
        rz: 2.2 + (i % 3) * 1.25,
        figure8: i % 3 === 0,
        y: 0.025,
        speed: (i % 2 === 0 ? 1 : -1) * (0.30 + (i % 3) * 0.06),
        phase: i * 1.41
      });
    }
    // 4 Koi en el vaso inferior de la Fuente Central (0, 0)
    for (let i = 0; i < 4; i++) {
      const r = 2.5 + (i % 2) * 1.35;
      specs.push({
        mode: 'orbit',
        cx: 0,
        cz: 0,
        rx: r,
        rz: r,
        figure8: false,
        y: centralFountainY,
        speed: (i % 2 === 0 ? 0.38 : -0.34),
        phase: i * 1.57
      });
    }
    // 8 Koi en los vasos inferiores de las Fuentes VIP del Casino (162, ±48)
    for (let i = 0; i < 4; i++) {
      const r = 1.7 + (i % 2) * 1.1;
      specs.push({
        mode: 'orbit',
        cx: 162,
        cz: -48,
        rx: r,
        rz: r,
        figure8: false,
        y: casinoNorthFountainY,
        speed: (i % 2 === 0 ? 0.42 : -0.38),
        phase: i * 1.57
      });
    }
    for (let i = 0; i < 4; i++) {
      const r = 1.7 + (i % 2) * 1.1;
      specs.push({
        mode: 'orbit',
        cx: 162,
        cz: 48,
        rx: r,
        rz: r,
        figure8: false,
        y: casinoSouthFountainY,
        speed: (i % 2 === 0 ? -0.40 : 0.36),
        phase: i * 1.57 + 0.7
      });
    }

    const count = specs.length; // 48
    const bodyInst = this.#trackInst(new THREE.InstancedMesh(koiBodyGeo, koiMat, count));
    const patternInst = this.#trackInst(new THREE.InstancedMesh(koiPatternGeo, koiMat, count));
    const tailInst = this.#trackInst(new THREE.InstancedMesh(koiTailGeo, koiTailMat, count));

    bodyInst.name = 'FaunaKoiBodies';
    patternInst.name = 'FaunaKoiPatterns';
    tailInst.name = 'FaunaKoiTails';

    for (const inst of [bodyInst, patternInst, tailInst]) {
      inst.frustumCulled = false;
      inst.castShadow = false;
      inst.receiveShadow = false;
      this.#root.add(inst);
    }

    const dummy = this.#dummy;
    for (let i = 0; i < count; i++) {
      const sp = specs[i];
      const pal = koiPalettes[i % koiPalettes.length];
      const scale = 0.88 + (i % 4) * 0.14;

      this.#tmpColor.setHex(pal.body);
      bodyInst.setColorAt(i, this.#tmpColor);
      this.#tmpColor.setHex(pal.pattern);
      patternInst.setColorAt(i, this.#tmpColor);
      this.#tmpColor.setHex(pal.tail);
      tailInst.setColorAt(i, this.#tmpColor);

      this.#evalKoiPos(sp, 0, this.#tmpXZ);
      this.#evalKoiPos(sp, 0.05, this.#tmpXZ2);
      const yaw = Math.atan2(this.#tmpXZ2.x - this.#tmpXZ.x, this.#tmpXZ2.z - this.#tmpXZ.z);

      dummy.position.set(this.#tmpXZ.x, sp.y, this.#tmpXZ.z);
      dummy.rotation.set(0, yaw, 0, 'YXZ');
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      bodyInst.setMatrixAt(i, dummy.matrix);
      patternInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(
        this.#tmpXZ.x - 0.18 * scale * Math.sin(yaw),
        sp.y,
        this.#tmpXZ.z - 0.18 * scale * Math.cos(yaw)
      );
      dummy.updateMatrix();
      tailInst.setMatrixAt(i, dummy.matrix);

      this.#koi.push({
        ...sp,
        scale,
        yaw,
        lastX: this.#tmpXZ.x,
        lastZ: this.#tmpXZ.z,
        wagFreq: 7.5 + (i % 4) * 1.1
      });
    }

    for (const inst of [bodyInst, patternInst, tailInst]) {
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    }

    this.#koiBodyInst = bodyInst;
    this.#koiPatternInst = patternInst;
    this.#koiTailInst = tailInst;
  }

  // ---------------------------------------------------------------------------
  // 9. Luciérnagas Mágicas Nocturnas (260 instancias con AdditiveBlending)
  // ---------------------------------------------------------------------------
  #buildFireflies() {
    // Núcleo brillante + suave halo exterior en una sola geometría con colores de vértice
    const core = new THREE.OctahedronGeometry(0.032, 0).toNonIndexed();
    const halo = new THREE.IcosahedronGeometry(0.082, 1).toNonIndexed();

    const cPos = core.getAttribute('position');
    const hPos = halo.getAttribute('position');
    const total = cPos.count + hPos.count;

    const posArr = new Float32Array(total * 3);
    const colArr = new Float32Array(total * 3);

    let off = 0;
    for (let i = 0; i < cPos.count; i++) {
      posArr[off] = cPos.getX(i);
      posArr[off + 1] = cPos.getY(i);
      posArr[off + 2] = cPos.getZ(i);
      colArr[off] = 1.0;
      colArr[off + 1] = 1.0;
      colArr[off + 2] = 1.0;
      off += 3;
    }
    for (let i = 0; i < hPos.count; i++) {
      posArr[off] = hPos.getX(i);
      posArr[off + 1] = hPos.getY(i);
      posArr[off + 2] = hPos.getZ(i);
      colArr[off] = 0.36;
      colArr[off + 1] = 0.32;
      colArr[off + 2] = 0.35;
      off += 3;
    }
    core.dispose();
    halo.dispose();

    const fireflyGeo = this.#trackGeo(new THREE.BufferGeometry());
    fireflyGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    fireflyGeo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    fireflyGeo.computeBoundingSphere();

    const fireflyMat = this.#trackMat(new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    }));
    this.#fireflyMat = fireflyMat;

    const paletteRGB = [
      [1.0, 0.87, 0.36], // Dorado imperial
      [1.0, 0.94, 0.58], // Ámbar estelar
      [1.0, 0.58, 0.84], // Rosa mágico
      [1.0, 0.74, 0.90]  // Rosa perlado
    ];

    const anchors = [];
    // 75 sobre el Río Cristalino y sus riberas
    for (let i = 0; i < 75; i++) {
      const z = -70 + (i / 74) * 104;
      const side = ((i * 7) % 11 - 5) * 1.15;
      anchors.push([riverCenterX(z) + side, z]);
    }
    // 55 sobre el Lago de los Cisnes (106, 45) y Estanque Este (46, 26)
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2 + (i % 3) * 0.2;
      const rMul = 0.45 + ((i * 3) % 7) * 0.09;
      anchors.push([106 + Math.cos(a) * 20.5 * rMul, 45 + Math.sin(a) * 12.0 * rMul]);
    }
    for (let i = 0; i < 15; i++) {
      const a = (i / 15) * Math.PI * 2;
      anchors.push([46 + Math.cos(a) * 9.5, 26 + Math.sin(a) * 7.2]);
    }
    // 75 en los Jardines VIP del Casino, Glorietas VIP y Fuentes del Bulevar
    for (let i = 0; i < 63; i++) {
      const a = (i / 63) * Math.PI * 2;
      const r = 43 + (i % 5) * 6.8;
      const fx = Math.min(218, 162 + Math.cos(a) * r);
      const fz = Math.max(-76, Math.min(58, Math.sin(a) * r));
      anchors.push([fx, fz]);
    }
    for (let i = 0; i < 12; i++) {
      const isNorth = i % 2 === 0;
      const base = i < 6 ? [80, isNorth ? -10.5 : 10.5] : [208, isNorth ? -22 : 22];
      const a = i * 1.05;
      anchors.push([base[0] + Math.cos(a) * 4.2, base[1] + Math.sin(a) * 4.2]);
    }
    // 55 en el Bosque de Cerezos SO, Arroyo SO y Bosque NO
    for (let i = 0; i < 32; i++) {
      const a = i * 2.399;
      const r = 4.0 + (i % 6) * 4.2;
      anchors.push([-56 + Math.cos(a) * r, 35 + Math.sin(a) * (r * 0.65)]);
    }
    for (let i = 0; i < 23; i++) {
      const a = i * 2.399;
      const r = 4.0 + (i % 5) * 4.4;
      anchors.push([-52 + Math.cos(a) * r, -34 + Math.sin(a) * (r * 0.7)]);
    }

    const count = anchors.length; // 260
    const inst = this.#trackInst(new THREE.InstancedMesh(fireflyGeo, fireflyMat, count));
    inst.name = 'FaunaMagicFireflies';
    inst.frustumCulled = false;
    inst.castShadow = false;
    inst.receiveShadow = false;
    inst.renderOrder = 2;
    this.#root.add(inst);

    const dummy = this.#dummy;
    for (let i = 0; i < count; i++) {
      const [ax, az] = anchors[i];
      const [r, g, b] = paletteRGB[i % paletteRGB.length];
      const baseY = 0.52 + (i % 7) * 0.30;
      const baseScale = 0.85 + (i % 4) * 0.18;

      dummy.position.set(ax, baseY, az);
      dummy.rotation.set(0, 0, 0, 'YXZ');
      dummy.scale.setScalar(baseScale * this.#fireflyScaleMul);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);

      this.#tmpColor.setRGB(r, g, b);
      inst.setColorAt(i, this.#tmpColor);

      this.#fireflies.push({
        ax,
        az,
        baseY,
        x: ax,
        z: az,
        driftRadius: 0.9 + (i % 5) * 0.42,
        yAmp: 0.22 + (i % 4) * 0.11,
        wanderSpeed: 0.32 + (i % 6) * 0.08,
        blinkFreq: 1.7 + (i % 7) * 0.38,
        blinkPhase: i * 1.618,
        phase: i * 0.87,
        baseScale,
        r,
        g,
        b
      });
    }

    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    this.#fireflyInst = inst;
  }

  // ---------------------------------------------------------------------------
  // Utilidades Matemáticas sin Asignaciones (GC-Free)
  // ---------------------------------------------------------------------------
  #lerpAngle(a, b, t) {
    let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }

  #angleDiff(a, b) {
    let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
  }

  #pickClearingTarget(homeX, homeZ, maxRadius, seed, out) {
    const a = (Math.sin(seed * 43.17) * 0.5 + 0.5) * Math.PI * 2;
    const r = (Math.cos(seed * 19.73) * 0.5 + 0.5) * maxRadius;
    out.x = homeX + Math.cos(a) * r;
    out.z = homeZ + Math.sin(a) * r;
  }

  #evalSwanPos(s, timeVal, out) {
    const a = timeVal * s.speed + s.phase;
    if (s.mode === 'river') {
      const zMid = (s.zMin + s.zMax) * 0.5;
      const zAmp = (s.zMax - s.zMin) * 0.5;
      const z = zMid + Math.sin(a) * zAmp;
      out.x = riverCenterX(z) + Math.cos(a) * s.laneOffset;
      out.z = z;
      return;
    }
    out.x = s.cx + Math.cos(a) * s.rx;
    out.z = s.cz + (s.figure8 ? Math.sin(a * 2) * 0.65 : Math.sin(a)) * s.rz;
  }

  #evalKoiPos(k, timeVal, out) {
    const a = timeVal * k.speed + k.phase;
    if (k.mode === 'river') {
      const z = k.zMid + Math.sin(a) * k.zAmp;
      out.x = riverCenterX(z) + Math.cos(a * 1.5) * k.laneAmp;
      out.z = z;
      return;
    }
    out.x = k.cx + Math.cos(a) * k.rx;
    out.z = k.cz + (k.figure8 ? Math.sin(a * 2) * 0.68 : Math.sin(a)) * k.rz;
  }

  // ---------------------------------------------------------------------------
  // Bucle Principal 100% GC-Free con LOD Estricto (<45u 60Hz, 45-85u 20Hz, >85u pausa)
  // ---------------------------------------------------------------------------
  update(delta, elapsed, playerPos = null, isPlayerRunning = false) {
    const dt = Math.min(delta, 0.1);
    const midDt = Math.min(dt * 3, 0.25);
    const t = elapsed ?? 0;
    const hasPlayer = playerPos !== null;
    const dummy = this.#dummy;
    const frameCount = (this.#frameCount + 1) % 30000;
    this.#frameCount = frameCount;

    // Detección pasiva de tema si aún no se invocó applyTheme(theme) explícitamente
    if (!this.#explicitThemeApplied && this.#scene?.fog?.color) {
      const fr = this.#scene.fog.color.r;
      const fg = this.#scene.fog.color.g;
      if (fr !== this.#lastFogR || fg !== this.#lastFogG) {
        this.#lastFogR = fr;
        this.#lastFogG = fg;
        if (fr < 0.35) this.#applyFireflyPreset('gala_imperial');
        else if (fg < 0.85) this.#applyFireflyPreset('jardines_perla');
        else this.#applyFireflyPreset('palacio_cristal');
      }
    }

    // 1. Mariposas de colores
    let butterflyDirty = false;
    for (let i = 0; i < this.#butterflies.length; i++) {
      const b = this.#butterflies[i];
      if (hasPlayer) {
        const dxp = b.x - playerPos.x;
        const dzp = b.z - playerPos.z;
        const distSq = dxp * dxp + dzp * dzp;
        if (distSq > FAR_LOD_DIST_SQ) continue;
        if (distSq >= NEAR_LOD_DIST_SQ && (frameCount + i) % 3 !== 0) continue;
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
      dummy.rotation.set(0, b.yaw, 0, 'YXZ');
      dummy.scale.setScalar(b.scale);
      dummy.updateMatrix();
      this.#butterflyBodyInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(nx - wingOffset * cosY, ny, nz + wingOffset * sinY);
      dummy.rotation.set(0, b.yaw, -flap, 'YXZ');
      dummy.updateMatrix();
      this.#butterflyLeftWingInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(nx + wingOffset * cosY, ny, nz - wingOffset * sinY);
      dummy.rotation.set(0, b.yaw, flap, 'YXZ');
      dummy.updateMatrix();
      this.#butterflyRightWingInst.setMatrixAt(i, dummy.matrix);

      butterflyDirty = true;
    }
    if (butterflyDirty) {
      this.#butterflyBodyInst.instanceMatrix.needsUpdate = true;
      this.#butterflyLeftWingInst.instanceMatrix.needsUpdate = true;
      this.#butterflyRightWingInst.instanceMatrix.needsUpdate = true;
    }

    // 2. Libélulas cristalinas (vuelo rasante con paradas y dardos rápidos)
    let dragonflyDirty = false;
    for (let i = 0; i < this.#dragonflies.length; i++) {
      const df = this.#dragonflies[i];
      let stepDt = dt;
      if (hasPlayer) {
        const dxp = df.x - playerPos.x;
        const dzp = df.z - playerPos.z;
        const distSq = dxp * dxp + dzp * dzp;
        if (distSq > FAR_LOD_DIST_SQ) continue;
        if (distSq >= NEAR_LOD_DIST_SQ) {
          if ((frameCount + i) % 3 !== 0) continue;
          stepDt = midDt;
        }
      }

      if (df.state === 'hover') {
        df.timer -= stepDt;
        df.y = df.baseY + Math.sin(t * 5.2 + df.phase) * 0.045;
        if (df.timer <= 0) {
          df.state = 'dart';
          df.dartTime = 0;
          df.dartDuration = 0.28 + (df.phase % 0.22);
          df.startX = df.x;
          df.startZ = df.z;
          const seed = t * 1.9 + df.phase;
          const ang = (Math.sin(seed * 31.7) * 0.5 + 0.5) * Math.PI * 2;
          const rad = 0.35 + (Math.cos(seed * 17.3) * 0.5 + 0.5) * 0.65;
          const tz = df.cz + Math.sin(ang) * df.rz * rad;
          const tx = (df.mode === 'river' ? riverCenterX(tz) : df.cx) + Math.cos(ang) * df.rx * rad;
          df.targetX = tx;
          df.targetZ = tz;
          if ((tx - df.x) * (tx - df.x) + (tz - df.z) * (tz - df.z) > 1e-4) {
            df.yaw = Math.atan2(tx - df.x, tz - df.z);
          }
        }
      } else {
        df.dartTime += stepDt;
        const p = Math.min(1, df.dartTime / df.dartDuration);
        const smooth = p * p * (3 - 2 * p);
        df.x = THREE.MathUtils.lerp(df.startX, df.targetX, smooth);
        df.z = THREE.MathUtils.lerp(df.startZ, df.targetZ, smooth);
        df.y = df.baseY + Math.sin(p * Math.PI) * 0.09;
        if (p >= 1) {
          df.state = 'hover';
          df.timer = 0.55 + (df.phase % 1.15);
        }
      }

      const flap = Math.sin(t * df.flapFreq + df.phase) * 0.52;
      const pitch = df.state === 'dart' ? 0.12 : 0.02;

      dummy.position.set(df.x, df.y, df.z);
      dummy.rotation.set(pitch, df.yaw, 0, 'YXZ');
      dummy.scale.setScalar(df.scale);
      dummy.updateMatrix();
      this.#dragonflyBodyInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(df.x, df.y + 0.012 * df.scale, df.z);
      dummy.rotation.set(pitch, df.yaw, -flap, 'YXZ');
      dummy.updateMatrix();
      this.#dragonflyLeftWingInst.setMatrixAt(i, dummy.matrix);

      dummy.rotation.set(pitch, df.yaw, flap, 'YXZ');
      dummy.updateMatrix();
      this.#dragonflyRightWingInst.setMatrixAt(i, dummy.matrix);

      dragonflyDirty = true;
    }
    if (dragonflyDirty) {
      this.#dragonflyBodyInst.instanceMatrix.needsUpdate = true;
      this.#dragonflyLeftWingInst.instanceMatrix.needsUpdate = true;
      this.#dragonflyRightWingInst.instanceMatrix.needsUpdate = true;
    }

    // 3. Cisnes reales, patitos en formación y ondas en #wakePool
    this.#wakeTimer += dt;
    const emitWake = this.#wakeTimer >= 0.36;
    if (emitWake) this.#wakeTimer = 0;

    let swanDirty = false;
    for (let i = 0; i < this.#swans.length; i++) {
      const s = this.#swans[i];
      let isMidLod = false;
      if (hasPlayer) {
        const dxp = s.lastX - playerPos.x;
        const dzp = s.lastZ - playerPos.z;
        const distSq = dxp * dxp + dzp * dzp;
        if (distSq > FAR_LOD_DIST_SQ) continue;
        if (distSq >= NEAR_LOD_DIST_SQ) {
          if ((frameCount + i) % 3 !== 0) continue;
          isMidLod = true;
        }
      }

      this.#evalSwanPos(s, t, this.#tmpXZ);
      const nx = this.#tmpXZ.x;
      const nz = this.#tmpXZ.z;
      const dx = nx - s.lastX;
      const dz = nz - s.lastZ;
      if (dx * dx + dz * dz > 1e-6) {
        s.yaw = Math.atan2(dx, dz);
      }
      let sy = s.waterY + Math.sin(t * 2.0 + s.phase) * 0.012;
      let pitch = 0;
      let roll = 0;
      if (this.#waterSystem) {
        this.#waterSystem.applyBuoyancy(this.#buoyOut, nx, nz, t, 1.0);
        sy = this.#buoyOut.y + 0.025;
        pitch = this.#buoyOut.pitch;
        roll = this.#buoyOut.roll;
      }
      const neckX = Math.sin(t * 1.4 + s.phase) * 0.085;
      const neckYaw = s.yaw + Math.cos(t * 0.95 + s.phase) * 0.06;

      dummy.position.set(nx, sy, nz);
      dummy.rotation.set(pitch, s.yaw, roll, 'YXZ');
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.#swanBodyInst.setMatrixAt(i, dummy.matrix);

      dummy.rotation.set(neckX + pitch * 0.5, neckYaw, roll * 0.5, 'YXZ');
      dummy.updateMatrix();
      this.#swanNeckInst.setMatrixAt(i, dummy.matrix);
      this.#swanBeakInst.setMatrixAt(i, dummy.matrix);
      this.#swanEyeInst.setMatrixAt(i, dummy.matrix);

      if (emitWake && !isMidLod) {
        this.#spawnWake(nx, sy, nz, 1.15);
        this.#waterSystem?.spawnRipple?.(nx, nz, 0.36);
      }
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
      let isMidLod = false;
      if (hasPlayer) {
        const dxp = d.lastX - playerPos.x;
        const dzp = d.lastZ - playerPos.z;
        const distSq = dxp * dxp + dzp * dzp;
        if (distSq > FAR_LOD_DIST_SQ) continue;
        if (distSq >= NEAR_LOD_DIST_SQ) {
          if ((frameCount + i) % 3 !== 0) continue;
          isMidLod = true;
        }
      }

      const leader = this.#swans[d.leaderIdx];
      this.#evalSwanPos(leader, t - d.lag, this.#tmpXZ);
      this.#evalSwanPos(leader, t - d.lag + 0.05, this.#tmpXZ2);
      const lx = this.#tmpXZ.x;
      const lz = this.#tmpXZ.z;
      const dirX = this.#tmpXZ2.x - lx;
      const dirZ = this.#tmpXZ2.z - lz;
      const len = Math.hypot(dirX, dirZ) || 1;
      const wobble = Math.sin(t * 3.1 + d.phase) * 0.035;
      const side = d.offsetSide + wobble;
      const nx = lx - (dirZ / len) * side;
      const nz = lz + (dirX / len) * side;
      const yaw = Math.atan2(dirX, dirZ);

      dummy.position.set(nx, d.waterY + Math.sin(t * 3.8 + d.phase) * 0.009, nz);
      dummy.rotation.set(0, yaw, Math.sin(t * 4.5 + d.phase) * 0.05, 'YXZ');
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.#duckBodyInst.setMatrixAt(i, dummy.matrix);
      this.#duckBeakInst.setMatrixAt(i, dummy.matrix);

      if (emitWake && !isMidLod && (i % 2 === 0)) {
        this.#spawnWake(nx, leader.waterY + 0.016, nz, 0.52);
      }
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
          dummy.position.set(w.x, w.y, w.z);
          dummy.rotation.set(0, 0, 0, 'YXZ');
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          this.#wakeInst.setMatrixAt(i, dummy.matrix);
        } else {
          activeWakes++;
          dummy.position.set(w.x, w.y, w.z);
          dummy.rotation.set(0, 0, 0, 'YXZ');
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

    // 4. Pajaritos cantores y Palomas Reales blancas
    let birdDirty = false;
    for (let i = 0; i < this.#birds.length; i++) {
      const b = this.#birds[i];
      let stepDt = dt;
      if (hasPlayer) {
        const dxp = b.x - playerPos.x;
        const dzp = b.z - playerPos.z;
        const distSq = dxp * dxp + dzp * dzp;
        if (distSq > FAR_LOD_DIST_SQ) continue;
        if (distSq >= NEAR_LOD_DIST_SQ) {
          if ((frameCount + i) % 3 !== 0) continue;
          stepDt = midDt;
        }
      }

      let flapL = 0.15;
      let flapR = -0.15;
      const sc = b.scale;

      if (b.state === 'perched') {
        b.timer -= stepDt;
        const perch = this.#perchNodes[b.fromIdx];
        b.x = perch.x;
        b.y = perch.y + Math.abs(Math.sin(t * 3.2 + b.phase)) * 0.025 * sc;
        b.z = perch.z;
        b.yaw = Math.sin(t * 2.4 + b.phase) * 0.38;

        if (b.timer <= 0) {
          b.state = 'flying';
          b.flightTime = 0;
          const neighbors = perch.neighbors;
          const pick = Math.floor((Math.sin(t * 7.3 + b.phase) * 0.5 + 0.5) * neighbors.length) % neighbors.length;
          b.toIdx = neighbors[pick];
          const dest = this.#perchNodes[b.toIdx];
          const dist = Math.hypot(dest.x - perch.x, dest.y - perch.y, dest.z - perch.z);
          b.flightDuration = Math.max(1.5, Math.min(4.8, dist / 10.2));
        }
      } else {
        b.flightTime += stepDt;
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
        const flap = Math.sin(t * b.flapFreq + b.phase) * 0.85;
        flapL = -flap;
        flapR = flap;

        if (p >= 1) {
          b.fromIdx = b.toIdx;
          b.state = 'perched';
          b.timer = 2.4 + (b.phase % 3.8);
        }
      }

      const cosY = Math.cos(b.yaw);
      const sinY = Math.sin(b.yaw);

      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(0, b.yaw, 0, 'YXZ');
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      this.#birdBodyInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(b.x + 0.02 * sc * sinY, b.y - 0.02 * sc, b.z + 0.02 * sc * cosY);
      dummy.updateMatrix();
      this.#birdBellyInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(b.x - 0.06 * sc * cosY, b.y + 0.03 * sc, b.z + 0.06 * sc * sinY);
      dummy.rotation.set(0, b.yaw, flapL, 'YXZ');
      dummy.updateMatrix();
      this.#birdLeftWingInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(b.x + 0.06 * sc * cosY, b.y + 0.03 * sc, b.z - 0.06 * sc * sinY);
      dummy.rotation.set(0, b.yaw, flapR, 'YXZ');
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

    // 5. Ciervos blancos imperiales y cervatos (pastan, levantan cabeza y miran al jugador a 6.5..15u, trotan si corres cerca)
    const deerTriggerDist = isPlayerRunning ? 8.2 : 5.2;
    const deerTriggerDistSq = deerTriggerDist * deerTriggerDist;
    const deerLookMinSq = 6.5 * 6.5;
    const deerLookMaxSq = 15.0 * 15.0;
    let deerDirty = false;

    for (let i = 0; i < this.#deer.length; i++) {
      const d = this.#deer[i];
      let stepDt = dt;
      let playerDistSq = Infinity;
      let dxp = 0;
      let dzp = 0;

      if (hasPlayer) {
        dxp = d.x - playerPos.x;
        dzp = d.z - playerPos.z;
        playerDistSq = dxp * dxp + dzp * dzp;
        if (playerDistSq > FAR_LOD_DIST_SQ) continue;
        if (playerDistSq >= NEAR_LOD_DIST_SQ) {
          if ((frameCount + i) % 3 !== 0) continue;
          stepDt = midDt;
        }

        if (playerDistSq < deerTriggerDistSq && d.state !== 'flee') {
          d.state = 'flee';
          d.timer = 2.4;
          const len = Math.sqrt(playerDistSq) || 1;
          let tx = d.x + (dxp / len) * 5.8;
          let tz = d.z + (dzp / len) * 5.8;
          const hdx = tx - d.homeX;
          const hdz = tz - d.homeZ;
          const fromHomeSq = hdx * hdx + hdz * hdz;
          const maxR = d.meadowRadius;
          if (fromHomeSq > maxR * maxR) {
            const fromHome = Math.sqrt(fromHomeSq);
            tx = d.homeX + (hdx / fromHome) * maxR;
            tz = d.homeZ + (hdz / fromHome) * maxR;
          }
          d.targetX = tx;
          d.targetZ = tz;
        }
      }

      const isWatchingPlayer =
        hasPlayer &&
        d.state !== 'flee' &&
        playerDistSq >= deerLookMinSq &&
        playerDistSq <= deerLookMaxSq;

      if (isWatchingPlayer) {
        // Levanta el cuello y gira suavemente cabeza y mirada hacia el jugador
        const angleToPlayer = Math.atan2(-dxp, -dzp);
        d.yaw = this.#lerpAngle(d.yaw, angleToPlayer, Math.min(1, stepDt * 1.4));
        const desiredHeadOffset = THREE.MathUtils.clamp(this.#angleDiff(d.yaw, angleToPlayer), -0.72, 0.72);
        d.headYawOffset = THREE.MathUtils.lerp(d.headYawOffset, desiredHeadOffset, Math.min(1, stepDt * 4.5));
        d.neckRotX = THREE.MathUtils.lerp(
          d.neckRotX,
          -0.06 + Math.sin(t * 1.8 + d.phase) * 0.035,
          Math.min(1, stepDt * 4.8)
        );
        for (let l = 0; l < 4; l++) {
          d.legAngles[l] = THREE.MathUtils.lerp(d.legAngles[l], 0, Math.min(1, stepDt * 6));
        }
      } else {
        d.headYawOffset = THREE.MathUtils.lerp(d.headYawOffset, 0, Math.min(1, stepDt * 4.5));
        d.timer -= stepDt;

        if (d.state === 'graze') {
          const targetGrazeNeck = 0.65 + Math.sin(t * 2.1 + d.phase) * 0.12;
          d.neckRotX = THREE.MathUtils.lerp(d.neckRotX, targetGrazeNeck, Math.min(1, stepDt * 4.5));
          for (let l = 0; l < 4; l++) {
            d.legAngles[l] = THREE.MathUtils.lerp(d.legAngles[l], 0, Math.min(1, stepDt * 6));
          }

          if (d.timer <= 0) {
            d.state = 'wander';
            d.timer = 3.4 + (d.phase % 2.4);
            this.#pickClearingTarget(d.homeX, d.homeZ, d.meadowRadius * 0.78, t + d.phase, this.#tmpXZ);
            d.targetX = this.#tmpXZ.x;
            d.targetZ = this.#tmpXZ.z;
          }
        } else {
          const speed = d.state === 'flee' ? (d.isFawn ? 3.5 : 3.8) : 1.4;
          const dx = d.targetX - d.x;
          const dz = d.targetZ - d.z;
          const distSq = dx * dx + dz * dz;

          if (distSq > 0.25 * 0.25 && d.timer > 0) {
            const dist = Math.sqrt(distSq);
            const desiredYaw = Math.atan2(dx, dz);
            d.yaw = this.#lerpAngle(d.yaw, desiredYaw, Math.min(1, stepDt * 5.5));
            const step = Math.min(dist, speed * stepDt);
            d.x += (dx / dist) * step;
            d.z += (dz / dist) * step;

            if (d.rippleCooldown > 0) d.rippleCooldown -= stepDt;
            if (this.#waterSystem && (!d.rippleCooldown || d.rippleCooldown <= 0)) {
              this.#waterSystem.sampleWater(d.x, d.z, this.#waterSample);
              if (this.#waterSample.inWater && this.#waterSample.depth < 0.7) {
                this.#waterSystem.spawnRipple(d.x, d.z, 0.55);
                d.rippleCooldown = 0.36;
              }
            }

            d.neckRotX = THREE.MathUtils.lerp(d.neckRotX, 0.04, Math.min(1, stepDt * 6));
            const gaitFreq = d.state === 'flee' ? 11.5 : 6.2;
            const swing = Math.sin(t * gaitFreq + d.phase) * 0.44;
            d.legAngles[0] = swing;
            d.legAngles[1] = -swing;
            d.legAngles[2] = -swing;
            d.legAngles[3] = swing;
          } else {
            d.state = 'graze';
            d.timer = 3.2 + (d.phase % 3.0);
          }
        }
      }

      this.#syncDeerInstance(i, d);
      deerDirty = true;
    }
    if (deerDirty) {
      this.#deerTorsoInst.instanceMatrix.needsUpdate = true;
      this.#deerTailInst.instanceMatrix.needsUpdate = true;
      this.#deerSpotsInst.instanceMatrix.needsUpdate = true;
      this.#deerHeadInst.instanceMatrix.needsUpdate = true;
      this.#deerNoseInst.instanceMatrix.needsUpdate = true;
      this.#deerAntlerInst.instanceMatrix.needsUpdate = true;
      this.#deerLegInst.instanceMatrix.needsUpdate = true;
      if (this.#deerShadowInst) this.#deerShadowInst.instanceMatrix.needsUpdate = true;
    }

    // 6. Conejitos pastel (saltitos, orejas vivas y pausa para olfatear)
    const bunnyTriggerDist = isPlayerRunning ? 6.8 : 4.8;
    const bunnyTriggerDistSq = bunnyTriggerDist * bunnyTriggerDist;
    const bunnyFollowDistSq = (bunnyTriggerDist + 1.2) * (bunnyTriggerDist + 1.2);
    let bunnyDirty = false;

    for (let i = 0; i < this.#bunnies.length; i++) {
      const b = this.#bunnies[i];
      let stepDt = dt;
      if (hasPlayer) {
        const dxp = b.x - playerPos.x;
        const dzp = b.z - playerPos.z;
        const distSq = dxp * dxp + dzp * dzp;
        if (distSq > FAR_LOD_DIST_SQ) continue;
        if (distSq >= NEAR_LOD_DIST_SQ) {
          if ((frameCount + i) % 3 !== 0) continue;
          stepDt = midDt;
        }

        if (b.state !== 'flee' && distSq < bunnyTriggerDistSq) {
          b.state = 'flee';
          b.hopTime = 0;
          b.hopDuration = 0.32;
          b.startX = b.x;
          b.startZ = b.z;
          const len = Math.sqrt(distSq) || 1;
          let tx = b.x + (dxp / len) * 3.0;
          let tz = b.z + (dzp / len) * 3.0;
          const hdx = tx - b.homeX;
          const hdz = tz - b.homeZ;
          const fromHomeSq = hdx * hdx + hdz * hdz;
          const maxR = b.maxRadius;
          if (fromHomeSq > maxR * maxR) {
            const fromHome = Math.sqrt(fromHomeSq);
            tx = b.homeX + (hdx / fromHome) * maxR;
            tz = b.homeZ + (hdz / fromHome) * maxR;
          }
          b.targetX = tx;
          b.targetZ = tz;
          b.yaw = Math.atan2(tx - b.x, tz - b.z);
        }
      }

      if (b.state === 'idle') {
        b.timer -= stepDt;
        b.y = 0;
        // Se inclinan suavemente y mueven rápido orejas/hocico al olfatear las flores
        const sniff = Math.sin(t * 13.5 + b.phase);
        b.bodyPitch = 0.08 + sniff * 0.035;
        b.earLX = -0.14 + Math.sin(t * 5.6 + b.phase) * 0.16;
        b.earRX = -0.14 + Math.cos(t * 5.1 + b.phase) * 0.16;

        if (b.timer <= 0) {
          b.state = 'hop';
          b.hopTime = 0;
          b.hopDuration = 0.44;
          b.startX = b.x;
          b.startZ = b.z;
          this.#pickClearingTarget(b.homeX, b.homeZ, b.maxRadius, t * 1.3 + b.phase, this.#tmpXZ);
          b.targetX = b.x + (this.#tmpXZ.x - b.x) * 0.55;
          b.targetZ = b.z + (this.#tmpXZ.z - b.z) * 0.55;
          b.yaw = Math.atan2(b.targetX - b.x, b.targetZ - b.z);
        }
      } else {
        b.hopTime += stepDt;
        const p = Math.min(1, b.hopTime / b.hopDuration);
        b.x = THREE.MathUtils.lerp(b.startX, b.targetX, p);
        b.z = THREE.MathUtils.lerp(b.startZ, b.targetZ, p);
        const hopHeight = b.state === 'flee' ? 0.45 : 0.27;
        b.y = Math.sin(p * Math.PI) * hopHeight;
        b.bodyPitch = Math.cos(p * Math.PI) * -0.22;
        b.earLX = -0.28;
        b.earRX = -0.28;

        if (p >= 1) {
          b.y = 0;
          b.bodyPitch = 0;
          if (b.state === 'flee' && hasPlayer) {
            const dxp = b.x - playerPos.x;
            const dzp = b.z - playerPos.z;
            const distSq = dxp * dxp + dzp * dzp;
            if (distSq < bunnyFollowDistSq) {
              const len = Math.sqrt(distSq) || 1;
              b.hopTime = 0;
              b.startX = b.x;
              b.startZ = b.z;
              let tx = b.x + (dxp / len) * 2.4;
              let tz = b.z + (dzp / len) * 2.4;
              const hdx = tx - b.homeX;
              const hdz = tz - b.homeZ;
              const fromHomeSq = hdx * hdx + hdz * hdz;
              const maxR = b.maxRadius;
              if (fromHomeSq > maxR * maxR) {
                const fromHome = Math.sqrt(fromHomeSq);
                tx = b.homeX + (hdx / fromHome) * maxR;
                tz = b.homeZ + (hdz / fromHome) * maxR;
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
          b.timer = 1.3 + (b.phase % 2.3);
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
      if (this.#bunnyShadowInst) this.#bunnyShadowInst.instanceMatrix.needsUpdate = true;
    }

    // 7. Ardillas reales estilizadas (saltitos ágiles y cola esponjosa agitándose rítmicamente)
    const squirrelFleeSq = 5.5 * 5.5;
    let squirrelDirty = false;
    for (let i = 0; i < this.#squirrels.length; i++) {
      const s = this.#squirrels[i];
      let stepDt = dt;
      if (hasPlayer) {
        const dxp = s.x - playerPos.x;
        const dzp = s.z - playerPos.z;
        const distSq = dxp * dxp + dzp * dzp;
        if (distSq > FAR_LOD_DIST_SQ) continue;
        if (distSq >= NEAR_LOD_DIST_SQ) {
          if ((frameCount + i) % 3 !== 0) continue;
          stepDt = midDt;
        }

        if (distSq < squirrelFleeSq && s.state !== 'scamper') {
          s.state = 'scamper';
          s.timer = 1.4;
          const len = Math.sqrt(distSq) || 1;
          let tx = s.x + (dxp / len) * 4.2;
          let tz = s.z + (dzp / len) * 4.2;
          const hdx = tx - s.homeX;
          const hdz = tz - s.homeZ;
          const fromHomeSq = hdx * hdx + hdz * hdz;
          if (fromHomeSq > 4.8 * 4.8) {
            const fromHome = Math.sqrt(fromHomeSq);
            tx = s.homeX + (hdx / fromHome) * 4.8;
            tz = s.homeZ + (hdz / fromHome) * 4.8;
          }
          s.targetX = tx;
          s.targetZ = tz;
        }
      }

      s.timer -= stepDt;
      if (s.state === 'perk') {
        s.y = 0;
        // Postura erguida vivaz y agitación rítmica de la cola en S
        s.bodyPitch = -0.22 + Math.sin(t * 7.5 + s.phase) * 0.04;
        s.tailPitch = Math.sin(t * 9.5 + s.phase) * 0.24 + Math.sin(t * 19.0 + s.phase) * 0.08;
        s.tailWagZ = Math.cos(t * 6.4 + s.phase) * 0.10;

        if (s.timer <= 0) {
          s.state = 'scamper';
          s.timer = 1.1 + (s.phase % 0.9);
          this.#pickClearingTarget(s.homeX, s.homeZ, 4.4, t * 1.7 + s.phase, this.#tmpXZ);
          s.targetX = this.#tmpXZ.x;
          s.targetZ = this.#tmpXZ.z;
        }
      } else {
        const dx = s.targetX - s.x;
        const dz = s.targetZ - s.z;
        const distSq = dx * dx + dz * dz;
        if (distSq > 0.18 * 0.18 && s.timer > 0) {
          const dist = Math.sqrt(distSq);
          s.yaw = this.#lerpAngle(s.yaw, Math.atan2(dx, dz), Math.min(1, stepDt * 9.0));
          const step = Math.min(dist, 3.1 * stepDt);
          s.x += (dx / dist) * step;
          s.z += (dz / dist) * step;

          const bound = Math.abs(Math.sin(t * 15.0 + s.phase));
          s.y = bound * 0.16;
          s.bodyPitch = 0.20 - bound * 0.26;
          s.tailPitch = -0.35 + Math.sin(t * 15.0 + s.phase) * 0.22;
          s.tailWagZ = Math.sin(t * 10.0 + s.phase) * 0.08;
        } else {
          s.state = 'perk';
          s.timer = 1.0 + (s.phase % 1.8);
        }
      }

      this.#syncSquirrelInstance(i, s);
      squirrelDirty = true;
    }
    if (squirrelDirty) {
      this.#squirrelBodyInst.instanceMatrix.needsUpdate = true;
      this.#squirrelBellyInst.instanceMatrix.needsUpdate = true;
      this.#squirrelDarkInst.instanceMatrix.needsUpdate = true;
      this.#squirrelTailInst.instanceMatrix.needsUpdate = true;
    }

    // 8. Peces Koi imperiales (nado curvo suave bajo el agua + aleta caudal articulada)
    let koiDirty = false;
    for (let i = 0; i < this.#koi.length; i++) {
      const k = this.#koi[i];
      if (hasPlayer) {
        const dxp = k.lastX - playerPos.x;
        const dzp = k.lastZ - playerPos.z;
        const distSq = dxp * dxp + dzp * dzp;
        if (distSq > FAR_LOD_DIST_SQ) continue;
        if (distSq >= NEAR_LOD_DIST_SQ && (frameCount + i) % 3 !== 0) continue;
      }

      this.#evalKoiPos(k, t, this.#tmpXZ);
      const nx = this.#tmpXZ.x;
      const nz = this.#tmpXZ.z;
      const dx = nx - k.lastX;
      const dz = nz - k.lastZ;
      if (dx * dx + dz * dz > 1e-6) {
        k.yaw = Math.atan2(dx, dz);
      }
      k.lastX = nx;
      k.lastZ = nz;

      const swimWave = t * k.wagFreq + k.phase;
      const bodyYaw = k.yaw + Math.sin(swimWave) * 0.085;
      const tailWag = Math.sin(swimWave - 1.05) * 0.44;
      const sc = k.scale;

      dummy.position.set(nx, k.y, nz);
      dummy.rotation.set(0, bodyYaw, Math.sin(swimWave) * 0.04, 'YXZ');
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      this.#koiBodyInst.setMatrixAt(i, dummy.matrix);
      this.#koiPatternInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(
        nx - 0.18 * sc * Math.sin(bodyYaw),
        k.y,
        nz - 0.18 * sc * Math.cos(bodyYaw)
      );
      dummy.rotation.set(0, bodyYaw + tailWag, 0, 'YXZ');
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      this.#koiTailInst.setMatrixAt(i, dummy.matrix);

      koiDirty = true;
    }
    if (koiDirty) {
      this.#koiBodyInst.instanceMatrix.needsUpdate = true;
      this.#koiPatternInst.instanceMatrix.needsUpdate = true;
      this.#koiTailInst.instanceMatrix.needsUpdate = true;
    }

    // 9. Luciérnagas mágicas nocturnas (flotación orgánica y pulso sinusoidal individual)
    if (this.#fireflyInst) {
      let fireflyDirty = false;
      const scaleMul = this.#fireflyScaleMul;
      const pulseAmp = this.#fireflyPulseAmp;

      for (let i = 0; i < this.#fireflies.length; i++) {
        const f = this.#fireflies[i];
        if (hasPlayer) {
          const dxp = f.x - playerPos.x;
          const dzp = f.z - playerPos.z;
          const distSq = dxp * dxp + dzp * dzp;
          if (distSq > FAR_LOD_DIST_SQ) continue;
          if (distSq >= NEAR_LOD_DIST_SQ && (frameCount + i) % 3 !== 0) continue;
        }

        const wa = t * f.wanderSpeed + f.phase;
        const nx = f.ax + Math.sin(wa) * f.driftRadius + Math.cos(wa * 1.63) * 0.35;
        const nz = f.az + Math.cos(wa * 0.87) * f.driftRadius + Math.sin(wa * 1.41) * 0.35;
        const ny = f.baseY + Math.sin(t * 1.35 + f.phase) * f.yAmp;
        f.x = nx;
        f.z = nz;

        const wave = 0.5 + 0.5 * Math.sin(t * f.blinkFreq + f.blinkPhase);
        const glow = 0.14 + 0.86 * wave * wave;
        const s = f.baseScale * scaleMul * (0.42 + glow * pulseAmp);

        dummy.position.set(nx, ny, nz);
        dummy.rotation.set(0, 0, 0, 'YXZ');
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        this.#fireflyInst.setMatrixAt(i, dummy.matrix);

        this.#tmpColor.setRGB(f.r * glow, f.g * glow, f.b * glow);
        this.#fireflyInst.setColorAt(i, this.#tmpColor);

        fireflyDirty = true;
      }

      if (fireflyDirty) {
        this.#fireflyInst.instanceMatrix.needsUpdate = true;
        if (this.#fireflyInst.instanceColor) {
          this.#fireflyInst.instanceColor.needsUpdate = true;
        }
      }
    }
  }

  dispose() {
    if (this.#root) {
      this.#scene.remove(this.#root);
      this.#root = null;
    }

    for (const inst of this.#instancedMeshes) {
      inst?.dispose?.();
    }
    this.#instancedMeshes.length = 0;

    this.#butterflyBodyInst = null;
    this.#butterflyLeftWingInst = null;
    this.#butterflyRightWingInst = null;
    this.#dragonflyBodyInst = null;
    this.#dragonflyLeftWingInst = null;
    this.#dragonflyRightWingInst = null;
    this.#swanBodyInst = null;
    this.#swanNeckInst = null;
    this.#swanBeakInst = null;
    this.#swanEyeInst = null;
    this.#duckBodyInst = null;
    this.#duckBeakInst = null;
    this.#wakeInst = null;
    this.#birdBodyInst = null;
    this.#birdBellyInst = null;
    this.#birdLeftWingInst = null;
    this.#birdRightWingInst = null;
    this.#deerTorsoInst = null;
    this.#deerTailInst = null;
    this.#deerSpotsInst = null;
    this.#deerHeadInst = null;
    this.#deerNoseInst = null;
    this.#deerAntlerInst = null;
    this.#deerLegInst = null;
    this.#deerShadowInst = null;
    this.#bunnyBodyInst = null;
    this.#bunnyTailInst = null;
    this.#bunnyNoseInst = null;
    this.#bunnyEarInst = null;
    this.#bunnyShadowInst = null;
    this.#shadowGeo = null;
    this.#shadowMat = null;
    this.#squirrelBodyInst = null;
    this.#squirrelBellyInst = null;
    this.#squirrelDarkInst = null;
    this.#squirrelTailInst = null;
    this.#koiBodyInst = null;
    this.#koiPatternInst = null;
    this.#koiTailInst = null;
    this.#fireflyInst = null;
    this.#fireflyMat = null;

    for (const g of this.#geometries) g.dispose();
    for (const m of this.#materials) m.dispose();
    this.#geometries.length = 0;
    this.#materials.length = 0;

    this.#butterflies.length = 0;
    this.#dragonflies.length = 0;
    this.#swans.length = 0;
    this.#ducklings.length = 0;
    this.#wakes.length = 0;
    this.#wakePool.length = 0;
    this.#birds.length = 0;
    this.#perchNodes.length = 0;
    this.#deer.length = 0;
    this.#bunnies.length = 0;
    this.#squirrels.length = 0;
    this.#koi.length = 0;
    this.#fireflies.length = 0;
  }
}
