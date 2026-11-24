import * as THREE from 'three';
import { CharacterPresets } from './CharacterPresets.js';
import { TextureFactory } from '../core/TextureFactory.js';
import { ModelLoader } from './ModelLoader.js';
import { GlbAvatarController } from './GlbAvatarController.js';

/**
 * Rig modular de personaje 3D: carga modelos .glb reales con esqueleto Mixamo
 * por defecto (CDN oficial o archivos locales) y mantiene el rig procedural
 * únicamente como respaldo de emergencia sin conexión.
 */
export class CharacterRig {
  static AVATARS = CharacterPresets.AVATARS;
  static OUTFITS = CharacterPresets.OUTFITS;
  static HAIRSTYLES = CharacterPresets.HAIRSTYLES;
  static ACCESSORIES = CharacterPresets.ACCESSORIES;

  #root = null; #proceduralGroup = null; #glbGroup = null; #bodyGroup = null;
  #headGroup = null; #hairGroup = null; #outfitGroup = null;
  #leftArm = null; #rightArm = null; #leftForearm = null; #rightForearm = null;
  #leftLeg = null; #rightLeg = null; #leftShin = null; #rightShin = null;
  #puffSleeves = []; #thighMeshes = []; #shinMeshes = []; #shoeMeshes = [];
  #accessoryNodes = {}; #materials = {}; #geometries = [];
  #textureFactory = null; #ownsTextures = false; #isMale = false; #outfitStyle = 'ballgown'; #animTime = 0;
  #appearance = { avatarId: 'aurora', outfitId: 'gala_rosa', hairId: 'ondas_reales', accessories: ['tiara'] };
  #modelUrl = null; #customModelUrl = null; #requestKey = null; #loadToken = 0; #disposed = false;
  #glbController = new GlbAvatarController();
  #modelReady = Promise.resolve(false);
  #lastAnimState = 'idle';

  constructor(initialAppearance = null, textureFactory = null) {
    if (initialAppearance) {
      const a = initialAppearance;
      this.#appearance = { avatarId: a.avatarId || 'aurora', outfitId: a.outfitId || 'gala_rosa', hairId: a.hairId || 'ondas_reales', accessories: [...(a.accessories || ['tiara'])] };
      this.#modelUrl = a.modelUrl || null;
    }
    this.#textureFactory = textureFactory;
  }

