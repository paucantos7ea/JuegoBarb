import * as THREE from 'three';
import { CatalogData } from './catalog/CatalogData.js';
import { FaceBuilder } from './catalog/FaceBuilder.js';
import { HairBuilder } from './catalog/HairBuilder.js';
import { OutfitBuilder } from './catalog/OutfitBuilder.js';
import { PrinceRigBuilder } from './catalog/PrinceRigBuilder.js';
import { CharacterAnimator } from './CharacterAnimator.js';
import { buildRidingMorphs, RIDE_MORPH } from './RidingDrape.js';
import { RIDER_POSE } from '../world/HorseAnatomy.js';

const SPINE_Y = 1.0;   // Pivote de la columna (cintura): el torso se inclina sin mover los pies
const WAIST_Y = 1.04;  // Pivote del vuelo de la falda
const HAIR_PIVOT = new THREE.Vector3(0, 0.1, -0.06); // Nuca: origen del balanceo del pelo largo
const _box = new THREE.Box3();

/**
 * Rig 3D estilizado de personaje con esqueleto articulado propio (cadera, columna, cabeza,
 * brazos y piernas), pivotes con física secundaria para falda y pelo largo, y cambio
 * instantáneo de vestimenta, peinado, colores y accesorios en tiempo real.
 * La animación vive en CharacterAnimator.
 */
export class CharacterRig {
  static AVATARS = CatalogData.AVATARS;
  static OUTFITS = CatalogData.OUTFITS;
  static HAIRSTYLES = CatalogData.HAIRSTYLES;
  static HAIR_COLORS = CatalogData.HAIR_COLORS;
  static ACCESSORIES = CatalogData.ACCESSORIES;
  static SKIN_TONES = CatalogData.SKIN_TONES;
  static EYE_COLORS = CatalogData.EYE_COLORS;

