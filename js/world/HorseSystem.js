import * as THREE from 'three';

export const HORSE_VARIANTS = Object.freeze({
  imperial_white: Object.freeze({
    id: 'imperial_white',
    name: 'Blanco Imperial',
    coat: 0xfbf7f5,
    muzzle: 0xf0d6d2,
    mane: 0xf4cf72,
    hooves: 0xd9b36c,
    saddle: 0xd43b7a,
    trim: 0xf2c864,
    eye: 0x3a6ee8
  }),
  pearl_rose: Object.freeze({
    id: 'pearl_rose',
    name: 'Perla Rosado',
    coat: 0xf7d6e6,
    muzzle: 0xf0bfd6,
    mane: 0xfff3f8,
    hooves: 0xcfa46e,
    saddle: 0x9b2868,
    trim: 0xf5d078,
    eye: 0x8b46d9
  }),
  royal_chestnut: Object.freeze({
    id: 'royal_chestnut',
    name: 'Castaño Real',
    coat: 0x9c5534,
    muzzle: 0x733a22,
    mane: 0x3b1d12,
    hooves: 0x261a18,
    saddle: 0xb8245a,
    trim: 0xf0c25c,
    eye: 0x4d3018
  }),
  jet_black: Object.freeze({
    id: 'jet_black',
    name: 'Negro Azabache',
    coat: 0x26212c,
    muzzle: 0x383142,
    mane: 0xd8dce8,
    hooves: 0x18151d,
    saddle: 0x881d58,
    trim: 0xe6eaf5,
    eye: 0x5cc4ff
  })
});

export const HORSE_SEAT_OFFSET = Object.freeze({ y: 0.52, z: -0.02 });

const BASE_BODY_Y = 1.10;
const LEG_UPPER_Y = -0.12;
const LEG_UPPER_LEN = 0.48;
const LEG_LOWER_LEN = 0.50;

const HORSE_SPAWNS = Object.freeze([
  Object.freeze({ id: 'horse_1', variantId: 'imperial_white', x: -8.5, z: -11.5, yaw: 0.45 }),
  Object.freeze({ id: 'horse_2', variantId: 'pearl_rose', x: -8.2, z: 10.2, yaw: -0.35 }),
  Object.freeze({ id: 'horse_3', variantId: 'royal_chestnut', x: 18.0, z: -2.0, yaw: Math.PI * 0.5 }),
  Object.freeze({ id: 'horse_4', variantId: 'jet_black', x: 118.5, z: -7.0, yaw: -Math.PI * 0.5 }),
  Object.freeze({ id: 'horse_5', variantId: 'imperial_white', x: 118.5, z: 7.0, yaw: -Math.PI * 0.5 })
]);

// Cache compartido de geometrías con conteo de referencias para reutilización segura entre
// caballos locales y remotos (RemotePlayer) sin fugas de memoria.
let _sharedGeos = null;
let _sharedRefCount = 0;

function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function freezeStatic(mesh) {
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

function createCurvedTubeGeo(points, radius, tubularSegs = 14, radialSegs = 8) {
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.TubeGeometry(curve, tubularSegs, radius, radialSegs, false);
}

function createSculptedNeckGeo() {
  const pts = [
    new THREE.Vector3(0, -0.04, -0.04),
    new THREE.Vector3(0, 0.14, 0.04),
    new THREE.Vector3(0, 0.34, 0.14),
    new THREE.Vector3(0, 0.54, 0.22)
  ];
  const curve = new THREE.CatmullRomCurve3(pts);
  const segs = 16;
  const radSegs = 14;
  const geo = new THREE.TubeGeometry(curve, segs, 1, radSegs, false);
  const pos = geo.attributes.position;
  const frames = curve.computeFrenetFrames(segs, false);

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const center = curve.getPointAt(t);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    // Cuello esbelto hacia la nuca y ancho musculoso en la base del pecho
    const radiusZ = 0.195 * (1 - t * 0.44);
    const radiusX = 0.145 * (1 - t * 0.38);

    for (let j = 0; j <= radSegs; j++) {
      const idx = i * (radSegs + 1) + j;
      const vx = pos.getX(idx) - center.x;
      const vy = pos.getY(idx) - center.y;
      const vz = pos.getZ(idx) - center.z;
      const nComp = vx * N.x + vy * N.y + vz * N.z;
      const bComp = vx * B.x + vy * B.y + vz * B.z;
      pos.setXYZ(
        idx,
        center.x + N.x * nComp * radiusZ + B.x * bComp * radiusX,
        center.y + N.y * nComp * radiusZ + B.y * bComp * radiusX,
        center.z + N.z * nComp * radiusZ + B.z * bComp * radiusX
      );
    }
  }
  geo.computeVertexNormals();
  return geo;
}

function createManeLockGeo() {
  const geo = new THREE.ConeGeometry(0.055, 0.22, 8);
  geo.scale(0.62, 1, 1.35);
  return geo;
}

function createTailStrandGeo(length, spreadX, sweepZ, thickness) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(spreadX * 0.6, -length * 0.32, sweepZ * 0.72),
    new THREE.Vector3(spreadX, -length * 0.72, sweepZ * 1.15),
    new THREE.Vector3(spreadX * 0.7, -length, sweepZ * 0.92)
  ]);
  const segs = 14;
  const radSegs = 8;
  const geo = new THREE.TubeGeometry(curve, segs, 1, radSegs, false);
  const pos = geo.attributes.position;

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const center = curve.getPointAt(t);
    const profile = Math.sin(Math.min(1, t * 0.88 + 0.12) * Math.PI) * thickness + thickness * 0.22 * (1 - t);
    for (let j = 0; j <= radSegs; j++) {
      const idx = i * (radSegs + 1) + j;
      pos.setXYZ(
        idx,
        center.x + (pos.getX(idx) - center.x) * profile,
        center.y + (pos.getY(idx) - center.y) * profile,
        center.z + (pos.getZ(idx) - center.z) * profile
      );
    }
  }
  geo.computeVertexNormals();
  return geo;
}

