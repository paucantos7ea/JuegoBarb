import * as THREE from 'three';

const CX = -18.6;
const CZ = 17.0;
const PLATFORM_Y = 0.36;
const R_OUTER = 9.0;
const R_INNER = 8.3;
const R_WALL = 8.55;
const WALL_TOP_Y = 1.35;
const DOME_APEX_Y = 15.1;
const LANTERN_TOP_Y = 16.5;
const ENTRANCE_HALF_ANG = 0.31;

const SLOT_SYMBOLS = Object.freeze(['crown', 'diamond', 'rose', 'star', 'seven']);

const SLOT_SPECS = Object.freeze([
  { id: 'slot_1', x: -22.2, z: 12.2, rotY: 0.28 },
  { id: 'slot_2', x: -19.8, z: 11.4, rotY: 0.10 },
  { id: 'slot_3', x: -17.4, z: 11.4, rotY: -0.10 },
  { id: 'slot_4', x: -15.0, z: 12.2, rotY: -0.28 }
]);

const BLACKJACK_SPECS = Object.freeze([
  { id: 'blackjack_1', x: -21.2, z: 22.0, rotY: Math.PI - 0.25 },
  { id: 'blackjack_2', x: -16.0, z: 22.0, rotY: Math.PI + 0.25 }
]);

const FIREWORK_PALETTE = [0xffe066, 0xff6eb4, 0xc47aff, 0x5cf2ff];

/**
 * Constructor arquitectónico de la Cúpula de Cristal del Casino Real y su sistema de fuegos artificiales.
 */
export class CasinoDomeBuilder {
  static DOME_CENTER = Object.freeze({ x: CX, y: 0, z: CZ });

  #scene = null;
  #collision = null;
  #textures = null;
  #root = new THREE.Group();
  #built = false;

  #stations = [];
  #markerRings = [];
  #chandelierSpinners = [];
  #elapsed = 0;

  #geometries = new Set();
  #materials = new Set();
  #ownedTextures = new Set();
  #instancedMeshes = new Set();

  // Estado del sistema VFX de fuegos artificiales
  #fwGroup = new THREE.Group();
  #fwLight = null;
  #fwActive = false;
  #fwTimer = 0;
  #fwSchedule = [];
  #fwRockets = [];
  #fwSparkMax = 1800;
  #fwSparkCount = 0;
  #fwSparkPos = null;
  #fwSparkVel = null;
  #fwSparkCol = null;
  #fwSparkBaseCol = null;
  #fwSparkAge = null;
  #fwSparkLife = null;
  #fwSparkGeo = null;
  #fwTrailMax = 420;
  #fwTrailCount = 0;
  #fwTrailPos = null;
  #fwTrailVel = null;
  #fwTrailCol = null;
  #fwTrailBaseCol = null;
  #fwTrailAge = null;
  #fwTrailLife = null;
  #fwTrailGeo = null;
  #fwFlashEnergy = 0;
  #fwFlashColor = new THREE.Color(0xffe066);

  constructor(sceneOrOpts, arg2, arg3) {
    this.#root.name = 'CasinoDomeRoot';
    this.#assignDependencies(sceneOrOpts, arg2, arg3);
  }