  #root = null; #bodyGroup = null; #headGroup = null; #hairGroup = null; #outfitGroup = null;
  #leftShoulder = null; #rightShoulder = null; #leftForearm = null; #rightForearm = null;
  #leftLeg = null; #rightLeg = null; #leftShin = null; #rightShin = null;
  #puffSleeves = []; #armMeshes = []; #thighMeshes = []; #shinMeshes = []; #shoeMeshes = [];
  #accessoryNodes = {}; #materials = {}; #geometries = [];
  #sharedMats = null; #hairSkipSet = null;
  #spine = null; #spineInner = null; #skirtPivot = null; #skirtInner = null;
  #hairSwing = null; #hairSwingInner = null; #torso = null; #animator = null;
  #isMale = false; #outfitStyle = 'ballgown';
  // Falda a caballo: mallas con morph targets precalculados (skirtGroup / capas de la columna)
  #rideMeshes = []; #rideMorphsReady = false; #ridingRequested = false;
  #appearance = CatalogData.getDefaultAppearance('aurora');

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
    }
  }

  init() {
    const avatar = CatalogData.getAvatar(this.#appearance.avatarId);
    this.#isMale = avatar.gender === 'male';
    this.#root = new THREE.Group();
    this.#root.userData.isCharacter = true;
    // Yaw -> cabeceo -> alabeo: el mismo marco que el cuerpo del caballo al montar
    this.#root.rotation.order = 'YXZ';
    this.#bodyGroup = new THREE.Group();
    this.#root.add(this.#bodyGroup);
    // Columna (torso, brazos, cabeza) con pivote en la cintura y vuelo de falda en la cadera
    [this.#spine, this.#spineInner] = this.#makePivot(this.#bodyGroup, new THREE.Vector3(0, SPINE_Y, 0));
    [this.#skirtPivot, this.#skirtInner] = this.#makePivot(this.#bodyGroup, new THREE.Vector3(0, WAIST_Y, 0));
    this.#skirtPivot.name = 'skirtGroup';

    this.#createMaterials();
    if (this.#isMale) {
      this.#buildPrinceBody();
    } else {
      this.#buildPrincessBody();
    }

    this.#headGroup = FaceBuilder.buildHead(this.#materials, this.#isMale, (g) => this.#track(g));
    this.#mergeHeadStaticMeshes();
    this.#hairGroup = new THREE.Group();
    this.#headGroup.add(this.#hairGroup);
    [this.#hairSwing, this.#hairSwingInner] = this.#makePivot(this.#hairGroup, HAIR_PIVOT);
    this.#hairSkipSet = new Set([this.#hairSwing]);
    this.#spineInner.add(this.#headGroup);

    this.#accessoryNodes = OutfitBuilder.buildAccessories(
      this.#headGroup,
      this.#leftForearm,
      this.#rightForearm,
      this.#materials,
      (g) => this.#track(g)
    );
    for (const accNode of Object.values(this.#accessoryNodes)) {
      this.#mergeAndUntrack(accNode, true);
    }

    this.#animator = new CharacterAnimator({
      root: this.#root, body: this.#bodyGroup, spine: this.#spine, head: this.#headGroup,
      hairSwing: this.#hairSwing, skirtPivot: this.#skirtPivot, torso: this.#torso,
      eyes: this.#headGroup.children.filter((c) => c.userData.isEye),
      lShoulder: this.#leftShoulder, rShoulder: this.#rightShoulder,
      lFore: this.#leftForearm, rFore: this.#rightForearm,
      lLeg: this.#leftLeg, rLeg: this.#rightLeg, lShin: this.#leftShin, rShin: this.#rightShin
    }, this.#isMale);

    this.applyAppearance(this.#appearance);
    // Lateralidad anatómica: el modelo mira a +Z local, su izquierda queda en +X.
    // Abducción natural: izquierdo +0.32 / derecho -0.32 → brazos siempre fuera de la falda.
    const baseZ = this.#getBaseArmZ();
    this.#leftShoulder.rotation.set(0, 0, baseZ);
    this.#rightShoulder.rotation.set(0, 0, -baseZ);
    return this.#root;
  }

  #track(geo) { this.#geometries.push(geo); return geo; }

  /** Crea un pivote en `at` cuyo hijo interior compensa el desplazamiento (mismo marco que el padre). */
  #makePivot(parent, at) {
    const pivot = new THREE.Group();
    pivot.position.copy(at);
    const inner = new THREE.Group();
    inner.position.copy(at).negate();
    pivot.add(inner);
    parent.add(pivot);
    return [pivot, inner];
  }

  /** Mueve las mallas que cumplen `test` de un grupo a otro (ambos con el mismo marco local). */
  #moveMeshes(from, to, test) {
    for (const child of [...from.children]) {
      if (child.isMesh && test(child)) {
        from.remove(child);
        to.add(child);
      }
    }
  }

  /** Falda/faldones (tornos) y adornos bajos van al pivote de cintura para tener vuelo. */
  #isSkirtPart(mesh) {
    return mesh.userData.skirtPart === true || mesh.geometry?.type === 'LatheGeometry' || mesh.position.y < 0.6;
  }

  /** Mechones y mantos que caen por debajo de las orejas tienen balanceo con inercia. */
  #isLongHair(mesh) {
    const geo = mesh.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    mesh.updateMatrix();
    return _box.copy(geo.boundingBox).applyMatrix4(mesh.matrix).min.y < -0.12;
  }

  /** Fusiona hijos THREE.Mesh estáticos con el mismo material en una única geometría para reducir draw calls. */
  static mergeGroupByMaterial(group, track = null) {
    if (!group) return new Set();
    const buckets = new Map();
    for (const child of group.children) {
      if (!child.isMesh || !child.geometry || !child.material || child.userData?.isEye) continue;
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
        const posArr = posAttr.array;
        const normArr = normAttr.array;
        const uvArr = uvAttr ? uvAttr.array : null;

        if (mesh.matrix.determinant() < 0) {
          for (let v = 0; v + 2 < count; v += 3) {
            const i1 = (v + 1) * 3;
            const i2 = (v + 2) * 3;
            for (let k = 0; k < 3; k++) {
              const tp = posArr[i1 + k]; posArr[i1 + k] = posArr[i2 + k]; posArr[i2 + k] = tp;
              const tn = normArr[i1 + k]; normArr[i1 + k] = normArr[i2 + k]; normArr[i2 + k] = tn;
            }
            if (uvArr) {
              const u1 = (v + 1) * 2;
              const u2 = (v + 2) * 2;
              for (let k = 0; k < 2; k++) {
                const tu = uvArr[u1 + k]; uvArr[u1 + k] = uvArr[u2 + k]; uvArr[u2 + k] = tu;
              }
            }
          }
        }

        castShadow = castShadow || mesh.castShadow;
        receiveShadow = receiveShadow || mesh.receiveShadow;
        if (mesh.renderOrder > renderOrder) renderOrder = mesh.renderOrder;
        totalVerts += count;
        pieces.push({ g, count, posArr, normArr, uvArr });
      }

      if (pieces.length === 0) continue;

      const positions = new Float32Array(totalVerts * 3);
      const normals = new Float32Array(totalVerts * 3);
      const uvs = new Float32Array(totalVerts * 2);

      let vOffset = 0;
      for (const p of pieces) {
        positions.set(p.posArr.subarray(0, p.count * 3), vOffset * 3);
        normals.set(p.normArr.subarray(0, p.count * 3), vOffset * 3);
        if (p.uvArr) {
          uvs.set(p.uvArr.subarray(0, p.count * 2), vOffset * 2);
        }
        vOffset += p.count;
        p.g.dispose();
      }

      const merged = new THREE.BufferGeometry();
      merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      merged.computeBoundingSphere();

      if (track) track(merged);

      const mergedMesh = new THREE.Mesh(merged, material);
      mergedMesh.castShadow = castShadow;
      mergedMesh.receiveShadow = receiveShadow;
      mergedMesh.renderOrder = renderOrder;
      group.add(mergedMesh);

      for (const mesh of meshes) {
        group.remove(mesh);
        if (!keptGeos.has(mesh.geometry)) {
          disposed.add(mesh.geometry);
        }
      }
    }

    for (const geo of disposed) {
      geo.dispose();
    }
    return disposed;
  }

  #mergeAndUntrack(group, trackMerged = false) {
    const disposed = CharacterRig.mergeGroupByMaterial(group, trackMerged ? (g) => this.#track(g) : null);
    if (disposed.size > 0) {
      this.#geometries = this.#geometries.filter((g) => !disposed.has(g));
    }
  }

  #mergeHeadStaticMeshes() {
    this.#mergeAndUntrack(this.#headGroup, true);
    for (const child of this.#headGroup.children) {
      if (child.isGroup) {
        this.#mergeAndUntrack(child, true);
      }
    }
  }

  #createMaterials() {
    const m = this.#materials;
    // Piel mate-satinada de muñeca: sin brillos plásticos
    m.skin = new THREE.MeshStandardMaterial({ color: 0xfbe0d2, roughness: 0.72, metalness: 0.0 });
    m.blush = new THREE.MeshBasicMaterial({ color: 0xf498b4, transparent: true, opacity: 0.42, depthWrite: false });
    m.eyelid = new THREE.MeshStandardMaterial({ color: 0xc88a96, roughness: 0.55, metalness: 0.02 });
    m.sclera = new THREE.MeshStandardMaterial({ color: 0xf6f8fc, roughness: 0.22, metalness: 0.02 });
    m.eyeIris = new THREE.MeshStandardMaterial({ color: 0x2d78e6, roughness: 0.16, metalness: 0.08 });
    m.eyeRing = new THREE.MeshStandardMaterial({ color: 0x164296, roughness: 0.25, metalness: 0.05 });
    m.eyeGlow = new THREE.MeshStandardMaterial({ color: 0x8ad6ff, emissive: 0x5ab4ff, emissiveIntensity: 0.25, roughness: 0.14 });
    m.pupil = new THREE.MeshStandardMaterial({ color: 0x100a16, roughness: 0.10, metalness: 0.05 });
    m.catchlight = new THREE.MeshBasicMaterial({ color: 0xffffff });
    m.lash = new THREE.MeshStandardMaterial({ color: 0x1b0f1b, roughness: 0.45, metalness: 0.04 });
    m.brow = new THREE.MeshStandardMaterial({ color: 0x9c743a, roughness: 0.48, metalness: 0.04 });
    m.lips = new THREE.MeshStandardMaterial({ color: 0xe86a80, roughness: 0.55, metalness: 0.0 });
    m.hair = new THREE.MeshStandardMaterial({ color: 0xf0c975, roughness: 0.45, metalness: 0.04, side: THREE.DoubleSide });
    m.hair.userData.preserveRoughness = true;
    m.primary = new THREE.MeshStandardMaterial({ color: 0xf18bb8, roughness: 0.36, metalness: 0.08 });
    m.secondary = new THREE.MeshStandardMaterial({ color: 0xffdce9, roughness: 0.38, metalness: 0.08, side: THREE.DoubleSide });
    m.roseGold = new THREE.MeshStandardMaterial({ color: 0xf0be74, metalness: 0.84, roughness: 0.22 });
    m.crystal = new THREE.MeshStandardMaterial({ color: 0xffe4f7, emissive: 0xe27bc4, emissiveIntensity: 0.42, roughness: 0.12, metalness: 0.15 });
    m.shawl = new THREE.MeshStandardMaterial({ color: 0xc2eeff, emissive: 0x7ca2ff, emissiveIntensity: 0.18, roughness: 0.14, transparent: true, opacity: 0.52, side: THREE.DoubleSide });
    m.dark = new THREE.MeshStandardMaterial({ color: 0x221520, roughness: 0.30, metalness: 0.28 });
    this.#sharedMats = new Set(Object.values(m));
  }

  #buildPrinceBody() {
    const parts = PrinceRigBuilder.buildBody(this.#bodyGroup, this.#spineInner, this.#materials, (g) => this.#track(g));
    this.#torso = parts.torso;
    this.#leftLeg = parts.leftLeg; this.#rightLeg = parts.rightLeg;
    this.#leftShin = parts.leftShin; this.#rightShin = parts.rightShin;
    this.#leftShoulder = parts.leftShoulder; this.#rightShoulder = parts.rightShoulder;
    this.#leftForearm = parts.leftForearm; this.#rightForearm = parts.rightForearm;
    this.#thighMeshes = parts.thighMeshes; this.#shinMeshes = parts.shinMeshes;
    this.#shoeMeshes = parts.shoeMeshes; this.#outfitGroup = parts.outfitGroup;
    this.#moveMeshes(this.#outfitGroup, this.#skirtInner, (m) => this.#isSkirtPart(m));
    CharacterRig.mergeGroupByMaterial(this.#outfitGroup);
    CharacterRig.mergeGroupByMaterial(this.#skirtInner);
  }

  #buildPrincessBody() {
    const torsoPts = [[0.01, 0.86], [0.14, 0.90], [0.102, 1.05], [0.132, 1.19], [0.152, 1.28], [0.124, 1.36], [0.048, 1.39]];
    const torso = new THREE.Mesh(this.#track(new THREE.LatheGeometry(torsoPts.map(([x, y]) => new THREE.Vector2(x, y)), 22)), this.#materials.primary);
    torso.scale.set(1.06, 1, 0.74); torso.castShadow = true;
    const neck = new THREE.Mesh(this.#track(new THREE.CylinderGeometry(0.042, 0.048, 0.148, 14)), this.#materials.skin);
    neck.position.y = 1.41; neck.castShadow = true;
    this.#spineInner.add(torso, neck);
    this.#torso = torso;

    this.#leftLeg = new THREE.Group(); this.#rightLeg = new THREE.Group();
    this.#leftLeg.position.set(0.095, 0.92, 0); this.#rightLeg.position.set(-0.095, 0.92, 0);
    const thighGeo = this.#track(new THREE.CylinderGeometry(0.064, 0.046, 0.44, 14));
    const shinGeo = this.#track(new THREE.CylinderGeometry(0.045, 0.032, 0.42, 14));
    const footGeo = this.#track(new THREE.BoxGeometry(0.068, 0.048, 0.165));
    const heelGeo = this.#track(new THREE.CylinderGeometry(0.014, 0.010, 0.068, 8));

    [this.#leftLeg, this.#rightLeg].forEach((leg, i) => {
      const thigh = new THREE.Mesh(thighGeo, this.#materials.skin); thigh.position.y = -0.22; thigh.castShadow = true; leg.add(thigh);
      const shinGroup = new THREE.Group(); shinGroup.position.y = -0.44;
      const shin = new THREE.Mesh(shinGeo, this.#materials.skin); shin.position.y = -0.21; shin.castShadow = true; shinGroup.add(shin);
      const shoe = new THREE.Mesh(footGeo, this.#materials.roseGold); shoe.position.set(0, -0.43, 0.035); shoe.castShadow = true; shinGroup.add(shoe);
      const heel = new THREE.Mesh(heelGeo, this.#materials.roseGold); heel.position.set(0, -0.45, -0.032); heel.castShadow = false; shinGroup.add(heel);
      leg.add(shinGroup); this.#bodyGroup.add(leg);
      this.#thighMeshes.push(thigh); this.#shinMeshes.push(shin); this.#shoeMeshes.push(shoe);
      if (i === 0) this.#leftShin = shinGroup; else this.#rightShin = shinGroup;
    });

    this.#leftShoulder = new THREE.Group(); this.#rightShoulder = new THREE.Group();
    this.#leftShoulder.position.set(0.194, 1.335, 0); this.#rightShoulder.position.set(-0.194, 1.335, 0);
    const shGeo = this.#track(new THREE.SphereGeometry(0.046, 12, 10));
    const puffGeo = this.#track(new THREE.SphereGeometry(0.080, 16, 12));
    const cuffGeo = this.#track(new THREE.TorusGeometry(0.048, 0.008, 8, 16));
    const upGeo = this.#track(new THREE.CylinderGeometry(0.038, 0.032, 0.27, 12));
    const loGeo = this.#track(new THREE.CylinderGeometry(0.031, 0.024, 0.25, 12));
    const hdGeo = this.#track(new THREE.SphereGeometry(0.032, 10, 10));

    [this.#leftShoulder, this.#rightShoulder].forEach((arm, i) => {
      const sh = new THREE.Mesh(shGeo, this.#materials.skin); arm.add(sh);
      const puffGroup = new THREE.Group();
      const puff = new THREE.Mesh(puffGeo, this.#materials.secondary);
      puff.scale.set(1.06, 1.05, 0.96); puff.position.set(i === 0 ? 0.01 : -0.01, -0.025, 0); puff.castShadow = true;
      const cuff = new THREE.Mesh(cuffGeo, this.#materials.roseGold);
      cuff.rotation.x = Math.PI / 2; cuff.position.set(i === 0 ? 0.005 : -0.005, -0.095, 0);
      puffGroup.add(puff, cuff); arm.add(puffGroup); this.#puffSleeves.push(puffGroup);

      const upper = new THREE.Mesh(upGeo, this.#materials.skin); upper.position.y = -0.14; upper.castShadow = true; arm.add(upper);
      const forearm = new THREE.Group(); forearm.position.y = -0.27;
      forearm.rotation.set(-0.22, 0, i === 0 ? 0.08 : -0.08);
      const lower = new THREE.Mesh(loGeo, this.#materials.skin); lower.position.y = -0.125; lower.castShadow = true; forearm.add(lower);
      const hand = new THREE.Mesh(hdGeo, this.#materials.skin); hand.scale.set(0.85, 1.38, 0.62); hand.position.y = -0.265; hand.castShadow = false; forearm.add(hand);
      arm.add(forearm); this.#spineInner.add(arm);
      this.#armMeshes.push(sh, upper, lower);
      if (i === 0) this.#leftForearm = forearm; else this.#rightForearm = forearm;
    });

    this.#outfitGroup = new THREE.Group();
    this.#spineInner.add(this.#outfitGroup);
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

    const outfit = CatalogData.getOutfit(ap.outfitId);
    const skin = CatalogData.getSkinTone(ap.skinId);
    const hairColor = CatalogData.getHairColor(ap.hairColorId);
    const eye = CatalogData.getEyeColor(ap.eyeColorId);
    const m = this.#materials;

    this.#outfitStyle = outfit.style;
    m.skin.color.setHex(skin.hex);
    m.blush.color.setHex(skin.blush);
    m.lips.color.setHex(skin.lip);
    m.hair.color.setHex(hairColor.hex);
    m.brow.color.setHex(hairColor.brow);
    m.eyeIris.color.setHex(eye.iris);
    m.eyeRing.color.setHex(eye.ring);
    m.eyeGlow.color.setHex(eye.glow);
    m.eyeGlow.emissive.setHex(eye.iris);
    m.primary.color.setHex(outfit.primary);
    m.secondary.color.setHex(outfit.secondary);
    m.roseGold.color.setHex(outfit.accent || 0xf0be74);
    m.shawl.color.setHex(outfit.style === 'starry_gown' ? 0xd0a8ff : 0xc2eeff);

    if (!this.#isMale) {
      const longSleeves = outfit.style === 'chic_midi' || outfit.style === 'riding';
      const tallBoots = outfit.style === 'chic_midi' || outfit.style === 'riding';
      const ridingBreeches = outfit.style === 'riding';
      for (const am of this.#armMeshes) am.material = longSleeves ? m.primary : m.skin;
      for (const th of this.#thighMeshes) th.material = ridingBreeches ? m.secondary : m.skin;
      for (const sh of this.#shinMeshes) sh.material = tallBoots ? m.dark : m.skin;
      for (const so of this.#shoeMeshes) so.material = tallBoots ? m.dark : m.roseGold;
      for (const ps of this.#puffSleeves) ps.visible = outfit.style === 'ballgown';
      OutfitBuilder.clearGroup(this.#skirtInner, null, null, this.#sharedMats);
      OutfitBuilder.populateOutfit(this.#outfitGroup, outfit, m);
      this.#moveMeshes(this.#outfitGroup, this.#skirtInner, (mesh) => this.#isSkirtPart(mesh));
      CharacterRig.mergeGroupByMaterial(this.#outfitGroup);
      CharacterRig.mergeGroupByMaterial(this.#skirtInner);
    }

    // Libera el pelo anterior (incluido el pivote con inercia) y reconstruye el nuevo peinado
    OutfitBuilder.clearGroup(this.#hairSwingInner, null, null, this.#sharedMats);
    OutfitBuilder.clearGroup(this.#hairGroup, this.#hairSkipSet, null, this.#sharedMats);
    HairBuilder.populate(this.#hairGroup, this.#isMale ? 'principe_tupe' : ap.hairId, m, this.#isMale);
    if (this.#hairSwing && !this.#hairSwing.parent) {
      this.#hairGroup.add(this.#hairSwing);
    }
    this.#moveMeshes(this.#hairGroup, this.#hairSwingInner, (mesh) => this.#isLongHair(mesh));
    CharacterRig.mergeGroupByMaterial(this.#hairGroup);
    CharacterRig.mergeGroupByMaterial(this.#hairSwingInner);
    this.#animator?.setBaseArmZ(this.#getBaseArmZ());

    // Las mallas de falda se han reconstruido: sus morphs de montar se recalculan
    this.#rideMeshes.length = 0;
    this.#rideMorphsReady = false;
    if (this.#ridingRequested) this.#buildRideMorphs();

    const activeAcc = new Set(ap.accessories);
    for (const [id, node] of Object.entries(this.#accessoryNodes)) {
      node.visible = activeAcc.has(id);
    }
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

  /** Abducción base del hombro en valor absoluto (izquierdo +, derecho -). */
  #getBaseArmZ() {
    if (this.#isMale) return 0.32;
    // Faldas de baile muy amplias: margen mínimo extra para que la mano nunca roce el vuelo
    const wideSkirt = ['ballgown', 'tiered_gown'].includes(this.#outfitStyle);
    return wideSkirt ? 0.35 : 0.32;
  }

  /** Avanza la animación (idle, walk, run, jump, dance, pose, talk, riding) y la física secundaria. */
  update(dt, animState = 'idle', speed = 0, lod = 0) {
    this.#animator?.update(dt, animState, speed, lod);
    this.#applyRideMorphs();
  }

  /**
   * Modo montura. Al montar, la falda (skirtGroup) y las capas largas se transforman con
   * morph targets precalculados que la dejan caer sobre la grupa y los flancos del caballo sin
   * atravesarlo nunca; al desmontar vuelven a su forma en ~0.25 s.
   * @param {boolean} isRiding
   * @param {object} [horseData] datos prealocados de la montura (HorseSystem model.mount)
   */
  setRidingMode(isRiding, horseData = null) {
    this.#ridingRequested = Boolean(isRiding);
    if (isRiding && !this.#rideMorphsReady) this.#buildRideMorphs();
    this.#animator?.setRidingMode(Boolean(isRiding), horseData);
  }

  /** Posición de ambas manos en el marco de la raíz (para anclar las riendas). */
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
    out.set(0, this.#isMale ? -0.268 : -0.265, 0)
      .applyMatrix4(fore.matrix)
      .applyMatrix4(shoulder.matrix)
      .applyMatrix4(this.#spineInner.matrix)
      .applyMatrix4(this.#spine.matrix)
      .applyMatrix4(this.#bodyGroup.matrix);
  }

  /** Aplica los pesos de la física de la falda a caballo a los morph targets (sin asignaciones). */
  #applyRideMorphs() {
    if (!this.#rideMorphsReady || !this.#animator) return;
    const w = this.#animator.getRideWeights();
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

  /** Cápsulas de las piernas del jinete en la pose de estribos (marco del cuerpo del rig). */
  #riderLegCapsules() {
    const P = RIDER_POSE;
    const caps = [];
    const thighR = this.#isMale ? 0.080 : 0.068;
    const shinR = this.#isMale ? 0.062 : 0.050;
    const e = new THREE.Euler();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const legs = [[this.#leftLeg, this.#leftShin, 1], [this.#rightLeg, this.#rightShin, -1]];
    for (const [leg, shin, side] of legs) {
      const mLeg = new THREE.Matrix4().compose(leg.position, q.setFromEuler(e.set(P.legX, 0, side * P.legZ)), one);
      const mShin = new THREE.Matrix4().compose(shin.position, q.setFromEuler(e.set(P.shinX, 0, side * P.shinZ)), one);
      const hip = leg.position.clone();
      const knee = shin.position.clone().applyMatrix4(mLeg);
      const ankle = new THREE.Vector3(0, -0.43, 0).applyMatrix4(mShin).applyMatrix4(mLeg);
      const toe = new THREE.Vector3(0, -0.44, 0.13).applyMatrix4(mShin).applyMatrix4(mLeg);
      caps.push({ a: hip, b: knee, r: thighR + 0.014 }, { a: knee, b: ankle, r: shinR + 0.014 }, { a: ankle, b: toe, r: 0.05 });
    }
    return caps;
  }

  /** Precalcula (una vez por vestido) la caída a caballo de falda y capas largas. */
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
      // Ribetes/cristales encima de la tela que adornan; capas por orden radial a igual altura
      const m = this.#materials;
      const bias = mesh.material === m.roseGold || mesh.material === m.crystal ? 0.006 : mesh.material === m.shawl ? 0.016 : 0;
      buildRidingMorphs(mesh, kind, caps, pelvis, bias);
      this.#rideMeshes.push(mesh);
    }
    this.#rideMorphsReady = true;
    this.#applyRideMorphs();
  }

  /** Emotes: 'wave' | 'spin' | 'curtsy' | 'star'. */
  playEmote(id) { return this.#animator?.playEmote(id) ?? false; }
  cancelEmote() { this.#animator?.cancelEmote(); }
  getEmote() { return this.#animator?.getEmote() ?? null; }
  setLookTarget(worldPos) { this.#animator?.setLookTarget(worldPos); }
  resetMotion() { this.#animator?.resetMotion(); }

  dispose() {
    const sharedGeos = new Set(this.#geometries);
    for (const g of sharedGeos) g.dispose();
    this.#geometries.length = 0;

    OutfitBuilder.clearGroup(this.#outfitGroup, null, sharedGeos, this.#sharedMats);
    OutfitBuilder.clearGroup(this.#skirtInner, null, sharedGeos, this.#sharedMats);
    OutfitBuilder.clearGroup(this.#hairSwingInner, null, sharedGeos, this.#sharedMats);
    OutfitBuilder.clearGroup(this.#hairGroup, this.#hairSkipSet, sharedGeos, this.#sharedMats);
    for (const node of Object.values(this.#accessoryNodes)) {
      OutfitBuilder.clearGroup(node, null, sharedGeos, this.#sharedMats);
    }
    OutfitBuilder.clearGroup(this.#headGroup, null, sharedGeos, this.#sharedMats);

    for (const mat of Object.values(this.#materials)) mat.dispose();
    this.#materials = {};
    this.#sharedMats = null;
  }
}
