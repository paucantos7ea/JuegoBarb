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
 * Fórmula compartida del eje X central del Río Cristalino Real para z ∈ [-78, 38].
 * @param {number} z
 * @returns {number}
 */
export function getRiverCenterX(z) {
  const t = Math.min(1, (z * z) / 144);
  return 97.5 + Math.sin(z * 0.07) * 7.5 * t;
}

function pseudoRand(seed) {
  const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Sistema unificado de Ríos, Cascada Norte, Lagos, Estanques, 5 Puentes Reales,
 * Fuentes Laterales VIP del Casino y efectos dinámicos de agua (espuma, ondas y destellos) a 60 FPS.
 */
export class WaterSystem {
  #scene;
  #textures;
  #collision;
  #root = null;
  #geometries = [];
  #materials = [];
  #ownedTextures = [];
  #instancedMeshes = [];
  #staticBuckets = new Map();
  #tempGeos = [];
  #dummy = new THREE.Object3D();
  #elapsed = 0;

  // Materiales y texturas animadas
  #riverTex = null;
  #lakeTex = null;
  #waterfallTex = null;
  #riverWaterMat = null;
  #lakeWaterMat = null;
  #waterfallMat = null;
  #sparkleMat = null;
  #rippleMat = null;
  #foamMat = null;
  #crystalPinkMat = null;
  #crystalTurquoiseMat = null;
  #baseWaterEmissive = 0.16;

  // Fuentes VIP laterales del Casino ((162, 0, -48) y (162, 0, +48))
  #vipCrystals = [];
  #vipHalos = [];
  #vipDrops = null;
  #vipDropData = null;

  // Cascada Norte spray
  #waterfallSpray = null;
  #waterfallSprayData = null;

  // Instanced VFX (espuma, anillos de onda, destellos solares/lunares)
  #foamInst = null;
  #foamData = null;
  #foamCount = 0;

  #rippleInst = null;
  #rippleData = null;
  #rippleCount = 0;

  #sparkleInst = null;
  #sparkleData = null;
  #sparkleCount = 0;

  constructor(scene, textureFactory, collisionSystem) {
    this.#scene = scene;
    this.#textures = textureFactory;
    this.#collision = collisionSystem;
  }

  init() {
    this.#root = new THREE.Group();
    this.#root.name = 'RoyalWaterSystem';

    const mats = this.#createMaterials();

    const shoreStones = [];
    const foamSpecs = [];
    const sparkleSpecs = [];
    const rippleEmitters = [];

    this.#buildRoyalRiverAndWaterfall(mats, shoreStones, foamSpecs, sparkleSpecs, rippleEmitters);
    this.#buildSwanLake(mats, shoreStones, foamSpecs, sparkleSpecs, rippleEmitters);
    this.#buildLegacyPondsStreamsAndSouthLake(mats, shoreStones, foamSpecs, sparkleSpecs);
    this.#buildAllBridges(mats, foamSpecs);
    this.#buildCasinoVipFountains(mats, rippleEmitters);

    // Anillos de onda también en la Gran Fuente Central (0,0) y las 2 Fuentes del Paseo (80, ±10.5)
    rippleEmitters.push(
      { x: 0.0, y: 0.68, z: 0.0, minR: 1.55, maxR: 5.05, speed: 0.42 },
      { x: 80.0, y: 0.50, z: -10.5, minR: 0.65, maxR: 2.42, speed: 0.52 },
      { x: 80.0, y: 0.50, z: 10.5, minR: 0.65, maxR: 2.42, speed: 0.52 }
    );

    this.#flushStaticBuckets();
    this.#buildShoreStonesInstanced(mats, shoreStones);
    this.#buildFoamInstanced(mats, foamSpecs);
    this.#buildRippleRingsInstanced(mats, rippleEmitters);
    this.#buildWaterSparklesInstanced(mats, sparkleSpecs);

    this.#root.matrixAutoUpdate = false;
    this.#root.updateMatrix();
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

  #trackTex(tex) {
    this.#ownedTextures.push(tex);
    return tex;
  }

  #addMesh(geo, mat, x, y, z, castShadow = false, receiveShadow = false) {
    this.#trackGeo(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = castShadow;
    m.receiveShadow = receiveShadow;
    this.#root.add(m);
    return m;
  }

  #addStaticMesh(
    geo,
    mat,
    x,
    y,
    z,
    castShadow = true,
    receiveShadow = true,
    rotX = 0,
    rotY = 0,
    rotZ = 0,
    sx = 1,
    sy = 1,
    sz = 1,
    sharedGeo = false
  ) {
    if (!sharedGeo) {
      this.#tempGeos.push(geo);
    }
    const key = `${mat.id}_${castShadow ? 1 : 0}_${receiveShadow ? 1 : 0}`;
    let bucket = this.#staticBuckets.get(key);
    if (!bucket) {
      bucket = { mat, castShadow, receiveShadow, pieces: [] };
      this.#staticBuckets.set(key, bucket);
    }
    this.#dummy.position.set(x, y, z);
    this.#dummy.rotation.set(rotX, rotY, rotZ);
    this.#dummy.scale.set(sx, sy, sz);
    this.#dummy.updateMatrix();
    bucket.pieces.push({ geometry: geo, matrix: this.#dummy.matrix.clone() });
  }

  #flushStaticBuckets() {
    for (const bucket of this.#staticBuckets.values()) {
      const merged = mergeGeometries(bucket.pieces);
      if (!merged) continue;
      this.#trackGeo(merged);
      const mesh = new THREE.Mesh(merged, bucket.mat);
      mesh.castShadow = bucket.castShadow;
      mesh.receiveShadow = bucket.receiveShadow;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.#root.add(mesh);
    }
    this.#staticBuckets.clear();
    for (const g of this.#tempGeos) g.dispose();
    this.#tempGeos.length = 0;
  }

  #createInstanced(geo, mat, count, castShadow = false, receiveShadow = true) {
    this.#trackGeo(geo);
    const im = new THREE.InstancedMesh(geo, mat, count);
    im.castShadow = castShadow;
    im.receiveShadow = receiveShadow;
    this.#instancedMeshes.push(im);
    this.#root.add(im);
    return im;
  }

  #finalizeStaticInstanced(im) {
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    im.matrixAutoUpdate = false;
    im.updateMatrix();
  }

  #createCausticWaterCanvas() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const data = img.data;

    // Red Worley periódica 6×6 para cáusticas suaves 100% tileables (sin costuras)
    const cells = 6;
    const ptsX = new Float32Array(cells * cells);
    const ptsY = new Float32Array(cells * cells);
    for (let cy = 0; cy < cells; cy++) {
      for (let cx = 0; cx < cells; cx++) {
        const idx = cy * cells + cx;
        ptsX[idx] = cx + 0.18 + pseudoRand(idx * 3.7 + 11.3) * 0.64;
        ptsY[idx] = cy + 0.18 + pseudoRand(idx * 5.9 + 27.1) * 0.64;
      }
    }

    const tau = Math.PI * 2;
    for (let py = 0; py < size; py++) {
      const v = py / size;
      const gy = v * cells;
      const baseCy = Math.floor(gy);

      for (let px = 0; px < size; px++) {
        const u = px / size;
        const gx = u * cells;
        const baseCx = Math.floor(gx);

        let d1 = 99;
        let d2 = 99;
        for (let oy = -1; oy <= 1; oy++) {
          const ncy = (baseCy + oy + cells) % cells;
          const wrapY = (baseCy + oy) - ncy;
          for (let ox = -1; ox <= 1; ox++) {
            const ncx = (baseCx + ox + cells) % cells;
            const wrapX = (baseCx + ox) - ncx;
            const cIdx = ncy * cells + ncx;
            const dx = ptsX[cIdx] + wrapX - gx;
            const dy = ptsY[cIdx] + wrapY - gy;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < d1) {
              d2 = d1;
              d1 = d;
            } else if (d < d2) {
              d2 = d;
            }
          }
        }

        const edge = Math.max(0, 1.0 - (d2 - d1) * 3.4);
        const caustic = edge * edge;
        const wave =
          0.5 +
          0.25 * Math.sin(u * tau * 3 + Math.sin(v * tau * 2) * 0.9) +
          0.25 * Math.cos(v * tau * 4 + u * tau * 2);

        const lum = Math.min(1, caustic * 0.58 + wave * 0.24);
        const r = Math.round(74 + lum * 158);
        const g = Math.round(188 + lum * 64);
        const b = Math.round(224 + lum * 31);

        const pIdx = (py * size + px) * 4;
        data[pIdx] = r;
        data[pIdx + 1] = g;
        data[pIdx + 2] = b;
        data[pIdx + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  #createWaterfallCanvas() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, size, 0);
    grad.addColorStop(0, '#7de4fa');
    grad.addColorStop(0.25, '#c7f5ff');
    grad.addColorStop(0.5, '#f2fdff');
    grad.addColorStop(0.75, '#c7f5ff');
    grad.addColorStop(1, '#7de4fa');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Estrías espumosas verticales periódicas en Y
    const tau = Math.PI * 2;
    for (let i = 0; i < 48; i++) {
      const x = (i / 48) * size;
      const w = 3 + pseudoRand(i * 4.3) * 7;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.42)' : 'rgba(92,202,232,0.34)';
      for (let y = 0; y < size; y += 8) {
        const waveX = x + Math.sin((y / size) * tau * 2 + i) * 3.5;
        ctx.fillRect(waveX, y, w, 9);
      }
    }
    return canvas;
  }

  #createMaterials() {
    const causticCanvas = this.#createCausticWaterCanvas();

    this.#riverTex = this.#trackTex(new THREE.CanvasTexture(causticCanvas));
    this.#riverTex.colorSpace = THREE.SRGBColorSpace;
    this.#riverTex.wrapS = THREE.RepeatWrapping;
    this.#riverTex.wrapT = THREE.RepeatWrapping;
    this.#riverTex.repeat.set(1, 1);
    this.#riverTex.anisotropy = 4;
    this.#riverTex.needsUpdate = true;

    this.#lakeTex = this.#trackTex(new THREE.CanvasTexture(causticCanvas));
    this.#lakeTex.colorSpace = THREE.SRGBColorSpace;
    this.#lakeTex.wrapS = THREE.RepeatWrapping;
    this.#lakeTex.wrapT = THREE.RepeatWrapping;
    this.#lakeTex.repeat.set(7, 5);
    this.#lakeTex.anisotropy = 4;
    this.#lakeTex.needsUpdate = true;

    const wfCanvas = this.#createWaterfallCanvas();
    this.#waterfallTex = this.#trackTex(new THREE.CanvasTexture(wfCanvas));
    this.#waterfallTex.colorSpace = THREE.SRGBColorSpace;
    this.#waterfallTex.wrapS = THREE.RepeatWrapping;
    this.#waterfallTex.wrapT = THREE.RepeatWrapping;
    this.#waterfallTex.repeat.set(2, 3);
    this.#waterfallTex.needsUpdate = true;

    const riverWater = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: this.#riverTex,
        color: 0x8ae4ff,
        emissive: 0x1f6e8c,
        emissiveIntensity: 0.16,
        roughness: 0.13,
        metalness: 0.24,
        transparent: true,
        opacity: 0.84
      })
    );
    riverWater.userData.preserveRoughness = true;
    this.#riverWaterMat = riverWater;

    const lakeWater = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: this.#lakeTex,
        color: 0x82defa,
        emissive: 0x206882,
        emissiveIntensity: 0.15,
        roughness: 0.14,
        metalness: 0.24,
        transparent: true,
        opacity: 0.82
      })
    );
    lakeWater.userData.preserveRoughness = true;
    this.#lakeWaterMat = lakeWater;

    const waterfall = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: this.#waterfallTex,
        color: 0xdff9ff,
        emissive: 0x5bc6e8,
        emissiveIntensity: 0.34,
        roughness: 0.18,
        metalness: 0.1,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide
      })
    );
    waterfall.userData.preserveRoughness = true;
    this.#waterfallMat = waterfall;

    const pondBed = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1d4d5e,
        roughness: 0.9,
        metalness: 0.02
      })
    );

    const marble = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: this.#textures.getTexture('marble', 2, 2),
        color: 0xf6f1f4,
        roughness: 0.32,
        metalness: 0.05
      })
    );

    const stoneSlab = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: this.#textures.getTexture('marble', 1, 1),
        color: 0xeee8ec,
        roughness: 0.4,
        metalness: 0.04
      })
    );

    const grottoRock = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: this.#textures.getTexture('marble', 2, 2),
        color: 0xc9c2cb,
        roughness: 0.78,
        metalness: 0.04
      })
    );

    const moss = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3b8f54,
        roughness: 0.86,
        metalness: 0.02
      })
    );

    const roseGold = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: this.#textures.getTexture('roseGold', 1, 1),
        color: 0xeeb0a1,
        metalness: 0.88,
        roughness: 0.18
      })
    );

    const carpet = this.#trackMat(
      new THREE.MeshStandardMaterial({
        map: this.#textures.getTexture('carpet', 6, 1),
        color: 0xf4dce6,
        roughness: 0.72,
        metalness: 0.04
      })
    );

    const lilyPad = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x4b9952,
        roughness: 0.72,
        metalness: 0.02
      })
    );

    const lotusFlower = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffb3d6,
        emissive: 0xd95f98,
        emissiveIntensity: 0.18,
        roughness: 0.45,
        metalness: 0.04
      })
    );

    const crystalPink = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffdff2,
        emissive: 0xf06eb8,
        emissiveIntensity: 0.68,
        roughness: 0.14,
        metalness: 0.28,
        transparent: true,
        opacity: 0.88
      })
    );
    crystalPink.userData.preserveRoughness = true;
    this.#crystalPinkMat = crystalPink;

    const crystalTurquoise = this.#trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd4fbff,
        emissive: 0x3ad1e8,
        emissiveIntensity: 0.68,
        roughness: 0.14,
        metalness: 0.28,
        transparent: true,
        opacity: 0.88
      })
    );
    crystalTurquoise.userData.preserveRoughness = true;
    this.#crystalTurquoiseMat = crystalTurquoise;

    const foam = this.#trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xe8fbff,
        transparent: true,
        opacity: 0.46,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      })
    );
    foam.userData.isVfx = true;
    this.#foamMat = foam;

    const ripple = this.#trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xd9f8ff,
        transparent: true,
        opacity: 0.44,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
      })
    );
    ripple.userData.isVfx = true;
    this.#rippleMat = ripple;

    const sparkle = this.#trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xfff8dc,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
      })
    );
    sparkle.userData.isVfx = true;
    this.#sparkleMat = sparkle;

    return {
      riverWater,
      lakeWater,
      waterfall,
      pondBed,
      marble,
      stoneSlab,
      grottoRock,
      moss,
      roseGold,
      carpet,
      lilyPad,
      lotusFlower,
      crystalPink,
      crystalTurquoise,
      foam,
      ripple,
      sparkle
    };
  }

  #buildRibbonGeometry(zStart, zEnd, zSteps, halfWidth, yFn, vScale = 7.2) {
    const cols = 7;
    const vertCount = (zSteps + 1) * cols;
    const positions = new Float32Array(vertCount * 3);
    const normals = new Float32Array(vertCount * 3);
    const uvs = new Float32Array(vertCount * 2);
    const indices = [];

    for (let iz = 0; iz <= zSteps; iz++) {
      const tz = iz / zSteps;
      const z = zStart + tz * (zEnd - zStart);
      const cx = getRiverCenterX(z);
      const y = yFn(z);
      const v = (z - zStart) / vScale;

      for (let ix = 0; ix < cols; ix++) {
        const u = ix / (cols - 1);
        const s = u * 2 - 1;
        const x = cx + s * halfWidth;
        const idx = iz * cols + ix;
        positions[idx * 3] = x;
        positions[idx * 3 + 1] = y;
        positions[idx * 3 + 2] = z;
        normals[idx * 3] = 0;
        normals[idx * 3 + 1] = 1;
        normals[idx * 3 + 2] = 0;
        uvs[idx * 2] = u * 1.35;
        uvs[idx * 2 + 1] = v;
      }
    }

    for (let iz = 0; iz < zSteps; iz++) {
      for (let ix = 0; ix < cols - 1; ix++) {
        const a = iz * cols + ix;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeBoundingSphere();
    return geo;
  }

  #buildRoyalRiverAndWaterfall(mats, shoreStones, foamSpecs, sparkleSpecs, rippleEmitters) {
    // 1. Lecho oscuro turquesa (Y = 0.014, con ligera elevación suave a 0.063 bajo la losa del bulevar Z ∈ [-4.7, 4.7])
    const bedGeo = this.#buildRibbonGeometry(-78.5, 39.2, 136, 3.65, (z) => {
      const az = Math.abs(z);
      if (az < 4.9) {
        const blend = Math.max(0, 1 - az / 4.9);
        return 0.014 + blend * 0.049;
      }
      return 0.014;
    }, 8.0);
    const bedMesh = this.#addMesh(bedGeo, mats.pondBed, 0, 0, 0, false, true);
    bedMesh.matrixAutoUpdate = false;
    bedMesh.updateMatrix();

    // 2. Superficie continua sinuosa del Río Cristalino Real en Y = 0.068
    const riverGeo = this.#buildRibbonGeometry(-78.2, 39.4, 148, 3.4, () => 0.068, 7.2);
    const riverMesh = this.#addMesh(riverGeo, mats.riverWater, 0, 0, 0, false, false);
    riverMesh.matrixAutoUpdate = false;
    riverMesh.updateMatrix();

    // 3. Piedras blancas pulidas en ambas orillas del río (dejando libres los 3 puentes del río)
    const isNearRiverBridge = (z) =>
      (z >= -40.7 && z <= -35.3) ||
      (z >= -5.4 && z <= 5.4) ||
      (z >= 24.3 && z <= 29.7);

    for (let z = -75.0; z <= 35.2; z += 1.35) {
      if (isNearRiverBridge(z)) continue;
      const cx = getRiverCenterX(z);
      const jitterL = (pseudoRand(z * 2.7 + 1.1) - 0.5) * 0.25;
      const jitterR = (pseudoRand(z * 3.1 + 9.4) - 0.5) * 0.25;
      shoreStones.push(
        [cx - 3.55 + jitterL, z, 0.54 + pseudoRand(z * 1.9) * 0.22, z * 0.8],
        [cx + 3.55 + jitterR, z, 0.54 + pseudoRand(z * 2.3 + 4) * 0.22, z * 1.1 + 1.5]
      );
    }

    // 4. Espuma en las orillas del río y destellos sobre la corriente
    for (let z = -74.5; z <= 36.5; z += 1.8) {
      const cx = getRiverCenterX(z);
      const cxNext = getRiverCenterX(z + 1.0);
      const dirLen = Math.hypot(cxNext - cx, 1.0);
      const dirX = (cxNext - cx) / dirLen;
      const dirZ = 1.0 / dirLen;

      foamSpecs.push(
        { x: cx - 2.95, y: 0.078, z, dx: dirX, dz: dirZ, scale: 0.72 + pseudoRand(z * 5.1) * 0.35, speed: 0.75 },
        { x: cx + 2.95, y: 0.078, z: z + 0.8, dx: dirX, dz: dirZ, scale: 0.72 + pseudoRand(z * 6.3) * 0.35, speed: 0.78 }
      );

      sparkleSpecs.push({
        x: cx + (pseudoRand(z * 9.1) - 0.5) * 5.2,
        y: 0.088,
        z: z + (pseudoRand(z * 4.7) - 0.5) * 1.2,
        phase: pseudoRand(z * 13.7) * Math.PI * 2,
        speed: 2.1 + pseudoRand(z * 7.9) * 1.8,
        scale: 0.8 + pseudoRand(z * 3.3) * 0.55
      });
    }

    // 5. Colisionadores de agua profunda del Río Cristalino (maxY = 1.4), dejando 100% libres los 3 puentes:
    //    Puente Norte [-40, -36], Puente Imperial [-4.5, 4.5], Puente Cisnes [25, 29]
    const riverCylSegments = [
      [-75.5, -43.2],
      [-32.8, -7.8],
      [7.8, 21.8],
      [32.2, 35.6]
    ];
    for (const [zA, zB] of riverCylSegments) {
      const steps = Math.max(1, Math.round((zB - zA) / 2.2));
      for (let i = 0; i <= steps; i++) {
        const z = zA + (i / steps) * (zB - zA);
        const cx = getRiverCenterX(z);
        this.#collision.addCylinderCollider(cx, z, 2.85, 0, 1.4);
      }
    }

    // Cajas ajustadas junto a los estribos/barandillas de cada puente (cero solape con el vano del puente)
    const abutmentBoxes = [
      [-43.0, -40.25],
      [-35.75, -33.0],
      [-7.6, -4.75],
      [4.75, 7.6],
      [22.0, 24.75],
      [29.25, 32.1]
    ];
    for (const [zMin, zMax] of abutmentBoxes) {
      const zMid = (zMin + zMax) * 0.5;
      const cx = getRiverCenterX(zMid);
      this.#collision.addBox(cx - 2.9, cx + 2.9, 0, 1.4, zMin, zMax);
    }

    // 6. Gruta y Cascada Rocosa Real en el nacimiento Norte (getRiverCenterX(-78), -78)
    const gx = getRiverCenterX(-78);
    const gz = -78.0;
    const rockGeo = new THREE.DodecahedronGeometry(1.0, 1);
    const mossCapGeo = new THREE.SphereGeometry(1.0, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.52);
    const quartzGeo = new THREE.OctahedronGeometry(0.45, 0);
    this.#tempGeos.push(rockGeo, mossCapGeo, quartzGeo);

    // Arco rocoso monumental y pilares escalonados de la gruta
    const grottoBlocks = [
      // Muro de fondo y repisas de cascada
      [gx, 2.5, gz - 3.2, 4.6, 3.2, 2.4, 0.1, 0.2],
      [gx, 5.4, gz - 3.8, 3.8, 2.6, 2.2, -0.08, 0.5],
      // Flanco Oeste
      [gx - 4.2, 2.1, gz - 1.4, 2.6, 2.6, 2.5, 0.15, 0.8],
      [gx - 3.5, 4.7, gz - 2.0, 2.2, 2.3, 2.1, -0.1, 1.4],
      [gx - 5.4, 1.2, gz + 0.6, 2.1, 1.5, 2.0, 0.08, 2.1],
      // Flanco Este
      [gx + 4.2, 2.2, gz - 1.4, 2.6, 2.7, 2.5, -0.12, 0.4],
      [gx + 3.5, 4.8, gz - 2.0, 2.2, 2.4, 2.1, 0.12, 1.9],
      [gx + 5.4, 1.25, gz + 0.6, 2.1, 1.5, 2.0, -0.06, 2.7],
      // Coronación del arco de la gruta sobre la caída
      [gx - 1.7, 6.9, gz - 2.6, 2.1, 1.4, 1.8, 0.1, 0.6],
      [gx + 1.7, 6.9, gz - 2.6, 2.1, 1.4, 1.8, -0.1, 1.2],
      [gx, 7.5, gz - 2.8, 2.4, 1.3, 1.9, 0.04, 0.3]
    ];

    for (const [rx, ry, rz, sx, sy, sz, tilt, yaw] of grottoBlocks) {
      this.#addStaticMesh(rockGeo, mats.grottoRock, rx, ry, rz, true, true, tilt, yaw, 0, sx, sy, sz, true);
      this.#addStaticMesh(
        mossCapGeo,
        mats.moss,
        rx,
        ry + sy * 0.45,
        rz,
        false,
        true,
        0,
        yaw,
        0,
        sx * 0.92,
        sy * 0.55,
        sz * 0.92,
        true
      );
    }

    // Cristales de cuarzo rosa y turquesa engastados en la gruta real
    const grottoCrystals = [
      [gx - 2.9, 3.6, gz - 0.5, 0.85, -0.25, 0.3, mats.crystalPink],
      [gx + 2.9, 3.7, gz - 0.5, 0.85, 0.25, -0.3, mats.crystalTurquoise],
      [gx, 8.35, gz - 2.5, 1.15, 0, 0, mats.crystalPink],
      [gx - 4.4, 1.8, gz + 1.1, 0.68, 0.2, 0.35, mats.crystalTurquoise],
      [gx + 4.4, 1.8, gz + 1.1, 0.68, -0.2, -0.35, mats.crystalPink]
    ];
    for (const [qx, qy, qz, sc, rx, rz, cMat] of grottoCrystals) {
      this.#addStaticMesh(quartzGeo, cMat, qx, qy, qz, false, false, rx, 0.4, rz, sc * 0.8, sc * 1.45, sc * 0.8, true);
    }

    // Vasos de agua elevados de la cascada (Y = 5.35 y repisa intermedia Y = 2.65)
    const poolGeo = new THREE.CylinderGeometry(2.3, 2.3, 0.12, 20);
    this.#tempGeos.push(poolGeo);
    this.#addStaticMesh(poolGeo, mats.riverWater, gx, 5.38, gz - 2.3, false, false, 0, 0, 0, 1.1, 1, 0.75, true);
    this.#addStaticMesh(poolGeo, mats.riverWater, gx, 2.68, gz - 1.1, false, false, 0, 0, 0, 1.25, 1, 0.8, true);

    // Cortina de agua espumosa en doble salto (Y = 5.4 -> 2.68 -> 0.07)
    const wfSegs = 22;
    const wfCols = 5;
    const wfPos = new Float32Array((wfSegs + 1) * wfCols * 3);
    const wfNorm = new Float32Array((wfSegs + 1) * wfCols * 3);
    const wfUv = new Float32Array((wfSegs + 1) * wfCols * 2);
    const wfIdx = [];
    for (let iy = 0; iy <= wfSegs; iy++) {
      const t = iy / wfSegs;
      // Perfil parabólico en 2 saltos desde (gz - 1.8, Y=5.42) hasta (gz + 1.4, Y=0.07)
      const y = 5.42 * (1 - t) + 0.07 * t + Math.sin(t * Math.PI * 2) * 0.16;
      const z = (gz - 1.85) + t * 3.25 + Math.sin(t * Math.PI) * 0.38;
      const halfW = 1.95 + t * 0.85;
      for (let ix = 0; ix < wfCols; ix++) {
        const u = ix / (wfCols - 1);
        const x = gx + (u * 2 - 1) * halfW;
        const vIdx = iy * wfCols + ix;
        wfPos[vIdx * 3] = x;
        wfPos[vIdx * 3 + 1] = y;
        wfPos[vIdx * 3 + 2] = z;
        wfNorm[vIdx * 3] = 0;
        wfNorm[vIdx * 3 + 1] = 0.35;
        wfNorm[vIdx * 3 + 2] = 0.94;
        wfUv[vIdx * 2] = u;
        wfUv[vIdx * 2 + 1] = t * 2.2;
      }
    }
    for (let iy = 0; iy < wfSegs; iy++) {
      for (let ix = 0; ix < wfCols - 1; ix++) {
        const a = iy * wfCols + ix;
        const b = a + 1;
        const c = a + wfCols;
        const d = c + 1;
        wfIdx.push(a, c, b, b, c, d);
      }
    }
    const wfGeo = new THREE.BufferGeometry();
    wfGeo.setAttribute('position', new THREE.BufferAttribute(wfPos, 3));
    wfGeo.setAttribute('normal', new THREE.BufferAttribute(wfNorm, 3));
    wfGeo.setAttribute('uv', new THREE.BufferAttribute(wfUv, 2));
    wfGeo.setIndex(wfIdx);
    wfGeo.computeBoundingSphere();
    const wfMesh = this.#addMesh(wfGeo, mats.waterfall, 0, 0, 0, false, false);
    wfMesh.matrixAutoUpdate = false;
    wfMesh.updateMatrix();

    // Colisionador sólido de la gruta norte
    this.#collision.addCylinderCollider(gx, gz - 1.2, 5.4, 0, 8.2);

    // Espuma densa al pie de la cascada norte y ondas expandiéndose
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const rad = 0.8 + (i % 4) * 0.65;
      foamSpecs.push({
        x: gx + Math.cos(a) * rad,
        y: 0.088 + (i % 3) * 0.012,
        z: gz + 1.5 + Math.sin(a) * rad * 0.75,
        dx: Math.cos(a) * 0.25,
        dz: 0.85,
        scale: 1.15 + (i % 3) * 0.35,
        speed: 1.35
      });
    }

    rippleEmitters.push(
      { x: gx, y: 0.088, z: gz + 1.6, minR: 0.85, maxR: 3.35, speed: 0.62 },
      { x: getRiverCenterX(-72.5), y: 0.084, z: -72.5, minR: 0.65, maxR: 2.6, speed: 0.46 }
    );

    // Spray de gotas ascendentes al pie de la cascada (Points ligero)
    const sprayCount = 72;
    const sprayPos = new Float32Array(sprayCount * 3);
    this.#waterfallSprayData = new Float32Array(sprayCount * 4);
    for (let i = 0; i < sprayCount; i++) {
      this.#waterfallSprayData[i * 4] = gx + (pseudoRand(i * 3.1) - 0.5) * 4.4;
      this.#waterfallSprayData[i * 4 + 1] = gz + 0.9 + pseudoRand(i * 5.7) * 2.2;
      this.#waterfallSprayData[i * 4 + 2] = pseudoRand(i * 8.3);
      this.#waterfallSprayData[i * 4 + 3] = 0.65 + pseudoRand(i * 11.9) * 0.65;
    }
    const sprayGeo = this.#trackGeo(new THREE.BufferGeometry());
    sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
    const sprayMat = this.#trackMat(
      new THREE.PointsMaterial({
        color: 0xe6fbff,
        size: 0.26,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    this.#waterfallSpray = new THREE.Points(sprayGeo, sprayMat);
    this.#waterfallSpray.matrixAutoUpdate = false;
    this.#waterfallSpray.updateMatrix();
    this.#root.add(this.#waterfallSpray);
  }

  #buildSwanLake(mats, shoreStones, foamSpecs, sparkleSpecs, rippleEmitters) {
    // Lago de los Cisnes centrado en (106, 45) con semiejes rx = 21.0, rz = 12.5 (X ∈ [85, 127], Z ∈ [32.5, 57.5])
    const cx = 106.0;
    const cz = 45.0;
    const rx = 21.0;
    const rz = 12.5;

    const unitDisc = new THREE.CircleGeometry(1.0, 56);
    this.#tempGeos.push(unitDisc);

    this.#addStaticMesh(unitDisc, mats.pondBed, cx, 0.014, cz, false, true, -Math.PI / 2, 0, 0, rx + 0.35, rz + 0.35, 1, true);
    this.#addStaticMesh(unitDisc, mats.lakeWater, cx, 0.068, cz, false, false, -Math.PI / 2, 0, 0, rx, rz, 1, true);

    // Colisionadores interiores del Lago de los Cisnes (maxY = 1.4), dejando caminable toda la orilla
    const swanLakeColliders = [
      [106.0, 45.0, 11.6],
      [97.5, 45.0, 10.1],
      [114.5, 45.0, 10.1],
      [91.5, 45.0, 6.2],
      [120.5, 45.0, 6.2]
    ];
    for (const [lx, lz, r] of swanLakeColliders) {
      this.#collision.addCylinderCollider(lx, lz, r, 0, 1.4);
    }

    // Piedras blancas pulidas rodeando el Lago de los Cisnes (dejando libre la desembocadura del río al Norte-Oeste)
    const mouthX = getRiverCenterX(35.0);
    const stoneCount = 74;
    for (let i = 0; i < stoneCount; i++) {
      const a = (i / stoneCount) * Math.PI * 2;
      const sx = cx + Math.cos(a) * (rx + 0.25);
      const sz = cz + Math.sin(a) * (rz + 0.25);
      if (sz < 36.2 && Math.abs(sx - mouthX) < 4.6) continue;
      shoreStones.push([sx, sz, 0.62 + (i % 3) * 0.16, a + 0.4]);

      if (i % 3 === 0) {
        foamSpecs.push({
          x: cx + Math.cos(a) * (rx - 0.65),
          y: 0.076,
          z: cz + Math.sin(a) * (rz - 0.65),
          dx: -Math.cos(a) * 0.22,
          dz: -Math.sin(a) * 0.22,
          scale: 0.78 + (i % 2) * 0.25,
          speed: 0.55
        });
      }
    }

    // Ondas suaves en la desembocadura del río hacia el Lago de los Cisnes
    rippleEmitters.push({
      x: getRiverCenterX(37.2),
      y: 0.082,
      z: 38.8,
      minR: 1.1,
      maxR: 4.5,
      speed: 0.36
    });

    // Destellos solares/lunares repartidos sobre el Lago de los Cisnes
    for (let i = 0; i < 42; i++) {
      const a = pseudoRand(i * 7.1 + 3.2) * Math.PI * 2;
      const r = Math.sqrt(pseudoRand(i * 11.3 + 1.7)) * 0.88;
      sparkleSpecs.push({
        x: cx + Math.cos(a) * rx * r,
        y: 0.086,
        z: cz + Math.sin(a) * rz * r,
        phase: pseudoRand(i * 5.9) * Math.PI * 2,
        speed: 1.8 + pseudoRand(i * 3.7) * 1.6,
        scale: 0.85 + pseudoRand(i * 9.3) * 0.6
      });
    }
  }

  #buildLegacyPondsStreamsAndSouthLake(mats, shoreStones, foamSpecs, sparkleSpecs) {
    const unitDisc = new THREE.CircleGeometry(1.0, 40);
    this.#tempGeos.push(unitDisc);

    // 1. Estanque Este: (46, 26), rx = 11.0, rz = 8.5 + Canal X ∈ [31, 36], Z ∈ [18, 30]
    this.#addStaticMesh(unitDisc, mats.pondBed, 46, 0.014, 26, false, true, -Math.PI / 2, 0, 0, 11.0, 8.5, 1, true);
    this.#addStaticMesh(unitDisc, mats.lakeWater, 46, 0.062, 26, false, false, -Math.PI / 2, 0, 0, 10.8, 8.3, 1, true);

    this.#addStaticMesh(new THREE.PlaneGeometry(5.4, 12.2), mats.pondBed, 33.5, 0.014, 24, false, true, -Math.PI / 2);
    this.#addStaticMesh(new THREE.PlaneGeometry(5.0, 12.0), mats.lakeWater, 33.5, 0.06, 24, false, false, -Math.PI / 2);
    this.#addStaticMesh(new THREE.PlaneGeometry(4.2, 9.5), mats.lakeWater, 37.0, 0.061, 25.0, false, false, -Math.PI / 2);

    const pondColliders = [
      [46, 26, 6.2],
      [43.2, 22.8, 3.2],
      [42.8, 28.8, 3.5],
      [51.0, 26.0, 4.5]
    ];
    for (const [px, pz, r] of pondColliders) {
      this.#collision.addCylinderCollider(px, pz, r, 0, 1.4);
    }
    // Canal Este dejando 100% libre el Puente Este (Z ∈ [22.3, 25.7])
    this.#collision.addBox(31.2, 35.8, 0, 1.4, 18.0, 22.05);
    this.#collision.addBox(31.2, 35.8, 0, 1.4, 25.95, 30.0);

    for (let i = 0; i < 38; i++) {
      const a = (i / 38) * Math.PI * 2;
      const sx = 46 + Math.cos(a) * 11.1;
      const sz = 26 + Math.sin(a) * 8.6;
      if (sx < 37.8 && sz > 21.6 && sz < 26.6) continue;
      shoreStones.push([sx, sz, 0.64 + (i % 3) * 0.15, a]);
    }
    for (let z = 18.2; z <= 29.8; z += 1.15) {
      if (z >= 21.8 && z <= 26.2) continue;
      shoreStones.push([31.0, z, 0.54, z], [36.0, z, 0.54, z + 1.0]);
    }

    // 2. Arroyo Sur-Oeste: X ∈ [-24, -18], Z ∈ [28, 55]
    this.#addStaticMesh(new THREE.PlaneGeometry(6.0, 27.5), mats.pondBed, -21, 0.014, 41.5, false, true, -Math.PI / 2);
    this.#addStaticMesh(new THREE.PlaneGeometry(5.2, 27.2), mats.lakeWater, -21, 0.06, 41.5, false, false, -Math.PI / 2);

    // Colisión dejando 100% libre el Puente SW (Z ∈ [32.3, 35.7])
    this.#collision.addBox(-23.6, -18.4, 0, 1.4, 28.0, 32.05);
    this.#collision.addBox(-23.6, -18.4, 0, 1.4, 35.95, 55.0);

    for (let z = 28.2; z <= 53.5; z += 1.25) {
      if (z >= 31.8 && z <= 36.2) continue;
      shoreStones.push([-23.9, z, 0.54, z * 0.7], [-18.1, z, 0.54, z * 1.1]);
    }

    // 3. Gran Lago Imperial Sur: X ∈ [-95, 95], Z ∈ [55, 108]
    this.#addStaticMesh(new THREE.PlaneGeometry(190, 53), mats.pondBed, 0, 0.012, 81.5, false, true, -Math.PI / 2);
    this.#addStaticMesh(new THREE.PlaneGeometry(190, 53), mats.lakeWater, 0, 0.062, 81.5, false, false, -Math.PI / 2);
    this.#collision.addBox(-95, 95, 0, 1.4, 55.3, 66.0);

    for (let x = -84; x <= 84; x += 3.6) {
      if (Math.abs(x) < 10.5) continue;
      shoreStones.push([x + Math.sin(x) * 0.5, 54.8 + Math.cos(x * 0.4) * 0.6, 0.82 + (Math.abs(x) % 3) * 0.14, x * 0.4]);
    }

    // Nenúfares y flores de loto en Estanque Este y Lago de los Cisnes
    const lilyCoords = [
      // Estanque Este
      [42.5, 22.0, 0.074], [43.3, 21.4, 0.074], [49.5, 29.2, 0.074], [50.4, 28.5, 0.074],
      [47.0, 21.0, 0.074], [41.0, 29.8, 0.074], [52.2, 24.0, 0.074],
      // Lago de los Cisnes (calas tranquilas Este y Sur)
      [118.0, 39.5, 0.08], [119.2, 40.4, 0.08], [121.5, 46.2, 0.08], [120.2, 47.4, 0.08],
      [113.5, 53.2, 0.08], [112.0, 53.8, 0.08], [94.0, 50.5, 0.08], [95.4, 51.4, 0.08],
      [91.5, 42.0, 0.08], [103.5, 54.6, 0.08]
    ];
    const lilyGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.03, 14, 1, false, 0.25, Math.PI * 1.82);
    const lotusGeo = new THREE.ConeGeometry(0.18, 0.2, 7);
    const lilyInst = this.#createInstanced(lilyGeo, mats.lilyPad, lilyCoords.length, false, true);
    const lotusInst = this.#createInstanced(lotusGeo, mats.lotusFlower, 8, false, false);
    const dummy = this.#dummy;
    let lotusIdx = 0;

    lilyCoords.forEach(([lx, lz, ly], idx) => {
      dummy.position.set(lx, ly, lz);
      dummy.rotation.set(0, idx * 1.37, 0);
      dummy.scale.setScalar(0.88 + (idx % 3) * 0.22);
      dummy.updateMatrix();
      lilyInst.setMatrixAt(idx, dummy.matrix);

      if (idx % 2 === 0 && lotusIdx < 8) {
        dummy.position.set(lx, ly + 0.1, lz);
        dummy.rotation.set(Math.PI, idx * 0.9, 0);
        dummy.scale.setScalar(1.0);
        dummy.updateMatrix();
        lotusInst.setMatrixAt(lotusIdx++, dummy.matrix);
      }
    });
    this.#finalizeStaticInstanced(lilyInst);
    this.#finalizeStaticInstanced(lotusInst);

    // Destellos adicionales en Estanque Este, Arroyo SW y Gran Lago Imperial Sur
    for (let i = 0; i < 16; i++) {
      const a = pseudoRand(i * 4.1) * Math.PI * 2;
      const r = Math.sqrt(pseudoRand(i * 8.9)) * 0.82;
      sparkleSpecs.push({
        x: 46 + Math.cos(a) * 10.2 * r,
        y: 0.078,
        z: 26 + Math.sin(a) * 7.8 * r,
        phase: pseudoRand(i * 6.7) * Math.PI * 2,
        speed: 2.0 + pseudoRand(i * 2.9) * 1.5,
        scale: 0.78
      });
    }
    for (let i = 0; i < 24; i++) {
      sparkleSpecs.push({
        x: (pseudoRand(i * 5.3 + 2) - 0.5) * 150,
        y: 0.08,
        z: 57.5 + pseudoRand(i * 7.7 + 5) * 28,
        phase: pseudoRand(i * 9.1) * Math.PI * 2,
        speed: 1.7 + pseudoRand(i * 4.3) * 1.4,
        scale: 0.95
      });
    }
  }

  #buildBridgeStructure(mats, spec, foamSpecs) {
    const {
      cx,
      cz,
      minX,
      maxX,
      halfWidthZ,
      crestY,
      hasRoyalCarpet = false,
      finialMat = mats.roseGold,
      addRiverFoam = false
    } = spec;

    const span = maxX - minX;
    const halfSpan = span * 0.5;
    const segments = 14;
    const segLen = span / segments;
    const deckWidth = halfWidthZ * 2 + 0.22;

    const plankGeo = new THREE.BoxGeometry(segLen + 0.08, 0.15, deckWidth);
    const trimGeo = new THREE.BoxGeometry(segLen + 0.08, 0.09, 0.18);
    const carpetGeo = hasRoyalCarpet ? new THREE.BoxGeometry(segLen + 0.06, 0.022, 3.2) : null;
    const carpetTrimGeo = hasRoyalCarpet ? new THREE.BoxGeometry(segLen + 0.06, 0.024, 0.09) : null;
    const postGeo = new THREE.CylinderGeometry(0.085, 0.105, 0.96, 10);
    const endPillarGeo = new THREE.BoxGeometry(0.52, 1.32, 0.52);
    const orbGeo = new THREE.OctahedronGeometry(0.18, 0);
    this.#tempGeos.push(plankGeo, trimGeo, postGeo, endPillarGeo, orbGeo);
    if (carpetGeo) this.#tempGeos.push(carpetGeo, carpetTrimGeo);

    const heightAtX = (x) => crestY * Math.max(0, 1 - Math.abs(x - cx) / halfSpan);

    for (let i = 0; i < segments; i++) {
      const x0 = minX + (i / segments) * span;
      const x1 = minX + ((i + 1) / segments) * span;
      const xm = (x0 + x1) * 0.5;
      const y0 = heightAtX(x0);
      const y1 = heightAtX(x1);
      const ym = (y0 + y1) * 0.5;
      const slope = Math.atan2(y1 - y0, x1 - x0);

      this.#addStaticMesh(plankGeo, mats.marble, xm, ym - 0.065, cz, true, true, 0, 0, slope, 1, 1, 1, true);

      for (const side of [-1, 1]) {
        this.#addStaticMesh(
          trimGeo,
          mats.roseGold,
          xm,
          ym + 0.01,
          cz + side * (halfWidthZ + 0.04),
          false,
          true,
          0,
          0,
          slope,
          1,
          1,
          1,
          true
        );
      }

      if (hasRoyalCarpet) {
        this.#addStaticMesh(carpetGeo, mats.carpet, xm, ym + 0.02, cz, false, true, 0, 0, slope, 1, 1, 1, true);
        for (const side of [-1, 1]) {
          this.#addStaticMesh(
            carpetTrimGeo,
            mats.roseGold,
            xm,
            ym + 0.022,
            cz + side * 1.63,
            false,
            true,
            0,
            0,
            slope,
            1,
            1,
            1,
            true
          );
        }
      }
    }

    // Costillas inferiores de arco en oro rosa en los lados Z = cz ± halfWidthZ
    const archRibGeo = new THREE.TorusGeometry(halfSpan * 0.72, 0.08, 8, 24, Math.PI);
    this.#tempGeos.push(archRibGeo);
    for (const side of [-1, 1]) {
      this.#addStaticMesh(
        archRibGeo,
        mats.roseGold,
        cx,
        0.02,
        cz + side * (halfWidthZ - 0.08),
        false,
        false,
        0,
        0,
        0,
        1.0,
        (crestY * 0.82) / (halfSpan * 0.72),
        1.0,
        true
      );
    }

    // Barandillas doradas, postes intermedios y 4 pilares monumentales en las esquinas
    const railZOffset = halfWidthZ + 0.05;
    for (const side of [-1, 1]) {
      const rz = cz + side * railZOffset;

      // Pilares de entrada y salida
      for (const endX of [minX + 0.22, maxX - 0.22]) {
        const py = heightAtX(endX);
        this.#addStaticMesh(endPillarGeo, mats.marble, endX, py + 0.62, rz, true, true, 0, 0, 0, 1, 1, 1, true);
        this.#addStaticMesh(orbGeo, finialMat, endX, py + 1.44, rz, false, false, 0, Math.PI / 4, 0, 1, 1.35, 1, true);
      }

      // Balustres intermedios
      const postStops = [-0.62, -0.32, 0, 0.32, 0.62];
      for (const frac of postStops) {
        const px = cx + frac * halfSpan;
        const py = heightAtX(px);
        this.#addStaticMesh(postGeo, mats.roseGold, px, py + 0.48, rz, true, false, 0, 0, 0, 1, 1, 1, true);
        this.#addStaticMesh(orbGeo, mats.roseGold, px, py + 1.02, rz, false, false, 0, 0, 0, 0.65, 0.85, 0.65, true);
      }

      // Pasamanos dobles inclinados siguiendo cada rampa
      for (const dir of [-1, 1]) {
        const startX = dir < 0 ? minX + 0.22 : cx;
        const endX = dir < 0 ? cx : maxX - 0.22;
        const startY = heightAtX(startX) + 0.92;
        const endY = heightAtX(endX) + 0.92;
        const len = Math.hypot(endX - startX, endY - startY);
        const railAngle = Math.PI / 2 - Math.atan2(endY - startY, endX - startX);

        for (const hOff of [0, -0.36]) {
          this.#addStaticMesh(
            new THREE.CylinderGeometry(0.048, 0.048, len, 8),
            mats.roseGold,
            (startX + endX) * 0.5,
            (startY + endY) * 0.5 + hOff,
            rz,
            true,
            false,
            0,
            0,
            railAngle
          );
        }
      }

      // Colisionador fino lateral de barandilla
      this.#collision.addBox(minX, maxX, 0, 2.0, rz - 0.14, rz + 0.14);
    }

    // Espuma bajo los estribos del puente en el Río Cristalino
    if (addRiverFoam) {
      const rcx = getRiverCenterX(cz);
      for (const zOff of [-halfWidthZ + 0.3, 0, halfWidthZ - 0.3]) {
        foamSpecs.push(
          { x: rcx - 2.6, y: 0.082, z: cz + zOff, dx: 0.05, dz: 0.9, scale: 0.95, speed: 0.95 },
          { x: rcx + 2.6, y: 0.082, z: cz + zOff, dx: 0.05, dz: 0.9, scale: 0.95, speed: 0.95 }
        );
      }
    }
  }

  #buildAllBridges(mats, foamSpecs) {
    // 1. Puente Imperial del Bulevar: centro (97.5, 0.0), X ∈ [92.4, 102.6], Z ∈ [-4.5, 4.5], Y = 0.76
    this.#buildBridgeStructure(
      mats,
      {
        cx: 97.5,
        cz: 0.0,
        minX: 92.4,
        maxX: 102.6,
        halfWidthZ: 4.5,
        crestY: 0.76,
        hasRoyalCarpet: true,
        finialMat: mats.crystalPink,
        addRiverFoam: true
      },
      foamSpecs
    );
    this.#collision.addRampSurface(92.2, 97.5, -4.5, 4.5, 'x', 92.4, 97.4, 0.0, 0.76);
    this.#collision.addRampSurface(97.5, 102.8, -4.5, 4.5, 'x', 102.6, 97.6, 0.0, 0.76);

    // 2. Puente Norte de los Cerezos: centro (94.0, -38.0), X ∈ [89.0, 99.0], Z ∈ [-40.0, -36.0], Y = 0.78
    this.#buildBridgeStructure(
      mats,
      {
        cx: 94.0,
        cz: -38.0,
        minX: 89.0,
        maxX: 99.0,
        halfWidthZ: 2.0,
        crestY: 0.78,
        hasRoyalCarpet: false,
        finialMat: mats.crystalPink,
        addRiverFoam: true
      },
      foamSpecs
    );
    this.#collision.addRampSurface(88.8, 94.0, -40.0, -36.0, 'x', 89.0, 93.9, 0.0, 0.78);
    this.#collision.addRampSurface(94.0, 99.2, -40.0, -36.0, 'x', 99.0, 94.1, 0.0, 0.78);

    // 3. Puente Sur de los Cisnes: centro (104.5, 27.0), X ∈ [99.5, 109.5], Z ∈ [25.0, 29.0], Y = 0.78
    this.#buildBridgeStructure(
      mats,
      {
        cx: 104.5,
        cz: 27.0,
        minX: 99.5,
        maxX: 109.5,
        halfWidthZ: 2.0,
        crestY: 0.78,
        hasRoyalCarpet: false,
        finialMat: mats.crystalTurquoise,
        addRiverFoam: true
      },
      foamSpecs
    );
    this.#collision.addRampSurface(99.3, 104.5, 25.0, 29.0, 'x', 99.5, 104.4, 0.0, 0.78);
    this.#collision.addRampSurface(104.5, 109.7, 25.0, 29.0, 'x', 109.5, 104.6, 0.0, 0.78);

    // 4. Puente Este conservado: centro (34, 24), X ∈ [30, 38], Z ∈ [22.3, 25.7], Y = 0.75
    this.#buildBridgeStructure(
      mats,
      {
        cx: 34.0,
        cz: 24.0,
        minX: 30.0,
        maxX: 38.0,
        halfWidthZ: 1.75,
        crestY: 0.75,
        hasRoyalCarpet: false,
        finialMat: mats.roseGold,
        addRiverFoam: false
      },
      foamSpecs
    );
    this.#collision.addRampSurface(30.0, 34.0, 22.3, 25.7, 'x', 30.2, 33.8, 0.0, 0.75);
    this.#collision.addRampSurface(34.0, 38.0, 22.3, 25.7, 'x', 37.8, 34.2, 0.0, 0.75);

    // 5. Puente SW conservado: centro (-21, 34), X ∈ [-25, -17], Z ∈ [32.3, 35.7], Y = 0.75
    this.#buildBridgeStructure(
      mats,
      {
        cx: -21.0,
        cz: 34.0,
        minX: -25.0,
        maxX: -17.0,
        halfWidthZ: 1.75,
        crestY: 0.75,
        hasRoyalCarpet: false,
        finialMat: mats.roseGold,
        addRiverFoam: false
      },
      foamSpecs
    );
    this.#collision.addRampSurface(-25.0, -21.0, 32.3, 35.7, 'x', -24.8, -21.2, 0.0, 0.75);
    this.#collision.addRampSurface(-21.0, -17.0, 32.3, 35.7, 'x', -17.2, -20.8, 0.0, 0.75);
  }

  #buildCasinoVipFountains(mats, rippleEmitters) {
    // 2 Fuentes monumentales VIP en (162, 0, -48) y (162, 0, +48), r = 4.0, colisionador r = 4.1
    const specs = [
      { fx: 162.0, fz: -48.0, crystalMat: mats.crystalPink, phase: 0.0 },
      { fx: 162.0, fz: 48.0, crystalMat: mats.crystalTurquoise, phase: Math.PI }
    ];

    const dropsPerFountain = 96;
    const totalDrops = specs.length * dropsPerFountain;
    const dropPos = new Float32Array(totalDrops * 3);
    this.#vipDropData = new Float32Array(totalDrops * 5);

    specs.forEach((sp, fIdx) => {
      const { fx, fz, crystalMat, phase } = sp;

      // Vaso inferior (r = 4.0)
      this.#addStaticMesh(new THREE.CylinderGeometry(4.0, 4.28, 0.68, 36), mats.marble, fx, 0.34, fz, true, true);
      this.#addStaticMesh(new THREE.CylinderGeometry(3.68, 3.68, 0.12, 32), mats.pondBed, fx, 0.16, fz, false, true);
      this.#addStaticMesh(new THREE.TorusGeometry(4.0, 0.15, 10, 48), mats.roseGold, fx, 0.7, fz, true, true, Math.PI / 2);
      this.#addStaticMesh(new THREE.CylinderGeometry(3.75, 3.75, 0.1, 36), mats.lakeWater, fx, 0.61, fz, false, false);

      // Pedestal estriado y 1ª copa intermedia (r = 2.35)
      this.#addStaticMesh(new THREE.CylinderGeometry(0.75, 1.05, 1.65, 20), mats.marble, fx, 1.4, fz, true, true);
      this.#addStaticMesh(new THREE.CylinderGeometry(2.35, 0.9, 0.46, 28), mats.marble, fx, 2.28, fz, true, true);
      this.#addStaticMesh(new THREE.TorusGeometry(2.35, 0.11, 10, 40), mats.roseGold, fx, 2.52, fz, false, true, Math.PI / 2);
      this.#addStaticMesh(new THREE.CylinderGeometry(2.15, 2.15, 0.08, 28), mats.lakeWater, fx, 2.48, fz, false, false);

      // Segundo pedestal oro-rosa y 2ª copa superior (r = 1.25)
      this.#addStaticMesh(new THREE.CylinderGeometry(0.38, 0.56, 1.32, 16), mats.roseGold, fx, 3.15, fz, true, true);
      this.#addStaticMesh(new THREE.CylinderGeometry(1.25, 0.48, 0.36, 24), mats.marble, fx, 3.85, fz, true, true);
      this.#addStaticMesh(new THREE.TorusGeometry(1.25, 0.08, 8, 32), mats.roseGold, fx, 4.04, fz, false, true, Math.PI / 2);
      this.#addStaticMesh(new THREE.CylinderGeometry(1.1, 1.1, 0.06, 24), mats.lakeWater, fx, 4.0, fz, false, false);

      // Aguja superior y cristal octaedro flotante giratorio + halo dorado
      this.#addStaticMesh(new THREE.CylinderGeometry(0.18, 0.28, 0.72, 14), mats.marble, fx, 4.38, fz, true, true);

      const crystal = this.#addMesh(new THREE.OctahedronGeometry(0.54, 0), crystalMat, fx, 5.25, fz, false, false);
      crystal.scale.set(0.95, 1.32, 0.95);
      const halo = this.#addMesh(new THREE.TorusGeometry(0.84, 0.052, 8, 28), mats.roseGold, fx, 5.25, fz, false, false);

      this.#vipCrystals.push({ mesh: crystal, baseY: 5.25, phase });
      this.#vipHalos.push({ mesh: halo, baseY: 5.25, phase });

      // Colisionador exacto r = 4.1
      this.#collision.addCylinderCollider(fx, fz, 4.1, 0, 5.2);

      // Anillos de onda expandiéndose en el vaso inferior
      rippleEmitters.push({
        x: fx,
        y: 0.64,
        z: fz,
        minR: 1.05,
        maxR: 3.62,
        speed: 0.48
      });

      // Datos de gotas en cascada de 2 niveles para esta fuente VIP
      const baseOffset = fIdx * dropsPerFountain;
      for (let i = 0; i < dropsPerFountain; i++) {
        const idx5 = (baseOffset + i) * 5;
        const tier = i < 38 ? 0 : 1;
        this.#vipDropData[idx5] = fx;
        this.#vipDropData[idx5 + 1] = fz;
        this.#vipDropData[idx5 + 2] = pseudoRand(idx5 * 1.7 + 3) * Math.PI * 2;
        this.#vipDropData[idx5 + 3] = pseudoRand(idx5 * 2.9 + 7);
        this.#vipDropData[idx5 + 4] = (tier === 0 ? 1 : -1) * (0.72 + pseudoRand(idx5 * 4.1) * 0.42);
      }
    });

    const vipDropGeo = this.#trackGeo(new THREE.BufferGeometry());
    vipDropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
    const vipDropMat = this.#trackMat(
      new THREE.PointsMaterial({
        color: 0xdff8ff,
        size: 0.21,
        transparent: true,
        opacity: 0.84,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    this.#vipDrops = new THREE.Points(vipDropGeo, vipDropMat);
    this.#vipDrops.matrixAutoUpdate = false;
    this.#vipDrops.updateMatrix();
    this.#root.add(this.#vipDrops);
  }

  #buildShoreStonesInstanced(mats, shoreStones) {
    if (shoreStones.length === 0) return;
    const stoneGeo = new THREE.DodecahedronGeometry(0.55, 1);
    const stoneInst = this.#createInstanced(stoneGeo, mats.stoneSlab, shoreStones.length, false, true);
    const dummy = this.#dummy;

    for (let i = 0; i < shoreStones.length; i++) {
      const [sx, sz, scale, rot] = shoreStones[i];
      dummy.position.set(sx, 0.11, sz);
      dummy.rotation.set(0.08, rot, 0.06);
      dummy.scale.set(scale * 1.18, scale * 0.44, scale);
      dummy.updateMatrix();
      stoneInst.setMatrixAt(i, dummy.matrix);
    }
    this.#finalizeStaticInstanced(stoneInst);
  }

  #buildFoamInstanced(mats, foamSpecs) {
    this.#foamCount = foamSpecs.length;
    if (this.#foamCount === 0) return;

    const foamGeo = new THREE.CircleGeometry(0.52, 10);
    foamGeo.rotateX(-Math.PI / 2);
    this.#foamInst = this.#createInstanced(foamGeo, mats.foam, this.#foamCount, false, false);
    this.#foamInst.frustumCulled = false;
    this.#foamInst.matrixAutoUpdate = false;
    this.#foamInst.updateMatrix();

    // 7 floats por espuma: x, y, z, dx, dz, phase, speedScalePacked (guardamos 8 floats para claridad)
    this.#foamData = new Float32Array(this.#foamCount * 8);
    for (let i = 0; i < this.#foamCount; i++) {
      const f = foamSpecs[i];
      const base = i * 8;
      this.#foamData[base] = f.x;
      this.#foamData[base + 1] = f.y;
      this.#foamData[base + 2] = f.z;
      this.#foamData[base + 3] = f.dx;
      this.#foamData[base + 4] = f.dz;
      this.#foamData[base + 5] = pseudoRand(i * 6.3 + 2.1);
      this.#foamData[base + 6] = f.speed;
      this.#foamData[base + 7] = f.scale;
    }
  }

  #buildRippleRingsInstanced(mats, rippleEmitters) {
    const ringsPerEmitter = 3;
    this.#rippleCount = rippleEmitters.length * ringsPerEmitter;
    if (this.#rippleCount === 0) return;

    const ringGeo = new THREE.RingGeometry(0.88, 1.0, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.#rippleInst = this.#createInstanced(ringGeo, mats.ripple, this.#rippleCount, false, false);
    this.#rippleInst.frustumCulled = false;
    this.#rippleInst.matrixAutoUpdate = false;
    this.#rippleInst.updateMatrix();

    // 7 floats por anillo: x, y, z, minR, maxR, phase, speed
    this.#rippleData = new Float32Array(this.#rippleCount * 7);
    let idx = 0;
    for (let e = 0; e < rippleEmitters.length; e++) {
      const em = rippleEmitters[e];
      for (let k = 0; k < ringsPerEmitter; k++) {
        const base = idx * 7;
        this.#rippleData[base] = em.x;
        this.#rippleData[base + 1] = em.y;
        this.#rippleData[base + 2] = em.z;
        this.#rippleData[base + 3] = em.minR;
        this.#rippleData[base + 4] = em.maxR;
        this.#rippleData[base + 5] = k / ringsPerEmitter;
        this.#rippleData[base + 6] = em.speed;
        idx++;
      }
    }
  }

  #buildWaterSparklesInstanced(mats, sparkleSpecs) {
    this.#sparkleCount = sparkleSpecs.length;
    if (this.#sparkleCount === 0) return;

    // Estrella plana de 4 puntas (CircleGeometry de 4 lados rotada)
    const glintGeo = new THREE.CircleGeometry(0.24, 4);
    glintGeo.rotateX(-Math.PI / 2);
    this.#sparkleInst = this.#createInstanced(glintGeo, mats.sparkle, this.#sparkleCount, false, false);
    this.#sparkleInst.frustumCulled = false;
    this.#sparkleInst.matrixAutoUpdate = false;
    this.#sparkleInst.updateMatrix();

    // 6 floats por destello: x, y, z, phase, speed, scale
    this.#sparkleData = new Float32Array(this.#sparkleCount * 6);
    for (let i = 0; i < this.#sparkleCount; i++) {
      const s = sparkleSpecs[i];
      const base = i * 6;
      this.#sparkleData[base] = s.x;
      this.#sparkleData[base + 1] = s.y;
      this.#sparkleData[base + 2] = s.z;
      this.#sparkleData[base + 3] = s.phase;
      this.#sparkleData[base + 4] = s.speed;
      this.#sparkleData[base + 5] = s.scale;
    }
  }

  applyTheme(theme) {
    if (!theme) return;
    const isNight = (theme.starsOpacity ?? 0) > 0.5;
    const isSunset = !isNight && (theme.starsOpacity ?? 0) > 0.1;

    if (isNight) {
      this.#baseWaterEmissive = 0.28;
      this.#riverWaterMat?.color.setHex(0x62c7f2);
      this.#lakeWaterMat?.color.setHex(0x5abce8);
      this.#sparkleMat?.color.setHex(0xd6ebff);
      this.#rippleMat?.color.setHex(0xb8f0ff);
    } else if (isSunset) {
      this.#baseWaterEmissive = 0.2;
      this.#riverWaterMat?.color.setHex(0x8fdcf5);
      this.#lakeWaterMat?.color.setHex(0x88d4f0);
      this.#sparkleMat?.color.setHex(0xffdfbe);
      this.#rippleMat?.color.setHex(0xffe6f2);
    } else {
      this.#baseWaterEmissive = 0.15;
      this.#riverWaterMat?.color.setHex(0x8ae4ff);
      this.#lakeWaterMat?.color.setHex(0x82defa);
      this.#sparkleMat?.color.setHex(0xfff8dc);
      this.#rippleMat?.color.setHex(0xd9f8ff);
    }

    const cryEm = theme.crystalEmissive ?? 0.55;
    if (this.#crystalPinkMat) this.#crystalPinkMat.emissiveIntensity = 0.45 + cryEm * 0.45;
    if (this.#crystalTurquoiseMat) this.#crystalTurquoiseMat.emissiveIntensity = 0.45 + cryEm * 0.45;
  }

  update(delta, elapsed) {
    const dt = Math.min(delta, 0.1);
    this.#elapsed = elapsed !== undefined ? elapsed : this.#elapsed + dt;
    const t = this.#elapsed;

    // 1. Flujo continuo de corriente Norte -> Sur en el Río Cristalino, cascada y lagos
    if (this.#riverTex) {
      this.#riverTex.offset.y = -(t * 0.36) % 1;
      this.#riverTex.offset.x = Math.sin(t * 0.55) * 0.045;
    }
    if (this.#lakeTex) {
      this.#lakeTex.offset.x = (t * 0.032) % 1;
      this.#lakeTex.offset.y = -(t * 0.026) % 1;
    }
    if (this.#waterfallTex) {
      this.#waterfallTex.offset.y = (t * 1.45) % 1;
    }

    const pulse = this.#baseWaterEmissive + Math.sin(t * 1.6) * 0.025;
    if (this.#riverWaterMat) this.#riverWaterMat.emissiveIntensity = pulse;
    if (this.#lakeWaterMat) this.#lakeWaterMat.emissiveIntensity = pulse * 0.94;

    // 2. Cristales flotantes giratorios y cascadas de las 2 Fuentes VIP del Casino
    for (let i = 0; i < this.#vipCrystals.length; i++) {
      const c = this.#vipCrystals[i];
      c.mesh.rotation.y += dt * 1.25;
      c.mesh.position.y = c.baseY + Math.sin(t * 2.3 + c.phase) * 0.09;
    }
    for (let i = 0; i < this.#vipHalos.length; i++) {
      const h = this.#vipHalos[i];
      h.mesh.rotation.y -= dt * 0.9;
      h.mesh.rotation.x = Math.sin(t * 1.2 + h.phase) * 0.38;
      h.mesh.position.y = h.baseY + Math.sin(t * 2.3 + h.phase) * 0.09;
    }

    if (this.#vipDrops && this.#vipDropData) {
      const pos = this.#vipDrops.geometry.attributes.position;
      const count = pos.count;
      for (let i = 0; i < count; i++) {
        const base = i * 5;
        const fx = this.#vipDropData[base];
        const fz = this.#vipDropData[base + 1];
        const angle = this.#vipDropData[base + 2];
        const rawSpeed = this.#vipDropData[base + 4];
        const speed = rawSpeed > 0 ? rawSpeed : -rawSpeed;
        const phase = (this.#vipDropData[base + 3] + dt * speed) % 1;
        this.#vipDropData[base + 3] = phase;

        let r;
        let y;
        if (rawSpeed > 0) {
          // Copa superior (r=1.25, Y=4.0) -> Copa intermedia (r=2.15, Y=2.5)
          r = 1.2 + phase * 0.95;
          y = 4.02 + Math.sin(phase * Math.PI) * 0.28 - phase * 1.52;
        } else {
          // Copa intermedia (r=2.35, Y=2.5) -> Vaso inferior (r=3.65, Y=0.65)
          r = 2.3 + phase * 1.32;
          y = 2.5 + Math.sin(phase * Math.PI) * 0.32 - phase * 1.86;
        }
        pos.setXYZ(i, fx + Math.cos(angle) * r, y, fz + Math.sin(angle) * r);
      }
      pos.needsUpdate = true;
    }

    // 3. Spray de niebla espumosa al pie de la Cascada Norte
    if (this.#waterfallSpray && this.#waterfallSprayData) {
      const pos = this.#waterfallSpray.geometry.attributes.position;
      const count = pos.count;
      for (let i = 0; i < count; i++) {
        const base = i * 4;
        const bx = this.#waterfallSprayData[base];
        const bz = this.#waterfallSprayData[base + 1];
        const speed = this.#waterfallSprayData[base + 3];
        const phase = (this.#waterfallSprayData[base + 2] + dt * speed) % 1;
        this.#waterfallSprayData[base + 2] = phase;

        const arcY = 0.14 + Math.sin(phase * Math.PI) * 1.45;
        const driftZ = bz + phase * 1.1;
        pos.setXYZ(i, bx + Math.sin(t * 2.0 + i) * 0.15, arcY, driftZ);
      }
      pos.needsUpdate = true;
    }

    const dummy = this.#dummy;

    // 4. Espuma animada en orillas, estribos de puentes y pie de cascada (GC-Free)
    if (this.#foamInst && this.#foamData) {
      dummy.rotation.set(0, 0, 0);
      for (let i = 0; i < this.#foamCount; i++) {
        const base = i * 8;
        const phase = (this.#foamData[base + 5] + dt * this.#foamData[base + 6] * 0.45) % 1;
        this.#foamData[base + 5] = phase;

        const env = Math.sin(phase * Math.PI);
        const s = this.#foamData[base + 7] * (0.35 + env * 0.85);
        const travel = (phase - 0.5) * 0.9;

        dummy.position.set(
          this.#foamData[base] + this.#foamData[base + 3] * travel,
          this.#foamData[base + 1],
          this.#foamData[base + 2] + this.#foamData[base + 4] * travel
        );
        dummy.rotation.y = phase * 1.4 + i * 0.3;
        dummy.scale.set(s * 0.85, 1, s * 1.25);
        dummy.updateMatrix();
        this.#foamInst.setMatrixAt(i, dummy.matrix);
      }
      this.#foamInst.instanceMatrix.needsUpdate = true;
    }

    // 5. Anillos de onda expandiéndose en fuentes y cascada (GC-Free)
    if (this.#rippleInst && this.#rippleData) {
      dummy.rotation.set(0, 0, 0);
      for (let i = 0; i < this.#rippleCount; i++) {
        const base = i * 7;
        const phase = (this.#rippleData[base + 5] + dt * this.#rippleData[base + 6]) % 1;
        this.#rippleData[base + 5] = phase;

        const minR = this.#rippleData[base + 3];
        const maxR = this.#rippleData[base + 4];
        const fade = Math.sin(phase * Math.PI);
        const r = fade > 0.02 ? minR + (maxR - minR) * phase : 0.0001;

        dummy.position.set(this.#rippleData[base], this.#rippleData[base + 1], this.#rippleData[base + 2]);
        dummy.scale.set(r, 1, r);
        dummy.updateMatrix();
        this.#rippleInst.setMatrixAt(i, dummy.matrix);
      }
      this.#rippleInst.instanceMatrix.needsUpdate = true;
    }

    // 6. Destellos solares/lunares centelleando sobre el río y los lagos (GC-Free)
    if (this.#sparkleInst && this.#sparkleData) {
      dummy.rotation.set(0, 0, 0);
      for (let i = 0; i < this.#sparkleCount; i++) {
        const base = i * 6;
        const w = Math.sin(t * this.#sparkleData[base + 4] + this.#sparkleData[base + 3]);
        const glint = w > 0.25 ? (w - 0.25) * 1.333 : 0.0001;
        const s = glint * glint * this.#sparkleData[base + 5];

        dummy.position.set(this.#sparkleData[base], this.#sparkleData[base + 1], this.#sparkleData[base + 2]);
        dummy.rotation.y = t * 0.8 + i;
        dummy.scale.set(s, 1, s);
        dummy.updateMatrix();
        this.#sparkleInst.setMatrixAt(i, dummy.matrix);
      }
      this.#sparkleInst.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    if (this.#root) {
      this.#scene.remove(this.#root);
      this.#root = null;
    }
    for (const im of this.#instancedMeshes) {
      if (typeof im.dispose === 'function') im.dispose();
    }
    for (const g of this.#geometries) g.dispose();
    for (const g of this.#tempGeos) g.dispose();
    for (const m of this.#materials) m.dispose();
    for (const tex of this.#ownedTextures) tex.dispose();

    this.#instancedMeshes.length = 0;
    this.#geometries.length = 0;
    this.#tempGeos.length = 0;
    this.#materials.length = 0;
    this.#ownedTextures.length = 0;
    this.#staticBuckets.clear();

    this.#vipCrystals.length = 0;
    this.#vipHalos.length = 0;
    this.#vipDrops = null;
    this.#vipDropData = null;
    this.#waterfallSpray = null;
    this.#waterfallSprayData = null;
    this.#foamInst = null;
    this.#foamData = null;
    this.#rippleInst = null;
    this.#rippleData = null;
    this.#sparkleInst = null;
    this.#sparkleData = null;
    this.#riverTex = null;
    this.#lakeTex = null;
    this.#waterfallTex = null;
    this.#riverWaterMat = null;
    this.#lakeWaterMat = null;
    this.#waterfallMat = null;
    this.#sparkleMat = null;
    this.#rippleMat = null;
    this.#foamMat = null;
    this.#crystalPinkMat = null;
    this.#crystalTurquoiseMat = null;
  }
}