function acquireSharedGeometries() {
  _sharedRefCount++;
  if (_sharedGeos) return _sharedGeos;

  const blanketGeo = new THREE.CylinderGeometry(0.282, 0.286, 0.56, 20, 1, true, -Math.PI * 0.54, Math.PI * 1.08);
  blanketGeo.rotateX(-Math.PI * 0.5);

  const girthGeo = new THREE.TorusGeometry(0.262, 0.018, 8, 24);
  girthGeo.scale(0.96, 1.03, 1.0);

  const stirrupStrapGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.48, 8);
  const stirrupArchGeo = new THREE.TorusGeometry(0.042, 0.009, 8, 16, Math.PI * 1.15);
  const stirrupBaseGeo = new THREE.BoxGeometry(0.088, 0.014, 0.036);

  const reinCurveL = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.076, 0.475, 0.965),
    new THREE.Vector3(0.165, 0.36, 0.58),
    new THREE.Vector3(0.135, 0.34, 0.28),
    new THREE.Vector3(0.0, 0.355, 0.22)
  ]);
  const reinCurveR = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.076, 0.475, 0.965),
    new THREE.Vector3(-0.165, 0.36, 0.58),
    new THREE.Vector3(-0.135, 0.34, 0.28),
    new THREE.Vector3(0.0, 0.355, 0.22)
  ]);

  const headBridgeGeo = new THREE.CylinderGeometry(0.068, 0.11, 0.30, 14);
  headBridgeGeo.rotateX(Math.PI * 0.5);

  _sharedGeos = {
    barrel: new THREE.SphereGeometry(0.265, 20, 16),
    chest: new THREE.SphereGeometry(0.255, 18, 14),
    croup: new THREE.SphereGeometry(0.265, 18, 14),
    neck: createSculptedNeckGeo(),
    maneLock: createManeLockGeo(),
    forelock: new THREE.ConeGeometry(0.045, 0.16, 8),

    cranium: new THREE.SphereGeometry(0.135, 16, 14),
    bridge: headBridgeGeo,
    muzzle: new THREE.SphereGeometry(0.076, 14, 12),
    jaw: new THREE.SphereGeometry(0.062, 12, 10),
    nostril: new THREE.SphereGeometry(0.014, 8, 8),
    earOuter: new THREE.ConeGeometry(0.038, 0.135, 10),
    earInner: new THREE.ConeGeometry(0.022, 0.095, 8),

    sclera: new THREE.SphereGeometry(0.030, 12, 10),
    iris: new THREE.SphereGeometry(0.021, 12, 10),
    pupil: new THREE.SphereGeometry(0.011, 10, 8),
    catchlight: new THREE.SphereGeometry(0.005, 8, 8),
    lash: new THREE.TorusGeometry(0.031, 0.0035, 6, 14, Math.PI * 0.82),

    browband: new THREE.TorusGeometry(0.105, 0.009, 8, 18, Math.PI * 1.05),
    noseband: new THREE.TorusGeometry(0.078, 0.009, 8, 18),
    cheekStrap: createCurvedTubeGeo([
      new THREE.Vector3(0, 0.05, 0.08),
      new THREE.Vector3(0, 0.01, 0.22),
      new THREE.Vector3(0, -0.025, 0.34)
    ], 0.0075, 10, 6),
    bitRing: new THREE.TorusGeometry(0.022, 0.0055, 6, 14),
    gem: new THREE.OctahedronGeometry(0.024, 1),
    plume: new THREE.ConeGeometry(0.035, 0.13, 8),

    blanket: blanketGeo,
    blanketTrim: new THREE.BoxGeometry(0.014, 0.022, 0.56),
    emblem: new THREE.CylinderGeometry(0.032, 0.032, 0.012, 12),
    saddleSeat: new THREE.SphereGeometry(0.195, 16, 12),
    pommel: new THREE.TorusGeometry(0.145, 0.024, 8, 16, Math.PI * 0.92),
    cantle: new THREE.TorusGeometry(0.155, 0.026, 8, 16, Math.PI * 0.86),
    girth: girthGeo,
    stirrupStrap: stirrupStrapGeo,
    stirrupArch: stirrupArchGeo,
    stirrupBase: stirrupBaseGeo,
    reinL: new THREE.TubeGeometry(reinCurveL, 14, 0.0095, 6, false),
    reinR: new THREE.TubeGeometry(reinCurveR, 14, 0.0095, 6, false),

    tailDock: new THREE.ConeGeometry(0.058, 0.18, 10),
    tailMain: createTailStrandGeo(0.76, 0, -0.26, 0.078),
    tailSideL: createTailStrandGeo(0.68, 0.055, -0.22, 0.052),
    tailSideR: createTailStrandGeo(0.68, -0.055, -0.22, 0.052),

    shoulderCap: new THREE.SphereGeometry(0.105, 12, 10),
    hipCap: new THREE.SphereGeometry(0.132, 12, 10),
    frontUpper: new THREE.CylinderGeometry(0.095, 0.062, LEG_UPPER_LEN, 12),
    backUpper: new THREE.CylinderGeometry(0.125, 0.066, LEG_UPPER_LEN, 12),
    jointSphere: new THREE.SphereGeometry(0.060, 10, 10),
    cannon: new THREE.CylinderGeometry(0.054, 0.043, 0.42, 12),
    fetlock: new THREE.SphereGeometry(0.050, 10, 8),
    hoof: new THREE.CylinderGeometry(0.047, 0.068, 0.082, 14),

    halo: new THREE.RingGeometry(0.72, 0.92, 32)
  };

  return _sharedGeos;
}

function releaseSharedGeometries() {
  _sharedRefCount = Math.max(0, _sharedRefCount - 1);
  if (_sharedRefCount === 0 && _sharedGeos) {
    for (const geo of Object.values(_sharedGeos)) {
      geo.dispose();
    }
    _sharedGeos = null;
  }
}

