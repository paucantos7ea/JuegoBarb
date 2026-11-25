import * as THREE from 'three';

function swapAttr3(attr, a, b) {
  const x = attr.getX(a);
  const y = attr.getY(a);
  const z = attr.getZ(a);
  attr.setXYZ(a, attr.getX(b), attr.getY(b), attr.getZ(b));
  attr.setXYZ(b, x, y, z);
}

function swapAttr2(attr, a, b) {
  const x = attr.getX(a);
  const y = attr.getY(a);
  attr.setXY(a, attr.getX(b), attr.getY(b));
  attr.setXY(b, x, y);
}

function mergeGeometries(pieces) {
  if (!pieces || pieces.length === 0) return null;

  const normalized = [];
  let totalVerts = 0;

  for (let i = 0; i < pieces.length; i++) {
    const { geometry, matrix } = pieces[i];
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (!g.attributes.normal) {
      g.computeVertexNormals();
    }
    if (matrix) {
      g.applyMatrix4(matrix);
      if (matrix.determinant() < 0) {
        const pos = g.attributes.position;
        const norm = g.attributes.normal;
        const uv = g.attributes.uv;
        for (let v = 0; v < pos.count; v += 3) {
          const v1 = v + 1;
          const v2 = v + 2;
          swapAttr3(pos, v1, v2);
          if (norm) swapAttr3(norm, v1, v2);
          if (uv) swapAttr2(uv, v1, v2);
        }
      }
    }
    totalVerts += g.attributes.position.count;
    normalized.push(g);
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);

  let offset = 0;
  for (let i = 0; i < normalized.length; i++) {
    const g = normalized[i];
    const pos = g.attributes.position;
    const norm = g.attributes.normal;
    const uv = g.attributes.uv;
    const count = pos.count;

    for (let v = 0; v < count; v++) {
      const i3 = (offset + v) * 3;
      const i2 = (offset + v) * 2;
      positions[i3] = pos.getX(v);
      positions[i3 + 1] = pos.getY(v);
      positions[i3 + 2] = pos.getZ(v);

      if (norm) {
        normals[i3] = norm.getX(v);
        normals[i3 + 1] = norm.getY(v);
        normals[i3 + 2] = norm.getZ(v);
      }
      if (uv) {
        uvs[i2] = uv.getX(v);
        uvs[i2 + 1] = uv.getY(v);
      }
    }
    offset += count;
    g.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

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
  #tempGeos = [];
  #staticBuckets = new Map();
  #sharedGoldMat = null;
  #sharedMarbleMat = null;

  // Elementos animados y materiales compartidos
  #medallionRingInst = null;
  #medallionRings = [];
  #medallionInnerMat = null;
  #spotlights = [];
  #spotHousingInst = null;
  #spotLensInst = null;
  #spotBeamInst = null;
  #beamMat = null;
  #beamBaseOpacity = 0.11;
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
  #localObj = new THREE.Object3D();

  // Estado de animación y temática
  #time = 0;
  #idleAnimAcc = 0;
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

    const marbleMap = this.#textures.getTexture('marble', 3, 3);
    const roseGoldMap = this.#textures.getTexture('roseGold', 2, 2);
    this.#sharedMarbleMat = this.#trackMat(new THREE.MeshStandardMaterial({
      map: marbleMap,
      color: 0xf8eef3,
      roughness: 0.40,
      metalness: 0.08
    }));
    this.#sharedGoldMat = this.#trackMat(new THREE.MeshStandardMaterial({
      map: roseGoldMap,
      color: 0xf4c28a,
      roughness: 0.24,
      metalness: 0.82
    }));
    this.#sharedGoldMat.userData.preserveRoughness = true;

    this.#buildRunwayArena();
    this.#buildRaceArena();
    this.#buildBallroomGalaRotunda();
    this.#flushStaticBuckets(this.#group);
    this.#buildAnimatedPennants();

    this.#group.matrixAutoUpdate = false;
    this.#group.updateMatrix();
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

  #finalizeStaticInstanced(inst, castShadow = false, receiveShadow = false) {
    inst.castShadow = castShadow;
    inst.receiveShadow = receiveShadow;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.matrixAutoUpdate = false;
    inst.updateMatrix();
    return inst;
  }

  #addStaticPiece(geo, mat, matrix, castShadow = false, receiveShadow = true, sharedGeo = false) {
    if (!sharedGeo) {
      this.#tempGeos.push(geo);
    }
    const key = `${mat.id}_${castShadow ? 1 : 0}_${receiveShadow ? 1 : 0}`;
    let bucket = this.#staticBuckets.get(key);
    if (!bucket) {
      bucket = { mat, castShadow, receiveShadow, pieces: [] };
      this.#staticBuckets.set(key, bucket);
    }
    bucket.pieces.push({ geometry: geo, matrix: matrix.clone() });
  }

  #addStaticMesh(geo, mat, x, y, z, castShadow = false, receiveShadow = true, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, sharedGeo = false) {
    this.#localObj.position.set(x, y, z);
    this.#localObj.rotation.set(rx, ry, rz);
    this.#localObj.scale.set(sx, sy, sz);
    this.#localObj.updateMatrix();
    this.#addStaticPiece(geo, mat, this.#localObj.matrix, castShadow, receiveShadow, sharedGeo);
  }

  #flushStaticBuckets(parent) {
    for (const bucket of this.#staticBuckets.values()) {
      const merged = mergeGeometries(bucket.pieces);
      if (!merged) continue;
      this.#trackGeo(merged);
      const mesh = new THREE.Mesh(merged, bucket.mat);
      mesh.castShadow = bucket.castShadow;
      mesh.receiveShadow = bucket.receiveShadow;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
    }
    this.#staticBuckets.clear();
    for (const g of this.#tempGeos) g.dispose();
    this.#tempGeos.length = 0;
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

    const floorMap = this.#textures.getTexture('marbleFloor', 3, 12);
    const crossFloorMap = this.#textures.getTexture('marbleFloor', 6, 2);
    const carpetMap = this.#textures.getTexture('carpet', 1, 14);
    const crossCarpetMap = this.#textures.getTexture('carpet', 1, 6);
    const crystalMap = this.#textures.getTexture('stainedCrystal', 2, 2);

    const baseMarbleMat = this.#sharedMarbleMat;

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

    const goldMat = this.#sharedGoldMat;

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
    this.#addStaticMesh(new THREE.BoxGeometry(5.6, 0.58, 32.5), baseMarbleMat, -46, 0.29, 2.75, false, true);
    this.#addStaticMesh(new THREE.BoxGeometry(5.64, 0.07, 32.5), runwayDeckMat, -46, 0.615, 2.75, false, true);
    this.#addStaticMesh(new THREE.BoxGeometry(17.0, 0.58, 5.0), baseMarbleMat, -46, 0.29, 21.5, false, true);
    this.#addStaticMesh(new THREE.BoxGeometry(17.04, 0.07, 5.04), runwayCrossMat, -46, 0.615, 21.5, false, true);

    // Colisiones exactas de superficie de pasarela
    this.#collision.addFlatSurface(-48.8, -43.2, -13.5, 19.0, 0.65);
    this.#collision.addFlatSurface(-54.5, -37.5, 19.0, 24.0, 0.65);

    // Alfombra imperial central y en T
    this.#addStaticMesh(new THREE.BoxGeometry(2.6, 0.014, 34.4), carpetMainMat, -46, 0.657, 3.7, false, true);
    this.#addStaticMesh(new THREE.BoxGeometry(15.6, 0.012, 2.5), carpetCrossMat, -46, 0.656, 21.5, false, true);

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
      this.#addStaticMesh(new THREE.BoxGeometry(w, h, d), edgeGlowMat, x, y, z, false, false);
    }

    // 4 Medallones de pose iluminados (material compartido + anillos animados)
    const medallionZ = [-4.0, 4.0, 12.0, 21.5];
    const outerMedGeo = new THREE.CylinderGeometry(1.18, 1.26, 0.04, 32);
    const innerMedGeo = new THREE.CylinderGeometry(0.88, 0.92, 0.05, 28);
    const ringMedGeo = this.#trackGeo(new THREE.TorusGeometry(1.06, 0.045, 10, 32));
    this.#tempGeos.push(outerMedGeo, innerMedGeo);

    this.#medallionInnerMat = this.#trackMat(new THREE.MeshStandardMaterial({
      map: crystalMap,
      color: 0xffd9ec,
      emissive: 0xff8dc4,
      emissiveIntensity: 0.55,
      roughness: 0.18,
      metalness: 0.25
    }));
    this.#medallionInnerMat.userData.preserveRoughness = true;

    this.#medallionRingInst = this.#trackInstanced(new THREE.InstancedMesh(ringMedGeo, edgeGlowMat, medallionZ.length));
    this.#medallionRingInst.castShadow = false;
    this.#medallionRingInst.receiveShadow = false;

    medallionZ.forEach((mz, idx) => {
      this.#addStaticMesh(outerMedGeo, goldMat, -46, 0.68, mz, false, true, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(innerMedGeo, this.#medallionInnerMat, -46, 0.686, mz, false, true, 0, 0, 0, 1, 1, 1, true);

      this.#dummy.position.set(-46, 0.705, mz);
      this.#dummy.rotation.set(Math.PI / 2, 0, 0);
      this.#dummy.scale.set(1, 1, 1);
      this.#dummy.updateMatrix();
      this.#medallionRingInst.setMatrixAt(idx, this.#dummy.matrix);
      this.#medallionRings.push({ x: -46, y: 0.705, z: mz, phase: idx * 0.9 });
    });
    this.#medallionRingInst.instanceMatrix.needsUpdate = true;
    this.#medallionRingInst.computeBoundingSphere();
    arena.add(this.#medallionRingInst);

    // --- Escaleras de acceso a la pasarela ---
    this.#buildVisualStair({
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

    this.#buildVisualStair({
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
    this.#buildBackstageArch(baseMarbleMat, goldMat, edgeGlowMat, velvetCurtainMat, crystalMap);

    // --- Puente de luces adicional y focos cenitales sobre la pasarela ---
    this.#buildRunwayLightRig(arena, goldMat, edgeGlowMat);

    // --- Pasillo Central VIP (Z ∈ [-3.5, 3.5] completamente despejado hacia la pasarela) ---
    this.#addStaticMesh(new THREE.BoxGeometry(15.2, 0.018, 3.2), carpetCrossMat, -35.6, 0.01, 0, false, true);
    const vipTrimGeo = new THREE.BoxGeometry(15.2, 0.025, 0.14);
    this.#tempGeos.push(vipTrimGeo);
    for (const zTrim of [-1.68, 1.68]) {
      this.#addStaticMesh(vipTrimGeo, goldMat, -35.6, 0.015, zTrim, false, true, 0, 0, 0, 1, 1, 1, true);
    }

    // --- Gradas Escalonadas Reales + Asientos Instanciados + Público 3D ---
    this.#buildGrandstandsAndCrowd(arena, baseMarbleMat, goldMat, edgeGlowMat);

    arena.matrixAutoUpdate = false;
    arena.updateMatrix();
    this.#group.add(arena);
  }

  #buildVisualStair({ steps, startX, endX, startZ, endZ, axis, maxHeight, stepMat, trimMat }) {
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

      this.#addStaticMesh(new THREE.BoxGeometry(sx, h, sz), stepMat, px, h * 0.5, pz, false, true);

      const nosingX = axis === 'x' ? startX + (endX - startX) * frac0 : px;
      const nosingZ = axis === 'z' ? startZ + (endZ - startZ) * frac0 : pz;
      this.#addStaticMesh(
        new THREE.BoxGeometry(axis === 'x' ? 0.07 : sx, 0.035, axis === 'z' ? 0.07 : sz),
        trimMat,
        nosingX,
        h + 0.005,
        nosingZ,
        false,
        true
      );
    }
  }

  #buildBackstageArch(marbleMat, goldMat, glowMat, curtainMat, crystalMap) {
    const ox = -46;
    const oz = -14.5;

    const colPositions = [
      [-3.7, -0.45],
      [-2.7, 0.35],
      [2.7, 0.35],
      [3.7, -0.45]
    ];

    const plinthGeo = new THREE.BoxGeometry(0.86, 0.72, 0.86);
    const shaftGeo = new THREE.CylinderGeometry(0.28, 0.34, 4.9, 16);
    const capGeo = new THREE.BoxGeometry(0.9, 0.36, 0.9);
    this.#tempGeos.push(plinthGeo, shaftGeo, capGeo);

    for (const [cx, cz] of colPositions) {
      this.#addStaticMesh(plinthGeo, marbleMat, ox + cx, 0.36, oz + cz, false, true, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(shaftGeo, goldMat, ox + cx, 3.15, oz + cz, true, true, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(capGeo, marbleMat, ox + cx, 5.75, oz + cz, false, true, 0, 0, 0, 1, 1, 1, true);

      this.#collision.addCylinderCollider(ox + cx, oz + cz, 0.45, 0, 5.8);
    }

    // Dintel y gran arco iluminado superior
    this.#addStaticMesh(new THREE.BoxGeometry(8.8, 0.55, 1.35), marbleMat, ox, 6.15, oz, true, true);
    this.#addStaticMesh(new THREE.TorusGeometry(2.6, 0.24, 14, 36, Math.PI), goldMat, ox, 6.35, oz + 0.15, true, true);
    this.#addStaticMesh(new THREE.TorusGeometry(2.35, 0.08, 10, 32, Math.PI), glowMat, ox, 6.35, oz + 0.32, false, false);

    // Medallón de cristal en el tímpano del arco
    const crestMat = this.#trackMat(new THREE.MeshStandardMaterial({
      map: crystalMap,
      color: 0xffd9ef,
      emissive: 0xff92c8,
      emissiveIntensity: 0.52,
      roughness: 0.2,
      metalness: 0.25
    }));
    this.#addStaticMesh(new THREE.CylinderGeometry(1.1, 1.1, 0.18, 24), crestMat, ox, 7.45, oz + 0.25, false, false, Math.PI / 2);

    // Cortinas de terciopelo rosa imperial recogidas a ambos lados
    const topDrapeGeo = new THREE.CylinderGeometry(0.58, 0.36, 3.1, 14);
    const botDrapeGeo = new THREE.CylinderGeometry(0.32, 0.62, 2.35, 14);
    const tiebackGeo = new THREE.TorusGeometry(0.35, 0.06, 8, 20);
    this.#tempGeos.push(topDrapeGeo, botDrapeGeo, tiebackGeo);

    for (const side of [-1, 1]) {
      this.#addStaticMesh(topDrapeGeo, curtainMat, ox + side * 2.25, 4.35, oz + 0.55, false, true, 0, 0, side * -0.14, 1, 1, 1, true);
      this.#addStaticMesh(botDrapeGeo, curtainMat, ox + side * 2.52, 1.85, oz + 0.55, false, true, 0, 0, side * 0.1, 1, 1, 1, true);
      this.#addStaticMesh(tiebackGeo, goldMat, ox + side * 2.42, 2.95, oz + 0.55, false, true, Math.PI / 2, 0, 0, 1, 1, 1, true);
    }

    // Valance superior del telón
    this.#addStaticMesh(new THREE.BoxGeometry(5.2, 0.65, 0.38), curtainMat, ox, 5.6, oz + 0.55, false, true);

    // Cartel "PASARELA IMPERIAL" sobre el pórtico
    const signTex = this.#makeSignTexture('✦ PASARELA IMPERIAL ✦', 'Gran Desfile del Palacio');
    const signMat = this.#trackMat(new THREE.MeshStandardMaterial({
      map: signTex,
      roughness: 0.35,
      metalness: 0.12
    }));
    this.#addStaticMesh(new THREE.BoxGeometry(3.8, 1.15, 0.14), signMat, ox, 6.22, oz + 0.72, false, false);
  }

  #buildRunwayLightRig(parent, goldMat, glowMat) {
    // Puentes de luces cenitales sobre la pasarela
    const gantryPositions = [-12.5, 4.0, 18.6];
    const postGeo = new THREE.CylinderGeometry(0.11, 0.14, 6.4, 10);
    const trussGeo = new THREE.BoxGeometry(8.6, 0.24, 0.28);
    this.#tempGeos.push(postGeo, trussGeo);

    for (const gz of gantryPositions) {
      for (const side of [-1, 1]) {
        this.#addStaticMesh(postGeo, goldMat, -46 + side * 4.15, 3.2, gz, false, true, 0, 0, 0, 1, 1, 1, true);
      }
      this.#addStaticMesh(trussGeo, goldMat, -46, 6.35, gz, false, true, 0, 0, 0, 1, 1, 1, true);
    }

    // Focos cenitales instanciados con 1 beamMat compartido
    const housingGeo = this.#trackGeo(new THREE.CylinderGeometry(0.16, 0.22, 0.42, 12));
    housingGeo.rotateX(Math.PI * 0.15);
    const lensGeo = this.#trackGeo(new THREE.CircleGeometry(0.2, 12));
    lensGeo.rotateX(Math.PI / 2);
    lensGeo.translate(0, -0.22, 0);
    const beamGeo = this.#trackGeo(new THREE.ConeGeometry(1.75, 6.4, 20, 1, true));
    beamGeo.translate(0, -3.2, 0);

    this.#beamMat = this.#trackMat(new THREE.MeshBasicMaterial({
      color: 0xffd8ec,
      transparent: true,
      opacity: this.#beamBaseOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));

    const beamSpecs = [
      { pos: [-48.2, 6.2, -12.5], targetZ: -4.0, phase: 0.0 },
      { pos: [-43.8, 6.2, -12.5], targetZ: -4.0, phase: 1.4 },
      { pos: [-48.2, 6.2, 4.0], targetZ: 4.0, phase: 2.3 },
      { pos: [-43.8, 6.2, 4.0], targetZ: 12.0, phase: 3.1 },
      { pos: [-48.5, 6.2, 18.6], targetZ: 21.5, phase: 4.0 },
      { pos: [-43.5, 6.2, 18.6], targetZ: 21.5, phase: 5.2 }
    ];

    this.#spotHousingInst = this.#trackInstanced(new THREE.InstancedMesh(housingGeo, goldMat, beamSpecs.length));
    this.#spotLensInst = this.#trackInstanced(new THREE.InstancedMesh(lensGeo, glowMat, beamSpecs.length));
    this.#spotBeamInst = this.#trackInstanced(new THREE.InstancedMesh(beamGeo, this.#beamMat, beamSpecs.length));
    this.#spotHousingInst.castShadow = false;
    this.#spotHousingInst.receiveShadow = true;
    this.#spotLensInst.castShadow = false;
    this.#spotLensInst.receiveShadow = false;
    this.#spotBeamInst.castShadow = false;
    this.#spotBeamInst.receiveShadow = false;

    for (const spec of beamSpecs) {
      const baseRotX = Math.atan2(spec.targetZ - spec.pos[2], 5.6);
      const baseRotZ = Math.atan2(-46 - spec.pos[0], 5.6);
      this.#spotlights.push({
        x: spec.pos[0],
        y: spec.pos[1],
        z: spec.pos[2],
        baseRotX,
        baseRotZ,
        phase: spec.phase
      });
    }
    this.#updateSpotlights(0, 0);
    this.#spotHousingInst.computeBoundingSphere();
    this.#spotLensInst.computeBoundingSphere();
    this.#spotBeamInst.computeBoundingSphere();
    parent.add(this.#spotHousingInst, this.#spotLensInst, this.#spotBeamInst);
  }

  #buildGrandstandsAndCrowd(parent, marbleMat, goldMat, glowMat) {
    const tierHeights = [0.55, 1.10, 1.65, 2.20, 2.75];
    const seatPositions = [];

    const postGeo = new THREE.CylinderGeometry(0.055, 0.065, 1.0, 8);
    const sideRailGeo = new THREE.BoxGeometry(2.0, 0.08, 0.09);
    this.#tempGeos.push(postGeo, sideRailGeo);

    const buildStandBlock = ({ minZ, maxZ, outerX, innerX, dirX, stairMinZ, stairMaxZ, railMinZ, railMaxZ }) => {
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

        this.#addStaticMesh(new THREE.BoxGeometry(2.0, h, lenZ), marbleMat, cx, h * 0.5, centerZ, true, true);
        this.#addStaticMesh(new THREE.BoxGeometry(0.08, 0.06, lenZ), goldMat, xA, h - 0.01, centerZ, false, true);

        // Superficie caminable plana de cada nivel
        this.#collision.addFlatSurface(xMin, xMax, minZ, maxZ, h);
      }

      // Escalera de acceso (rampa suave + escalones visuales)
      const stairX0 = innerX - dirX * 1.4;
      const stairX1 = innerX;
      const stairX5 = innerX + dirX * 8.0;

      this.#buildVisualStair({
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
          this.#addStaticMesh(
            new THREE.BoxGeometry(Math.abs(p1 - p0), 0.19, stairMaxZ - stairMinZ),
            goldMat,
            (p0 + p1) * 0.5,
            stepH - 0.09,
            (stairMinZ + stairMaxZ) * 0.5,
            false,
            true
          );
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
      this.#addStaticMesh(new THREE.BoxGeometry(0.1, 0.09, lenZ), goldMat, backRailX, 3.72, centerZ, false, true);

      const postCount = Math.max(3, Math.round(lenZ / 3.2));
      for (let p = 0; p <= postCount; p++) {
        const pz = minZ + 0.25 + (lenZ - 0.5) * (p / postCount);
        this.#addStaticMesh(postGeo, goldMat, backRailX, 3.25, pz, false, true, 0, 0, 0, 1, 1, 1, true);
      }

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

          this.#addStaticMesh(sideRailGeo, goldMat, cx, h + 0.92, sideZ, false, true, 0, 0, 0, 1, 1, 1, true);
          this.#addStaticMesh(postGeo, goldMat, xB - dirX * 0.15, h + 0.48, sideZ, false, true, 0, 0, 0, 1, 1, 1, true);

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

    // Grada Oeste continua
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

    // Grada Este Bloque Norte
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

    // Grada Este Bloque Sur
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
    const westCols = [-8.4, -5.6, -2.8, 0.0, 6.4, 9.2, 12.0, 14.8];
    for (let t = 0; t < 5; t++) {
      const seatX = -53.55 - t * 2.0;
      const seatY = tierHeights[t];
      for (const sz of westCols) {
        seatPositions.push({ x: seatX, y: seatY, z: sz, yaw: Math.PI * 0.5 });
      }
    }

    const eastNorthCols = [-8.7, -6.5];
    const eastSouthCols = [6.6, 9.4, 12.2, 15.0];
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

    const seatColorA = new THREE.Color(0xc93b7d);
    const seatColorB = new THREE.Color(0xdf6aa3);
    const dummy = this.#dummy;

    seatPositions.forEach((sp, i) => {
      const dir = Math.sin(sp.yaw);
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

    this.#finalizeStaticInstanced(cushionMesh, false, true);
    this.#finalizeStaticInstanced(frameMesh, false, true);
    this.#finalizeStaticInstanced(backMesh, false, true);
    parent.add(cushionMesh, frameMesh, backMesh);

    // --- Seleccionar 56 espectadores sentados en ambas gradas (InstancedMesh animado) ---
    const chosenSeats = [];
    for (let i = 0; i < seatPositions.length && chosenSeats.length < 56; i++) {
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

    this.#updateCrowdPose(0);

    for (const m of [
      this.#spectatorTorsoMesh,
      this.#spectatorHeadMesh,
      this.#spectatorHatMesh,
      this.#spectatorLeftArmMesh,
      this.#spectatorRightArmMesh
    ]) {
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
      parent.add(m);
    }
  }

  // =========================================================================
  // 2. ARENA DE SALIDA/META DE CARRERA Y EQUITACIÓN REAL
  //    X ∈ [13.5, 26.5], Z ∈ [8.5, 20.5], centro (18, 0, 14)
  // =========================================================================
  #buildRaceArena() {
    const floorMap = this.#textures.getTexture('marbleFloor', 4, 1);

    const whiteFenceMat = this.#sharedMarbleMat;
    const goldMat = this.#sharedGoldMat;

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
    this.#addStaticMesh(new THREE.BoxGeometry(6.6, 0.025, 1.3), lineMat, 18, 0.012, 14, false, true);

    // Gran Arco de Salida/Meta en (18, 0, 14): pilares en X = 14.5 y X = 21.5
    const pillarGeo = new THREE.CylinderGeometry(0.32, 0.4, 4.9, 16);
    const plinthGeo = new THREE.BoxGeometry(0.95, 0.6, 0.95);
    const finialGeo = new THREE.OctahedronGeometry(0.36, 1);
    this.#tempGeos.push(pillarGeo, plinthGeo, finialGeo);

    for (const px of [14.5, 21.5]) {
      this.#addStaticMesh(plinthGeo, whiteFenceMat, px, 0.3, 14, false, true, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(pillarGeo, goldMat, px, 2.75, 14, true, true, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(finialGeo, goldMat, px, 5.55, 14, false, true, 0, 0, 0, 1, 1, 1, true);

      this.#collision.addCylinderCollider(px, 14, 0.48, 0, 5.2);
    }

    this.#addStaticMesh(new THREE.BoxGeometry(8.2, 0.48, 0.85), whiteFenceMat, 18, 5.18, 14, true, true);
    this.#addStaticMesh(new THREE.TorusGeometry(2.3, 0.16, 12, 30, Math.PI), goldMat, 18, 5.35, 14, true, true);

    const bannerTex = this.#makeSignTexture('♛ SALIDA · META REAL ♛', 'Gran Circuito del Reino', '#c83a82');
    const bannerMat = this.#trackMat(new THREE.MeshStandardMaterial({
      map: bannerTex,
      roughness: 0.38,
      metalness: 0.1
    }));
    this.#addStaticMesh(new THREE.BoxGeometry(4.8, 1.15, 0.16), bannerMat, 18, 5.85, 14, false, false);

    // Vallas ornamentales blancas y doradas en X = 14.2 y X = 21.8 (Z ∈ [9.5, 18.5])
    const postGeo = new THREE.CylinderGeometry(0.09, 0.11, 1.12, 10);
    const capBallGeo = new THREE.SphereGeometry(0.13, 10, 8);
    const railGeo = new THREE.BoxGeometry(0.08, 0.1, 9.0);
    this.#tempGeos.push(postGeo, capBallGeo, railGeo);

    for (const fx of [14.2, 21.8]) {
      for (let z = 9.5; z <= 18.51; z += 1.8) {
        this.#addStaticMesh(postGeo, whiteFenceMat, fx, 0.56, z, false, true, 0, 0, 0, 1, 1, 1, true);
        this.#addStaticMesh(capBallGeo, goldMat, fx, 1.16, z, false, true, 0, 0, 0, 1, 1, 1, true);
      }
      for (const ry of [0.46, 0.92]) {
        this.#addStaticMesh(railGeo, whiteFenceMat, fx, ry, 14.0, false, true, 0, 0, 0, 1, 1, 1, true);
      }
      this.#collision.addBox(fx - 0.18, fx + 0.18, 0, 1.4, 9.5, 18.5);
    }

    // Postes de señalización dorados en las entradas Norte (Z = 8.9) y Sur (Z = 19.1)
    const signPostGeo = new THREE.CylinderGeometry(0.11, 0.14, 2.2, 10);
    const lanternGeo = new THREE.OctahedronGeometry(0.22, 0);
    const lanternMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xffe4a8,
      emissive: 0xffb85c,
      emissiveIntensity: 0.65,
      roughness: 0.2,
      metalness: 0.3
    }));
    this.#tempGeos.push(signPostGeo, lanternGeo);

    for (const [sx, sz] of [[14.0, 8.9], [22.0, 8.9], [14.0, 19.1], [22.0, 19.1]]) {
      this.#addStaticMesh(signPostGeo, goldMat, sx, 1.1, sz, false, true, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(lanternGeo, lanternMat, sx, 2.35, sz, false, false, 0, 0, 0, 1, 1, 1, true);
      this.#collision.addCylinderCollider(sx, sz, 0.24, 0, 2.5);
    }

    // 2 tribunas pequeñas cubiertas en el lateral Este (X = 24.5, Z = 11.2 y Z = 16.8)
    for (const tz of [11.2, 16.8]) {
      this.#buildMiniTribune(24.5, tz, -Math.PI * 0.5, whiteFenceMat, goldMat, canopyMat);
    }

    // Saltos / obstáculos ecuestres decorativos fuera del pasillo de paso
    for (const jz of [9.6, 14.0, 18.4]) {
      this.#buildEquestrianJump(23.0, jz, whiteFenceMat, goldMat, canopyMat);
    }
  }

  #buildMiniTribune(x, z, yaw, marbleMat, goldMat, canopyMat) {
    const parentMat = new THREE.Matrix4().compose(
      new THREE.Vector3(x, 0, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
      new THREE.Vector3(1, 1, 1)
    );
    const localObj = this.#localObj;
    const pushLocal = (geo, mat, lx, ly, lz, castShadow = false, receiveShadow = true, ry = 0, sharedGeo = false) => {
      localObj.position.set(lx, ly, lz);
      localObj.rotation.set(0, ry, 0);
      localObj.scale.set(1, 1, 1);
      localObj.updateMatrix();
      const worldMat = new THREE.Matrix4().multiplyMatrices(parentMat, localObj.matrix);
      this.#addStaticPiece(geo, mat, worldMat, castShadow, receiveShadow, sharedGeo);
    };

    pushLocal(new THREE.BoxGeometry(3.4, 0.42, 2.3), marbleMat, 0, 0.21, 0, false, true);
    pushLocal(new THREE.BoxGeometry(2.8, 0.28, 0.72), canopyMat, 0, 0.56, -0.35, false, true);
    pushLocal(new THREE.BoxGeometry(2.8, 0.48, 0.16), canopyMat, 0, 0.88, -0.68, false, true);

    const colGeo = new THREE.CylinderGeometry(0.06, 0.075, 2.35, 8);
    this.#tempGeos.push(colGeo);
    for (const [cx, cz] of [[-1.55, -0.98], [1.55, -0.98], [-1.55, 0.98], [1.55, 0.98]]) {
      pushLocal(colGeo, goldMat, cx, 1.58, cz, false, true, 0, true);
    }

    pushLocal(new THREE.ConeGeometry(2.35, 0.85, 4), canopyMat, 0, 3.12, 0, true, true, Math.PI * 0.25);
    pushLocal(new THREE.BoxGeometry(3.55, 0.14, 2.45), goldMat, 0, 2.74, 0, false, true);

    const rotated = Math.abs(Math.sin(yaw)) > 0.7;
    const halfX = rotated ? 1.2 : 1.75;
    const halfZ = rotated ? 1.75 : 1.2;
    this.#collision.addBox(x - halfX, x + halfX, 0, 3.2, z - halfZ, z + halfZ);
  }

  #buildEquestrianJump(x, z, whiteMat, goldMat, pinkMat) {
    const wingGeo = new THREE.BoxGeometry(0.14, 1.05, 0.34);
    const capGeo = new THREE.SphereGeometry(0.1, 8, 6);
    const barGeo = new THREE.CylinderGeometry(0.055, 0.055, 1.26, 8);
    barGeo.rotateX(Math.PI / 2);
    this.#tempGeos.push(wingGeo, capGeo, barGeo);

    for (const sz of [-0.62, 0.62]) {
      this.#addStaticMesh(wingGeo, whiteMat, x, 0.525, z + sz, false, true, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(capGeo, goldMat, x, 1.1, z + sz, false, true, 0, 0, 0, 1, 1, 1, true);
    }

    this.#addStaticMesh(barGeo, pinkMat, x, 0.48, z, false, true, 0, 0, 0, 1, 1, 1, true);
    this.#addStaticMesh(barGeo, goldMat, x, 0.82, z, false, true, 0, 0, 0, 1, 1, 1, true);

    this.#collision.addBox(x - 0.3, x + 0.3, 0, 1.2, z - 0.8, z + 0.8);
  }

  // =========================================================================
  // 3. ROTONDA EXTERIOR DE GALA / SEÑALIZACIÓN DEL SALÓN DE BAILE
  //    X ∈ [37, 49], Z ∈ [-42, -30], pista circular en (43, 0.04, -36) r = 5.6
  // =========================================================================
  #buildBallroomGalaRotunda() {
    const cx = 43;
    const cz = -36;
    const radius = 5.6;

    const danceMap = this.#textures.getTexture('danceFloor', 3, 3);

    const discMat = this.#trackMat(new THREE.MeshStandardMaterial({
      map: danceMap,
      color: 0xffd7ee,
      roughness: 0.16,
      metalness: 0.25
    }));
    discMat.userData.preserveRoughness = true;

    const goldMat = this.#sharedGoldMat;
    const marbleMat = this.#sharedMarbleMat;

    const velvetMat = this.#trackMat(new THREE.MeshStandardMaterial({
      color: 0xb6276c,
      roughness: 0.78,
      metalness: 0.05
    }));

    this.#addStaticMesh(new THREE.CylinderGeometry(radius, radius + 0.12, 0.08, 48), discMat, cx, 0.04, cz, false, true);
    this.#addStaticMesh(new THREE.TorusGeometry(radius + 0.05, 0.09, 10, 48), goldMat, cx, 0.08, cz, false, true, Math.PI / 2);

    this.#collision.addDiscSurface(cx, cz, radius, 0.08);

    // Postes dorados con cordones de terciopelo
    const postCount = 12;
    const postGeo = new THREE.CylinderGeometry(0.06, 0.08, 1.05, 10);
    const sphereGeo = new THREE.SphereGeometry(0.1, 10, 8);
    this.#tempGeos.push(postGeo, sphereGeo);
    const postCoords = [];

    for (let i = 0; i < postCount; i++) {
      const a = (i / postCount) * Math.PI * 2;
      const skipWestEntrance = Math.cos(a) < -0.75;
      const skipEastTribune = Math.cos(a) > 0.88;
      if (skipWestEntrance || skipEastTribune) {
        postCoords.push(null);
        continue;
      }

      const px = cx + Math.cos(a) * (radius + 0.18);
      const pz = cz + Math.sin(a) * (radius + 0.18);
      postCoords.push(new THREE.Vector3(px, 0.88, pz));

      this.#addStaticMesh(postGeo, goldMat, px, 0.525, pz, false, true, 0, 0, 0, 1, 1, 1, true);
      this.#addStaticMesh(sphereGeo, goldMat, px, 1.1, pz, false, true, 0, 0, 0, 1, 1, 1, true);
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
      this.#addStaticMesh(new THREE.TubeGeometry(curve, 12, 0.042, 8, false), velvetMat, 0, 0, 0, false, true);
    }

    // 4 mástiles altos con guirnaldas de banderines luminosos en lo alto
    const mastGeo = new THREE.CylinderGeometry(0.08, 0.12, 4.1, 10);
    this.#tempGeos.push(mastGeo);
    const mastAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
    const mastTops = [];
    for (const a of mastAngles) {
      const mx = cx + Math.cos(a) * (radius + 0.35);
      const mz = cz + Math.sin(a) * (radius + 0.35);
      this.#addStaticMesh(mastGeo, goldMat, mx, 2.05, mz, false, true, 0, 0, 0, 1, 1, 1, true);
      mastTops.push(new THREE.Vector3(mx, 3.95, mz));
      this.#collision.addCylinderCollider(mx, mz, 0.22, 0, 4.0);
    }

    for (let i = 0; i < mastTops.length; i++) {
      const a = mastTops[i];
      const b = mastTops[(i + 1) % mastTops.length];
      const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
      mid.y -= 0.45;
      const garland = new THREE.QuadraticBezierCurve3(a, mid, b);
      this.#addStaticMesh(new THREE.TubeGeometry(garland, 14, 0.025, 6, false), goldMat, 0, 0, 0, false, true);

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
    this.#buildMiniTribune(48.5, -36, -Math.PI * 0.5, marbleMat, goldMat, velvetMat);

    // Cartel ornamental indicando la entrada al Salón de Baile
    const signParentMat = new THREE.Matrix4().compose(
      new THREE.Vector3(37.6, 0, -31.8),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * 0.22),
      new THREE.Vector3(1, 1, 1)
    );
    const localObj = this.#localObj;
    const pushSignLocal = (geo, mat, lx, ly, lz, ry = 0, sharedGeo = false) => {
      localObj.position.set(lx, ly, lz);
      localObj.rotation.set(0, ry, 0);
      localObj.scale.set(1, 1, 1);
      localObj.updateMatrix();
      const worldMat = new THREE.Matrix4().multiplyMatrices(signParentMat, localObj.matrix);
      this.#addStaticPiece(geo, mat, worldMat, false, false, sharedGeo);
    };

    pushSignLocal(new THREE.BoxGeometry(2.3, 1.35, 0.14), goldMat, 0, 1.65, 0);
    const signTex = this.#makeSignTexture('♪ SALÓN DE BAILE ♪', 'Entrada Real · Pista de Gala');
    const signMat = this.#trackMat(new THREE.MeshStandardMaterial({
      map: signTex,
      roughness: 0.35,
      metalness: 0.12
    }));
    const faceGeo = new THREE.PlaneGeometry(2.1, 1.15);
    const legGeo = new THREE.CylinderGeometry(0.05, 0.06, 2.2, 8);
    this.#tempGeos.push(faceGeo, legGeo);
    pushSignLocal(faceGeo, signMat, 0, 1.65, 0.08, 0, true);
    pushSignLocal(faceGeo, signMat, 0, 1.65, -0.08, Math.PI, true);
    for (const lx of [-0.9, 0.9]) {
      pushSignLocal(legGeo, goldMat, lx, 1.1, 0, 0, true);
    }

    this.#collision.addBox(36.9, 38.3, 0, 2.4, -32.6, -31.0);
  }

  #buildAnimatedPennants() {
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
    this.#pennantMesh.castShadow = false;
    this.#pennantMesh.receiveShadow = false;

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
    this.#updatePennants();
    this.#pennantMesh.computeBoundingSphere();
    this.#group.add(this.#pennantMesh);
  }

  #updatePennants() {
    if (!this.#pennantMesh) return;
    const dummy = this.#dummy;
    for (let idx = 0; idx < this.#pennants.length; idx++) {
      const p = this.#pennants[idx];
      const sway = Math.sin(this.#time * 3.4 + p.phase) * 0.22;
      dummy.position.copy(p.pos);
      dummy.rotation.set(sway, p.yaw, sway * 0.4);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      this.#pennantMesh.setMatrixAt(idx, dummy.matrix);
    }
    this.#pennantMesh.instanceMatrix.needsUpdate = true;
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
    if (this.#medallionInnerMat) {
      this.#medallionInnerMat.emissive.copy(this.#themeEmissiveColor);
      this.#medallionInnerMat.emissiveIntensity = Math.min(0.82, 0.55 + nightBoost);
    }
    if (this.#beamMat) {
      this.#beamMat.opacity = Math.min(0.14, this.#beamBaseOpacity + nightBoost * 0.15);
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
    const showBoost = this.#runwayShowActive ? 0.18 : 0;
    if (this.#medallionInnerMat) {
      const matPulse = 0.5 + 0.5 * Math.sin(this.#time * 3.1);
      this.#medallionInnerMat.emissiveIntensity = Math.min(0.82, 0.45 + matPulse * 0.22 + showBoost);
    }
    if (this.#medallionRingInst && this.#medallionRings.length > 0) {
      const dummy = this.#dummy;
      for (let i = 0; i < this.#medallionRings.length; i++) {
        const m = this.#medallionRings[i];
        const pulse = 0.5 + 0.5 * Math.sin(this.#time * 3.1 + m.phase);
        const s = 1 + pulse * 0.035;
        dummy.position.set(m.x, m.y, m.z);
        dummy.rotation.set(Math.PI / 2, 0, 0);
        dummy.scale.set(s, s, 1);
        dummy.updateMatrix();
        this.#medallionRingInst.setMatrixAt(i, dummy.matrix);
      }
      this.#medallionRingInst.instanceMatrix.needsUpdate = true;
    }

    // Animar focos cenitales
    const sweepSpeed = this.#runwayShowActive ? 1.85 : 0.75;
    const sweepAmp = this.#runwayShowActive ? 0.14 : 0.05;
    this.#updateSpotlights(sweepSpeed, sweepAmp);
    if (this.#beamMat) {
      const targetOpacity = this.#runwayShowActive
        ? Math.min(0.14, this.#beamBaseOpacity + 0.03)
        : this.#beamBaseOpacity;
      this.#beamMat.opacity += (targetOpacity - this.#beamMat.opacity) * Math.min(1, dt * 4);
    }

    // Animar banderines y público 3D (60 Hz durante show/vítores, ~20 Hz en reposo)
    const activeEvent = this.#runwayShowActive || this.#cheerTimer > 0;
    if (activeEvent) {
      this.#idleAnimAcc = 0;
      this.#updatePennants();
      this.#updateCrowdPose(dt);
    } else {
      this.#idleAnimAcc += dt;
      if (this.#idleAnimAcc >= 0.05) {
        this.#idleAnimAcc %= 0.05;
        this.#updatePennants();
        this.#updateCrowdPose(dt);
      }
    }
  }

  #updateSpotlights(sweepSpeed, sweepAmp) {
    if (!this.#spotHousingInst || !this.#spotLensInst || !this.#spotBeamInst) return;
    const dummy = this.#dummy;
    dummy.scale.set(1, 1, 1);
    for (let i = 0; i < this.#spotlights.length; i++) {
      const s = this.#spotlights[i];
      const rx = s.baseRotX + Math.sin(this.#time * sweepSpeed + s.phase) * sweepAmp;
      const rz = s.baseRotZ + Math.cos(this.#time * sweepSpeed * 0.8 + s.phase) * sweepAmp * 0.7;
      dummy.position.set(s.x, s.y, s.z);
      dummy.rotation.set(rx, 0, rz);
      dummy.updateMatrix();
      this.#spotHousingInst.setMatrixAt(i, dummy.matrix);
      this.#spotLensInst.setMatrixAt(i, dummy.matrix);
      this.#spotBeamInst.setMatrixAt(i, dummy.matrix);
    }
    this.#spotHousingInst.instanceMatrix.needsUpdate = true;
    this.#spotLensInst.instanceMatrix.needsUpdate = true;
    this.#spotBeamInst.instanceMatrix.needsUpdate = true;
  }

  #updateCrowdPose(_dt) {
    if (!this.#spectatorTorsoMesh || this.#spectatorData.length === 0) return;

    const cheerFade = this.#cheerTimer > 0 ? Math.min(1, this.#cheerTimer * 0.75) : 0;
    const energy = Math.max(this.#runwayShowActive ? 0.55 : 0.0, cheerFade * this.#cheerIntensity);
    const dummy = this.#dummy;

    for (let i = 0; i < this.#spectatorData.length; i++) {
      const sp = this.#spectatorData[i];
      const stadiumWave = Math.max(0, Math.sin(this.#time * 5.2 - sp.z * 0.28 + sp.x * 0.05));
      const localEnergy = Math.min(1.35, energy * (0.65 + 0.55 * stadiumWave));

      const idleBob = Math.sin(this.#time * sp.speed + sp.phase) * 0.015;
      const cheerJump = localEnergy * Math.abs(Math.sin(this.#time * 6.8 + sp.phase)) * 0.14;
      const y = sp.y + idleBob + cheerJump;

      const swayYaw = sp.yaw + Math.sin(this.#time * 1.7 + sp.phase) * (0.06 + localEnergy * 0.08);
      const dirX = Math.sin(swayYaw);
      const dirZ = Math.cos(swayYaw);
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

      // Sombrero / corona
      dummy.position.set(sp.x, y + 0.83, sp.z);
      dummy.rotation.set(0, swayYaw, 0);
      dummy.scale.setScalar(sp.hasHat ? 1 : 0.001);
      dummy.updateMatrix();
      this.#spectatorHatMesh.setMatrixAt(i, dummy.matrix);

      // Brazos izquierdo y derecho articulados
      const clapWave = Math.sin(this.#time * (4.0 + localEnergy * 7.5) + sp.phase);
      const raiseAngle = -0.7 - localEnergy * 1.75;
      const clapSpread = 0.25 + (1 - localEnergy * 0.5) * clapWave * 0.22 + localEnergy * 0.24 * clapWave;

      dummy.position.set(sp.x + sideX * 0.2 + dirX * 0.04, y + 0.47, sp.z + sideZ * 0.2 + dirZ * 0.04);
      dummy.rotation.set(raiseAngle, swayYaw, clapSpread);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      this.#spectatorLeftArmMesh.setMatrixAt(i, dummy.matrix);

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

    for (const g of this.#tempGeos) g.dispose();
    this.#tempGeos.length = 0;
    this.#staticBuckets.clear();

    for (const mat of this.#materials) {
      mat.dispose();
    }
    this.#materials.clear();

    for (const tex of this.#customTextures) {
      tex.dispose();
    }
    this.#customTextures.clear();

    this.#medallionRingInst = null;
    this.#medallionRings.length = 0;
    this.#medallionInnerMat = null;
    this.#spotlights.length = 0;
    this.#spotHousingInst = null;
    this.#spotLensInst = null;
    this.#spotBeamInst = null;
    this.#beamMat = null;
    this.#sharedGoldMat = null;
    this.#sharedMarbleMat = null;
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