  #assignDependencies(a, b, c) {
    if (a && !a.isObject3D && typeof a === 'object' && a.scene) {
      this.#scene = a.scene || this.#scene;
      this.#collision = a.collision || this.#collision;
      this.#textures = a.textures || this.#textures;
      return;
    }
    if (a && a.isObject3D) this.#scene = a;
    for (const dep of [b, c]) {
      if (!dep) continue;
      if (typeof dep.getTexture === 'function') this.#textures = dep;
      else if (typeof dep.addDiscSurface === 'function') this.#collision = dep;
    }
  }

  init(sceneOrOpts, arg2, arg3) {
    if (sceneOrOpts || arg2 || arg3) {
      this.#assignDependencies(sceneOrOpts, arg2, arg3);
    }
    if (this.#built) return this.#root;
    this.#built = true;

    this.#buildPlatformAndStairs();
    this.#buildPerimeterWalls();
    this.#buildCrystalDomeAndArch();
    this.#buildChandelierAndCarpet();
    this.#buildSlotMachines();
    this.#buildBlackjackTables();
    this.#buildInteractionMarkers();
    this.#initFireworksSystem();

    if (this.#scene && !this.#root.parent) {
      this.#scene.add(this.#root);
    }
    return this.#root;
  }

  build(sceneOrOpts, arg2, arg3) {
    return this.init(sceneOrOpts, arg2, arg3);
  }

  getGroup() {
    return this.#root;
  }

  getStations() {
    return this.#stations;
  }

  getNearestStation(playerPos, maxDist = 2.35) {
    if (!playerPos) return null;
    let best = null;
    let bestDist = maxDist;
    for (const station of this.#stations) {
      const p = station.interactPos;
      const dx = playerPos.x - p.x;
      const dy = (playerPos.y ?? p.y) - p.y;
      const dz = playerPos.z - p.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist <= bestDist) {
        bestDist = dist;
        best = station;
      }
    }
    return best;
  }

  triggerDomeFireworks() {
    this.#fwActive = true;
    this.#fwTimer = 0;
    this.#fwSchedule.length = 0;
    this.#fwRockets.length = 0;
    this.#fwFlashEnergy = 0;

    const totalRockets = 14;
    for (let i = 0; i < totalRockets; i++) {
      const isInterior = i % 2 === 0;
      const delay = (i / (totalRockets - 1)) * 4.75 + (Math.random() - 0.5) * 0.12;
      const angle = (i * 2.39996) + (Math.random() - 0.5) * 0.4;
      const radius = isInterior
        ? 1.5 + Math.random() * 4.2
        : 2.2 + Math.random() * 7.8;
      const targetY = isInterior
        ? 6.5 + Math.random() * 5.7
        : 14.5 + Math.random() * 11.0;

      const startR = isInterior ? Math.min(radius * 0.45, 2.8) : 3.0 + Math.random() * 4.8;
      const startY = isInterior ? 1.1 : 1.4;
      const startX = CX + Math.cos(angle) * startR;
      const startZ = CZ + Math.sin(angle) * startR;

      const targetX = CX + Math.cos(angle) * radius;
      const targetZ = CZ + Math.sin(angle) * radius;

      this.#fwSchedule.push({
        delay: Math.max(0, delay),
        launched: false,
        startX,
        startY,
        startZ,
        targetX,
        targetY,
        targetZ,
        colorHex: FIREWORK_PALETTE[i % FIREWORK_PALETTE.length],
        isInterior
      });
    }
    this.#fwSchedule.sort((a, b) => a.delay - b.delay);
  }

  update(dt = 0.016) {
    const safeDt = Math.min(Math.max(dt, 0), 0.05);
    this.#elapsed += safeDt;

    for (let i = 0; i < this.#chandelierSpinners.length; i++) {
      const sp = this.#chandelierSpinners[i];
      sp.rotation.y += safeDt * (i % 2 === 0 ? 0.35 : -0.28);
    }

    for (let i = 0; i < this.#markerRings.length; i++) {
      const ring = this.#markerRings[i];
      ring.rotation.z += safeDt * 1.1;
      const pulse = 0.94 + 0.08 * Math.sin(this.#elapsed * 3.2 + i * 1.1);
      ring.scale.set(pulse, pulse, 1);
    }

    this.#updateFireworks(safeDt);
  }

  dispose() {
    for (const mesh of this.#instancedMeshes) {
      if (mesh && typeof mesh.dispose === 'function') mesh.dispose();
    }
    this.#instancedMeshes.clear();

    for (const geo of this.#geometries) {
      if (geo && typeof geo.dispose === 'function') geo.dispose();
    }
    this.#geometries.clear();

    for (const mat of this.#materials) {
      if (mat && typeof mat.dispose === 'function') mat.dispose();
    }
    this.#materials.clear();

    for (const tex of this.#ownedTextures) {
      if (tex && typeof tex.dispose === 'function') tex.dispose();
    }
    this.#ownedTextures.clear();

    if (this.#root.parent) {
      this.#root.parent.remove(this.#root);
    }
    this.#root.clear();
    this.#stations.length = 0;
    this.#markerRings.length = 0;
    this.#chandelierSpinners.length = 0;
    this.#fwSchedule.length = 0;
    this.#fwRockets.length = 0;
    this.#fwActive = false;
    this.#built = false;
  }

  // ---------------------------------------------------------------------------
  // Helpers de seguimiento de recursos y texturas
  // ---------------------------------------------------------------------------

  #trackGeo(geo) {
    this.#geometries.add(geo);
    return geo;
  }

  #trackMat(mat) {
    this.#materials.add(mat);
    return mat;
  }

  #trackTex(tex) {
    this.#ownedTextures.add(tex);
    return tex;
  }

  #trackInstanced(mesh) {
    this.#instancedMeshes.add(mesh);
    return mesh;
  }

  #getSharedTexture(key, rx = 1, ry = 1) {
    if (!this.#textures || typeof this.#textures.getTexture !== 'function') return null;
    return this.#textures.getTexture(key, rx, ry);
  }

  #localToWorld(originX, originY, originZ, rotY, lx, ly, lz) {
    const c = Math.cos(rotY);
    const s = Math.sin(rotY);
    return new THREE.Vector3(
      originX + lx * c + lz * s,
      originY + ly,
      originZ - lx * s + lz * c
    );
  }

  #createRoseGoldMat(roughness = 0.2, metalness = 0.88) {
    const tex = this.#getSharedTexture('roseGold', 2, 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xf4c2b8,
      map: tex,
      roughness,
      metalness
    });
    mat.userData.preserveRoughness = true;
    return this.#trackMat(mat);
  }

  #createMarbleMat(key = 'marble', rx = 3, ry = 3, tint = 0xffffff) {
    const tex = this.#getSharedTexture(key, rx, ry);
    return this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: tint,
        map: tex,
        roughness: 0.34,
        metalness: 0.06
      })
    );
  }

  // ---------------------------------------------------------------------------
  // 1. Plataforma circular, escalinata y alfombra exterior
  // ---------------------------------------------------------------------------

  #buildPlatformAndStairs() {
    const group = new THREE.Group();
    group.name = 'DomePlatformAndStairs';

    const marbleMat = this.#createMarbleMat('marble', 6, 6, 0xfff8fb);
    const floorMat = this.#createMarbleMat('marbleFloor', 7, 7, 0xfff7fa);
    const roseGoldMat = this.#createRoseGoldMat(0.22, 0.88);
    const carpetMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd9387f,
        map: this.#getSharedTexture('carpet', 1, 3),
        roughness: 0.82,
        metalness: 0.04
      })
    );

    // Zócalo inferior escalonado (radio 9.0 m)
    const plinthGeo = this.#trackGeo(new THREE.CylinderGeometry(R_OUTER, R_OUTER + 0.14, 0.18, 64));
    const plinth = new THREE.Mesh(plinthGeo, marbleMat);
    plinth.position.set(CX, 0.09, CZ);
    plinth.receiveShadow = true;
    group.add(plinth);

    // Plataforma principal de mármol blanco y rosa (Y = 0.36)
    const deckGeo = this.#trackGeo(new THREE.CylinderGeometry(R_OUTER - 0.1, R_OUTER - 0.05, 0.18, 64));
    const deck = new THREE.Mesh(deckGeo, floorMat);
    deck.position.set(CX, 0.27, CZ);
    deck.receiveShadow = true;
    group.add(deck);

    // Moldura oro-rosa perimetral interior en R_INNER = 8.3 m
    const innerRingGeo = this.#trackGeo(new THREE.RingGeometry(R_INNER - 0.08, R_INNER + 0.08, 72));
    innerRingGeo.rotateX(-Math.PI / 2);
    const innerRing = new THREE.Mesh(innerRingGeo, roseGoldMat);
    innerRing.position.set(CX, PLATFORM_Y + 0.004, CZ);
    group.add(innerRing);

    // Escalinata monumental al Este (+X): X in [-9.8, -6.2], Z in [14.8, 19.2]
    const stepCount = 5;
    const xStart = -6.2;
    const xEnd = -9.8;
    const stepRun = (xStart - xEnd) / stepCount;
    const stepRise = PLATFORM_Y / stepCount;

    for (let i = 0; i < stepCount; i++) {
      const h = (i + 1) * stepRise;
      const minX = xStart - (i + 1) * stepRun;
      const stepW = stepRun + 0.06;
      const stepGeo = this.#trackGeo(new THREE.BoxGeometry(stepW, h, 4.42));
      const stepMesh = new THREE.Mesh(stepGeo, marbleMat);
      stepMesh.position.set(minX + stepW * 0.5, h * 0.5, CZ);
      stepMesh.receiveShadow = true;
      stepMesh.castShadow = true;
      group.add(stepMesh);

      // Ribete oro-rosa en el borde frontal de cada peldaño
      const lipGeo = this.#trackGeo(new THREE.BoxGeometry(0.05, 0.035, 4.44));
      const lip = new THREE.Mesh(lipGeo, roseGoldMat);
      lip.position.set(minX + stepW - 0.02, h - 0.015, CZ);
      group.add(lip);
    }

    // Alfombra imperial exterior sobre la escalinata
    const rampLen = Math.hypot(xStart - xEnd, PLATFORM_Y);
    const rampSlope = Math.atan2(PLATFORM_Y, xStart - xEnd);
    const runnerGeo = this.#trackGeo(new THREE.BoxGeometry(rampLen + 0.25, 0.022, 2.5));
    const runner = new THREE.Mesh(runnerGeo, carpetMat);
    runner.position.set((xStart + xEnd) * 0.5, PLATFORM_Y * 0.5 + 0.025, CZ);
    runner.rotation.z = -rampSlope;
    runner.receiveShadow = true;
    group.add(runner);

    // Balaustradas laterales de la escalinata (fuera de Z in [14.8, 19.2])
    const cheekGeo = this.#trackGeo(new THREE.BoxGeometry(3.85, 0.52, 0.34));
    const finialGeo = this.#trackGeo(new THREE.SphereGeometry(0.16, 16, 12));
    for (const side of [-1, 1]) {
      const zSide = CZ + side * 2.39;
      const cheek = new THREE.Mesh(cheekGeo, marbleMat);
      cheek.position.set(-8.0, 0.26, zSide);
      cheek.castShadow = true;
      cheek.receiveShadow = true;
      group.add(cheek);

      const postGeo = this.#trackGeo(new THREE.CylinderGeometry(0.18, 0.21, 0.88, 16));
      const post = new THREE.Mesh(postGeo, marbleMat);
      post.position.set(-6.15, 0.44, zSide);
      post.castShadow = true;
      group.add(post);

      const cap = new THREE.Mesh(finialGeo, roseGoldMat);
      cap.position.set(-6.15, 0.96, zSide);
      group.add(cap);
    }

    this.#root.add(group);

    // Colisiones exactas especificadas
    if (this.#collision) {
      this.#collision.addDiscSurface(CX, CZ, 8.9, PLATFORM_Y);
      this.#collision.addCylinderCollider(CX, CZ, 8.95, 0, 0.25);
      this.#collision.addRampSurface(-10.2, -6.0, 14.8, 19.2, 'x', -6.2, -9.8, 0.0, PLATFORM_Y);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Muretes perimetrales curvos y pilares oro-rosa
  // ---------------------------------------------------------------------------

  #buildPerimeterWalls() {
    const group = new THREE.Group();
    group.name = 'DomePerimeterWalls';

    const marbleMat = this.#createMarbleMat('marble', 2, 1, 0xfff5f9);
    const roseGoldMat = this.#createRoseGoldMat(0.2, 0.88);

    const startAng = ENTRANCE_HALF_ANG;
    const endAng = Math.PI * 2 - ENTRANCE_HALF_ANG;
    const segments = 22;
    const stepAng = (endAng - startAng) / segments;
    const wallHeight = WALL_TOP_Y - PLATFORM_Y;

    // Pilares oro-rosa instanciados en las juntas
    const pillarGeo = this.#trackGeo(new THREE.CylinderGeometry(0.14, 0.16, wallHeight + 0.08, 14));
    const capGeo = this.#trackGeo(new THREE.CylinderGeometry(0.19, 0.15, 0.09, 14));
    const pillarInst = this.#trackInstanced(new THREE.InstancedMesh(pillarGeo, roseGoldMat, segments + 1));
    const capInst = this.#trackInstanced(new THREE.InstancedMesh(capGeo, roseGoldMat, segments + 1));
    const dummy = new THREE.Object3D();

    for (let i = 0; i <= segments; i++) {
      const ang = startAng + i * stepAng;
      const px = CX + Math.cos(ang) * R_WALL;
      const pz = CZ + Math.sin(ang) * R_WALL;

      dummy.position.set(px, PLATFORM_Y + (wallHeight + 0.08) * 0.5, pz);
      dummy.rotation.set(0, -ang, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      pillarInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(px, WALL_TOP_Y + 0.04, pz);
      dummy.updateMatrix();
      capInst.setMatrixAt(i, dummy.matrix);
    }
    pillarInst.instanceMatrix.needsUpdate = true;
    capInst.instanceMatrix.needsUpdate = true;
    group.add(pillarInst, capInst);

    // Paños curvos de murete bajo entre pilares + remate superior oro-rosa
    const chordLen = 2 * R_WALL * Math.sin(stepAng * 0.5) + 0.06;
    const wallGeo = this.#trackGeo(new THREE.BoxGeometry(0.26, wallHeight, chordLen));
    const railGeo = this.#trackGeo(new THREE.BoxGeometry(0.32, 0.07, chordLen + 0.04));
    const wallInst = this.#trackInstanced(new THREE.InstancedMesh(wallGeo, marbleMat, segments));
    const railInst = this.#trackInstanced(new THREE.InstancedMesh(railGeo, roseGoldMat, segments));

    for (let i = 0; i < segments; i++) {
      const midAng = startAng + (i + 0.5) * stepAng;
      const rMid = R_WALL * Math.cos(stepAng * 0.5);
      const wx = CX + Math.cos(midAng) * rMid;
      const wz = CZ + Math.sin(midAng) * rMid;

      dummy.position.set(wx, PLATFORM_Y + wallHeight * 0.5, wz);
      dummy.rotation.set(0, -midAng, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      wallInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(wx, WALL_TOP_Y + 0.02, wz);
      dummy.updateMatrix();
      railInst.setMatrixAt(i, dummy.matrix);
    }
    wallInst.instanceMatrix.needsUpdate = true;
    railInst.instanceMatrix.needsUpdate = true;
    group.add(wallInst, railInst);

    this.#root.add(group);

    // Colisionadores perimetrales continuos (dejan libre |ang| < 0.31 rad)
    if (this.#collision) {
      const colSteps = 48;
      const colStart = ENTRANCE_HALF_ANG + 0.02;
      const colEnd = Math.PI * 2 - ENTRANCE_HALF_ANG - 0.02;
      for (let i = 0; i <= colSteps; i++) {
        const ang = colStart + (i / colSteps) * (colEnd - colStart);
        const cx = CX + Math.cos(ang) * R_WALL;
        const cz = CZ + Math.sin(ang) * R_WALL;
        this.#collision.addCylinderCollider(cx, cz, 0.32, PLATFORM_Y, 3.2);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Cúpula de cristal geodésica/nervada, linterna y Arco Monumental
  // ---------------------------------------------------------------------------

  #buildCrystalDomeAndArch() {
    const group = new THREE.Group();
    group.name = 'CrystalDomeStructure';

    const roseGoldMat = this.#createRoseGoldMat(0.18, 0.9);
    const marbleMat = this.#createMarbleMat('marble', 2, 3, 0xfff8fb);

    const domeHeight = DOME_APEX_Y - WALL_TOP_Y; // 13.75 m
    const scaleY = domeHeight / R_WALL;          // ~1.608
    const oculusPhi = 0.14;

    // Casquete principal de cristal translúcido calibrado (sin flash blanco)
    const crystalTex = this.#getSharedTexture('stainedCrystal', 8, 3);
    const glassMat = this.#trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0xffedf7,
        map: crystalTex,
        emissive: 0xffb2d8,
        emissiveIntensity: 0.22,
        transparent: true,
        opacity: 0.38,
        roughness: 0.08,
        metalness: 0.05,
        clearcoat: 0.9,
        clearcoatRoughness: 0.08,
        reflectivity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );

    const domeGeo = this.#trackGeo(
      new THREE.SphereGeometry(R_WALL, 36, 18, 0, Math.PI * 2, oculusPhi, Math.PI * 0.5 - oculusPhi)
    );
    const domeMesh = new THREE.Mesh(domeGeo, glassMat);
    domeMesh.position.set(CX, WALL_TOP_Y, CZ);
    domeMesh.scale.set(1, scaleY, 1);
    group.add(domeMesh);

    // 12 costillas meridionales doradas (la del arco Este arranca sobre el frontón del pórtico)
    const ribCount = 12;
    const ribRadius = R_WALL + 0.04;
    for (let i = 0; i < ribCount; i++) {
      const ang = (i / ribCount) * Math.PI * 2;
      const startPhi = i === 0 ? Math.PI * 0.5 - 0.34 : Math.PI * 0.5;
      const pts = [];
      const steps = 16;
      for (let s = 0; s <= steps; s++) {
        const phi = startPhi + (oculusPhi - startPhi) * (s / steps);
        const rHoriz = ribRadius * Math.sin(phi);
        const y = WALL_TOP_Y + domeHeight * Math.cos(phi);
        pts.push(new THREE.Vector3(
          CX + Math.cos(ang) * rHoriz,
          y,
          CZ + Math.sin(ang) * rHoriz
        ));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const ribGeo = this.#trackGeo(new THREE.TubeGeometry(curve, 20, 0.075, 8, false));
      const rib = new THREE.Mesh(ribGeo, roseGoldMat);
      group.add(rib);
    }

    // 3 anillos horizontales oro-rosa
    const ringPhis = [0.42, 0.78, 1.14];
    for (let rIdx = 0; rIdx < ringPhis.length; rIdx++) {
      const phi = ringPhis[rIdx];
      const ringR = (R_WALL + 0.04) * Math.sin(phi);
      const ringY = WALL_TOP_Y + domeHeight * Math.cos(phi);
      const isLowest = rIdx === ringPhis.length - 1;
      const arcStart = isLowest ? ENTRANCE_HALF_ANG : 0;
      const arcLen = isLowest ? Math.PI * 2 - ENTRANCE_HALF_ANG * 2 : Math.PI * 2;

      const ringGeo = this.#trackGeo(new THREE.TorusGeometry(ringR, 0.065, 10, 64, arcLen));
      const ring = new THREE.Mesh(ringGeo, roseGoldMat);
      ring.position.set(CX, ringY, CZ);
      ring.rotation.x = Math.PI / 2;
      if (isLowest) ring.rotation.z = -arcStart;
      group.add(ring);
    }

    // Óculo superior, linterna de cristal y corona/aguja de oro rosa hasta Y = 16.5 m
    const oculusR = R_WALL * Math.sin(oculusPhi);
    const oculusY = WALL_TOP_Y + domeHeight * Math.cos(oculusPhi);
    const oculusRingGeo = this.#trackGeo(new THREE.TorusGeometry(oculusR + 0.04, 0.1, 12, 32));
    const oculusRing = new THREE.Mesh(oculusRingGeo, roseGoldMat);
    oculusRing.position.set(CX, oculusY, CZ);
    oculusRing.rotation.x = Math.PI / 2;
    group.add(oculusRing);

    const lanternGlassGeo = this.#trackGeo(new THREE.CylinderGeometry(oculusR * 0.85, oculusR * 0.96, 0.72, 16, 1, true));
    const lanternGlass = new THREE.Mesh(lanternGlassGeo, glassMat);
    lanternGlass.position.set(CX, oculusY + 0.34, CZ);
    group.add(lanternGlass);

    const lanternCapGeo = this.#trackGeo(new THREE.ConeGeometry(oculusR * 0.98, 0.56, 16));
    const lanternCap = new THREE.Mesh(lanternCapGeo, roseGoldMat);
    lanternCap.position.set(CX, oculusY + 0.96, CZ);
    group.add(lanternCap);

    const spireHeight = LANTERN_TOP_Y - (oculusY + 1.12);
    if (spireHeight > 0.1) {
      const spireGeo = this.#trackGeo(new THREE.ConeGeometry(0.11, spireHeight, 12));
      const spire = new THREE.Mesh(spireGeo, roseGoldMat);
      spire.position.set(CX, oculusY + 1.12 + spireHeight * 0.5, CZ);
      group.add(spire);
    }

    const crownOrbGeo = this.#trackGeo(new THREE.OctahedronGeometry(0.16, 0));
    const crownOrbMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffd6ec,
        emissive: 0xff8dc7,
        emissiveIntensity: 0.65,
        roughness: 0.15,
        metalness: 0.5
      })
    );
    const crownOrb = new THREE.Mesh(crownOrbGeo, crownOrbMat);
    crownOrb.position.set(CX, LANTERN_TOP_Y - 0.04, CZ);
    group.add(crownOrb);

    // Arco de Entrada Monumental al Este (+X)
    this.#buildEntranceArch(group, marbleMat, roseGoldMat);

    this.#root.add(group);
  }

  #buildEntranceArch(parent, marbleMat, roseGoldMat) {
    const archGroup = new THREE.Group();
    archGroup.name = 'MonumentalEntranceArch';

    const colHeight = 4.65;
    const colGeo = this.#trackGeo(new THREE.CylinderGeometry(0.24, 0.29, colHeight, 18));
    const baseGeo = this.#trackGeo(new THREE.BoxGeometry(0.72, 0.28, 0.72));
    const capGeo = this.#trackGeo(new THREE.CylinderGeometry(0.36, 0.24, 0.28, 18));

    for (const side of [-1, 1]) {
      const ang = side * ENTRANCE_HALF_ANG;
      const cx = CX + Math.cos(ang) * R_WALL;
      const cz = CZ + Math.sin(ang) * R_WALL;

      const base = new THREE.Mesh(baseGeo, roseGoldMat);
      base.position.set(cx, PLATFORM_Y + 0.14, cz);
      archGroup.add(base);

      const col = new THREE.Mesh(colGeo, marbleMat);
      col.position.set(cx, PLATFORM_Y + 0.28 + colHeight * 0.5, cz);
      col.castShadow = true;
      archGroup.add(col);

      const cap = new THREE.Mesh(capGeo, roseGoldMat);
      cap.position.set(cx, PLATFORM_Y + 0.28 + colHeight + 0.14, cz);
      archGroup.add(cap);
    }

    // Dintel curvo / entablamento mirando al Este (+X)
    const archCenterX = CX + Math.cos(ENTRANCE_HALF_ANG) * R_WALL;
    const archSpan = 2 * Math.sin(ENTRANCE_HALF_ANG) * R_WALL;
    const lintelGeo = this.#trackGeo(new THREE.BoxGeometry(0.68, 0.92, archSpan + 0.68));
    const lintel = new THREE.Mesh(lintelGeo, marbleMat);
    lintel.position.set(archCenterX, 5.65, CZ);
    archGroup.add(lintel);

    const trimGeo = this.#trackGeo(new THREE.BoxGeometry(0.76, 0.12, archSpan + 0.8));
    const trimBot = new THREE.Mesh(trimGeo, roseGoldMat);
    trimBot.position.set(archCenterX, 5.18, CZ);
    const trimTop = new THREE.Mesh(trimGeo, roseGoldMat);
    trimTop.position.set(archCenterX, 6.12, CZ);
    archGroup.add(trimBot, trimTop);

    // Cartel iluminado pintado en CanvasTexture: "♛ CÚPULA REAL · CASINO ♛"
    const signTex = this.#createSignTexture();
    const signMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: signTex,
        emissiveMap: signTex,
        emissive: 0xffd2ec,
        emissiveIntensity: 0.72,
        roughness: 0.26,
        metalness: 0.15
      })
    );
    const signGeo = this.#trackGeo(new THREE.PlaneGeometry(4.35, 0.78));
    const signMesh = new THREE.Mesh(signGeo, signMat);
    signMesh.position.set(archCenterX + 0.36, 5.65, CZ);
    signMesh.rotation.y = Math.PI / 2;
    archGroup.add(signMesh);

    // Bombillas doradas decorativas alrededor del cartel
    const bulbGeo = this.#trackGeo(new THREE.SphereGeometry(0.045, 10, 8));
    const bulbMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfff0c8,
        emissive: 0xffd175,
        emissiveIntensity: 0.82,
        roughness: 0.2
      })
    );
    const bulbCount = 22;
    const bulbInst = this.#trackInstanced(new THREE.InstancedMesh(bulbGeo, bulbMat, bulbCount));
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let i = 0; i < 11; i++) {
      const zPos = CZ - 2.1 + (i / 10) * 4.2;
      for (const yOff of [-0.42, 0.42]) {
        dummy.position.set(archCenterX + 0.37, 5.65 + yOff, zPos);
        dummy.updateMatrix();
        bulbInst.setMatrixAt(idx++, dummy.matrix);
      }
    }
    bulbInst.instanceMatrix.needsUpdate = true;
    archGroup.add(bulbInst);

    parent.add(archGroup);
  }

  // ---------------------------------------------------------------------------
  // 4. Lámpara de araña central, alfombra imperial y luz interior
  // ---------------------------------------------------------------------------

  #buildChandelierAndCarpet() {
    const group = new THREE.Group();
    group.name = 'ChandelierAndCarpet';

    const roseGoldMat = this.#createRoseGoldMat(0.18, 0.92);

    // Alfombra circular central (Y = 0.375)
    const carpetTex = this.#getSharedTexture('carpet', 4, 4);
    const carpetMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xc82b6e,
        map: carpetTex,
        roughness: 0.86,
        metalness: 0.04
      })
    );
    const carpetGeo = this.#trackGeo(new THREE.CylinderGeometry(4.2, 4.24, 0.025, 48));
    const carpet = new THREE.Mesh(carpetGeo, carpetMat);
    carpet.position.set(CX, 0.375, CZ);
    carpet.receiveShadow = true;
    group.add(carpet);

    const carpetRimGeo = this.#trackGeo(new THREE.RingGeometry(4.12, 4.26, 56));
    carpetRimGeo.rotateX(-Math.PI / 2);
    const carpetRim = new THREE.Mesh(carpetRimGeo, roseGoldMat);
    carpetRim.position.set(CX, 0.389, CZ);
    group.add(carpetRim);

    // Pasillo de alfombra hacia la escalinata Este
    const aisleGeo = this.#trackGeo(new THREE.BoxGeometry(4.65, 0.022, 2.5));
    const aisle = new THREE.Mesh(aisleGeo, carpetMat);
    aisle.position.set(CX + 6.45, 0.374, CZ);
    aisle.receiveShadow = true;
    group.add(aisle);

    // Lámpara de araña suspendida del óculo superior (Y = 14.9 -> Y = 9.4)
    const chanGroup = new THREE.Group();
    chanGroup.position.set(CX, 10.6, CZ);

    const rodGeo = this.#trackGeo(new THREE.CylinderGeometry(0.05, 0.05, 4.5, 10));
    const rod = new THREE.Mesh(rodGeo, roseGoldMat);
    rod.position.y = 2.25;
    chanGroup.add(rod);

    const crystalMat = this.#trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0xfff0fa,
        emissive: 0xffcae6,
        emissiveIntensity: 0.58,
        transparent: true,
        opacity: 0.85,
        roughness: 0.08,
        metalness: 0.1
      })
    );
    const flameMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfff5d6,
        emissive: 0xffd584,
        emissiveIntensity: 0.82,
        roughness: 0.2
      })
    );

    const tierRadii = [1.55, 1.05, 0.55];
    const tierY = [0.25, -0.35, -0.85];
    const crystalGeo = this.#trackGeo(new THREE.OctahedronGeometry(0.09, 0));
    const bulbGeo = this.#trackGeo(new THREE.SphereGeometry(0.055, 10, 8));

    for (let t = 0; t < tierRadii.length; t++) {
      const r = tierRadii[t];
      const y = tierY[t];
      const spinner = new THREE.Group();
      spinner.position.y = y;

      const hoopGeo = this.#trackGeo(new THREE.TorusGeometry(r, 0.04, 10, 32));
      const hoop = new THREE.Mesh(hoopGeo, roseGoldMat);
      hoop.rotation.x = Math.PI / 2;
      spinner.add(hoop);

      const count = 12 - t * 3;
      for (let c = 0; c < count; c++) {
        const a = (c / count) * Math.PI * 2;
        const px = Math.cos(a) * r;
        const pz = Math.sin(a) * r;

        const prism = new THREE.Mesh(crystalGeo, crystalMat);
        prism.position.set(px, -0.18, pz);
        prism.scale.set(0.75, 1.9, 0.75);
        spinner.add(prism);

        if (t < 2) {
          const bulb = new THREE.Mesh(bulbGeo, flameMat);
          bulb.position.set(px, 0.11, pz);
          spinner.add(bulb);
        }
      }

      chanGroup.add(spinner);
      this.#chandelierSpinners.push(spinner);
    }

    group.add(chanGroup);

    // 2 luces interiores suaves optimizadas
    const warmLight = new THREE.PointLight(0xffdcb8, 2.8, 24, 1.5);
    warmLight.position.set(CX, 9.6, CZ);
    group.add(warmLight);

    const floorFill = new THREE.PointLight(0xffb8d8, 1.15, 16, 1.6);
    floorFill.position.set(CX, 3.1, CZ);
    group.add(floorFill);

    this.#root.add(group);
  }

  // ---------------------------------------------------------------------------
  // 5. 4 Máquinas Tragaperras de Lujo (Arco Norte)
  // ---------------------------------------------------------------------------

  #buildSlotMachines() {
    const group = new THREE.Group();
    group.name = 'SlotMachinesGroup';

    const roseGoldMat = this.#createRoseGoldMat(0.18, 0.9);
    const bodyPinkMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe97aad,
        roughness: 0.28,
        metalness: 0.35
      })
    );
    const darkVelvetMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3b122a,
        roughness: 0.75,
        metalness: 0.08
      })
    );
    const chromeMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf4ecee,
        roughness: 0.14,
        metalness: 0.94
      })
    );
    chromeMat.userData.preserveRoughness = true;

    const knobMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe62968,
        emissive: 0x801036,
        emissiveIntensity: 0.32,
        roughness: 0.16,
        metalness: 0.25
      })
    );
    knobMat.userData.preserveRoughness = true;

    const glassWindowMat = this.#trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.16,
        roughness: 0.05,
        metalness: 0.0,
        clearcoat: 1.0,
        depthWrite: false
      })
    );

    const reelTex = this.#createReelTexture();
    const reelMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: reelTex,
        emissive: 0xffffff,
        emissiveMap: reelTex,
        emissiveIntensity: 0.18,
        roughness: 0.26,
        metalness: 0.12
      })
    );
    reelMat.userData.preserveRoughness = true;

    const marqueeTex = this.#createMarqueeTexture();
    const marqueeMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: marqueeTex,
        emissiveMap: marqueeTex,
        emissive: 0xffd0ea,
        emissiveIntensity: 0.72,
        roughness: 0.25,
        metalness: 0.15
      })
    );

    const btnMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffd272,
        emissive: 0xffb338,
        emissiveIntensity: 0.62,
        roughness: 0.25,
        metalness: 0.4
      })
    );

    // Geometrías compartidas
    const pedestalGeo = this.#trackGeo(new THREE.BoxGeometry(0.94, 0.94, 0.64));
    const cabinetGeo = this.#trackGeo(new THREE.BoxGeometry(0.90, 0.70, 0.56));
    const marqueeBoxGeo = this.#trackGeo(new THREE.BoxGeometry(0.88, 0.34, 0.46));
    const marqueeFaceGeo = this.#trackGeo(new THREE.PlaneGeometry(0.80, 0.28));
    const trayGeo = this.#trackGeo(new THREE.BoxGeometry(0.68, 0.10, 0.20));
    const coinGeo = this.#trackGeo(new THREE.CylinderGeometry(0.032, 0.032, 0.012, 12));

    // Rodillo con eje X local ya horneado en la geometría para que reel.rotation.x gire limpio
    const reelGeo = this.#trackGeo(new THREE.CylinderGeometry(0.165, 0.165, 0.155, 40, 1, false));
    reelGeo.rotateZ(Math.PI / 2);

    const winPaneGeo = this.#trackGeo(new THREE.PlaneGeometry(0.68, 0.30));
    const consoleGeo = this.#trackGeo(new THREE.BoxGeometry(0.86, 0.12, 0.24));
    const btnGeo = this.#trackGeo(new THREE.CylinderGeometry(0.036, 0.04, 0.035, 14));
    const hubGeo = this.#trackGeo(new THREE.CylinderGeometry(0.055, 0.065, 0.09, 14));
    hubGeo.rotateZ(Math.PI / 2);
    const shaftGeo = this.#trackGeo(new THREE.CylinderGeometry(0.02, 0.024, 0.45, 12));
    const knobGeo = this.#trackGeo(new THREE.SphereGeometry(0.058, 18, 14));

    const getReelAngleForSymbol = (symbolIdx) => {
      const n = SLOT_SYMBOLS.length;
      const idx = ((symbolIdx % n) + n) % n;
      return ((idx + 0.5) / n) * Math.PI * 2;
    };

    for (let sIdx = 0; sIdx < SLOT_SPECS.length; sIdx++) {
      const spec = SLOT_SPECS[sIdx];
      const machine = new THREE.Group();
      machine.name = `SlotMachine_${spec.id}`;
      machine.position.set(spec.x, PLATFORM_Y, spec.z);
      machine.rotation.y = spec.rotY;

      // Pedestal inferior
      const pedestal = new THREE.Mesh(pedestalGeo, bodyPinkMat);
      pedestal.position.set(0, 0.47, 0);
      pedestal.castShadow = true;
      pedestal.receiveShadow = true;
      machine.add(pedestal);

      // Zócalo inferior oro-rosa
      const baseTrim = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(0.98, 0.08, 0.68)), roseGoldMat);
      baseTrim.position.set(0, 0.04, 0);
      machine.add(baseTrim);

      // Bandeja de monedas frontal
      const tray = new THREE.Mesh(trayGeo, roseGoldMat);
      tray.position.set(0, 0.62, 0.36);
      machine.add(tray);

      for (let c = 0; c < 6; c++) {
        const coin = new THREE.Mesh(coinGeo, btnMat);
        coin.position.set(-0.2 + c * 0.08, 0.675, 0.36 + (c % 2 === 0 ? 0.02 : -0.02));
        machine.add(coin);
      }

      // Consola frontal inclinada con botones
      const consoleBox = new THREE.Mesh(consoleGeo, darkVelvetMat);
      consoleBox.position.set(0, 0.96, 0.32);
      consoleBox.rotation.x = 0.25;
      machine.add(consoleBox);

      for (let b = -1; b <= 1; b++) {
        const btn = new THREE.Mesh(btnGeo, btnMat);
        btn.position.set(b * 0.16, 1.03, 0.34);
        btn.rotation.x = 0.25;
        machine.add(btn);
      }

      // Cuerpo superior de rodillos
      const cabinet = new THREE.Mesh(cabinetGeo, bodyPinkMat);
      cabinet.position.set(0, 1.32, -0.02);
      cabinet.castShadow = true;
      machine.add(cabinet);

      // Hueco oscuro de rodillos y marco oro-rosa
      const recess = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(0.68, 0.32, 0.12)), darkVelvetMat);
      recess.position.set(0, 1.38, 0.21);
      machine.add(recess);

      const frameTop = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(0.76, 0.05, 0.08)), roseGoldMat);
      frameTop.position.set(0, 1.55, 0.28);
      const frameBot = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(0.76, 0.05, 0.08)), roseGoldMat);
      frameBot.position.set(0, 1.21, 0.28);
      machine.add(frameTop, frameBot);

      for (const side of [-1, 1]) {
        const sideBar = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(0.05, 0.39, 0.08)), roseGoldMat);
        sideBar.position.set(side * 0.355, 1.38, 0.28);
        machine.add(sideBar);
      }

      // 3 rodillos cilíndricos giratorios centrados en local Y = 1.38
      const reels = [];
      const initSymbols = [0, 4, (sIdx + 1) % 5];
      for (let r = 0; r < 3; r++) {
        const reel = new THREE.Mesh(reelGeo, reelMat);
        reel.position.set((r - 1) * 0.21, 1.38, 0.115);
        reel.rotation.x = getReelAngleForSymbol(initSymbols[r]);
        machine.add(reel);
        reels.push(reel);
      }

      // Cristal protector frontal de la ventana
      const pane = new THREE.Mesh(winPaneGeo, glassWindowMat);
      pane.position.set(0, 1.38, 0.295);
      machine.add(pane);

      // Marquesina superior luminosa "ROYAL SLOTS"
      const marqueeBox = new THREE.Mesh(marqueeBoxGeo, roseGoldMat);
      marqueeBox.position.set(0, 1.84, 0.02);
      machine.add(marqueeBox);

      const marqueeFace = new THREE.Mesh(marqueeFaceGeo, marqueeMat);
      marqueeFace.position.set(0, 1.84, 0.256);
      machine.add(marqueeFace);

      // Corona ornamental superior
      const topper = new THREE.Mesh(this.#trackGeo(new THREE.OctahedronGeometry(0.11, 0)), btnMat);
      topper.position.set(0, 2.10, 0.02);
      topper.scale.set(1.2, 0.85, 0.7);
      machine.add(topper);

      // Palanca lateral derecha articulada (+X local)
      const hub = new THREE.Mesh(hubGeo, roseGoldMat);
      hub.position.set(0.46, 1.24, 0.04);
      machine.add(hub);

      const leverPivot = new THREE.Group();
      leverPivot.name = `LeverPivot_${spec.id}`;
      leverPivot.position.set(0.50, 1.24, 0.04);

      const shaft = new THREE.Mesh(shaftGeo, chromeMat);
      shaft.position.set(0.02, 0.22, 0.01);
      shaft.rotation.z = -0.09;
      leverPivot.add(shaft);

      const knob = new THREE.Mesh(knobGeo, knobMat);
      knob.position.set(0.04, 0.44, 0.02);
      leverPivot.add(knob);

      machine.add(leverPivot);
      group.add(machine);

      if (this.#collision) {
        this.#collision.addCylinderCollider(spec.x, spec.z, 0.65, PLATFORM_Y, 2.5);
      }

      const playerStandPos = this.#localToWorld(spec.x, PLATFORM_Y, spec.z, spec.rotY, 0, 0, 1.15);
      const cameraPos = this.#localToWorld(spec.x, PLATFORM_Y, spec.z, spec.rotY, 0, 1.48, 0.88);
      const cameraLookAt = this.#localToWorld(spec.x, PLATFORM_Y, spec.z, spec.rotY, 0, 1.38, 0.16);

      this.#stations.push({
        id: spec.id,
        type: 'slots',
        label: 'Jugar Tragaperras Real',
        group: machine,
        playerStandPos,
        interactPos: playerStandPos.clone(),
        playerYaw: spec.rotY + Math.PI,
        cameraPos,
        cameraLookAt,
        reels,
        leverPivot,
        leverGrabLocal: new THREE.Vector3(0.54, 1.68, 0.06),
        symbols: [...SLOT_SYMBOLS],
        getReelAngleForSymbol
      });
    }

    this.#root.add(group);
  }

  // ---------------------------------------------------------------------------
  // 6. 2 Mesas Semicirculares de Blackjack de Lujo (Arco Sur)
  // ---------------------------------------------------------------------------

  #buildBlackjackTables() {
    const group = new THREE.Group();
    group.name = 'BlackjackTablesGroup';

    const roseGoldMat = this.#createRoseGoldMat(0.18, 0.9);
    const marbleMat = this.#createMarbleMat('marble', 2, 2, 0xfff8fb);
    const feltTex = this.#createBlackjackFeltTexture();
    const feltMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: feltTex,
        roughness: 0.88,
        metalness: 0.03
      })
    );
    const railMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x7a1c4b,
        roughness: 0.42,
        metalness: 0.12
      })
    );
    const velvetChairMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xb62768,
        roughness: 0.78,
        metalness: 0.05
      })
    );
    const acrylicMat = this.#trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0xffeef8,
        transparent: true,
        opacity: 0.45,
        roughness: 0.08,
        metalness: 0.08
      })
    );
    const cardDeckMat = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfff5fa,
        roughness: 0.35,
        metalness: 0.02
      })
    );

    const chipColors = [0xffd25a, 0xe83b7a, 0x45c8ff, 0xa86bff, 0xfff2f8];
    const chipMats = chipColors.map((col) =>
      this.#trackMat(new THREE.MeshStandardMaterial({ color: col, roughness: 0.28, metalness: 0.25 }))
    );

    // Forma semicircular del tablero (lado plano crupier en Z = -0.38, arco jugador hasta Z = +0.68)
    const tableRadius = 1.06;
    const flatZ = -0.36;
    const feltShape = new THREE.Shape();
    feltShape.moveTo(-tableRadius, 0);
    feltShape.absarc(0, 0, tableRadius, Math.PI, 0, false);
    feltShape.lineTo(-tableRadius, 0);

    const tableBaseGeo = this.#trackGeo(
      new THREE.ExtrudeGeometry(feltShape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.02, bevelSegments: 2 })
    );
    tableBaseGeo.rotateX(-Math.PI / 2);

    const railShape = new THREE.Shape();
    railShape.moveTo(-tableRadius - 0.09, 0);
    railShape.absarc(0, 0, tableRadius + 0.09, Math.PI, 0, false);
    railShape.lineTo(tableRadius - 0.02, 0);
    railShape.absarc(0, 0, tableRadius - 0.02, 0, Math.PI, true);
    railShape.closePath();

    const railGeo = this.#trackGeo(
      new THREE.ExtrudeGeometry(railShape, { depth: 0.055, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3 })
    );
    railGeo.rotateX(-Math.PI / 2);

    const feltTopGeo = this.#trackGeo(new THREE.CircleGeometry(tableRadius - 0.01, 36, 0, Math.PI));
    feltTopGeo.rotateX(-Math.PI / 2);
    feltTopGeo.rotateY(Math.PI);

    const pedBaseGeo = this.#trackGeo(new THREE.CylinderGeometry(0.42, 0.56, 0.14, 24));
    const pedColGeo = this.#trackGeo(new THREE.CylinderGeometry(0.20, 0.25, 0.68, 20));
    const chipGeo = this.#trackGeo(new THREE.CylinderGeometry(0.032, 0.032, 0.012, 16));

    const tableSurfaceY = 0.86;

    for (const spec of BLACKJACK_SPECS) {
      const table = new THREE.Group();
      table.name = `BlackjackTable_${spec.id}`;
      table.position.set(spec.x, PLATFORM_Y, spec.z);
      table.rotation.y = spec.rotY;

      // Pedestal elegante
      const pedBase = new THREE.Mesh(pedBaseGeo, roseGoldMat);
      pedBase.position.set(0, 0.07, 0.05);
      table.add(pedBase);

      const pedCol = new THREE.Mesh(pedColGeo, marbleMat);
      pedCol.position.set(0, 0.48, 0.05);
      pedCol.castShadow = true;
      table.add(pedCol);

      // Tablero semicircular (Z de -0.36 hasta +0.70, superficie superior en tableSurfaceY = 0.86)
      const board = new THREE.Mesh(tableBaseGeo, roseGoldMat);
      board.position.set(0, tableSurfaceY - 0.096, flatZ);
      board.castShadow = true;
      board.receiveShadow = true;
      table.add(board);

      // Tapete de terciopelo burdeos/rosa con marcas doradas
      const felt = new THREE.Mesh(feltTopGeo, feltMat);
      felt.position.set(0, tableSurfaceY - 0.0005, flatZ);
      felt.receiveShadow = true;
      table.add(felt);

      // Borde acolchado semicircular + borde plano posterior
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(0, tableSurfaceY - 0.02, flatZ);
      table.add(rail);

      const backTrim = new THREE.Mesh(
        this.#trackGeo(new THREE.BoxGeometry((tableRadius + 0.09) * 2, 0.09, 0.12)),
        roseGoldMat
      );
      backTrim.position.set(0, tableSurfaceY - 0.046, flatZ - 0.05);
      table.add(backTrim);

      // Zapato dispensador de cartas en shoeLocalPos = (-0.68, 0.86, -0.25)
      const shoePos = new THREE.Vector3(-0.68, tableSurfaceY, -0.25);
      const shoeGroup = new THREE.Group();
      shoeGroup.position.copy(shoePos);
      shoeGroup.rotation.y = 0.42;

      const shoeBody = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(0.11, 0.09, 0.24)), acrylicMat);
      shoeBody.position.set(0, 0.045, 0);
      shoeGroup.add(shoeBody);

      const deckBlock = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(0.085, 0.068, 0.14)), cardDeckMat);
      deckBlock.position.set(0, 0.042, 0.01);
      shoeGroup.add(deckBlock);

      const shoeTrim = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(0.12, 0.02, 0.25)), roseGoldMat);
      shoeTrim.position.set(0, 0.01, 0);
      shoeGroup.add(shoeTrim);
      table.add(shoeGroup);

      // Pilas de fichas 3D decorativas
      const stackSpecs = [
        { x: 0.56, z: -0.24, count: 6, matIdx: 0 },
        { x: 0.65, z: -0.22, count: 4, matIdx: 1 },
        { x: 0.60, z: -0.14, count: 5, matIdx: 2 },
        { x: -0.44, z: 0.28, count: 5, matIdx: 0 },
        { x: -0.36, z: 0.32, count: 4, matIdx: 3 },
        { x: 0.44, z: 0.28, count: 6, matIdx: 4 }
      ];
      for (const st of stackSpecs) {
        for (let k = 0; k < st.count; k++) {
          const chip = new THREE.Mesh(chipGeo, chipMats[st.matIdx]);
          chip.position.set(st.x, tableSurfaceY + 0.008 + k * 0.013, st.z);
          table.add(chip);
        }
      }

      // Silla tapizada elegante situada detrás de playerStandPos (no bloquea zLocal = 1.32)
      const chair = new THREE.Group();
      chair.position.set(0, 0, 1.82);

      const chairStem = new THREE.Mesh(this.#trackGeo(new THREE.CylinderGeometry(0.045, 0.055, 0.48, 12)), roseGoldMat);
      chairStem.position.set(0, 0.24, 0);
      chair.add(chairStem);

      const chairFoot = new THREE.Mesh(this.#trackGeo(new THREE.CylinderGeometry(0.26, 0.28, 0.04, 18)), roseGoldMat);
      chairFoot.position.set(0, 0.02, 0);
      chair.add(chairFoot);

      const seat = new THREE.Mesh(this.#trackGeo(new THREE.CylinderGeometry(0.28, 0.26, 0.10, 20)), velvetChairMat);
      seat.position.set(0, 0.52, 0);
      chair.add(seat);

      const backrest = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(0.46, 0.36, 0.08)), velvetChairMat);
      backrest.position.set(0, 0.74, 0.22);
      chair.add(backrest);

      table.add(chair);
      group.add(table);

      if (this.#collision) {
        this.#collision.addCylinderCollider(spec.x, spec.z, 1.15, PLATFORM_Y, 1.4);
      }

      const playerStandPos = this.#localToWorld(spec.x, PLATFORM_Y, spec.z, spec.rotY, 0, 0, 1.32);
      const interactPos = this.#localToWorld(spec.x, PLATFORM_Y, spec.z, spec.rotY, 0, 0, 1.45);
      const cameraPos = this.#localToWorld(spec.x, PLATFORM_Y, spec.z, spec.rotY, 0, 1.48, 1.12);
      const cameraLookAt = this.#localToWorld(spec.x, PLATFORM_Y, spec.z, spec.rotY, 0, 0.86, 0.05);

      this.#stations.push({
        id: spec.id,
        type: 'blackjack',
        label: 'Jugar Blackjack Real',
        group: table,
        playerStandPos,
        interactPos,
        playerYaw: spec.rotY + Math.PI,
        cameraPos,
        cameraLookAt,
        tableSurfaceY,
        shoeLocalPos: shoePos.clone(),
        playerCardOriginLocal: new THREE.Vector3(0.0, tableSurfaceY, 0.32),
        dealerCardOriginLocal: new THREE.Vector3(0.0, tableSurfaceY, -0.22),
        betSpotLocal: new THREE.Vector3(0.0, tableSurfaceY, 0.52)
      });
    }

    this.#root.add(group);
  }

  // ---------------------------------------------------------------------------
  // 7. Marcadores discretos de interacción en el suelo
  // ---------------------------------------------------------------------------

  #buildInteractionMarkers() {
    const markerGeo = this.#trackGeo(new THREE.RingGeometry(0.28, 0.36, 28));
    const innerGeo = this.#trackGeo(new THREE.RingGeometry(0.14, 0.18, 24));
    innerGeo.rotateX(-Math.PI / 2);

    const markerMat = this.#trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffd982,
        transparent: true,
        opacity: 0.52,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    const innerMat = this.#trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xff8ec8,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );

    for (const station of this.#stations) {
      const ring = new THREE.Mesh(markerGeo, markerMat);
      ring.position.set(station.interactPos.x, PLATFORM_Y + 0.015, station.interactPos.z);
      ring.rotation.x = -Math.PI / 2;
      this.#root.add(ring);
      this.#markerRings.push(ring);

      const dot = new THREE.Mesh(innerGeo, innerMat);
      dot.position.set(station.interactPos.x, PLATFORM_Y + 0.016, station.interactPos.z);
      this.#root.add(dot);
    }
  }

  // ---------------------------------------------------------------------------
  // 8. Sistema de Fuegos Artificiales de la Cúpula (PointsMaterial + PointLight)
  // ---------------------------------------------------------------------------

  #initFireworksSystem() {
    this.#fwGroup.name = 'DomeFireworksVFX';
    const sparkTex = this.#createSparkTexture();

    // Buffer de chispas de explosión
    this.#fwSparkPos = new Float32Array(this.#fwSparkMax * 3);
    this.#fwSparkVel = new Float32Array(this.#fwSparkMax * 3);
    this.#fwSparkCol = new Float32Array(this.#fwSparkMax * 3);
    this.#fwSparkBaseCol = new Float32Array(this.#fwSparkMax * 3);
    this.#fwSparkAge = new Float32Array(this.#fwSparkMax);
    this.#fwSparkLife = new Float32Array(this.#fwSparkMax);

    this.#fwSparkGeo = this.#trackGeo(new THREE.BufferGeometry());
    const sparkPosAttr = new THREE.BufferAttribute(this.#fwSparkPos, 3);
    sparkPosAttr.setUsage(THREE.DynamicDrawUsage);
    const sparkColAttr = new THREE.BufferAttribute(this.#fwSparkCol, 3);
    sparkColAttr.setUsage(THREE.DynamicDrawUsage);
    this.#fwSparkGeo.setAttribute('position', sparkPosAttr);
    this.#fwSparkGeo.setAttribute('color', sparkColAttr);
    this.#fwSparkGeo.setDrawRange(0, 0);

    const sparkMat = this.#trackMat(
      new THREE.PointsMaterial({
        size: 0.30,
        map: sparkTex,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      })
    );
    sparkMat.userData.isVfx = true;

    const sparkPoints = new THREE.Points(this.#fwSparkGeo, sparkMat);
    sparkPoints.frustumCulled = false;
    this.#fwGroup.add(sparkPoints);

    // Buffer de estelas y cabezas de cohetes
    this.#fwTrailPos = new Float32Array(this.#fwTrailMax * 3);
    this.#fwTrailVel = new Float32Array(this.#fwTrailMax * 3);
    this.#fwTrailCol = new Float32Array(this.#fwTrailMax * 3);
    this.#fwTrailBaseCol = new Float32Array(this.#fwTrailMax * 3);
    this.#fwTrailAge = new Float32Array(this.#fwTrailMax);
    this.#fwTrailLife = new Float32Array(this.#fwTrailMax);

    this.#fwTrailGeo = this.#trackGeo(new THREE.BufferGeometry());
    const trailPosAttr = new THREE.BufferAttribute(this.#fwTrailPos, 3);
    trailPosAttr.setUsage(THREE.DynamicDrawUsage);
    const trailColAttr = new THREE.BufferAttribute(this.#fwTrailCol, 3);
    trailColAttr.setUsage(THREE.DynamicDrawUsage);
    this.#fwTrailGeo.setAttribute('position', trailPosAttr);
    this.#fwTrailGeo.setAttribute('color', trailColAttr);
    this.#fwTrailGeo.setDrawRange(0, 0);

    const trailMat = this.#trackMat(
      new THREE.PointsMaterial({
        size: 0.22,
        map: sparkTex,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      })
    );
    trailMat.userData.isVfx = true;

    const trailPoints = new THREE.Points(this.#fwTrailGeo, trailMat);
    trailPoints.frustumCulled = false;
    this.#fwGroup.add(trailPoints);

    // 1 PointLight festivo temporal (intensidad <= 12)
    this.#fwLight = new THREE.PointLight(0xffe066, 0, 26, 1.5);
    this.#fwLight.position.set(CX, 9.2, CZ);
    this.#fwLight.visible = false;
    this.#fwGroup.add(this.#fwLight);

    this.#root.add(this.#fwGroup);
  }

  #spawnTrailParticle(x, y, z, vx, vy, vz, colorHex, life) {
    const idx = this.#fwTrailCount;
    if (idx >= this.#fwTrailMax) return;
    const c = new THREE.Color(colorHex);
    const i3 = idx * 3;
    this.#fwTrailPos[i3] = x;
    this.#fwTrailPos[i3 + 1] = y;
    this.#fwTrailPos[i3 + 2] = z;
    this.#fwTrailVel[i3] = vx;
    this.#fwTrailVel[i3 + 1] = vy;
    this.#fwTrailVel[i3 + 2] = vz;
    this.#fwTrailBaseCol[i3] = c.r;
    this.#fwTrailBaseCol[i3 + 1] = c.g;
    this.#fwTrailBaseCol[i3 + 2] = c.b;
    this.#fwTrailCol[i3] = c.r;
    this.#fwTrailCol[i3 + 1] = c.g;
    this.#fwTrailCol[i3 + 2] = c.b;
    this.#fwTrailAge[idx] = 0;
    this.#fwTrailLife[idx] = life;
    this.#fwTrailCount++;
  }

  #spawnExplosion(x, y, z, primaryHex, isInterior) {
    const secondaryHex = FIREWORK_PALETTE[Math.floor(Math.random() * FIREWORK_PALETTE.length)];
    const c1 = new THREE.Color(primaryHex);
    const c2 = new THREE.Color(secondaryHex);
    const count = isInterior ? 76 : 96;
    const baseSpeed = isInterior ? 3.8 : 6.2;

    for (let i = 0; i < count; i++) {
      const idx = this.#fwSparkCount;
      if (idx >= this.#fwSparkMax) break;

      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const rHoriz = Math.sqrt(Math.max(0, 1 - u * u));
      const speed = baseSpeed * (0.45 + Math.random() * 0.65);

      const i3 = idx * 3;
      this.#fwSparkPos[i3] = x;
      this.#fwSparkPos[i3 + 1] = y;
      this.#fwSparkPos[i3 + 2] = z;
      this.#fwSparkVel[i3] = rHoriz * Math.cos(theta) * speed;
      this.#fwSparkVel[i3 + 1] = u * speed + 0.8;
      this.#fwSparkVel[i3 + 2] = rHoriz * Math.sin(theta) * speed;

      const col = i % 3 === 0 ? c2 : c1;
      this.#fwSparkBaseCol[i3] = col.r;
      this.#fwSparkBaseCol[i3 + 1] = col.g;
      this.#fwSparkBaseCol[i3 + 2] = col.b;
      this.#fwSparkCol[i3] = col.r;
      this.#fwSparkCol[i3 + 1] = col.g;
      this.#fwSparkCol[i3 + 2] = col.b;
      this.#fwSparkAge[idx] = 0;
      this.#fwSparkLife[idx] = 1.45 + Math.random() * 0.95;
      this.#fwSparkCount++;
    }

    // Pulso de luz festiva (tope <= 12)
    this.#fwFlashColor.copy(c1);
    this.#fwFlashEnergy = Math.min(11.5, this.#fwFlashEnergy + (isInterior ? 6.5 : 4.5));
  }

  #updateFireworks(dt) {
    if (!this.#fwActive && this.#fwSparkCount === 0 && this.#fwTrailCount === 0 && this.#fwRockets.length === 0) {
      if (this.#fwLight && this.#fwLight.visible) {
        this.#fwLight.intensity = 0;
        this.#fwLight.visible = false;
      }
      return;
    }

    this.#fwTimer += dt;

    // Lanzar cohetes programados
    let pendingCount = 0;
    for (let i = 0; i < this.#fwSchedule.length; i++) {
      const item = this.#fwSchedule[i];
      if (!item.launched) {
        if (this.#fwTimer >= item.delay) {
          item.launched = true;
          const flightDuration = item.isInterior ? 0.62 : 0.88;
          this.#fwRockets.push({
            x: item.startX,
            y: item.startY,
            z: item.startZ,
            sx: item.startX,
            sy: item.startY,
            sz: item.startZ,
            tx: item.targetX,
            ty: item.targetY,
            tz: item.targetZ,
            age: 0,
            duration: flightDuration,
            trailAcc: 0,
            colorHex: item.colorHex,
            isInterior: item.isInterior
          });
        } else {
          pendingCount++;
        }
      }
    }
    if (pendingCount === 0 && this.#fwRockets.length === 0) {
      this.#fwActive = false;
    }

    // Actualizar cohetes ascendentes
    for (let i = this.#fwRockets.length - 1; i >= 0; i--) {
      const r = this.#fwRockets[i];
      r.age += dt;
      const t = Math.min(1, r.age / r.duration);
      const ease = 1 - Math.pow(1 - t, 1.7);
      r.x = r.sx + (r.tx - r.sx) * ease;
      r.y = r.sy + (r.ty - r.sy) * ease;
      r.z = r.sz + (r.tz - r.sz) * ease;

      r.trailAcc += dt;
      while (r.trailAcc >= 0.025) {
        r.trailAcc -= 0.025;
        this.#spawnTrailParticle(
          r.x + (Math.random() - 0.5) * 0.08,
          r.y,
          r.z + (Math.random() - 0.5) * 0.08,
          (Math.random() - 0.5) * 0.35,
          -0.8 - Math.random() * 0.6,
          (Math.random() - 0.5) * 0.35,
          r.colorHex,
          0.42
        );
      }

      if (t >= 1) {
        this.#spawnExplosion(r.tx, r.ty, r.tz, r.colorHex, r.isInterior);
        this.#fwRockets.splice(i, 1);
      }
    }

    // Actualizar partículas de estela
    this.#stepParticlePool(
      dt,
      -1.2,
      0.92,
      this.#fwTrailPos,
      this.#fwTrailVel,
      this.#fwTrailCol,
      this.#fwTrailBaseCol,
      this.#fwTrailAge,
      this.#fwTrailLife,
      () => this.#fwTrailCount,
      (v) => { this.#fwTrailCount = v; }
    );
    this.#fwTrailGeo.setDrawRange(0, this.#fwTrailCount);
    this.#fwTrailGeo.attributes.position.needsUpdate = true;
    this.#fwTrailGeo.attributes.color.needsUpdate = true;

    // Actualizar partículas de explosión (gravedad suave + cascada)
    this.#stepParticlePool(
      dt,
      -3.4,
      Math.exp(-1.55 * dt),
      this.#fwSparkPos,
      this.#fwSparkVel,
      this.#fwSparkCol,
      this.#fwSparkBaseCol,
      this.#fwSparkAge,
      this.#fwSparkLife,
      () => this.#fwSparkCount,
      (v) => { this.#fwSparkCount = v; }
    );
    this.#fwSparkGeo.setDrawRange(0, this.#fwSparkCount);
    this.#fwSparkGeo.attributes.position.needsUpdate = true;
    this.#fwSparkGeo.attributes.color.needsUpdate = true;

    // Luz festiva pulsante suave (siempre <= 12)
    this.#fwFlashEnergy = Math.max(0, this.#fwFlashEnergy - dt * 7.5);
    if (this.#fwLight) {
      if (this.#fwFlashEnergy > 0.05) {
        this.#fwLight.visible = true;
        this.#fwLight.color.lerp(this.#fwFlashColor, 0.25);
        this.#fwLight.intensity = Math.min(12, this.#fwFlashEnergy);
      } else {
        this.#fwLight.intensity = 0;
        this.#fwLight.visible = false;
      }
    }
  }

  #stepParticlePool(dt, gravity, drag, pos, vel, col, baseCol, age, life, getCount, setCount) {
    let count = getCount();
    let i = 0;
    while (i < count) {
      age[i] += dt;
      if (age[i] >= life[i]) {
        const last = count - 1;
        if (i !== last) {
          const i3 = i * 3;
          const l3 = last * 3;
          pos[i3] = pos[l3];
          pos[i3 + 1] = pos[l3 + 1];
          pos[i3 + 2] = pos[l3 + 2];
          vel[i3] = vel[l3];
          vel[i3 + 1] = vel[l3 + 1];
          vel[i3 + 2] = vel[l3 + 2];
          baseCol[i3] = baseCol[l3];
          baseCol[i3 + 1] = baseCol[l3 + 1];
          baseCol[i3 + 2] = baseCol[l3 + 2];
          col[i3] = col[l3];
          col[i3 + 1] = col[l3 + 1];
          col[i3 + 2] = col[l3 + 2];
          age[i] = age[last];
          life[i] = life[last];
        }
        count--;
        continue;
      }

      const i3 = i * 3;
      vel[i3] *= drag;
      vel[i3 + 1] = vel[i3 + 1] * drag + gravity * dt;
      vel[i3 + 2] *= drag;

      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;

      const fade = Math.pow(Math.max(0, 1 - age[i] / life[i]), 1.35);
      col[i3] = baseCol[i3] * fade;
      col[i3 + 1] = baseCol[i3 + 1] * fade;
      col[i3 + 2] = baseCol[i3 + 2] * fade;
      i++;
    }
    setCount(count);
  }

  // ---------------------------------------------------------------------------
  // 9. Texturas procedurales de alta nitidez (CanvasTexture)
  // ---------------------------------------------------------------------------

  #createSignTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 192;
    const ctx = canvas.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, 1024, 192);
    bg.addColorStop(0, '#451231');
    bg.addColorStop(0.5, '#6d1b4c');
    bg.addColorStop(1, '#451231');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1024, 192);

    ctx.strokeStyle = '#f5cb78';
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, 1004, 172);
    ctx.strokeStyle = '#ff9fd0';
    ctx.lineWidth = 2;
    ctx.strokeRect(22, 22, 980, 148);

    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 58px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255, 160, 210, 0.75)';
    ctx.shadowBlur = 12;
    ctx.fillText('♛ CÚPULA REAL · CASINO ♛', 512, 98);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return this.#trackTex(tex);
  }

  #createMarqueeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;
    const ctx = canvas.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, 512, 192);
    bg.addColorStop(0, '#5a1440');
    bg.addColorStop(0.5, '#962268');
    bg.addColorStop(1, '#5a1440');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 192);

    ctx.strokeStyle = '#ffd984';
    ctx.lineWidth = 7;
    ctx.strokeRect(8, 8, 496, 176);

    ctx.fillStyle = '#fff0bc';
    ctx.font = 'bold 46px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♛ ROYAL SLOTS ♛', 256, 82);

    ctx.fillStyle = '#ffbce0';
    ctx.font = 'bold 22px Georgia, serif';
    ctx.fillText('JACKPOT IMPERIAL', 256, 138);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return this.#trackTex(tex);
  }

  #createReelTexture() {
    const W = 1024;
    const H = 256;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const cellW = W / SLOT_SYMBOLS.length; // 204.8 px por símbolo

    // Fondo satinado crema-rosado del tambor
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#f5e7ef');
    bg.addColorStop(0.5, '#fffbfd');
    bg.addColorStop(1, '#f5e7ef');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < SLOT_SYMBOLS.length; i++) {
      const cx = (i + 0.5) * cellW;
      const cy = H * 0.5;

      // Banda divisoria dorada entre símbolos
      ctx.fillStyle = '#d9a452';
      ctx.fillRect(i * cellW - 3, 0, 6, H);

      // Medallón sutil tras el símbolo
      ctx.save();
      ctx.translate(cx, cy);
      // Rotación +90° para alinear ejes UV del cilindro rotado Z=PI/2 mirando a +Z local
      ctx.rotate(Math.PI / 2);

      ctx.beginPath();
      ctx.arc(0, 0, 68, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(248, 224, 238, 0.55)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(218, 165, 86, 0.7)';
      ctx.stroke();

      this.#drawSlotSymbol(ctx, SLOT_SYMBOLS[i]);
      ctx.restore();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return this.#trackTex(tex);
  }

  #drawSlotSymbol(ctx, symbol) {
    if (symbol === 'crown') {
      // Corona Real dorada con rubíes
      ctx.beginPath();
      ctx.moveTo(-44, 28);
      ctx.lineTo(-48, -18);
      ctx.lineTo(-22, 4);
      ctx.lineTo(0, -36);
      ctx.lineTo(22, 4);
      ctx.lineTo(48, -18);
      ctx.lineTo(44, 28);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, -36, 0, 34);
      g.addColorStop(0, '#ffe87a');
      g.addColorStop(1, '#d68f22');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#7a4b0b';
      ctx.stroke();

      ctx.fillStyle = '#e82e78';
      for (const [jx, jy] of [[-48, -18], [0, -36], [48, -18], [0, 14]]) {
        ctx.beginPath();
        ctx.arc(jx, jy, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    if (symbol === 'diamond') {
      // Diamante Azul facetado
      ctx.beginPath();
      ctx.moveTo(-28, -34);
      ctx.lineTo(28, -34);
      ctx.lineTo(48, -8);
      ctx.lineTo(0, 46);
      ctx.lineTo(-48, -8);
      ctx.closePath();
      const g = ctx.createLinearGradient(-40, -34, 40, 44);
      g.addColorStop(0, '#aef2ff');
      g.addColorStop(0.5, '#29a8f5');
      g.addColorStop(1, '#1259b5');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#0d3b7a';
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-48, -8);
      ctx.lineTo(48, -8);
      ctx.moveTo(-20, -34);
      ctx.lineTo(-14, -8);
      ctx.lineTo(0, 46);
      ctx.moveTo(20, -34);
      ctx.lineTo(14, -8);
      ctx.lineTo(0, 46);
      ctx.stroke();
      return;
    }

    if (symbol === 'rose') {
      // Rosa Imperial con hojas
      ctx.fillStyle = '#2e8b57';
      ctx.beginPath();
      ctx.ellipse(-26, 26, 20, 10, -0.5, 0, Math.PI * 2);
      ctx.ellipse(26, 26, 20, 10, 0.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#c81d66';
      ctx.beginPath();
      ctx.arc(0, -4, 38, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ff5c9e';
      ctx.beginPath();
      ctx.arc(-8, -8, 24, 0, Math.PI * 2);
      ctx.arc(10, -2, 22, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffd1e6';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(0, -4, 16, 0.3, Math.PI * 1.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -4, 7, 0, Math.PI * 1.5);
      ctx.stroke();
      return;
    }

    if (symbol === 'star') {
      // Estrella Dorada
      ctx.beginPath();
      for (let p = 0; p < 10; p++) {
        const rad = p % 2 === 0 ? 48 : 20;
        const a = -Math.PI / 2 + (p * Math.PI) / 5;
        const px = Math.cos(a) * rad;
        const py = Math.sin(a) * rad;
        if (p === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      const g = ctx.createRadialGradient(0, -6, 4, 0, 0, 48);
      g.addColorStop(0, '#fff7b2');
      g.addColorStop(0.6, '#ffc837');
      g.addColorStop(1, '#d98416');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#7d4b08';
      ctx.stroke();
      return;
    }

    // 'seven': 7 Imperial carmesí y oro
    ctx.font = 'bold 104px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#e6ad3e';
    ctx.strokeText('7', 0, 4);
    const g7 = ctx.createLinearGradient(0, -44, 0, 44);
    g7.addColorStop(0, '#ff3b7f');
    g7.addColorStop(1, '#9c093d');
    ctx.fillStyle = g7;
    ctx.fillText('7', 0, 4);
  }

  #createBlackjackFeltTexture() {
    const S = 512;
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#5c1438';
    ctx.fillRect(0, 0, S, S);

    // Arco dorado del tapete (en UV de CircleGeometry rotado hacia +Z)
    ctx.save();
    ctx.translate(S * 0.5, S * 0.5);
    ctx.rotate(Math.PI);

    ctx.strokeStyle = '#e7bd6b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, S * 0.36, 0, Math.PI, false);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 210, 140, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, S * 0.30, 0, Math.PI, false);
    ctx.stroke();

    // Inscripción real
    ctx.fillStyle = '#f5d284';
    ctx.font = 'bold 20px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('BLACKJACK PAYS 3 TO 2', 0, 108);
    ctx.font = 'bold 15px Georgia, serif';
    ctx.fillStyle = '#ffbde0';
    ctx.fillText('DEALER STANDS ON ALL 17', 0, 78);

    // Círculo de apuesta (betSpot en Z = +0.52 -> sy ≈ +214)
    ctx.beginPath();
    ctx.arc(0, 214, 24, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffd578';
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return this.#trackTex(tex);
  }

  #createSparkTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.28, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.65, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return this.#trackTex(tex);
  }

  /**
   * Adaptador de tema del reino (la cúpula conserva su estética cristal/oro-rosa imperial).
   */
  applyTheme() {}
}