function buildSaddleGroup(geos, mats) {
  const saddleGroup = new THREE.Group();

  // Mantilla festoneada real
  const blanket = new THREE.Mesh(geos.blanket, mats.saddle);
  blanket.position.set(0, 0.025, -0.02);
  blanket.scale.set(1.0, 1.04, 1.0);
  blanket.castShadow = true;
  blanket.receiveShadow = true;
  saddleGroup.add(freezeStatic(blanket));

  // Ribetes dorados laterales y medallones reales en la mantilla
  for (const s of [-1, 1]) {
    const trimBar = new THREE.Mesh(geos.blanketTrim, mats.trim);
    trimBar.position.set(s * 0.278, -0.025, -0.02);
    trimBar.rotation.z = s * 0.22;
    saddleGroup.add(freezeStatic(trimBar));

    const emblem = new THREE.Mesh(geos.emblem, mats.trim);
    emblem.position.set(s * 0.275, 0.055, -0.14);
    emblem.rotation.z = Math.PI * 0.5;
    saddleGroup.add(freezeStatic(emblem));
  }

  // Cincha bajo el barril
  const girth = new THREE.Mesh(geos.girth, mats.saddle);
  girth.position.set(0, 0.015, 0.05);
  saddleGroup.add(freezeStatic(girth));

  // Asiento acolchado curvado (top a y_local ≈ 0.30 -> y_mundo ≈ 1.40)
  const seat = new THREE.Mesh(geos.saddleSeat, mats.saddle);
  seat.position.set(0, 0.245, -0.02);
  seat.scale.set(0.92, 0.28, 1.18);
  seat.castShadow = true;
  seat.receiveShadow = true;
  saddleGroup.add(freezeStatic(seat));

  // Borrén delantero dorado (pommel) + gema
  const pommel = new THREE.Mesh(geos.pommel, mats.trim);
  pommel.position.set(0, 0.23, 0.19);
  pommel.rotation.x = 0.24;
  pommel.rotation.z = Math.PI * 0.04;
  saddleGroup.add(freezeStatic(pommel));

  const pommelGem = new THREE.Mesh(geos.gem, mats.gem);
  pommelGem.position.set(0, 0.365, 0.225);
  saddleGroup.add(freezeStatic(pommelGem));

  // Borrén trasero dorado (cantle)
  const cantle = new THREE.Mesh(geos.cantle, mats.trim);
  cantle.position.set(0, 0.24, -0.22);
  cantle.rotation.x = -0.30;
  cantle.rotation.z = Math.PI * 0.07;
  saddleGroup.add(freezeStatic(cantle));

  // Estribos dorados colgando en x = ±0.30, y_mundo ≈ 0.72..1.10
  for (const s of [-1, 1]) {
    const strap = new THREE.Mesh(geos.stirrupStrap, mats.trim);
    strap.position.set(s * 0.285, -0.06, 0.02);
    strap.rotation.z = s * 0.06;
    saddleGroup.add(freezeStatic(strap));

    const arch = new THREE.Mesh(geos.stirrupArch, mats.trim);
    arch.position.set(s * 0.30, -0.32, 0.02);
    arch.rotation.y = Math.PI * 0.5;
    arch.rotation.z = -Math.PI * 0.075;
    saddleGroup.add(freezeStatic(arch));

    const footplate = new THREE.Mesh(geos.stirrupBase, mats.trim);
    footplate.position.set(s * 0.30, -0.355, 0.02);
    saddleGroup.add(freezeStatic(footplate));
  }

  // Riendas doradas hacia la cruz/pommel cerca de las manos del jinete
  const reinL = new THREE.Mesh(geos.reinL, mats.trim);
  const reinR = new THREE.Mesh(geos.reinR, mats.trim);
  saddleGroup.add(freezeStatic(reinL), freezeStatic(reinR));

  return saddleGroup;
}

