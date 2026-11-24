import * as THREE from 'three';
import { CatalogData } from './catalog/CatalogData.js';
import { FaceBuilder } from './catalog/FaceBuilder.js';
import { HairBuilder } from './catalog/HairBuilder.js';
import { OutfitBuilder } from './catalog/OutfitBuilder.js';
import { PrinceRigBuilder } from './catalog/PrinceRigBuilder.js';

/**
 * Rig 3D estilizado de personaje con esqueleto articulado propio y cambio
 * instantáneo de vestimenta, peinado, colores y accesorios en tiempo real.
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
  #leftArm = null; #rightArm = null; #leftForearm = null; #rightForearm = null;
  #leftLeg = null; #rightLeg = null; #leftShin = null; #rightShin = null;
  #puffSleeves = []; #armMeshes = []; #thighMeshes = []; #shinMeshes = []; #shoeMeshes = [];
  #accessoryNodes = {}; #materials = {}; #geometries = [];
  #isMale = false; #outfitStyle = 'ballgown'; #animTime = 0;
  #appearance = CatalogData.getDefaultAppearance('aurora');

  constructor(initialAppearance = null) {
    if (initialAppearance) {
      const base = CatalogData.getDefaultAppearance(initialAppearance.avatarId || 'aurora');
      this.#appearance = {
        avatarId: base.avatarId,
        outfitId: initialAppearance.outfitId || base.outfitId,
        hairId: CatalogData.normalizeHairId(initialAppearance.hairId || base.hairId),
        hairColorId: initialAppearance.hairColorId || base.hairColorId,
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

    this.#createMaterials();
    if (this.#isMale) {
      this.#buildPrinceBody();
    } else {
      this.#buildPrincessBody();
    }

    this.#headGroup = FaceBuilder.buildHead(this.#materials, this.#isMale, (g) => this.#track(g));
    this.#hairGroup = new THREE.Group();
    this.#headGroup.add(this.#hairGroup);
    this.#bodyGroup.add(this.#headGroup);

    this.#accessoryNodes = OutfitBuilder.buildAccessories(
      this.#headGroup,
      this.#leftForearm,
      this.#rightForearm,
      this.#materials,
      (g) => this.#track(g)
    );

    this.applyAppearance(this.#appearance);
    const baseZ = this.#getBaseArmZ();
    this.#leftArm.rotation.set(0, 0, -baseZ);
    this.#rightArm.rotation.set(0, 0, baseZ);
    return this.#root;
  }

  #track(geo) { this.#geometries.push(geo); return geo; }

  #createMaterials() {
    const m = this.#materials;
    m.skin = new THREE.MeshStandardMaterial({ color: 0xfbe0d2, roughness: 0.50, metalness: 0.02 });
    m.blush = new THREE.MeshBasicMaterial({ color: 0xf498b4, transparent: true, opacity: 0.28, depthWrite: false });
    m.eyelid = new THREE.MeshStandardMaterial({ color: 0xc88a96, roughness: 0.55, metalness: 0.02 });
    m.sclera = new THREE.MeshStandardMaterial({ color: 0xf6f8fc, roughness: 0.22, metalness: 0.02 });
    m.eyeIris = new THREE.MeshStandardMaterial({ color: 0x2d78e6, roughness: 0.16, metalness: 0.08 });
    m.eyeRing = new THREE.MeshStandardMaterial({ color: 0x164296, roughness: 0.25, metalness: 0.05 });
    m.eyeGlow = new THREE.MeshStandardMaterial({ color: 0x8ad6ff, emissive: 0x5ab4ff, emissiveIntensity: 0.25, roughness: 0.14 });
    m.pupil = new THREE.MeshStandardMaterial({ color: 0x100a16, roughness: 0.10, metalness: 0.05 });
    m.catchlight = new THREE.MeshBasicMaterial({ color: 0xd8e2ea, toneMapped: false });
    m.lash = new THREE.MeshStandardMaterial({ color: 0x1b0f1b, roughness: 0.45, metalness: 0.04 });
    m.brow = new THREE.MeshStandardMaterial({ color: 0x9c743a, roughness: 0.48, metalness: 0.04 });
    m.lips = new THREE.MeshPhysicalMaterial({ color: 0xe35f90, roughness: 0.22, metalness: 0.05, clearcoat: 0.65 });
    m.hair = new THREE.MeshStandardMaterial({ color: 0xf0c975, roughness: 0.36, metalness: 0.08, side: THREE.DoubleSide });
    m.hair.userData.preserveRoughness = true;
    m.primary = new THREE.MeshPhysicalMaterial({ color: 0xf18bb8, roughness: 0.36, metalness: 0.08, sheen: 0.72, sheenColor: new THREE.Color(0xffe0ef), clearcoat: 0.14 });
    m.secondary = new THREE.MeshPhysicalMaterial({ color: 0xffdce9, roughness: 0.38, metalness: 0.08, sheen: 0.60, side: THREE.DoubleSide });
    m.roseGold = new THREE.MeshStandardMaterial({ color: 0xf0be74, metalness: 0.84, roughness: 0.22 });
    m.crystal = new THREE.MeshPhysicalMaterial({ color: 0xffe4f7, emissive: 0xe27bc4, emissiveIntensity: 0.42, roughness: 0.12, metalness: 0.15, clearcoat: 0.8 });
    m.shawl = new THREE.MeshPhysicalMaterial({ color: 0xc2eeff, emissive: 0x7ca2ff, emissiveIntensity: 0.18, roughness: 0.14, transparent: true, opacity: 0.52, side: THREE.DoubleSide });
    m.dark = new THREE.MeshStandardMaterial({ color: 0x221520, roughness: 0.30, metalness: 0.28 });
  }

  #buildPrinceBody() {
    const parts = PrinceRigBuilder.buildBody(this.#bodyGroup, this.#materials, (g) => this.#track(g));
    this.#leftLeg = parts.leftLeg; this.#rightLeg = parts.rightLeg;
    this.#leftShin = parts.leftShin; this.#rightShin = parts.rightShin;
    this.#leftArm = parts.leftArm; this.#rightArm = parts.rightArm;
    this.#leftForearm = parts.leftForearm; this.#rightForearm = parts.rightForearm;
    this.#thighMeshes = parts.thighMeshes; this.#shinMeshes = parts.shinMeshes;
    this.#shoeMeshes = parts.shoeMeshes; this.#outfitGroup = parts.outfitGroup;
  }

  #buildPrincessBody() {
    const torsoPts = [[0.01, 0.86], [0.14, 0.90], [0.102, 1.05], [0.132, 1.19], [0.152, 1.28], [0.124, 1.36], [0.048, 1.39]];
    const torso = new THREE.Mesh(this.#track(new THREE.LatheGeometry(torsoPts.map(([x, y]) => new THREE.Vector2(x, y)), 22)), this.#materials.primary);
    torso.scale.set(1.06, 1, 0.74); torso.castShadow = true;
    const neck = new THREE.Mesh(this.#track(new THREE.CylinderGeometry(0.042, 0.048, 0.148, 14)), this.#materials.skin);
    neck.position.y = 1.41; neck.castShadow = true;
    this.#bodyGroup.add(torso, neck);

    this.#leftLeg = new THREE.Group(); this.#rightLeg = new THREE.Group();
    this.#leftLeg.position.set(-0.095, 0.92, 0); this.#rightLeg.position.set(0.095, 0.92, 0);
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

    this.#leftArm = new THREE.Group(); this.#rightArm = new THREE.Group();
    this.#leftArm.position.set(-0.194, 1.335, 0); this.#rightArm.position.set(0.194, 1.335, 0);
    const shGeo = this.#track(new THREE.SphereGeometry(0.046, 12, 10));
    const puffGeo = this.#track(new THREE.SphereGeometry(0.080, 16, 12));
    const cuffGeo = this.#track(new THREE.TorusGeometry(0.048, 0.008, 8, 16));
    const upGeo = this.#track(new THREE.CylinderGeometry(0.038, 0.032, 0.27, 12));
    const loGeo = this.#track(new THREE.CylinderGeometry(0.031, 0.024, 0.25, 12));
    const hdGeo = this.#track(new THREE.SphereGeometry(0.032, 10, 10));

    [this.#leftArm, this.#rightArm].forEach((arm, i) => {
      const sh = new THREE.Mesh(shGeo, this.#materials.skin); arm.add(sh);
      const puffGroup = new THREE.Group();
      const puff = new THREE.Mesh(puffGeo, this.#materials.secondary);
      puff.scale.set(1.06, 1.05, 0.96); puff.position.set(i === 0 ? -0.01 : 0.01, -0.025, 0); puff.castShadow = true;
      const cuff = new THREE.Mesh(cuffGeo, this.#materials.roseGold);
      cuff.rotation.x = Math.PI / 2; cuff.position.set(i === 0 ? -0.005 : 0.005, -0.095, 0);
      puffGroup.add(puff, cuff); arm.add(puffGroup); this.#puffSleeves.push(puffGroup);

      const upper = new THREE.Mesh(upGeo, this.#materials.skin); upper.position.y = -0.14; upper.castShadow = true; arm.add(upper);
      const forearm = new THREE.Group(); forearm.position.y = -0.27;
      forearm.rotation.set(-0.22, 0, i === 0 ? -0.08 : 0.08);
      const lower = new THREE.Mesh(loGeo, this.#materials.skin); lower.position.y = -0.125; lower.castShadow = true; forearm.add(lower);
      const hand = new THREE.Mesh(hdGeo, this.#materials.skin); hand.scale.set(0.85, 1.38, 0.62); hand.position.y = -0.265; forearm.add(hand);
      arm.add(forearm); this.#bodyGroup.add(arm);
      this.#armMeshes.push(sh, upper, lower);
      if (i === 0) this.#leftForearm = forearm; else this.#rightForearm = forearm;
    });

    this.#outfitGroup = new THREE.Group();
    this.#bodyGroup.add(this.#outfitGroup);
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
    if (config.hairColorId) ap.hairColorId = config.hairColorId;
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
      OutfitBuilder.populateOutfit(this.#outfitGroup, outfit, m);
    }

    OutfitBuilder.clearGroup(this.#hairGroup);
    HairBuilder.populate(this.#hairGroup, this.#isMale ? 'principe_tupe' : ap.hairId, m, this.#isMale);

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

  #getBaseArmZ() {
    if (this.#isMale) return 0.32;
    const wideSkirt = ['ballgown', 'ice_gown', 'tiered_gown', 'starry_gown'].includes(this.#outfitStyle);
    return wideSkirt ? 0.40 : 0.32;
  }

  update(dt, animState = 'idle', speed = 0) {
    const safeDt = Math.max(0, Math.min(dt, 0.1));
    this.#animTime += safeDt;
    const t = this.#animTime;
    const baseZ = this.#getBaseArmZ();

    const p = {
      bodyY: 0, bodyRotX: 0, bodyRotY: 0, headX: 0, headY: 0, headZ: 0,
      lArmX: 0, lArmZ: -baseZ, rArmX: 0, rArmZ: baseZ,
      lForeX: -0.22, lForeZ: -0.08, rForeX: -0.22, rForeZ: 0.08,
      lLegX: 0, rLegX: 0, lShinX: 0, rShinX: 0, hairX: 0, hairZ: 0
    };

    if (animState === 'walk' || animState === 'run') {
      const run = animState === 'run', freq = run ? 11.2 : 7.4, swing = Math.sin(t * freq) * (run ? 0.62 : 0.38);
      const openZ = baseZ + (run ? 0.06 : 0.03);
      Object.assign(p, {
        bodyY: Math.abs(Math.cos(t * freq)) * (run ? 0.055 : 0.026), bodyRotX: run ? 0.07 : 0.025,
        lLegX: swing, rLegX: -swing, lShinX: Math.max(0, -swing * (run ? 0.78 : 0.62)), rShinX: Math.max(0, swing * (run ? 0.78 : 0.62)),
        lArmX: -swing * (run ? 0.58 : 0.46), rArmX: swing * (run ? 0.58 : 0.46), lArmZ: -openZ, rArmZ: openZ,
        lForeX: (run ? -0.34 : -0.22) - Math.max(0, swing * 0.24), rForeX: (run ? -0.34 : -0.22) - Math.max(0, -swing * 0.24),
        headY: -swing * 0.05, headX: run ? -0.03 : -0.01, hairX: run ? 0.09 : 0.04, hairZ: Math.sin(t * freq) * 0.028
      });
    } else if (animState === 'jump') {
      // Salto estilizado limpio con brazos ligeramente abiertos, nunca cruzados
      Object.assign(p, {
        bodyY: 0.04, bodyRotX: 0.035, headX: -0.05, lArmX: -0.18, rArmX: -0.18, lArmZ: -(baseZ + 0.22), rArmZ: baseZ + 0.22,
        lForeX: -0.26, rForeX: -0.26, lForeZ: -0.10, rForeZ: 0.10, lLegX: -0.32, lShinX: 0.48, rLegX: 0.20, rShinX: 0.34, hairX: 0.13
      });
    } else if (animState === 'dance') {
      const step = Math.sin(t * 4.8);
      Object.assign(p, {
        bodyY: Math.abs(Math.sin(t * 6.0)) * 0.06, bodyRotY: Math.sin(t * 3.0) * 0.14,
        lArmZ: -(0.78 + step * 0.22), rArmZ: 0.78 + Math.cos(t * 4.8) * 0.22,
        lArmX: -0.20 + Math.cos(t * 4.8) * 0.14, rArmX: -0.20 + step * 0.14,
        lForeX: -0.36, rForeX: -0.36, lLegX: step * 0.24, rLegX: -step * 0.24,
        lShinX: Math.max(0, -step * 0.26), rShinX: Math.max(0, step * 0.26),
        headY: Math.sin(t * 3.0) * 0.15, headZ: Math.sin(t * 2.4) * 0.05, hairZ: Math.sin(t * 4.8) * 0.04
      });
    } else if (animState === 'pose') {
      Object.assign(p, {
        bodyY: 0.015, bodyRotY: 0.08, lArmZ: -(baseZ + 0.14), lArmX: -0.10, lForeX: -0.36,
        rArmZ: this.#isMale ? baseZ + 0.14 : 0.96, rArmX: this.#isMale ? -0.16 : -0.30, rForeX: -0.32,
        lLegX: 0.10, rLegX: -0.14, lShinX: 0.08, rShinX: 0.16, headY: Math.sin(t * 2.0) * 0.12 - 0.05, headZ: 0.04
      });
    } else {
      const breath = Math.sin(t * 2.1);
      p.bodyY = speed > 0.1 ? 0 : breath * 0.012;
      p.lArmZ = -(baseZ + breath * 0.016); p.rArmZ = baseZ + breath * 0.016;
      p.headY = Math.sin(t * 0.85) * 0.06; p.headX = breath * 0.015; p.hairZ = Math.sin(t * 1.4) * 0.014;
    }

    const a = Math.min(1, safeDt * 12), L = THREE.MathUtils.lerp, b = this.#bodyGroup, h = this.#headGroup;
    b.position.y = L(b.position.y, p.bodyY, a);
    b.rotation.set(L(b.rotation.x, p.bodyRotX, a), L(b.rotation.y, p.bodyRotY, a), 0);
    h.rotation.set(L(h.rotation.x, p.headX, a), L(h.rotation.y, p.headY, a), L(h.rotation.z, p.headZ, a));
    this.#hairGroup.rotation.set(L(this.#hairGroup.rotation.x, p.hairX, a), 0, L(this.#hairGroup.rotation.z, p.hairZ, a));
    this.#leftArm.rotation.set(L(this.#leftArm.rotation.x, p.lArmX, a), 0, L(this.#leftArm.rotation.z, p.lArmZ, a));
    this.#rightArm.rotation.set(L(this.#rightArm.rotation.x, p.rArmX, a), 0, L(this.#rightArm.rotation.z, p.rArmZ, a));
    this.#leftForearm.rotation.set(L(this.#leftForearm.rotation.x, p.lForeX, a), 0, L(this.#leftForearm.rotation.z, p.lForeZ, a));
    this.#rightForearm.rotation.set(L(this.#rightForearm.rotation.x, p.rForeX, a), 0, L(this.#rightForearm.rotation.z, p.rForeZ, a));
    this.#leftLeg.rotation.x = L(this.#leftLeg.rotation.x, p.lLegX, a);
    this.#rightLeg.rotation.x = L(this.#rightLeg.rotation.x, p.rLegX, a);
    this.#leftShin.rotation.x = L(this.#leftShin.rotation.x, p.lShinX, a);
    this.#rightShin.rotation.x = L(this.#rightShin.rotation.x, p.rShinX, a);
  }

  dispose() {
    for (const g of this.#geometries) g.dispose();
    this.#geometries.length = 0;
    OutfitBuilder.clearGroup(this.#outfitGroup);
    OutfitBuilder.clearGroup(this.#hairGroup);
    for (const mat of Object.values(this.#materials)) mat.dispose();
    this.#materials = {};
  }
}
