import * as THREE from 'three';
import { CatalogData } from './catalog/CatalogData.js';
import { buildStylizedSkeleton, initCharacterVertexAttributes } from './CharacterAnatomy.js';
import {
  createStylizedHeadGeometry,
  createFaceTextureSet,
  buildVolumetricHair,
  buildStylizedAccessories
} from './CharacterFaceHair.js';
import {
  COURT_PALETTES,
  getCoutureTextures,
  buildPrincessGown,
  buildPrinceRegalia,
  buildCourtOutfit
} from './CharacterCouture.js';
import { createCharacterMaterial, createMotionUniforms } from './CharacterShader.js';
import { CharacterMotion } from './CharacterMotion.js';
import { buildRidingMorphs, RIDE_MORPH } from './RidingDrape.js';
import { RIDER_POSE } from '../world/HorseAnatomy.js';
import { bakeProceduralVertexAO, ensureVertexColors } from '../core/LumenArtPipeline.js';

const _box = new THREE.Box3();
const _hairPivot = new THREE.Vector3(0, 0.06, -0.05);
const _tmpEuler = new THREE.Euler();
const _tmpQuat = new THREE.Quaternion();
const _oneVec = new THREE.Vector3(1, 1, 1);

/**
 * Rig 3D estilizado RPG/Anime de alta costura para Protagonista, Príncipe y Corte Imperial.
 * Orquesta CharacterAnatomy, CharacterFaceHair, CharacterCouture, CharacterShader y CharacterMotion
 * manteniendo el 100% de las firmas públicas, compatibilidad con HorseSystem y BlackjackDealer.
 */
export class CharacterRig {
  static AVATARS = CatalogData.AVATARS;
  static OUTFITS = CatalogData.OUTFITS;
  static HAIRSTYLES = CatalogData.HAIRSTYLES;
  static HAIR_COLORS = CatalogData.HAIR_COLORS;
  static ACCESSORIES = CatalogData.ACCESSORIES;
  static SKIN_TONES = CatalogData.SKIN_TONES;
  static EYE_COLORS = CatalogData.EYE_COLORS;

  #root = null;
  #bodyGroup = null;
  #headGroup = null;
  #hairGroup = null;
  #outfitGroup = null;
  #leftShoulder = null;
  #rightShoulder = null;
  #leftForearm = null;
  #rightForearm = null;
  #leftLeg = null;
  #rightLeg = null;
  #leftShin = null;
  #rightShin = null;
  #torso = null;
  #armMeshes = [];
  #thighMeshes = [];
  #shinMeshes = [];
  #shoeMeshes = [];
  #sleeveNodes = [];
  #cuffNodes = [];
  #accessoryNodes = {};
  #materials = {};
  #sharedMats = null;
  #geometries = [];
  #dynamicGeos = [];
  #hairSkipSet = null;
  #spine = null;
  #spineInner = null;
  #skirtPivot = null;
  #skirtInner = null;
  #hairSwing = null;
  #hairSwingInner = null;
  #motionUniforms = null;
  #motion = null;
  #metrics = null;
  #isMale = false;
  #outfitStyle = 'ballgown';

  #rideMeshes = [];
  #rideMorphsReady = false;
  #ridingRequested = false;