function buildHeadGroup(geos, mats) {
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.53, 0.22);
  headPivot.rotation.x = 0.36;

  // Cráneo y puente nasal estilizado
  const cranium = new THREE.Mesh(geos.cranium, mats.coat);
  cranium.position.set(0, 0.02, 0.03);
  cranium.scale.set(0.95, 1.0, 1.15);
  cranium.castShadow = true;
  cranium.receiveShadow = true;
  headPivot.add(freezeStatic(cranium));

  const bridge = new THREE.Mesh(geos.bridge, mats.coat);
  bridge.position.set(0, -0.015, 0.20);
  bridge.scale.set(0.94, 0.90, 1.0);
  bridge.castShadow = true;
  bridge.receiveShadow = true;
  headPivot.add(freezeStatic(bridge));

  // Hocico suave + mandíbula + ollares
  const muzzle = new THREE.Mesh(geos.muzzle, mats.muzzle);
  muzzle.position.set(0, -0.022, 0.355);
  muzzle.scale.set(1.0, 0.92, 1.08);
  muzzle.castShadow = true;
  muzzle.receiveShadow = true;
  headPivot.add(freezeStatic(muzzle));

  const jaw = new THREE.Mesh(geos.jaw, mats.muzzle);
  jaw.position.set(0, -0.062, 0.315);
  jaw.scale.set(0.92, 0.72, 1.18);
  headPivot.add(freezeStatic(jaw));

  for (const s of [-1, 1]) {
    const nostril = new THREE.Mesh(geos.nostril, mats.hooves);
    nostril.position.set(s * 0.038, -0.002, 0.415);
    nostril.scale.set(0.75, 1.0, 0.55);
    headPivot.add(freezeStatic(nostril));
  }

  // Ojos grandes expresivos en capas (esclera + iris + pupila + catchlight + pestaña)
  for (const s of [-1, 1]) {
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(s * 0.098, 0.036, 0.13);
    eyeGroup.rotation.y = s * 0.56;

    const sclera = new THREE.Mesh(geos.sclera, mats.sclera);
    sclera.scale.set(0.76, 1.04, 0.96);
    eyeGroup.add(freezeStatic(sclera));

    const iris = new THREE.Mesh(geos.iris, mats.eye);
    iris.position.set(s * 0.008, 0, 0.014);
    eyeGroup.add(freezeStatic(iris));

    const pupil = new THREE.Mesh(geos.pupil, mats.pupil);
    pupil.position.set(s * 0.012, 0, 0.024);
    eyeGroup.add(freezeStatic(pupil));

    const catchlight = new THREE.Mesh(geos.catchlight, mats.catchlight);
    catchlight.position.set(s * 0.016, 0.012, 0.028);
    eyeGroup.add(freezeStatic(catchlight));

    const lash = new THREE.Mesh(geos.lash, mats.pupil);
    lash.position.set(s * 0.003, 0.012, 0.006);
    lash.rotation.x = -0.35;
    lash.rotation.z = Math.PI * 0.09;
    eyeGroup.add(freezeStatic(lash));

    headPivot.add(freezeStatic(eyeGroup));
  }

  // Orejas articuladas
  const buildEar = (side) => {
    const earPivot = new THREE.Group();
    earPivot.position.set(side * 0.072, 0.135, 0.015);
    earPivot.rotation.set(0.18, side * 0.14, -side * 0.22);

    const outer = new THREE.Mesh(geos.earOuter, mats.coat);
    outer.position.y = 0.062;
    outer.scale.set(0.85, 1.0, 0.65);
    outer.castShadow = true;
    earPivot.add(freezeStatic(outer));

    const inner = new THREE.Mesh(geos.earInner, mats.muzzle);
    inner.position.set(0, 0.056, 0.014);
    inner.scale.set(0.75, 1.0, 0.45);
    earPivot.add(freezeStatic(inner));

    headPivot.add(earPivot);
    return earPivot;
  };
  const lEar = buildEar(1);
  const rEar = buildEar(-1);

  // Flequillo real en la frente
  const forelock = new THREE.Mesh(geos.forelock, mats.mane);
  forelock.position.set(0, 0.125, 0.095);
  forelock.rotation.x = 1.92;
  forelock.scale.set(1.15, 1.0, 0.72);
  headPivot.add(freezeStatic(forelock));

  // Brida / testera dorada + gema emisiva + penacho real
  const browband = new THREE.Mesh(geos.browband, mats.trim);
  browband.position.set(0, 0.088, 0.085);
  browband.rotation.x = 1.15;
  browband.rotation.z = -Math.PI * 0.025;
  headPivot.add(freezeStatic(browband));

  const headGem = new THREE.Mesh(geos.gem, mats.gem);
  headGem.position.set(0, 0.115, 0.145);
  headPivot.add(freezeStatic(headGem));

  const plumeBase = new THREE.Mesh(geos.bitRing, mats.trim);
  plumeBase.position.set(0, 0.155, 0.055);
  plumeBase.rotation.x = Math.PI * 0.5;
  headPivot.add(freezeStatic(plumeBase));

  const plume = new THREE.Mesh(geos.plume, mats.saddle);
  plume.position.set(0, 0.215, 0.045);
  plume.rotation.x = -0.18;
  headPivot.add(freezeStatic(plume));

  const noseband = new THREE.Mesh(geos.noseband, mats.trim);
  noseband.position.set(0, -0.02, 0.305);
  noseband.scale.set(1.06, 0.94, 1.0);
  headPivot.add(freezeStatic(noseband));

  for (const s of [-1, 1]) {
    const strap = new THREE.Mesh(geos.cheekStrap, mats.trim);
    strap.position.x = s * 0.088;
    headPivot.add(freezeStatic(strap));

    const bit = new THREE.Mesh(geos.bitRing, mats.trim);
    bit.position.set(s * 0.076, -0.036, 0.335);
    bit.rotation.y = Math.PI * 0.5;
    headPivot.add(freezeStatic(bit));
  }

  return { headPivot, lEar, rEar };
}

function buildLeg(geos, mats, sideX, posZ, isFront) {
  const upperPivot = new THREE.Group();
  upperPivot.position.set(sideX, LEG_UPPER_Y, posZ);

  const cap = new THREE.Mesh(isFront ? geos.shoulderCap : geos.hipCap, mats.coat);
  cap.scale.set(0.88, 1.08, 1.05);
  cap.castShadow = true;
  upperPivot.add(freezeStatic(cap));

  const upperMesh = new THREE.Mesh(isFront ? geos.frontUpper : geos.backUpper, mats.coat);
  upperMesh.position.y = -LEG_UPPER_LEN * 0.5;
  upperMesh.castShadow = true;
  upperMesh.receiveShadow = true;
  upperPivot.add(freezeStatic(upperMesh));

  const knee = new THREE.Mesh(geos.jointSphere, mats.coat);
  knee.position.y = -LEG_UPPER_LEN;
  upperPivot.add(freezeStatic(knee));

  const lowerPivot = new THREE.Group();
  lowerPivot.position.set(0, -LEG_UPPER_LEN, 0);
  upperPivot.add(lowerPivot);

  const cannon = new THREE.Mesh(geos.cannon, mats.coat);
  cannon.position.y = -0.21;
  cannon.castShadow = true;
  cannon.receiveShadow = true;
  lowerPivot.add(freezeStatic(cannon));

  const fetlock = new THREE.Mesh(geos.fetlock, mats.mane);
  fetlock.position.y = -0.41;
  fetlock.scale.set(0.95, 0.85, 1.05);
  lowerPivot.add(freezeStatic(fetlock));

  // Base exacta de la pezuña en y = -LEG_LOWER_LEN (-0.50) -> y_mundo = 0.000
  const hoof = new THREE.Mesh(geos.hoof, mats.hooves);
  hoof.position.y = -LEG_LOWER_LEN + 0.041;
  hoof.castShadow = true;
  hoof.receiveShadow = true;
  lowerPivot.add(freezeStatic(hoof));

  return { upperPivot, lowerPivot };
}

