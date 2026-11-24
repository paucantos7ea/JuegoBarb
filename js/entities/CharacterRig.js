import * as THREE from 'three';
import { CatalogData } from './catalog/CatalogData.js';
import { FaceBuilder } from './catalog/FaceBuilder.js';
import { HairBuilder } from './catalog/HairBuilder.js';
import { OutfitBuilder } from './catalog/OutfitBuilder.js';
import { PrinceRigBuilder } from './catalog/PrinceRigBuilder.js';
import { CharacterAnimator } from './CharacterAnimator.js';

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
  #spine = null; #spineInner = null; #skirtPivot = null; #skirtInner = null;
  #hairSwing = null; #hairSwingInner = null; #torso = null; #animator = null;
  #isMale = false; #outfitStyle = 'ballgown';
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
    this.#bodyGroup = new THREE.Group();
    this.#root.add(this.#bodyGroup);
    // Columna (torso, brazos, cabeza) con pivote en la cintura y vuelo de falda en la cadera
    [this.#spine, this.#spineInner] = this.#makePivot(this.#bodyGroup, new THREE.Vector3(0, SPINE_Y, 0));
    [this.#skirtPivot, this.#skirtInner] = this.#makePivot(this.#bodyGroup, new THREE.Vector3(0, WAIST_Y, 0));

    this.#createMaterials();
    if (this.#isMale) {
      this.#buildPrinceBody();
    } else {
      this.#buildPrincessBody();
    }

    this.#headGroup = FaceBuilder.buildHead(this.#materials, this.#isMale, (g) => this.#track(g));
    this.#hairGroup = new THREE.Group();
    this.#headGroup.add(this.#hairGroup);
    [this.#hairSwing, this.#hairSwingInner] = this.#makePivot(this.#hairGroup, HAIR_PIVOT);
    this.#spineInner.add(this.#headGroup);

    this.#accessoryNodes = OutfitBuilder.buildAccessories(
      this.#headGroup,
      this.#leftForearm,
      this.#rightForearm,
      this.#materials,
      (g) => this.#track(g)
    );

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
    return mesh.geometry?.type === 'LatheGeometry' || mesh.position.y < 0.6;
  }

  /** Mechones y mantos que caen por debajo de las orejas tienen balanceo con inercia. */
  #isLongHair(mesh) {
    const geo = mesh.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    mesh.updateMatrix();
    return _box.copy(geo.boundingBox).applyMatrix4(mesh.matrix).min.y < -0.12;
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
    m.primary = new THREE.MeshPhysicalMaterial({ color: 0xf18bb8, roughness: 0.36, metalness: 0.08, sheen: 0.72, sheenColor: new THREE.Color(0xffe0ef), clearcoat: 0.14 });
    m.secondary = new THREE.MeshPhysicalMaterial({ color: 0xffdce9, roughness: 0.38, metalness: 0.08, sheen: 0.60, side: THREE.DoubleSide });
    m.roseGold = new THREE.MeshStandardMaterial({ color: 0xf0be74, metalness: 0.84, roughness: 0.22 });
    m.crystal = new THREE.MeshPhysicalMaterial({ color: 0xffe4f7, emissive: 0xe27bc4, emissiveIntensity: 0.42, roughness: 0.12, metalness: 0.15, clearcoat: 0.8 });
    m.shawl = new THREE.MeshPhysicalMaterial({ color: 0xc2eeff, emissive: 0x7ca2ff, emissiveIntensity: 0.18, roughness: 0.14, transparent: true, opacity: 0.52, side: THREE.DoubleSide });
    m.dark = new THREE.MeshStandardMaterial({ color: 0x221520, roughness: 0.30, metalness: 0.28 });
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
      const heel = new THREE.Mesh(heelGeo, this.#materials.roseGold); heel.position.set(0, -0.45, -0.032); shinGroup.add(heel);
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
      const hand = new THREE.Mesh(hdGeo, this.#materials.skin); hand.scale.set(0.85, 1.38, 0.62); hand.position.y = -0.265; forearm.add(hand);
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
      OutfitBuilder.clearGroup(this.#skirtInner);
      OutfitBuilder.populateOutfit(this.#outfitGroup, outfit, m);
      this.#moveMeshes(this.#outfitGroup, this.#skirtInner, (mesh) => this.#isSkirtPart(mesh));
    }

    // Libera el pelo anterior (incluido el pivote con inercia) y reconstruye el nuevo peinado
    OutfitBuilder.clearGroup(this.#hairSwingInner);
    OutfitBuilder.clearGroup(this.#hairGroup);
    HairBuilder.populate(this.#hairGroup, this.#isMale ? 'principe_tupe' : ap.hairId, m, this.#isMale);
    this.#hairGroup.add(this.#hairSwing);
    this.#moveMeshes(this.#hairGroup, this.#hairSwingInner, (mesh) => this.#isLongHair(mesh));
    this.#animator?.setBaseArmZ(this.#getBaseArmZ());

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

  /** Avanza la animación (idle, walk, run, jump, dance, pose, talk) y la física secundaria. */
  update(dt, animState = 'idle', speed = 0) {
    this.#animator?.update(dt, animState, speed);
  }

  /** Emotes: 'wave' | 'spin' | 'curtsy' | 'star'. */
  playEmote(id) { return this.#animator?.playEmote(id) ?? false; }
  cancelEmote() { this.#animator?.cancelEmote(); }
  getEmote() { return this.#animator?.getEmote() ?? null; }
  setLookTarget(worldPos) { this.#animator?.setLookTarget(worldPos); }
  resetMotion() { this.#animator?.resetMotion(); }

  dispose() {
    for (const g of this.#geometries) g.dispose();
    this.#geometries.length = 0;
    OutfitBuilder.clearGroup(this.#outfitGroup);
    OutfitBuilder.clearGroup(this.#skirtInner);
    OutfitBuilder.clearGroup(this.#hairSwingInner);
    OutfitBuilder.clearGroup(this.#hairGroup);
    for (const mat of Object.values(this.#materials)) mat.dispose();
    this.#materials = {};
  }
}