  init() {
    if (!this.#textureFactory) { this.#textureFactory = new TextureFactory(); this.#textureFactory.init(); this.#ownsTextures = true; }
    const avatar = CharacterPresets.getAvatar(this.#appearance.avatarId);
    this.#isMale = avatar.gender === 'male';
    this.#root = new THREE.Group();
    this.#proceduralGroup = new THREE.Group();
    this.#glbGroup = new THREE.Group();
    this.#glbGroup.visible = false;
    this.#bodyGroup = new THREE.Group();
    this.#proceduralGroup.add(this.#bodyGroup);
    this.#root.add(this.#proceduralGroup, this.#glbGroup);

    this.#createMaterials(avatar);
    this.#buildBody();
    this.#buildHead(avatar);
    this.#accessoryNodes = CharacterPresets.buildAccessories(this.#headGroup, this.#leftForearm, this.#rightForearm, this.#materials, (g) => this.#track(g));
    this.#applyState(this.#appearance);
    const baseZ = this.#getBaseArmZ();
    this.#leftArm.rotation.set(0, 0, -baseZ);
    this.#rightArm.rotation.set(0, 0, baseZ);
    return this.#root;
  }

  #createMaterials(avatar) {
    const m = this.#materials;
    m.skin = new THREE.MeshStandardMaterial({ color: avatar.skin, roughness: 0.5, metalness: 0.02 });
    m.face = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.48, metalness: 0.02 });
    m.lips = new THREE.MeshPhysicalMaterial({ color: avatar.lipHex, roughness: 0.2, metalness: 0.05, clearcoat: 0.55 });
    m.hair = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.05, side: THREE.DoubleSide });
    m.hair.userData.preserveRoughness = true;
    m.primary = new THREE.MeshPhysicalMaterial({ color: 0xf18bb8, roughness: 0.34, metalness: 0.08, sheen: 0.72, sheenColor: new THREE.Color(0xffe0ef), clearcoat: 0.15 });
    m.secondary = new THREE.MeshPhysicalMaterial({ color: 0xffd5e8, roughness: 0.36, metalness: 0.08, sheen: 0.6, side: THREE.DoubleSide });
    m.roseGold = new THREE.MeshStandardMaterial({ color: 0xf2ba98, metalness: 0.88, roughness: 0.18 });
    m.crystal = new THREE.MeshPhysicalMaterial({ color: 0xffe4f7, emissive: 0xe27bc4, emissiveIntensity: 0.45, roughness: 0.1, metalness: 0.15, clearcoat: 0.8 });
    m.shawl = new THREE.MeshPhysicalMaterial({ color: 0xc2eeff, emissive: 0x7ca2ff, emissiveIntensity: 0.18, roughness: 0.12, transparent: true, opacity: 0.56, side: THREE.DoubleSide });
    m.dark = new THREE.MeshStandardMaterial({ color: 0x221520, roughness: 0.28, metalness: 0.32 });
  }

  #track(geo) { this.#geometries.push(geo); return geo; }

  #buildBody() {
    const m = this.#isMale;
    const torsoPts = m
      ? [[0.01, 0.86], [0.145, 0.88], [0.15, 1.02], [0.165, 1.16], [0.21, 1.32], [0.19, 1.41], [0.068, 1.44]]
      : [[0.01, 0.86], [0.14, 0.9], [0.102, 1.05], [0.132, 1.19], [0.152, 1.28], [0.124, 1.36], [0.05, 1.39]];
    const torso = new THREE.Mesh(this.#track(new THREE.LatheGeometry(torsoPts.map(([x, y]) => new THREE.Vector2(x, y)), 22)), this.#materials.primary);
    torso.scale.set(1.06, 1, 0.74); torso.castShadow = true;
    const neck = new THREE.Mesh(this.#track(new THREE.CylinderGeometry(m ? 0.056 : 0.043, m ? 0.064 : 0.05, m ? 0.13 : 0.145, 14)), this.#materials.skin);
    neck.position.y = m ? 1.44 : 1.405; neck.castShadow = true;
    this.#bodyGroup.add(torso, neck);
    this.#buildLimbs(m);
    this.#outfitGroup = new THREE.Group();
    this.#bodyGroup.add(this.#outfitGroup);
  }

  #buildLimbs(m) {
    this.#leftLeg = new THREE.Group(); this.#rightLeg = new THREE.Group();
    this.#leftLeg.position.set(m ? -0.115 : -0.095, m ? 0.9 : 0.92, 0);
    this.#rightLeg.position.set(m ? 0.115 : 0.095, m ? 0.9 : 0.92, 0);
    const thighGeo = this.#track(new THREE.CylinderGeometry(m ? 0.074 : 0.064, m ? 0.058 : 0.046, 0.44, 14));
    const shinGeo = this.#track(new THREE.CylinderGeometry(m ? 0.056 : 0.045, m ? 0.044 : 0.032, 0.42, 14));
    const footGeo = this.#track(new THREE.BoxGeometry(m ? 0.095 : 0.068, m ? 0.075 : 0.048, m ? 0.21 : 0.165));
    const heelGeo = this.#track(new THREE.CylinderGeometry(0.014, 0.01, 0.068, 8));

    [this.#leftLeg, this.#rightLeg].forEach((leg, i) => {
      const thigh = new THREE.Mesh(thighGeo, this.#materials.secondary);
      thigh.position.y = -0.22; thigh.castShadow = true; leg.add(thigh);
      const shinGroup = new THREE.Group(); shinGroup.position.y = -0.44;
      const shin = new THREE.Mesh(shinGeo, this.#materials.secondary);
      shin.position.y = -0.21; shin.castShadow = true; shinGroup.add(shin);
      const shoe = new THREE.Mesh(footGeo, this.#materials.roseGold);
      shoe.position.set(0, -0.43, m ? 0.045 : 0.035); shoe.castShadow = true; shinGroup.add(shoe);
      if (!m) { const heel = new THREE.Mesh(heelGeo, this.#materials.roseGold); heel.position.set(0, -0.45, -0.032); shinGroup.add(heel); }
      leg.add(shinGroup); this.#bodyGroup.add(leg);
      this.#thighMeshes.push(thigh); this.#shinMeshes.push(shin); this.#shoeMeshes.push(shoe);
      if (i === 0) this.#leftShin = shinGroup; else this.#rightShin = shinGroup;
    });

    this.#leftArm = new THREE.Group(); this.#rightArm = new THREE.Group();
    this.#leftArm.position.set(m ? -0.235 : -0.192, m ? 1.37 : 1.335, 0);
    this.#rightArm.position.set(m ? 0.235 : 0.192, m ? 1.37 : 1.335, 0);
    const shGeo = this.#track(new THREE.SphereGeometry(m ? 0.062 : 0.046, 12, 10));
    const puffGeo = this.#track(new THREE.SphereGeometry(0.082, 16, 12));
    const cuffGeo = this.#track(new THREE.TorusGeometry(0.048, 0.008, 8, 16));
    const upGeo = this.#track(new THREE.CylinderGeometry(m ? 0.05 : 0.038, m ? 0.042 : 0.032, 0.27, 12));
    const loGeo = this.#track(new THREE.CylinderGeometry(m ? 0.041 : 0.031, m ? 0.032 : 0.024, 0.25, 12));
    const hdGeo = this.#track(new THREE.SphereGeometry(m ? 0.04 : 0.032, 10, 10));
    const sleeveMat = m ? this.#materials.primary : this.#materials.skin;

    [this.#leftArm, this.#rightArm].forEach((arm, i) => {
      arm.add(new THREE.Mesh(shGeo, sleeveMat));
      if (!m) {
        const puffGroup = new THREE.Group();
        const puff = new THREE.Mesh(puffGeo, this.#materials.secondary);
        puff.scale.set(1.06, 1.05, 0.96); puff.position.set(i === 0 ? -0.01 : 0.01, -0.025, 0); puff.castShadow = true;
        const cuff = new THREE.Mesh(cuffGeo, this.#materials.roseGold);
        cuff.rotation.x = Math.PI / 2; cuff.position.set(i === 0 ? -0.005 : 0.005, -0.095, 0);
        puffGroup.add(puff, cuff); arm.add(puffGroup); this.#puffSleeves.push(puffGroup);
      }
      const upper = new THREE.Mesh(upGeo, sleeveMat); upper.position.y = -0.14; upper.castShadow = true; arm.add(upper);
      const forearm = new THREE.Group(); forearm.position.y = -0.27;
      forearm.rotation.set(-0.22, 0, i === 0 ? -0.08 : 0.08);
      const lower = new THREE.Mesh(loGeo, sleeveMat); lower.position.y = -0.125; lower.castShadow = true; forearm.add(lower);
      const hand = new THREE.Mesh(hdGeo, this.#materials.skin); hand.scale.set(0.85, 1.38, 0.62); hand.position.y = -0.265; forearm.add(hand);
      arm.add(forearm); this.#bodyGroup.add(arm);
      if (i === 0) this.#leftForearm = forearm; else this.#rightForearm = forearm;
    });
  }

  #buildHead(avatar) {
    const m = this.#isMale;
    this.#headGroup = new THREE.Group(); this.#headGroup.position.y = m ? 1.62 : 1.575;
    const headGeo = this.#track(new THREE.SphereGeometry(0.165, 36, 26, -Math.PI / 2, Math.PI * 2));
    const pos = headGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i) * (m ? 0.96 : 0.93), y = pos.getY(i) * (m ? 1.15 : 1.16), z = pos.getZ(i) * 0.97;
      if (!m && z > 0.04 && y > -0.055 && y < 0.025) {
        const cheek = Math.exp(-Math.pow((y + 0.018) / 0.035, 2)) * Math.min(1, Math.abs(x) / 0.08);
        x *= 1 + cheek * 0.045; z += cheek * 0.008;
      }
      if (y < -0.01) {
        const t = Math.min(1, Math.abs((y + 0.01) / 0.185));
        x *= 1 - Math.pow(t, 1.15) * (m ? 0.20 : 0.30);
        z *= 1 - Math.pow(t, 1.4) * (m ? 0.04 : 0.08);
      }
      pos.setXYZ(i, x, y, z);
    }
    headGeo.computeVertexNormals();
    const headMesh = new THREE.Mesh(headGeo, this.#materials.face); headMesh.castShadow = true;
    const noseBridge = new THREE.Mesh(this.#track(new THREE.ConeGeometry(0.011, 0.036, 10)), this.#materials.skin);
    noseBridge.position.set(0, -0.032, 0.155); noseBridge.rotation.x = Math.PI * 0.32;
    const noseTip = new THREE.Mesh(this.#track(new THREE.SphereGeometry(0.009, 10, 8)), this.#materials.skin);
    noseTip.scale.set(1.0, 0.88, 1.12); noseTip.position.set(0, -0.042, 0.161);
    const lip = new THREE.Mesh(this.#track(new THREE.SphereGeometry(0.015, 12, 8)), this.#materials.lips);
    lip.scale.set(m ? 1.25 : 1.38, m ? 0.32 : 0.38, 0.45); lip.position.set(0, -0.072, 0.145);
    this.#headGroup.add(headMesh, noseBridge, noseTip, lip);
    const earGeo = this.#track(new THREE.SphereGeometry(0.023, 8, 8));
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(earGeo, this.#materials.skin);
      ear.scale.set(0.52, 1.15, 0.78); ear.position.set(s * 0.149, -0.012, -0.006);
      this.#headGroup.add(ear);
    }
    this.#hairGroup = new THREE.Group();
    this.#headGroup.add(this.#hairGroup);
    this.#bodyGroup.add(this.#headGroup);
    this.#updateTextures(avatar);
  }

  #updateTextures(avatar) {
    const faceMap = this.#textureFactory.getFaceTexture(avatar);
    if (this.#materials.face.map !== faceMap) { this.#materials.face.map = faceMap; this.#materials.face.needsUpdate = true; }
    const hairMap = this.#textureFactory.getHairTexture(avatar);
    if (this.#materials.hair.map !== hairMap) { this.#materials.hair.map = hairMap; this.#materials.hair.needsUpdate = true; }
    this.#materials.lips.color.set(avatar.lipHex);
  }

  #clearGroup(group) {
    if (!group) return;
    while (group.children.length > 0) { const c = group.children[0]; c.geometry?.dispose(); group.remove(c); }
  }

  applyAppearance(partial) { if (partial) this.#applyState(partial); }

  #applyState(partial) {
    const ap = this.#appearance;
    if (partial.avatarId) ap.avatarId = partial.avatarId;
    if (partial.outfitId) ap.outfitId = partial.outfitId;
    if (partial.hairId) ap.hairId = partial.hairId;
    if (partial.accessories) ap.accessories = [...partial.accessories];
    if ('modelUrl' in partial) this.#modelUrl = partial.modelUrl || null;
    if ('customModelUrl' in partial) {
      this.#customModelUrl = typeof partial.customModelUrl === 'string' && partial.customModelUrl
        ? partial.customModelUrl
        : null;
    }

    const avatar = CharacterPresets.getAvatar(ap.avatarId);
    const outfit = CharacterPresets.getOutfit(ap.outfitId);
    this.#isMale = avatar.gender === 'male';
    this.#outfitStyle = outfit.style;
    this.#materials.skin.color.setHex(avatar.skin);
    this.#materials.primary.color.setHex(outfit.primary);
    this.#materials.secondary.color.setHex(outfit.secondary);
    this.#updateTextures(avatar);

    const skinLegs = outfit.style === 'ballgown' || outfit.style === 'mermaid';
    const tallBoots = outfit.style === 'prince' || outfit.style === 'riding';
    for (const m of this.#thighMeshes) m.material = skinLegs ? this.#materials.skin : this.#materials.secondary;
    for (const m of this.#shinMeshes) m.material = tallBoots ? this.#materials.dark : (skinLegs ? this.#materials.skin : this.#materials.secondary);
    for (const m of this.#shoeMeshes) m.material = tallBoots ? this.#materials.dark : this.#materials.roseGold;
    for (const ps of this.#puffSleeves) ps.visible = outfit.style === 'ballgown';

    this.#clearGroup(this.#outfitGroup);
    CharacterPresets.populateOutfit(this.#outfitGroup, outfit, this.#materials, this.#isMale);
    this.#clearGroup(this.#hairGroup);
    CharacterPresets.populateHair(this.#hairGroup, ap.hairId, this.#materials, this.#isMale);

    const active = new Set(ap.accessories);
    for (const [id, node] of Object.entries(this.#accessoryNodes)) node.visible = active.has(id);

    const nextKey = `${ap.avatarId}|${this.#modelUrl || ''}|${this.#customModelUrl || ''}`;
    if (nextKey !== this.#requestKey) {
      this.#requestKey = nextKey;
      this.#modelReady = this.#loadRealModel(ap.avatarId, this.#modelUrl, this.#customModelUrl);
    } else if (this.#glbController.isMounted()) {
      this.#glbController.applyAppearance(avatar, outfit, ap.hairId, ap.accessories, this.#isMale);
    }
  }

  /** Promesa que resuelve true si el modelo .glb real quedó montado (false = respaldo procedural). */
  whenModelReady() { return this.#modelReady; }

  async #loadRealModel(avatarId, localUrl, customUrl) {
    const token = ++this.#loadToken;
    let loaded = null;
    try { loaded = await ModelLoader.loadCharacterModel({ avatarId, localUrl, customUrl }); } catch { loaded = null; }
    if (token !== this.#loadToken || this.#disposed) { loaded?.dispose(); return false; }
    if (!loaded) { this.#clearGlbModel(); return false; }
    try {
      this.#mountGlbModel(loaded);
      return true;
    } catch (err) {
      console.warn('[CharacterRig] Modelo .glb no compatible, usando respaldo procedural.', err);
      this.#clearGlbModel();
      return false;
    }
  }

  #mountGlbModel(loaded) {
    this.#clearGlbModel();
    this.#glbController.mount(loaded, this.#materials, this.#lastAnimState);
    this.#glbGroup.add(loaded.root);
    this.#glbGroup.visible = true; this.#proceduralGroup.visible = false;
    const ap = this.#appearance;
    this.#glbController.applyAppearance(CharacterPresets.getAvatar(ap.avatarId), CharacterPresets.getOutfit(ap.outfitId), ap.hairId, ap.accessories, this.#isMale);
  }

  #clearGlbModel() {
    const entry = this.#glbController.getEntry();
    if (entry) this.#glbGroup?.remove(entry.root);
    this.#glbController.dispose();
    if (this.#glbGroup) this.#glbGroup.visible = false;
    if (this.#proceduralGroup) this.#proceduralGroup.visible = true;
  }

  getAppearance() { return { avatarId: this.#appearance.avatarId, outfitId: this.#appearance.outfitId, hairId: this.#appearance.hairId, accessories: [...this.#appearance.accessories] }; }
  getRoot() { return this.#root; }
  #getBaseArmZ() { return this.#outfitStyle === 'ballgown' ? 0.36 : (this.#isMale ? 0.32 : 0.33); }

  update(dt, animState = 'idle', speed = 0) {
    const safeDt = Math.max(0, Math.min(dt, 0.1));
    this.#lastAnimState = animState;
    if (this.#glbController.isMounted() && this.#glbGroup?.visible) {
      this.#glbController.update(safeDt, animState);
      return;
    }

    this.#animTime += safeDt;
    const t = this.#animTime, baseZ = this.#getBaseArmZ();
    const p = {
      bodyY: 0, bodyRotX: 0, bodyRotY: 0, headX: 0, headY: 0, headZ: 0,
      lArmX: 0, lArmZ: -baseZ, rArmX: 0, rArmZ: baseZ,
      lForeX: -0.22, lForeZ: -0.08, rForeX: -0.22, rForeZ: 0.08,
      lLegX: 0, rLegX: 0, lShinX: 0, rShinX: 0, hairX: 0, hairZ: 0
    };

    if (animState === 'walk' || animState === 'run') {
      const run = animState === 'run', freq = run ? 11.2 : 7.4, swing = Math.sin(t * freq) * (run ? 0.65 : 0.40);
      const openZ = baseZ + (run ? 0.06 : 0.02);
      Object.assign(p, {
        bodyY: Math.abs(Math.cos(t * freq)) * (run ? 0.055 : 0.026), bodyRotX: run ? 0.075 : 0.028,
        lLegX: swing, rLegX: -swing, lShinX: Math.max(0, -swing * (run ? 0.8 : 0.65)), rShinX: Math.max(0, swing * (run ? 0.8 : 0.65)),
        lArmX: -swing * (run ? 0.64 : 0.52), rArmX: swing * (run ? 0.64 : 0.52), lArmZ: -openZ, rArmZ: openZ,
        lForeX: (run ? -0.36 : -0.22) - Math.max(0, swing * 0.28), rForeX: (run ? -0.36 : -0.22) - Math.max(0, -swing * 0.28),
        headY: -swing * 0.05, headX: run ? -0.035 : -0.012, hairX: run ? 0.1 : 0.04, hairZ: Math.sin(t * freq) * 0.03
      });
    } else if (animState === 'jump') {
      Object.assign(p, {
        bodyY: 0.04, bodyRotX: 0.04, headX: -0.06, lArmX: -0.30, rArmX: -0.30, lArmZ: -0.74, rArmZ: 0.74,
        lForeX: -0.28, rForeX: -0.28, lForeZ: -0.1, rForeZ: 0.1, lLegX: -0.34, lShinX: 0.52, rLegX: 0.22, rShinX: 0.36, hairX: 0.14
      });
    } else if (animState === 'dance') {
      const step = Math.sin(t * 4.8);
      Object.assign(p, {
        bodyY: Math.abs(Math.sin(t * 6.0)) * 0.065, bodyRotY: Math.sin(t * 3.0) * 0.14,
        lArmZ: -(0.86 + step * 0.25), rArmZ: 0.86 + Math.cos(t * 4.8) * 0.25,
        lArmX: -0.24 + Math.cos(t * 4.8) * 0.15, rArmX: -0.24 + step * 0.15,
        lForeX: -0.4, rForeX: -0.4, lForeZ: -0.1, rForeZ: 0.1, lLegX: step * 0.24, rLegX: -step * 0.24,
        lShinX: Math.max(0, -step * 0.26), rShinX: Math.max(0, step * 0.26),
        headY: Math.sin(t * 3.0) * 0.16, headZ: Math.sin(t * 2.4) * 0.05, hairZ: Math.sin(t * 4.8) * 0.05
      });
    } else if (animState === 'pose') {
      Object.assign(p, {
        bodyY: 0.015, bodyRotY: 0.08, lArmZ: -(baseZ + 0.14), lArmX: -0.1, lForeX: -0.4, lForeZ: -0.08,
        rArmZ: this.#isMale ? baseZ + 0.14 : 1.02, rArmX: this.#isMale ? -0.18 : -0.34, rForeX: -0.34, rForeZ: this.#isMale ? 0.08 : 0.12,
        lLegX: 0.1, rLegX: -0.14, lShinX: 0.08, rShinX: 0.16, headY: Math.sin(t * 2.0) * 0.12 - 0.05, headZ: 0.04
      });
    } else {
      const breath = Math.sin(t * 2.1);
      p.bodyY = speed > 0.1 ? 0 : breath * 0.012;
      p.lArmZ = -(baseZ + breath * 0.018); p.rArmZ = baseZ + breath * 0.018;
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
    this.#disposed = true;
    this.#loadToken++;
    this.#clearGlbModel();
    for (const g of this.#geometries) g.dispose();
    this.#geometries.length = 0;
    this.#clearGroup(this.#outfitGroup);
    this.#clearGroup(this.#hairGroup);
    for (const mat of Object.values(this.#materials)) mat.dispose();
    this.#materials = {};
    if (this.#ownsTextures) this.#textureFactory?.dispose();
  }
}