/**
 * Crea un modelo 3D estilizado y articulado de caballo real.
 * @param {string} [variantId='imperial_white']
 */
export function createHorseModel(variantId = 'imperial_white') {
  const variant = HORSE_VARIANTS[variantId] || HORSE_VARIANTS.imperial_white;
  const geos = acquireSharedGeometries();

  const mats = {
    coat: new THREE.MeshStandardMaterial({ color: variant.coat, roughness: 0.52, metalness: 0.04 }),
    muzzle: new THREE.MeshStandardMaterial({ color: variant.muzzle, roughness: 0.62, metalness: 0.02 }),
    mane: new THREE.MeshStandardMaterial({ color: variant.mane, roughness: 0.48, metalness: 0.06 }),
    hooves: new THREE.MeshStandardMaterial({ color: variant.hooves, roughness: 0.28, metalness: 0.35 }),
    saddle: new THREE.MeshStandardMaterial({
      color: variant.saddle,
      roughness: 0.42,
      metalness: 0.10,
      side: THREE.DoubleSide
    }),
    trim: new THREE.MeshStandardMaterial({ color: variant.trim, roughness: 0.24, metalness: 0.82 }),
    gem: new THREE.MeshStandardMaterial({
      color: variant.eye,
      emissive: variant.eye,
      emissiveIntensity: 0.55,
      roughness: 0.16,
      metalness: 0.25
    }),
    sclera: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.22, metalness: 0.02 }),
    eye: new THREE.MeshStandardMaterial({
      color: variant.eye,
      emissive: variant.eye,
      emissiveIntensity: 0.24,
      roughness: 0.18,
      metalness: 0.08
    }),
    pupil: new THREE.MeshStandardMaterial({ color: 0x16121b, roughness: 0.15, metalness: 0.05 }),
    catchlight: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.48,
      roughness: 0.1
    })
  };

  const root = new THREE.Group();
  root.name = `Horse_${variant.id}`;

  const bodyPivot = new THREE.Group();
  bodyPivot.position.set(0, BASE_BODY_Y, 0);
  root.add(bodyPivot);

  // Torso (barril, pecho, grupa, silla y bridas)
  const torsoGroup = new THREE.Group();
  bodyPivot.add(torsoGroup);

  const barrel = new THREE.Mesh(geos.barrel, mats.coat);
  barrel.position.set(0, 0.02, 0.02);
  barrel.scale.set(0.98, 0.98, 1.72);
  barrel.castShadow = true;
  barrel.receiveShadow = true;
  torsoGroup.add(freezeStatic(barrel));

  const chest = new THREE.Mesh(geos.chest, mats.coat);
  chest.position.set(0, 0.04, 0.39);
  chest.scale.set(0.98, 1.04, 1.04);
  chest.castShadow = true;
  chest.receiveShadow = true;
  torsoGroup.add(freezeStatic(chest));

  const croup = new THREE.Mesh(geos.croup, mats.coat);
  croup.position.set(0, 0.05, -0.37);
  croup.scale.set(1.02, 1.02, 1.08);
  croup.castShadow = true;
  croup.receiveShadow = true;
  torsoGroup.add(freezeStatic(croup));

  torsoGroup.add(buildSaddleGroup(geos, mats));

  // Cuello y crin multicapa
  const neckPivot = new THREE.Group();
  neckPivot.position.set(0, 0.14, 0.42);
  neckPivot.rotation.x = 0.08;
  bodyPivot.add(neckPivot);

  const neckMesh = new THREE.Mesh(geos.neck, mats.coat);
  neckMesh.castShadow = true;
  neckMesh.receiveShadow = true;
  neckPivot.add(freezeStatic(neckMesh));

  const maneGroup = new THREE.Group();
  neckPivot.add(maneGroup);

  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const lock = new THREE.Mesh(geos.maneLock, mats.mane);
    const side = i % 2 === 0 ? 1 : 0.72;
    lock.position.set(
      0.078 * side,
      0.06 + t * 0.44,
      -0.06 + t * 0.14
    );
    lock.rotation.set(-0.78 - t * 0.25, 0.22, -0.46 - (i % 2) * 0.16);
    const sc = 1.15 - t * 0.28;
    lock.scale.set(sc, sc * 1.12, sc);
    lock.castShadow = true;
    maneGroup.add(freezeStatic(lock));
  }

  // Cabeza y orejas
  const { headPivot, lEar, rEar } = buildHeadGroup(geos, mats);
  neckPivot.add(headPivot);

  // Cola articulada multicapa
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.17, -0.60);
  bodyPivot.add(tailPivot);

  const dock = new THREE.Mesh(geos.tailDock, mats.coat);
  dock.position.set(0, -0.04, -0.05);
  dock.rotation.x = -0.82;
  tailPivot.add(freezeStatic(dock));

  const tailMain = new THREE.Mesh(geos.tailMain, mats.mane);
  tailMain.position.set(0, -0.05, -0.06);
  tailMain.castShadow = true;
  tailPivot.add(freezeStatic(tailMain));

  const tailSideL = new THREE.Mesh(geos.tailSideL, mats.mane);
  tailSideL.position.set(0.02, -0.06, -0.06);
  tailSideL.castShadow = true;
  tailPivot.add(freezeStatic(tailSideL));

  const tailSideR = new THREE.Mesh(geos.tailSideR, mats.mane);
  tailSideR.position.set(-0.02, -0.06, -0.06);
  tailSideR.castShadow = true;
  tailPivot.add(freezeStatic(tailSideR));

  // 4 patas articuladas (delanteras en +Z, traseras en -Z; izquierda en +X, derecha en -X)
  const fl = buildLeg(geos, mats, 0.145, 0.36, true);
  const fr = buildLeg(geos, mats, -0.145, 0.36, true);
  const bl = buildLeg(geos, mats, 0.155, -0.36, false);
  const br = buildLeg(geos, mats, -0.155, -0.36, false);

  bodyPivot.add(fl.upperPivot, fr.upperPivot, bl.upperPivot, br.upperPivot);

  let disposed = false;
  const model = {
    root,
    variantId: variant.id,
    bones: {
      bodyPivot,
      torsoGroup,
      neckPivot,
      maneGroup,
      headPivot,
      lEar,
      rEar,
      tailPivot,
      flUpper: fl.upperPivot,
      flLower: fl.lowerPivot,
      frUpper: fr.upperPivot,
      frLower: fr.lowerPivot,
      blUpper: bl.upperPivot,
      blLower: bl.lowerPivot,
      brUpper: br.upperPivot,
      brLower: br.lowerPivot
    },
    phase: 0,
    idleTime: 0,
    earTimer: 1.8 + Math.random() * 2.4,
    bounceY: 0,
    pitch: 0,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const mat of Object.values(mats)) {
        mat.dispose();
      }
      releaseSharedGeometries();
    }
  };

  return model;
}