  #appearance = CatalogData.getDefaultAppearance('aurora');
  #courtMeta = {
    courtPalette: null,
    courtSilhouette: null,
    hairStyleOverride: null,
    heightScale: 1.0
  };

  constructor(initialAppearance = null) {
    if (initialAppearance) {
      const base = CatalogData.getDefaultAppearance(initialAppearance.avatarId || 'aurora');
      this.#appearance = {
        avatarId: base.avatarId,
        outfitId: initialAppearance.outfitId || base.outfitId,
        hairId: CatalogData.normalizeHairId(initialAppearance.hairId || base.hairId),
        hairColorId: CatalogData.getHairColor(initialAppearance.hairColorId || base.hairColorId).id,
        skinId: initialAppearance.skinId || base.skinId,
        eyeColorId: initialAppearance.eyeColorId || base.eyeColorId,
        accessories: [...(initialAppearance.accessories || base.accessories)]
      };
      if (initialAppearance.courtPalette) this.#courtMeta.courtPalette = initialAppearance.courtPalette;
      if (initialAppearance.courtSilhouette) this.#courtMeta.courtSilhouette = initialAppearance.courtSilhouette;
      if (initialAppearance.hairStyleOverride) this.#courtMeta.hairStyleOverride = initialAppearance.hairStyleOverride;
      if (typeof initialAppearance.heightScale === 'number') this.#courtMeta.heightScale = initialAppearance.heightScale;
    }
  }

  init() {
    const avatar = CatalogData.getAvatar(this.#appearance.avatarId);
    this.#isMale = avatar.gender === 'male';
    this.#motionUniforms = createMotionUniforms();
    this.#createMaterials();

    const skel = buildStylizedSkeleton(this.#isMale ? 'male' : 'female', {
      materials: this.#materials
    });
    for (const g of skel.geometries) this.#track(g);

    const p = skel.pivots;
    const m = skel.meshes;
    this.#metrics = skel.metrics;
    this.#root = p.root;
    this.#bodyGroup = p.bodyGroup;
    this.#spine = p.spine;
    this.#spineInner = p.spineInner;
    this.#skirtPivot = p.skirtPivot;
    this.#skirtInner = p.skirtInner;
    this.#leftShoulder = p.shoulderL;
    this.#rightShoulder = p.shoulderR;
    this.#leftForearm = p.forearmL;
    this.#rightForearm = p.forearmR;
    this.#leftLeg = p.thighL;
    this.#rightLeg = p.thighR;
    this.#leftShin = p.shinL;
    this.#rightShin = p.shinR;
    this.#torso = m.torso;
    this.#armMeshes = m.armMeshes;
    this.#thighMeshes = m.thighMeshes;
    this.#shinMeshes = m.shinMeshes;
    this.#shoeMeshes = m.shoeMeshes;

    if (this.#courtMeta.heightScale !== 1.0) {
      this.#root.scale.setScalar(this.#courtMeta.heightScale);
    }

    // Cabeza estilizada anime/RPG 3D con aSmoothNormal y atlas 1024x1024
    this.#headGroup = p.head;
    const headGeo = this.#track(createStylizedHeadGeometry(this.#isMale ? 'male' : 'female'));
    const headMesh = new THREE.Mesh(headGeo, this.#materials.face);
    headMesh.castShadow = true;
    headMesh.receiveShadow = true;
    this.#headGroup.add(headMesh);
    this.#spineInner.add(this.#headGroup);

    this.#hairGroup = p.hairRoot;
    [this.#hairSwing, this.#hairSwingInner] = this.#makePivot(this.#hairGroup, _hairPivot);
    this.#hairSkipSet = new Set([this.#hairSwing]);

    this.#outfitGroup = new THREE.Group();
    this.#spineInner.add(this.#outfitGroup);

    this.#accessoryNodes = buildStylizedAccessories(p, this.#materials, (g) => this.#track(g));
    for (const accNode of Object.values(this.#accessoryNodes)) {
      this.#mergeAndUntrack(accNode, true);
    }

    this.#motion = new CharacterMotion(
      {
        root: this.#root,
        body: this.#bodyGroup,
        spine: this.#spine,
        head: this.#headGroup,
        hairSwing: this.#hairSwing,
        skirtPivot: this.#skirtPivot,
        torso: this.#torso,
        motionUniforms: this.#motionUniforms,
        lShoulder: this.#leftShoulder,
        rShoulder: this.#rightShoulder,
        lFore: this.#leftForearm,
        rFore: this.#rightForearm,
        lLeg: this.#leftLeg,
        rLeg: this.#rightLeg,
        lShin: this.#leftShin,
        rShin: this.#rightShin
      },
      this.#isMale,
      this.#metrics
    );

    this.applyAppearance(this.#appearance);

    const baseZ = this.#getBaseArmZ();
    this.#leftShoulder.rotation.set(0, 0, baseZ);
    this.#rightShoulder.rotation.set(0, 0, -baseZ);
    ensureVertexColors(this.#root, { aoStrength: 0.18, shadowTint: 0x3b224d });
    return this.#root;
  }

  #track(geo) {
    this.#geometries.push(geo);
    return geo;
  }

  #makePivot(parent, at) {
    const pivot = new THREE.Group();
    pivot.position.copy(at);
    const inner = new THREE.Group();
    inner.position.copy(at).negate();
    pivot.add(inner);
    parent.add(pivot);
    return [pivot, inner];
  }

  #moveMeshes(from, to, test) {
    for (const child of [...from.children]) {
      if (child.isMesh && test(child)) {
        from.remove(child);
        to.add(child);
      }
    }
  }

  #isSkirtPart(mesh) {
    return mesh.userData.skirtPart === true;
  }

  #isLongHair(mesh) {
    if (mesh.userData.isLongHair) return true;
    const geo = mesh.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    mesh.updateMatrix();
    return _box.copy(geo.boundingBox).applyMatrix4(mesh.matrix).min.y < -0.14;
  }

  /**
   * Fusiona hijos THREE.Mesh estáticos con el mismo material preservando todos los atributos
   * estándar y custom (color, aSmoothNormal, aSwayWeight, aStrandPhase).
   * Mallas con userData.noMerge o morphTargetInfluences no se fusionan.
   */
  static mergeGroupByMaterial(group, track = null) {
    if (!group) return new Set();
    const buckets = new Map();
    for (const child of group.children) {
      if (
        !child.isMesh ||
        !child.geometry ||
        !child.material ||
        child.userData?.isEye ||
        child.userData?.noMerge ||
        (child.morphTargetInfluences && child.morphTargetInfluences.length > 0)
      ) {
        continue;
      }
      let list = buckets.get(child.material);
      if (!list) {
        list = [];
        buckets.set(child.material, list);
      }
      list.push(child);
    }

    const keptGeos = new Set();
    for (const child of group.children) {
      if (child.isMesh && child.geometry) {
        const list = buckets.get(child.material);
        if (!list || list.length < 2) keptGeos.add(child.geometry);
      }
    }

    const disposed = new Set();
    for (const [material, meshes] of buckets.entries()) {
      if (meshes.length < 2) continue;

      const pieces = [];
      let totalVerts = 0;
      let castShadow = false;
      let receiveShadow = false;
      let renderOrder = 0;
      let hasColor = false;
      let hasSmooth = false;
      let hasSway = false;
      let hasPhase = false;
      let preservedSkirtPart = false;
      let preservedRideBias = 0;

      for (const mesh of meshes) {
        mesh.updateMatrix();
        const srcGeo = mesh.geometry;
        const g = srcGeo.index ? srcGeo.toNonIndexed() : srcGeo.clone();
        if (!g.attributes.normal) g.computeVertexNormals();
        g.applyMatrix4(mesh.matrix);

        const posAttr = g.attributes.position;
        const count = posAttr ? posAttr.count : 0;
        if (count === 0) {
          g.dispose();
          continue;
        }

        const normAttr = g.attributes.normal;
        const uvAttr = g.attributes.uv;
        const colorAttr = g.attributes.color;
        const smoothAttr = g.attributes.aSmoothNormal;
        const swayAttr = g.attributes.aSwayWeight;
        const phaseAttr = g.attributes.aStrandPhase;

        const posArr = posAttr.array;
        const normArr = normAttr.array;
        const uvArr = uvAttr ? uvAttr.array : null;
        const colorArr = colorAttr ? colorAttr.array : null;
        const colorItemSize = colorAttr ? colorAttr.itemSize : 3;
        const smoothArr = smoothAttr ? smoothAttr.array : null;
        const swayArr = swayAttr ? swayAttr.array : null;
        const phaseArr = phaseAttr ? phaseAttr.array : null;

        if (colorArr) hasColor = true;
        if (smoothArr) hasSmooth = true;
        if (swayArr) hasSway = true;
        if (phaseArr) hasPhase = true;
        if (mesh.userData?.skirtPart) preservedSkirtPart = true;
        if (typeof mesh.userData?.rideBias === 'number') preservedRideBias = mesh.userData.rideBias;

        if (mesh.matrix.determinant() < 0) {
          for (let v = 0; v + 2 < count; v += 3) {
            const i1 = (v + 1) * 3;
            const i2 = (v + 2) * 3;
            for (let k = 0; k < 3; k++) {
              const tp = posArr[i1 + k]; posArr[i1 + k] = posArr[i2 + k]; posArr[i2 + k] = tp;
              const tn = normArr[i1 + k]; normArr[i1 + k] = normArr[i2 + k]; normArr[i2 + k] = tn;
              if (smoothArr) {
                const ts = smoothArr[i1 + k]; smoothArr[i1 + k] = smoothArr[i2 + k]; smoothArr[i2 + k] = ts;
              }
            }
            if (uvArr) {
              const u1 = (v + 1) * 2;
              const u2 = (v + 2) * 2;
              for (let k = 0; k < 2; k++) {
                const tu = uvArr[u1 + k]; uvArr[u1 + k] = uvArr[u2 + k]; uvArr[u2 + k] = tu;
              }
            }
            if (colorArr) {
              const c1 = (v + 1) * colorItemSize;
              const c2 = (v + 2) * colorItemSize;
              for (let k = 0; k < colorItemSize; k++) {
                const tc = colorArr[c1 + k]; colorArr[c1 + k] = colorArr[c2 + k]; colorArr[c2 + k] = tc;
              }
            }
            if (swayArr) {
              const ts = swayArr[v + 1]; swayArr[v + 1] = swayArr[v + 2]; swayArr[v + 2] = ts;
            }
            if (phaseArr) {
              const tp = phaseArr[v + 1]; phaseArr[v + 1] = phaseArr[v + 2]; phaseArr[v + 2] = tp;
            }
          }
        }

        castShadow = castShadow || mesh.castShadow;
        receiveShadow = receiveShadow || mesh.receiveShadow;
        if (mesh.renderOrder > renderOrder) renderOrder = mesh.renderOrder;
        totalVerts += count;
        pieces.push({ g, count, posArr, normArr, uvArr, colorArr, colorItemSize, smoothArr, swayArr, phaseArr });
      }

      if (pieces.length === 0) continue;

      const positions = new Float32Array(totalVerts * 3);
      const normals = new Float32Array(totalVerts * 3);
      const uvs = new Float32Array(totalVerts * 2);
      const colors = hasColor ? new Float32Array(totalVerts * 3) : null;
      const smooths = hasSmooth ? new Float32Array(totalVerts * 3) : null;
      const sways = hasSway ? new Float32Array(totalVerts) : null;
      const phases = hasPhase ? new Float32Array(totalVerts) : null;

      let vOffset = 0;
      for (const p of pieces) {
        positions.set(p.posArr.subarray(0, p.count * 3), vOffset * 3);
        normals.set(p.normArr.subarray(0, p.count * 3), vOffset * 3);
        if (p.uvArr) uvs.set(p.uvArr.subarray(0, p.count * 2), vOffset * 2);
        if (colors) {
          if (p.colorArr && p.colorItemSize === 3) {
            colors.set(p.colorArr.subarray(0, p.count * 3), vOffset * 3);
          } else if (p.colorArr) {
            for (let k = 0; k < p.count; k++) {
              colors[(vOffset + k) * 3] = p.colorArr[k * p.colorItemSize];
              colors[(vOffset + k) * 3 + 1] = p.colorArr[k * p.colorItemSize + 1];
              colors[(vOffset + k) * 3 + 2] = p.colorArr[k * p.colorItemSize + 2];
            }
          } else {
            colors.fill(1, vOffset * 3, (vOffset + p.count) * 3);
          }
        }
        if (smooths) {
          if (p.smoothArr) smooths.set(p.smoothArr.subarray(0, p.count * 3), vOffset * 3);
          else smooths.set(p.normArr.subarray(0, p.count * 3), vOffset * 3);
        }
        if (sways && p.swayArr) sways.set(p.swayArr.subarray(0, p.count), vOffset);
        if (phases && p.phaseArr) phases.set(p.phaseArr.subarray(0, p.count), vOffset);

        vOffset += p.count;
        p.g.dispose();
      }

      const merged = new THREE.BufferGeometry();
      merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      if (colors) merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      if (smooths) merged.setAttribute('aSmoothNormal', new THREE.BufferAttribute(smooths, 3));
      if (sways) merged.setAttribute('aSwayWeight', new THREE.BufferAttribute(sways, 1));
      if (phases) merged.setAttribute('aStrandPhase', new THREE.BufferAttribute(phases, 1));
      initCharacterVertexAttributes(merged);
      merged.computeBoundingBox();
      merged.computeBoundingSphere();

      if (track) track(merged);

      const mergedMesh = new THREE.Mesh(merged, material);
      mergedMesh.castShadow = castShadow;
      mergedMesh.receiveShadow = receiveShadow;
      mergedMesh.renderOrder = renderOrder;
      if (preservedSkirtPart) mergedMesh.userData.skirtPart = true;
      if (preservedRideBias !== 0) mergedMesh.userData.rideBias = preservedRideBias;
      group.add(mergedMesh);

      for (const mesh of meshes) {
        group.remove(mesh);
        if (!keptGeos.has(mesh.geometry)) {
          disposed.add(mesh.geometry);
        }
      }
    }

    for (const geo of disposed) geo.dispose();
    return disposed;
  }

  #mergeAndUntrack(group, trackMerged = false) {
    const disposed = CharacterRig.mergeGroupByMaterial(group, trackMerged ? (g) => this.#track(g) : null);
    if (disposed.size > 0) {
      this.#geometries = this.#geometries.filter((g) => !disposed.has(g));
    }
  }

  #createMaterials() {
    const m = this.#materials;
    const mu = this.#motionUniforms;

    m.skin = createCharacterMaterial('skin', { color: 0xfbe0d2 }, mu);
    m.face = createCharacterMaterial('face', { color: 0xffffff }, mu);
    m.hair = createCharacterMaterial('hair', { color: 0xf0c975 }, mu);

    // Corpiño/levita sin textura de dobladillo; falda usa m.primary con bordado imperial
    m.bodice = createCharacterMaterial(this.#isMale ? 'velvet' : 'silk', { color: 0xf18bb8 }, mu);
    m.primary = createCharacterMaterial(this.#isMale ? 'velvet' : 'silk', { color: 0xffffff }, mu);
    m.secondary = createCharacterMaterial('silk', { color: 0xffffff }, mu);
    m.tulle = createCharacterMaterial('tulleSparkle', { color: 0xffffff, opacity: 0.44 }, mu);
    m.shawl = m.tulle;

    m.roseGold = createCharacterMaterial('goldFiligree', { color: 0xefc074 }, mu);
    m.crystal = createCharacterMaterial('crystalGem', {
      color: 0xffe4f7,
      emissive: 0xe684c8,
      emissiveIntensity: 0.94
    }, mu);
    m.dark = createCharacterMaterial('velvet', { color: 0x201528, roughness: 0.32, metalness: 0.22 }, mu);

    this.#sharedMats = new Set(Object.values(m));
  }

  #disposeDynamicNodes() {
    for (const node of this.#sleeveNodes) {
      node.parent?.remove(node);
    }
    for (const node of this.#cuffNodes) {
      node.parent?.remove(node);
    }
    this.#sleeveNodes.length = 0;
    this.#cuffNodes.length = 0;

    if (this.#outfitGroup) {
      for (const c of [...this.#outfitGroup.children]) this.#outfitGroup.remove(c);
    }
    if (this.#skirtInner) {
      for (const c of [...this.#skirtInner.children]) this.#skirtInner.remove(c);
    }
    if (this.#hairSwingInner) {
      for (const c of [...this.#hairSwingInner.children]) this.#hairSwingInner.remove(c);
    }
    if (this.#hairGroup) {
      for (const c of [...this.#hairGroup.children]) {
        if (!this.#hairSkipSet?.has(c)) this.#hairGroup.remove(c);
      }
    }
    for (const g of this.#dynamicGeos) g.dispose();
    this.#dynamicGeos.length = 0;
  }

  /**
   * Reconstruye al instante vestido, peinado, colores, piel, ojos y accesorios en tiempo real.
   */
  applyAppearance(config) {
    if (!config) return;
    const ap = this.#appearance;
    if (config.avatarId) ap.avatarId = config.avatarId;
    if (config.outfitId) ap.outfitId = config.outfitId;
    if (config.hairId) ap.hairId = CatalogData.normalizeHairId(config.hairId);
    if (config.hairColorId) ap.hairColorId = CatalogData.getHairColor(config.hairColorId).id;
    if (config.skinId) ap.skinId = config.skinId;
    if (config.eyeColorId) ap.eyeColorId = config.eyeColorId;
    if (Array.isArray(config.accessories)) ap.accessories = [...config.accessories];
    if (config.courtPalette !== undefined) this.#courtMeta.courtPalette = config.courtPalette;
    if (config.courtSilhouette !== undefined) this.#courtMeta.courtSilhouette = config.courtSilhouette;
    if (config.hairStyleOverride !== undefined) this.#courtMeta.hairStyleOverride = config.hairStyleOverride;
    if (typeof config.heightScale === 'number' && this.#root) {
      this.#courtMeta.heightScale = config.heightScale;
      this.#root.scale.setScalar(config.heightScale);
    }

    const baseOutfit = CatalogData.getOutfit(ap.outfitId);
    const paletteOverride = typeof this.#courtMeta.courtPalette === 'string'
      ? COURT_PALETTES[this.#courtMeta.courtPalette]
      : this.#courtMeta.courtPalette;
    const outfit = paletteOverride
      ? {
          ...baseOutfit,
          primary: paletteOverride.primary,
          secondary: paletteOverride.secondary,
          accent: paletteOverride.accent,
          deep: paletteOverride.deep,
          tulle: paletteOverride.tulle,
          style: this.#courtMeta.courtSilhouette || baseOutfit.style
        }
      : {
          ...baseOutfit,
          style: this.#courtMeta.courtSilhouette || baseOutfit.style
        };

    const skin = CatalogData.getSkinTone(ap.skinId);
    const hairColor = CatalogData.getHairColor(ap.hairColorId);
    const eye = CatalogData.getEyeColor(ap.eyeColorId);
    const m = this.#materials;

    this.#outfitStyle = outfit.style;
    m.skin.color.setHex(skin.hex);
    m.hair.color.setHex(hairColor.hex);

    // Atlas facial cacheado 1024x1024 + blinkMap 512x512
    const faceTex = createFaceTextureSet({
      skin,
      eye,
      hairColor,
      archetype: this.#isMale ? 'male' : 'female'
    });
    m.face.map = faceTex.openMap;
    m.face.color.setHex(0xffffff);
    if (m.face.userData.uBlinkMap) m.face.userData.uBlinkMap.value = faceTex.blinkMap;
    if (m.face.userData.uHasBlinkMap) m.face.userData.uHasBlinkMap.value = 1.0;
    m.face.needsUpdate = true;

    // Texturas textiles PBR cacheadas
    const skirtTex = getCoutureTextures(this.#isMale ? 'royal_velvet' : 'silk_embroidery', outfit);
    const bodiceTex = getCoutureTextures('corset_lace', outfit);
    const tulleTex = getCoutureTextures('starlight_tulle', outfit);

    m.bodice.color.setHex(outfit.primary);
    m.primary.map = skirtTex.map;
    m.primary.bumpMap = skirtTex.bumpMap;
    m.primary.bumpScale = 0.008;
    m.primary.roughnessMap = skirtTex.roughnessMap;
    m.primary.color.setHex(0xffffff);
    m.primary.needsUpdate = true;

    m.secondary.map = bodiceTex.map;
    m.secondary.bumpMap = bodiceTex.bumpMap;
    m.secondary.bumpScale = 0.006;
    m.secondary.roughnessMap = bodiceTex.roughnessMap;
    m.secondary.color.setHex(0xffffff);
    m.secondary.needsUpdate = true;

    m.tulle.map = tulleTex.map;
    m.tulle.alphaMap = tulleTex.alphaMap || null;
    m.tulle.color.setHex(outfit.tulle || (outfit.style === 'starry_gown' ? 0xd0a8ff : 0xffe4f6));
    m.tulle.needsUpdate = true;

    m.roseGold.color.setHex(outfit.accent || 0xefc074);
    m.crystal.emissive.setHex(eye.iris || 0xe684c8);

    this.#disposeDynamicNodes();

    // Asignación de materiales en torso y extremidades según silueta
    if (this.#isMale) {
      this.#torso.material = m.bodice;
      for (const am of this.#armMeshes) am.material = m.bodice;
      for (const th of this.#thighMeshes) th.material = m.secondary;
      for (const sh of this.#shinMeshes) sh.material = m.dark;
      for (const so of this.#shoeMeshes) so.material = m.dark;

      const regalia = buildPrinceRegalia(outfit, m, this.#metrics, {
        outfitGroup: this.#outfitGroup,
        forearmL: this.#leftForearm,
        forearmR: this.#rightForearm
      });
      this.#dynamicGeos.push(...regalia.geometries);
      this.#cuffNodes.push(...regalia.cuffNodes);
    } else {
      const longSleeves = outfit.style === 'chic_midi' || outfit.style === 'riding';
      const tallBoots = outfit.style === 'chic_midi' || outfit.style === 'riding';
      const ridingBreeches = outfit.style === 'riding';
      this.#torso.material = outfit.style === 'ballgown' || outfit.style === 'tiered_gown' ? m.secondary : m.bodice;
      for (const am of this.#armMeshes) am.material = longSleeves ? m.bodice : m.skin;
      for (const th of this.#thighMeshes) th.material = ridingBreeches ? m.secondary : m.skin;
      for (const sh of this.#shinMeshes) sh.material = tallBoots ? m.dark : m.skin;
      for (const so of this.#shoeMeshes) so.material = tallBoots ? m.dark : m.roseGold;

      const gown = this.#courtMeta.courtSilhouette
        ? buildCourtOutfit({ ...outfit, gender: 'female' }, m, this.#metrics, {
            outfitGroup: this.#outfitGroup,
            shoulderL: this.#leftShoulder,
            shoulderR: this.#rightShoulder
          })
        : buildPrincessGown(outfit, m, this.#metrics, {
            outfitGroup: this.#outfitGroup,
            shoulderL: this.#leftShoulder,
            shoulderR: this.#rightShoulder
          });
      this.#dynamicGeos.push(...gown.geometries);
      this.#sleeveNodes.push(...gown.sleeveNodes);
    }

    // Mueve faldas/faldones a skirtInner para vuelo y morphs de monta
    this.#moveMeshes(this.#outfitGroup, this.#skirtInner, (mesh) => this.#isSkirtPart(mesh));
    // Marca enagua interior con noMerge para preservar rideBias negativo
    for (const c of this.#skirtInner.children) {
      if (c.isMesh && typeof c.userData.rideBias === 'number' && c.userData.rideBias < 0) {
        c.userData.noMerge = true;
      }
    }
    CharacterRig.mergeGroupByMaterial(this.#outfitGroup);
    CharacterRig.mergeGroupByMaterial(this.#skirtInner);

    // Reconstruye cabello volumétrico por mechones 3D
    const hairStyle = this.#courtMeta.hairStyleOverride || (this.#isMale ? 'prince_royal_tousled' : ap.hairId);
    const hairRes = buildVolumetricHair(hairStyle, {
      materials: m,
      isMale: this.#isMale,
      hairColor
    });
    this.#dynamicGeos.push(...hairRes.geometries);
    for (const child of [...hairRes.group.children]) {
      hairRes.group.remove(child);
      this.#hairGroup.add(child);
    }
    if (this.#hairSwing && !this.#hairSwing.parent) {
      this.#hairGroup.add(this.#hairSwing);
    }
    this.#moveMeshes(this.#hairGroup, this.#hairSwingInner, (mesh) => this.#isLongHair(mesh));
    CharacterRig.mergeGroupByMaterial(this.#hairGroup);
    CharacterRig.mergeGroupByMaterial(this.#hairSwingInner);

    this.#motion?.setBaseArmZ(this.#getBaseArmZ());

    // Recalcular morphs de monta ecuestre si estaba montado
    this.#rideMeshes.length = 0;
    this.#rideMorphsReady = false;
    if (this.#ridingRequested) this.#buildRideMorphs();

    const activeAcc = new Set(ap.accessories);
    for (const [id, node] of Object.entries(this.#accessoryNodes)) {
      node.visible = activeAcc.has(id);
    }

    ensureVertexColors(this.#root, { aoStrength: 0.18, shadowTint: 0x3b224d });
  }

  getAppearance() {
    return {
      avatarId: this.#appearance.avatarId,
      outfitId: this.#appearance.outfitId,
      hairId: this.#appearance.hairId,
      hairColorId: this.#appearance.hairColorId,
      skinId: this.#appearance.skinId,
      eyeColorId: this.#appearance.eyeColorId,
      accessories: [...this.#appearance.accessories]
    };
  }

  getRoot() { return this.#root; }

  #getBaseArmZ() {
    if (this.#isMale) return 0.30;
    const wideSkirt = ['ballgown', 'tiered_gown', 'starry_gown', 'princess_light'].includes(this.#outfitStyle);
    return wideSkirt ? 0.35 : 0.31;
  }

  setWading(active) { this.#motion?.setWading?.(active); }

  update(dt, animState = 'idle', speed = 0, lod = 0) {
    this.#motion?.update(dt, animState, speed, lod);
    this.#applyRideMorphs();
  }

  setRidingMode(isRiding, horseData = null) {
    this.#ridingRequested = Boolean(isRiding);
    if (isRiding && !this.#rideMorphsReady) this.#buildRideMorphs();
    this.#motion?.setRidingMode(Boolean(isRiding), horseData);
  }

  getHandPositions(outL, outR) {
    if (!this.#bodyGroup) return false;
    this.#bodyGroup.updateMatrix();
    this.#spine.updateMatrix();
    this.#spineInner.updateMatrix();
    this.#solveHand(this.#leftShoulder, this.#leftForearm, outL);
    this.#solveHand(this.#rightShoulder, this.#rightForearm, outR);
    return true;
  }

  #solveHand(shoulder, fore, out) {
    shoulder.updateMatrix();
    fore.updateMatrix();
    const handY = this.#metrics ? this.#metrics.handOffsetY : (this.#isMale ? -0.275 : -0.265);
    out.set(0, handY, 0)
      .applyMatrix4(fore.matrix)
      .applyMatrix4(shoulder.matrix)
      .applyMatrix4(this.#spineInner.matrix)
      .applyMatrix4(this.#spine.matrix)
      .applyMatrix4(this.#bodyGroup.matrix);
  }

  #applyRideMorphs() {
    if (!this.#rideMorphsReady || !this.#motion) return;
    const w = this.#motion.getRideWeights();
    const T = w.T;
    for (let i = 0; i < this.#rideMeshes.length; i++) {
      const inf = this.#rideMeshes[i].morphTargetInfluences;
      if (!inf) continue;
      inf[RIDE_MORPH.DRAPE] = T;
      inf[RIDE_MORPH.LIFT] = T * w.lift;
      inf[RIDE_MORPH.WAVE_S] = T * w.waveS;
      inf[RIDE_MORPH.WAVE_C] = T * w.waveC;
      inf[RIDE_MORPH.OUT_POS] = T * w.outPos;
      inf[RIDE_MORPH.OUT_NEG] = T * w.outNeg;
    }
  }

  #riderLegCapsules() {
    const P = RIDER_POSE;
    const caps = [];
    const thighR = this.#isMale ? 0.080 : 0.068;
    const shinR = this.#isMale ? 0.062 : 0.050;
    const shinDrop = this.#metrics ? -(this.#metrics.shinLen + 0.01) : -0.43;
    const legs = [[this.#leftLeg, this.#leftShin, 1], [this.#rightLeg, this.#rightShin, -1]];
    for (const [leg, shin, side] of legs) {
      const mLeg = new THREE.Matrix4().compose(
        leg.position,
        _tmpQuat.setFromEuler(_tmpEuler.set(P.legX, 0, side * P.legZ)),
        _oneVec
      );
      const mShin = new THREE.Matrix4().compose(
        shin.position,
        _tmpQuat.setFromEuler(_tmpEuler.set(P.shinX, 0, side * P.shinZ)),
        _oneVec
      );
      const hip = leg.position.clone();
      const knee = shin.position.clone().applyMatrix4(mLeg);
      const ankle = new THREE.Vector3(0, shinDrop, 0).applyMatrix4(mShin).applyMatrix4(mLeg);
      const toe = new THREE.Vector3(0, shinDrop - 0.01, 0.13).applyMatrix4(mShin).applyMatrix4(mLeg);
      caps.push(
        { a: hip, b: knee, r: thighR + 0.014 },
        { a: knee, b: ankle, r: shinR + 0.014 },
        { a: ankle, b: toe, r: 0.05 }
      );
    }
    return caps;
  }

  #buildRideMorphs() {
    if (!this.#skirtInner || !this.#outfitGroup) return;
    const caps = this.#riderLegCapsules();
    const pelvis = { c: new THREE.Vector3(0, 0.95, 0), r: new THREE.Vector3(0.165, 0.10, 0.125) };
    const meshes = [];
    for (const child of this.#skirtInner.children) {
      if (child.isMesh) meshes.push([child, 'skirt']);
    }
    for (const child of this.#outfitGroup.children) {
      if (!child.isMesh) continue;
      const geo = child.geometry;
      if (!geo.boundingBox) geo.computeBoundingBox();
      child.updateMatrix();
      if (_box.copy(geo.boundingBox).applyMatrix4(child.matrix).min.y < 0.98) meshes.push([child, 'spine']);
    }
    for (const [mesh, kind] of meshes) {
      const m = this.#materials;
      let bias = typeof mesh.userData?.rideBias === 'number' ? mesh.userData.rideBias : 0;
      if (bias === 0) {
        bias = mesh.material === m.roseGold || mesh.material === m.crystal
          ? 0.006
          : (mesh.material === m.tulle ? 0.018 : 0);
      }
      buildRidingMorphs(mesh, kind, caps, pelvis, bias);
      this.#rideMeshes.push(mesh);
    }
    this.#rideMorphsReady = true;
    this.#applyRideMorphs();
  }

  playEmote(id) { return this.#motion?.playEmote(id) ?? false; }
  cancelEmote() { this.#motion?.cancelEmote(); }
  getEmote() { return this.#motion?.getEmote() ?? null; }
  setLookTarget(worldPos) { this.#motion?.setLookTarget(worldPos); }
  resetMotion() { this.#motion?.resetMotion(); }

  dispose() {
    this.#disposeDynamicNodes();
    for (const g of this.#geometries) g.dispose();
    this.#geometries.length = 0;

    for (const mat of Object.values(this.#materials)) mat.dispose();
    this.#materials = {};
    this.#sharedMats = null;
    this.#rideMeshes.length = 0;
  }
}