/**
 * Anima el modelo 3D del caballo según el estado de movimiento sin asignar memoria por frame.
 * @param {ReturnType<typeof createHorseModel>} model
 * @param {'idle'|'walk'|'run'|'jump'} [animState='idle']
 * @param {number} [dt=0.016]
 * @param {number} [speedRatio=0]
 */
export function animateHorseModel(model, animState = 'idle', dt = 0.016, speedRatio = 0) {
  if (!model || !model.bones) return;
  const clampedDt = dt > 0.05 ? 0.05 : dt < 0 ? 0 : dt;
  const b = model.bones;
  const blend = 1 - Math.exp(-12 * clampedDt);

  let targetBounce = 0;
  let targetPitch = 0;
  let targetNeckX = 0.08;
  let targetHeadX = 0.36;
  let targetHeadY = 0;
  let targetTailX = 0.14;
  let targetTailZ = 0;
  let targetManeZ = 0;
  let targetManeX = 0;

  let flU = 0;
  let flL = 0;
  let frU = 0;
  let frL = 0;
  let blU = 0;
  let blL = 0;
  let brU = 0;
  let brL = 0;

  let lEarX = 0.18;
  let rEarX = 0.18;
  let lEarZ = -0.22;
  let rEarZ = 0.22;

  if (animState === 'jump') {
    model.phase += clampedDt * 4.0;
    targetBounce = 0.06;
    targetPitch = -0.20;
    targetNeckX = -0.02;
    targetHeadX = 0.22;
    targetTailX = 0.58;
    targetTailZ = Math.sin(model.phase * 2.5) * 0.08;
    targetManeX = -0.18;
    targetManeZ = Math.sin(model.phase * 3.0) * 0.06;

    flU = -0.96;
    flL = 1.32;
    frU = -0.86;
    frL = 1.24;
    blU = 0.72;
    blL = 0.24;
    brU = 0.64;
    brL = 0.28;

    lEarX = 0.34;
    rEarX = 0.34;
    b.torsoGroup.scale.set(
      damp(b.torsoGroup.scale.x, 1, 10, clampedDt),
      damp(b.torsoGroup.scale.y, 1, 10, clampedDt),
      1
    );
  } else if (animState === 'run') {
    const rate = 10.6 + speedRatio * 3.2;
    model.phase += clampedDt * rate;
    const ph = model.phase;

    // Galope asimétrico en 4 tiempos: br -> bl -> fr -> fl
    const sBR = Math.sin(ph);
    const sBL = Math.sin(ph - 0.68);
    const sFR = Math.sin(ph - 2.32);
    const sFL = Math.sin(ph - 3.05);

    const cBR = Math.cos(ph);
    const cBL = Math.cos(ph - 0.68);
    const cFR = Math.cos(ph - 2.32);
    const cFL = Math.cos(ph - 3.05);

    flU = sFL * 0.72;
    frU = sFR * 0.72;
    blU = sBL * 0.70;
    brU = sBR * 0.70;

    flL = Math.max(0, -cFL) * 0.98 + Math.max(0, -sFL) * 0.25;
    frL = Math.max(0, -cFR) * 0.98 + Math.max(0, -sFR) * 0.25;
    blL = Math.max(0, cBL) * 0.88 + 0.06;
    brL = Math.max(0, cBR) * 0.88 + 0.06;

    targetBounce = (0.5 - 0.5 * Math.cos(ph + 0.35)) * 0.085;
    targetPitch = -Math.sin(ph + 0.55) * 0.095;
    targetNeckX = 0.34 + Math.sin(ph + 0.4) * 0.14;
    targetHeadX = 0.24 - Math.sin(ph + 0.4) * 0.10;
    targetTailX = 0.48 + Math.sin(ph * 1.0) * 0.16;
    targetTailZ = Math.sin(ph * 0.5) * 0.10;
    targetManeX = -0.14 - Math.sin(ph) * 0.08;
    targetManeZ = Math.sin(ph * 2.0) * 0.09;

    lEarX = 0.28;
    rEarX = 0.28;
    b.torsoGroup.scale.set(
      damp(b.torsoGroup.scale.x, 1, 10, clampedDt),
      damp(b.torsoGroup.scale.y, 1, 10, clampedDt),
      1
    );
  } else if (animState === 'walk') {
    const rate = 6.6 + speedRatio * 2.4;
    model.phase += clampedDt * rate;
    const ph = model.phase;
    const s = Math.sin(ph);
    const c = Math.cos(ph);

    // Trote elegante en pares diagonales: (FL + BR) y (FR + BL)
    flU = s * 0.44;
    brU = s * 0.44;
    frU = -s * 0.44;
    blU = -s * 0.44;

    flL = Math.max(0, -c) * 0.56 + 0.04;
    frL = Math.max(0, c) * 0.56 + 0.04;
    brL = Math.max(0, c) * 0.42 + 0.04;
    blL = Math.max(0, -c) * 0.42 + 0.04;

    targetBounce = Math.abs(s) * 0.045;
    targetPitch = c * 0.025;
    targetNeckX = 0.14 + Math.sin(ph * 2.0) * 0.045;
    targetHeadX = 0.36 - Math.sin(ph * 2.0) * 0.04;
    targetTailX = 0.24 + Math.sin(ph * 2.0) * 0.06;
    targetTailZ = Math.sin(ph) * 0.07;
    targetManeX = -0.04;
    targetManeZ = Math.sin(ph) * 0.045;

    b.torsoGroup.scale.set(
      damp(b.torsoGroup.scale.x, 1, 10, clampedDt),
      damp(b.torsoGroup.scale.y, 1, 10, clampedDt),
      1
    );
  } else {
    // Reposo vivo: respiración del torso, balanceo sutil de cola, cabeceo y movimiento de orejas
    model.idleTime += clampedDt;
    const t = model.idleTime;
    const breath = Math.sin(t * 1.95);

    b.torsoGroup.scale.set(1 + breath * 0.013, 1 + breath * 0.008, 1);

    targetBounce = 0;
    targetPitch = 0;
    targetNeckX = 0.08 + Math.sin(t * 1.1) * 0.032 + breath * 0.01;
    targetHeadX = 0.36 + Math.sin(t * 0.95 + 0.6) * 0.036;
    targetHeadY = Math.sin(t * 0.48) * 0.075;
    targetTailX = 0.12 + Math.sin(t * 1.6) * 0.03;
    targetTailZ = Math.sin(t * 1.35) * 0.085;
    targetManeZ = Math.sin(t * 1.2) * 0.015;

    model.earTimer -= clampedDt;
    if (model.earTimer <= 0) {
      model.earTimer = 2.2 + ((Math.sin(t * 7.3) + 1) * 1.4);
    } else if (model.earTimer < 0.32) {
      const flick = Math.sin((model.earTimer / 0.32) * Math.PI);
      lEarX = 0.18 + flick * 0.28;
      rEarX = 0.18 - flick * 0.16;
      lEarZ = -0.22 - flick * 0.12;
      rEarZ = 0.22 + flick * 0.08;
    }
  }

  model.bounceY = damp(model.bounceY, targetBounce, 14, clampedDt);
  model.pitch = damp(model.pitch, targetPitch, 14, clampedDt);

  b.bodyPivot.position.y = BASE_BODY_Y + model.bounceY;
  b.bodyPivot.rotation.x = model.pitch;

  b.neckPivot.rotation.x += (targetNeckX - b.neckPivot.rotation.x) * blend;
  b.headPivot.rotation.x += (targetHeadX - b.headPivot.rotation.x) * blend;
  b.headPivot.rotation.y += (targetHeadY - b.headPivot.rotation.y) * blend;

  b.tailPivot.rotation.x += (targetTailX - b.tailPivot.rotation.x) * blend;
  b.tailPivot.rotation.z += (targetTailZ - b.tailPivot.rotation.z) * blend;
  b.maneGroup.rotation.x += (targetManeX - b.maneGroup.rotation.x) * blend;
  b.maneGroup.rotation.z += (targetManeZ - b.maneGroup.rotation.z) * blend;

  b.lEar.rotation.x += (lEarX - b.lEar.rotation.x) * blend;
  b.rEar.rotation.x += (rEarX - b.rEar.rotation.x) * blend;
  b.lEar.rotation.z += (lEarZ - b.lEar.rotation.z) * blend;
  b.rEar.rotation.z += (rEarZ - b.rEar.rotation.z) * blend;

  b.flUpper.rotation.x += (flU - b.flUpper.rotation.x) * blend;
  b.flLower.rotation.x += (flL - b.flLower.rotation.x) * blend;
  b.frUpper.rotation.x += (frU - b.frUpper.rotation.x) * blend;
  b.frLower.rotation.x += (frL - b.frLower.rotation.x) * blend;
  b.blUpper.rotation.x += (blU - b.blUpper.rotation.x) * blend;
  b.blLower.rotation.x += (blL - b.blLower.rotation.x) * blend;
  b.brUpper.rotation.x += (brU - b.brUpper.rotation.x) * blend;
  b.brLower.rotation.x += (brL - b.brLower.rotation.x) * blend;
}

/**
 * Gestiona los caballos reales del mundo, la búsqueda de monturas libres,
 * el montaje/desmontaje y la sincronización de animación y posición.
 */
export class HorseSystem {
  #scene;
  #collision;
  #audio;
  #root = null;
  #horses = [];
  #positionsCache = [];
  #haloMats = [];
  #mountSyncResult = {
    seatY: HORSE_SEAT_OFFSET.y,
    seatZ: HORSE_SEAT_OFFSET.z,
    bounceY: 0,
    pitch: 0
  };
  #pulseTime = 0;

  constructor(scene, collisionSystem, audioManager = null) {
    this.#scene = scene;
    this.#collision = collisionSystem;
    this.#audio = audioManager;
  }

  init() {
    this.#root = new THREE.Group();
    this.#root.name = 'RoyalHorses';

    const sharedGeos = acquireSharedGeometries();

    for (let i = 0; i < HORSE_SPAWNS.length; i++) {
      const cfg = HORSE_SPAWNS[i];
      const variant = HORSE_VARIANTS[cfg.variantId] || HORSE_VARIANTS.imperial_white;
      const model = createHorseModel(cfg.variantId);
      const groundY = this.#collision?.getGroundHeight?.(cfg.x, cfg.z, 0, 2.0) ?? 0;

      model.root.position.set(cfg.x, groundY, cfg.z);
      model.root.rotation.y = cfg.yaw;
      model.idleTime = i * 1.37;

      // Halo sutil en el suelo para indicar montura disponible (sin PointLight)
      const haloMat = new THREE.MeshBasicMaterial({
        color: variant.trim,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      this.#haloMats.push(haloMat);

      const halo = new THREE.Mesh(sharedGeos.halo, haloMat);
      halo.rotation.x = -Math.PI * 0.5;
      halo.position.y = 0.03;
      model.root.add(halo);

      this.#root.add(model.root);

      const horse = {
        id: cfg.id,
        variantId: variant.id,
        name: variant.name,
        x: cfg.x,
        y: groundY,
        z: cfg.z,
        yaw: cfg.yaw,
        mounted: false,
        model,
        root: model.root,
        halo
      };

      this.#horses.push(horse);
      this.#positionsCache.push({
        id: horse.id,
        variantId: horse.variantId,
        x: horse.x,
        z: horse.z,
        mounted: horse.mounted
      });
    }

    this.#scene.add(this.#root);
  }

  /**
   * Devuelve el caballo libre más cercano dentro de maxDist, o null si no hay ninguno.
   */
  getNearestFreeHorse(playerPos, maxDist = 3.2) {
    if (!playerPos) return null;
    const maxDistSq = maxDist * maxDist;
    let best = null;
    let bestDistSq = maxDistSq;

    for (let i = 0; i < this.#horses.length; i++) {
      const h = this.#horses[i];
      if (h.mounted) continue;
      const dx = playerPos.x - h.x;
      const dy = playerPos.y - h.y;
      const dz = playerPos.z - h.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq <= bestDistSq) {
        bestDistSq = distSq;
        best = h;
      }
    }
    return best;
  }

  /**
   * Marca un caballo como montado, oculta su halo y reproduce un sonido suave.
   */
  mountHorse(horse) {
    if (!horse) return null;
    horse.mounted = true;
    if (horse.halo) horse.halo.visible = false;
    this.#audio?.playClick?.();
    return horse;
  }

  /**
   * Desmonta al jugador buscando una posición lateral/adyacente libre de colisiones.
   */
  dismountHorse(horse) {
    if (!horse) return { x: 0, y: 0, z: 0 };
    horse.mounted = false;
    if (horse.halo) horse.halo.visible = true;

    animateHorseModel(horse.model, 'idle', 0.05, 0);
    horse.model.bounceY = 0;
    horse.model.pitch = 0;
    horse.model.bones.bodyPivot.position.y = BASE_BODY_Y;
    horse.model.bones.bodyPivot.rotation.x = 0;

    const sinY = Math.sin(horse.yaw);
    const cosY = Math.cos(horse.yaw);
    // Lateral izquierdo (+X local), derecho (-X local), detrás (-Z local), delante (+Z local)
    const dirs = [
      { dx: cosY, dz: -sinY, dist: 1.35 },
      { dx: -cosY, dz: sinY, dist: 1.35 },
      { dx: -sinY, dz: -cosY, dist: 1.45 },
      { dx: sinY, dz: cosY, dist: 1.45 },
      { dx: cosY, dz: -sinY, dist: 0.95 },
      { dx: -cosY, dz: sinY, dist: 0.95 }
    ];

    for (let i = 0; i < dirs.length; i++) {
      const d = dirs[i];
      const tx = horse.x + d.dx * d.dist;
      const tz = horse.z + d.dz * d.dist;
      const ty = this.#collision?.getGroundHeight?.(tx, tz, horse.y + 0.4, 1.5) ?? horse.y;
      const blocked = this.#collision?.isPointBlocked?.(tx, ty + 0.9, tz, 0.42) ?? false;
      if (!blocked) {
        this.#audio?.playClick?.();
        return { x: tx, y: ty, z: tz };
      }
    }

    const fallbackY = this.#collision?.getGroundHeight?.(horse.x, horse.z, horse.y + 0.4, 1.5) ?? horse.y;
    this.#audio?.playClick?.();
    return { x: horse.x, y: fallbackY, z: horse.z };
  }

  /**
   * Sincroniza la posición, rotación y animación de un caballo montado.
   * Devuelve un objeto prealocado sin asignaciones por frame.
   */
  syncMountedHorse(horse, pos, yaw, animState, speedRatio, dt) {
    horse.x = pos.x;
    horse.y = pos.y;
    horse.z = pos.z;
    horse.yaw = yaw;
    horse.root.position.set(pos.x, pos.y, pos.z);
    horse.root.rotation.y = yaw;

    animateHorseModel(horse.model, animState, dt, speedRatio);

    this.#mountSyncResult.seatY = HORSE_SEAT_OFFSET.y;
    this.#mountSyncResult.seatZ = HORSE_SEAT_OFFSET.z;
    this.#mountSyncResult.bounceY = horse.model.bounceY;
    this.#mountSyncResult.pitch = horse.model.pitch;
    return this.#mountSyncResult;
  }

  /**
   * Actualiza y devuelve un array prealocado con las posiciones actuales de todos los caballos.
   */
  getHorsePositions() {
    for (let i = 0; i < this.#horses.length; i++) {
      const h = this.#horses[i];
      const entry = this.#positionsCache[i];
      entry.x = h.x;
      entry.z = h.z;
      entry.mounted = h.mounted;
    }
    return this.#positionsCache;
  }

  update(dt) {
    this.#pulseTime += dt;
    const pulse = 0.96 + Math.sin(this.#pulseTime * 2.6) * 0.05;

    for (let i = 0; i < this.#horses.length; i++) {
      const h = this.#horses[i];
      if (!h.mounted) {
        animateHorseModel(h.model, 'idle', dt, 0);
        if (h.halo) {
          h.halo.scale.set(pulse, pulse, 1);
        }
      }
    }
  }

  dispose() {
    if (this.#root) {
      this.#scene?.remove(this.#root);
      this.#root = null;
    }
    for (let i = 0; i < this.#horses.length; i++) {
      this.#horses[i].model.dispose();
    }
    for (let i = 0; i < this.#haloMats.length; i++) {
      this.#haloMats[i].dispose();
    }
    if (this.#horses.length > 0) {
      releaseSharedGeometries();
    }
    this.#horses.length = 0;
    this.#haloMats.length = 0;
    this.#positionsCache.length = 0;
  }
}
