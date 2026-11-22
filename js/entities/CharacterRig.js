import * as THREE from 'three';
import { CharacterPresets } from './CharacterPresets.js';
import { TextureFactory } from '../core/TextureFactory.js';

export class CharacterRig {
  static AVATARS = CharacterPresets.AVATARS;
  static OUTFITS = CharacterPresets.OUTFITS;
  static HAIRSTYLES = CharacterPresets.HAIRSTYLES;
  static ACCESSORIES = CharacterPresets.ACCESSORIES;

  #root = null;
  #bodyGroup = null;
  #headGroup = null;
  #hairGroup = null;
  #outfitGroup = null;
  #leftArm = null;
  #rightArm = null;
  #leftForearm = null;
  #rightForearm = null;
  #leftLeg = null;
  #rightLeg = null;
  #leftShin = null;
  #rightShin = null;
  #thighMeshes = [];
  #shinMeshes = [];
  #shoeMeshes = [];
  #accessoryNodes = {};
  #materials = {};
  #geometries = [];
  #textureFactory = null;
  #ownsTextures = false;
  #isMale = false;
  #outfitStyle = 'ballgown';
  #animTime = 0;

  #appearance = {
    avatarId: 'aurora',
    outfitId: 'gala_rosa',
    hairId: 'ondas_reales',
    accessories: ['tiara']
  };

  constructor(initialAppearance = null, textureFactory = null) {
    if (initialAppearance) {
      this.#appearance = { ...this.#appearance, ...initialAppearance, accessories: [...(initialAppearance.accessories || ['tiara'])] };
    }
    this.#textureFactory = textureFactory;
  }

  init() {
    if (!this.#textureFactory) {
      this.#textureFactory = new TextureFactory();
      this.#textureFactory.init();
      this.#ownsTextures = true;
    }
    const avatar = CharacterPresets.getAvatar(this.#appearance.avatarId);
    this.#isMale = avatar.gender === 'male';
    this.#root = new THREE.Group();
    this.#bodyGroup = new THREE.Group();
    this.#root.add(this.#bodyGroup);
    this.#createMaterials(avatar);
    this.#buildBody();
    this.#buildHead(avatar);
    this.#accessoryNodes = CharacterPresets.buildAccessories(
      this.#headGroup, this.#leftForearm, this.#rightForearm, this.#materials, (g) => this.#track(g)
    );
    this.applyAppearance(this.#appearance);
    const baseZ = this.#getBaseArmZ();
    this.#leftArm.rotation.set(0, 0, -baseZ);
    this.#rightArm.rotation.set(0, 0, baseZ);
    return this.#root;
  }

  #createMaterials(avatar) {
    const m = this.#materials;
    m.skin = new THREE.MeshStandardMaterial({ color: avatar.skin, roughness: 0.48, metalness: 0.02 });
    m.face = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.44, metalness: 0.02 });
    m.lips = new THREE.MeshPhysicalMaterial({ color: avatar.lipHex, roughness: 0.2, metalness: 0.05, clearcoat: 0.55 });
    m.hair = new THREE.MeshPhysicalMaterial({ color: avatar.hair, roughness: 0.35, metalness: 0.12, sheen: 0.45 });
    m.primary = new THREE.MeshPhysicalMaterial({ color: 0xec66aa, roughness: 0.3, metalness: 0.12, sheen: 0.75, sheenColor: new THREE.Color(0xffd7ec), clearcoat: 0.2 });
    m.secondary = new THREE.MeshPhysicalMaterial({ color: 0xf8c9b8, roughness: 0.34, metalness: 0.1, sheen: 0.5 });
    m.roseGold = new THREE.MeshStandardMaterial({ color: 0xf4b99d, metalness: 0.9, roughness: 0.16 });
    m.crystal = new THREE.MeshPhysicalMaterial({ color: 0xffe4f7, emissive: 0xe27bc4, emissiveIntensity: 0.48, roughness: 0.1, metalness: 0.15, clearcoat: 0.8 });
    m.shawl = new THREE.MeshPhysicalMaterial({ color: 0xc2eeff, emissive: 0x7ca2ff, emissiveIntensity: 0.2, roughness: 0.12, transparent: true, opacity: 0.58, side: THREE.DoubleSide });
    m.dark = new THREE.MeshStandardMaterial({ color: 0x221520, roughness: 0.25, metalness: 0.35 });
  }

  #track(geo) { this.#geometries.push(geo); return geo; }

  #buildBody() {
    const m = this.#isMale;
    const torsoPts = m
      ? [[0.01, 0.86], [0.145, 0.88], [0.15, 1.02], [0.165, 1.16], [0.21, 1.32], [0.19, 1.41], [0.068, 1.44]]
      : [[0.01, 0.86], [0.142, 0.9], [0.105, 1.06], [0.132, 1.19], [0.152, 1.28], [0.125, 1.36], [0.052, 1.39]];
    const torso = new THREE.Mesh(
      this.#track(new THREE.LatheGeometry(torsoPts.map(([x, y]) => new THREE.Vector2(x, y)), 20)),
      this.#materials.primary
    );
    torso.scale.set(1.06, 1, 0.74);
    torso.castShadow = true;
    this.#bodyGroup.add(torso);

    const neck = new THREE.Mesh(
      this.#track(new THREE.CylinderGeometry(m ? 0.056 : 0.044, m ? 0.064 : 0.05, m ? 0.13 : 0.14, 14)),
      this.#materials.skin
    );
    neck.position.y = m ? 1.44 : 1.4;
    neck.castShadow = true;
    this.#bodyGroup.add(neck);

    this.#buildLimbs(m);
    this.#outfitGroup = new THREE.Group();
    this.#bodyGroup.add(this.#outfitGroup);
  }

  #buildLimbs(m) {
    // Piernas largas articuladas (muslo + pantorrilla + zapato de tacón o bota)
    this.#leftLeg = new THREE.Group();
    this.#rightLeg = new THREE.Group();
    this.#leftLeg.position.set(m ? -0.115 : -0.095, m ? 0.9 : 0.92, 0);
    this.#rightLeg.position.set(m ? 0.115 : 0.095, m ? 0.9 : 0.92, 0);

    const thighGeo = this.#track(new THREE.CylinderGeometry(m ? 0.074 : 0.064, m ? 0.058 : 0.046, 0.44, 14));
    const shinGeo = this.#track(new THREE.CylinderGeometry(m ? 0.056 : 0.045, m ? 0.044 : 0.032, 0.42, 14));
    const footGeo = this.#track(new THREE.BoxGeometry(m ? 0.095 : 0.068, m ? 0.075 : 0.048, m ? 0.21 : 0.165));
    const heelGeo = this.#track(new THREE.CylinderGeometry(0.014, 0.01, 0.068, 8));

    [this.#leftLeg, this.#rightLeg].forEach((leg, i) => {
      const thigh = new THREE.Mesh(thighGeo, this.#materials.secondary);
      thigh.position.y = -0.22;
      thigh.castShadow = true;
      leg.add(thigh);

      const shinGroup = new THREE.Group();
      shinGroup.position.y = -0.44;
      const shin = new THREE.Mesh(shinGeo, this.#materials.secondary);
      shin.position.y = -0.21;
      shin.castShadow = true;
      shinGroup.add(shin);

      const shoe = new THREE.Mesh(footGeo, this.#materials.roseGold);
      shoe.position.set(0, -0.43, m ? 0.045 : 0.035);
      shoe.castShadow = true;
      shinGroup.add(shoe);

      if (!m) {
        const heel = new THREE.Mesh(heelGeo, this.#materials.roseGold);
        heel.position.set(0, -0.45, -0.032);
        shinGroup.add(heel);
      }

      leg.add(shinGroup);
      this.#bodyGroup.add(leg);
      this.#thighMeshes.push(thigh);
      this.#shinMeshes.push(shin);
      this.#shoeMeshes.push(shoe);
      if (i === 0) this.#leftShin = shinGroup;
      else this.#rightShin = shinGroup;
    });

    // Brazos articulados en 2 segmentos con manos esculpidas
    this.#leftArm = new THREE.Group();
    this.#rightArm = new THREE.Group();
    this.#leftArm.position.set(m ? -0.235 : -0.185, m ? 1.37 : 1.33, 0);
    this.#rightArm.position.set(m ? 0.235 : 0.185, m ? 1.37 : 1.33, 0);

    const shGeo = this.#track(new THREE.SphereGeometry(m ? 0.062 : 0.048, 12, 10));
    const upGeo = this.#track(new THREE.CylinderGeometry(m ? 0.05 : 0.039, m ? 0.042 : 0.033, 0.27, 12));
    const loGeo = this.#track(new THREE.CylinderGeometry(m ? 0.041 : 0.032, m ? 0.032 : 0.025, 0.25, 12));
    const hdGeo = this.#track(new THREE.SphereGeometry(m ? 0.04 : 0.033, 10, 10));
    const sleeveMat = m ? this.#materials.primary : this.#materials.skin;

    [this.#leftArm, this.#rightArm].forEach((arm, i) => {
      arm.add(new THREE.Mesh(shGeo, sleeveMat));
      const upper = new THREE.Mesh(upGeo, sleeveMat);
      upper.position.y = -0.14;
      upper.castShadow = true;
      arm.add(upper);

      const forearm = new THREE.Group();
      forearm.position.y = -0.27;
      forearm.rotation.set(-0.15, 0, i === 0 ? -0.06 : 0.06);
      const lower = new THREE.Mesh(loGeo, sleeveMat);
      lower.position.y = -0.125;
      lower.castShadow = true;
      forearm.add(lower);

      const hand = new THREE.Mesh(hdGeo, this.#materials.skin);
      hand.scale.set(0.85, 1.35, 0.65);
      hand.position.y = -0.265;
      forearm.add(hand);

      arm.add(forearm);
      this.#bodyGroup.add(arm);
      if (i === 0) this.#leftForearm = forearm;
      else this.#rightForearm = forearm;
    });
  }

  #buildHead(avatar) {
    const m = this.#isMale;
    this.#headGroup = new THREE.Group();
    this.#headGroup.position.y = m ? 1.62 : 1.57;

    // Cabeza ovalada con barbilla delicada (phiStart=-PI/2 centra u=0.5 en +Z)
    const headGeo = this.#track(new THREE.SphereGeometry(0.165, 32, 24, -Math.PI / 2, Math.PI * 2));
    const pos = headGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i) * (m ? 0.96 : 0.92);
      let y = pos.getY(i) * (m ? 1.15 : 1.17);
      let z = pos.getZ(i) * 0.97;
      if (y < 0) {
        const taper = 1 - Math.abs(y / 0.2) * (m ? 0.18 : 0.26);
        x *= taper;
        z *= 0.94 + taper * 0.06;
      }
      pos.setXYZ(i, x, y, z);
    }
    headGeo.computeVertexNormals();

    const headMesh = new THREE.Mesh(headGeo, this.#materials.face);
    headMesh.castShadow = true;
    this.#headGroup.add(headMesh);

    const nose = new THREE.Mesh(this.#track(new THREE.SphereGeometry(0.012, 10, 8)), this.#materials.skin);
    nose.scale.set(m ? 0.94 : 0.82, m ? 1.2 : 1.12, m ? 1.22 : 1.15);
    nose.position.set(0, -0.040, 0.155);

    const lip = new THREE.Mesh(this.#track(new THREE.SphereGeometry(0.016, 12, 8)), this.#materials.lips);
    lip.scale.set(m ? 1.28 : 1.42, m ? 0.34 : 0.38, 0.5);
    lip.position.set(0, -0.072, 0.143);
    this.#headGroup.add(nose, lip);

    const earGeo = this.#track(new THREE.SphereGeometry(0.024, 8, 8));
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(earGeo, this.#materials.skin);
      ear.scale.set(0.55, 1.15, 0.8);
      ear.position.set(side * 0.148, -0.01, -0.005);
      this.#headGroup.add(ear);
    }

    this.#hairGroup = new THREE.Group();
    this.#headGroup.add(this.#hairGroup);
    this.#bodyGroup.add(this.#headGroup);
    this.#updateFaceTexture(avatar);
  }

  #updateFaceTexture(avatar) {
    const map = this.#textureFactory.getFaceTexture(avatar);
    // Solo recompilar el shader si cambia la textura (antes ocurría en cada cambio de ropa)
    if (this.#materials.face.map !== map) {
      this.#materials.face.map = map;
      this.#materials.face.needsUpdate = true;
    }
    this.#materials.lips.color.set(avatar.lipHex);
  }

  #clearGroup(group) {
    if (!group) return;
    while (group.children.length > 0) {
      const c = group.children[0];
      c.geometry?.dispose();
      group.remove(c);
    }
  }

  applyAppearance(partial) {
    this.#appearance = {
      ...this.#appearance, ...partial,
      accessories: partial.accessories ? [...partial.accessories] : this.#appearance.accessories
    };
    const avatar = CharacterPresets.getAvatar(this.#appearance.avatarId);
    const outfit = CharacterPresets.getOutfit(this.#appearance.outfitId);
    this.#outfitStyle = outfit.style;

    this.#materials.skin.color.setHex(avatar.skin);
    this.#materials.hair.color.setHex(avatar.hair);
    this.#materials.primary.color.setHex(outfit.primary);
    this.#materials.secondary.color.setHex(outfit.secondary);
    this.#updateFaceTexture(avatar);

    const skinLegs = outfit.style === 'ballgown' || outfit.style === 'mermaid';
    const tallBoots = outfit.style === 'prince' || outfit.style === 'riding';
    for (const m of this.#thighMeshes) m.material = skinLegs ? this.#materials.skin : this.#materials.secondary;
    for (const m of this.#shinMeshes) m.material = tallBoots ? this.#materials.dark : (skinLegs ? this.#materials.skin : this.#materials.secondary);
    for (const m of this.#shoeMeshes) m.material = tallBoots ? this.#materials.dark : this.#materials.roseGold;

    this.#clearGroup(this.#outfitGroup);
    CharacterPresets.populateOutfit(this.#outfitGroup, outfit, this.#materials, this.#isMale);
    this.#clearGroup(this.#hairGroup);
    CharacterPresets.populateHair(this.#hairGroup, this.#appearance.hairId, this.#materials, this.#isMale);

    const active = new Set(this.#appearance.accessories);
    for (const [id, node] of Object.entries(this.#accessoryNodes)) node.visible = active.has(id);
  }

  getAppearance() { return { ...this.#appearance, accessories: [...this.#appearance.accessories] }; }
  getRoot() { return this.#root; }

  #getBaseArmZ() {
    return this.#outfitStyle === 'ballgown' ? 0.34 : (this.#isMale ? 0.28 : 0.30);
  }

  update(dt, animState = 'idle', speed = 0) {
    const safeDt = Math.max(0, Math.min(dt, 0.1));
    this.#animTime += safeDt;
    const t = this.#animTime;
    const baseZ = this.#getBaseArmZ();

    // Pose objetivo absoluta para todos los ejes (cero residuos al cambiar de estado)
    const p = {
      bodyY: 0, bodyRotX: 0, bodyRotY: 0, headX: 0, headY: 0, headZ: 0,
      lArmX: 0, lArmZ: -baseZ, rArmX: 0, rArmZ: baseZ,
      lForeX: -0.15, lForeZ: -0.06, rForeX: -0.15, rForeZ: 0.06,
      lLegX: 0, rLegX: 0, lShinX: 0, rShinX: 0
    };

    if (animState === 'walk' || animState === 'run') {
      const run = animState === 'run';
      const freq = run ? 11.2 : 7.4;
      const swing = Math.sin(t * freq) * (run ? 0.66 : 0.42);
      const openZ = baseZ + (run ? 0.06 : 0.02);
      Object.assign(p, {
        bodyY: Math.abs(Math.cos(t * freq)) * (run ? 0.055 : 0.026), bodyRotX: run ? 0.08 : 0.03,
        lLegX: swing, rLegX: -swing,
        lShinX: Math.max(0, -swing * (run ? 0.82 : 0.68)), rShinX: Math.max(0, swing * (run ? 0.82 : 0.68)),
        lArmX: -swing * (run ? 0.68 : 0.56), rArmX: swing * (run ? 0.68 : 0.56),
        lArmZ: -openZ, rArmZ: openZ,
        lForeX: (run ? -0.34 : -0.18) - Math.max(0, swing * 0.3),
        rForeX: (run ? -0.34 : -0.18) - Math.max(0, -swing * 0.3),
        headY: -swing * 0.05, headX: run ? -0.04 : -0.015
      });
    } else if (animState === 'jump') {
      Object.assign(p, {
        bodyY: 0.04, bodyRotX: 0.04, headX: -0.06,
        lArmX: -0.25, rArmX: -0.25, lArmZ: -0.78, rArmZ: 0.78,
        lForeX: -0.30, rForeX: -0.30, lForeZ: -0.08, rForeZ: 0.08,
        lLegX: -0.34, lShinX: 0.52, rLegX: 0.22, rShinX: 0.36
      });
    } else if (animState === 'dance') {
      const step = Math.sin(t * 4.8);
      Object.assign(p, {
        bodyY: Math.abs(Math.sin(t * 6.0)) * 0.068, bodyRotY: Math.sin(t * 3.0) * 0.14,
        lArmZ: -(0.86 + step * 0.26), rArmZ: 0.86 + Math.cos(t * 4.8) * 0.26,
        lArmX: -0.22 + Math.cos(t * 4.8) * 0.16, rArmX: -0.22 + step * 0.16,
        lForeX: -0.42, rForeX: -0.42, lForeZ: -0.10, rForeZ: 0.10,
        lLegX: step * 0.24, rLegX: -step * 0.24,
        lShinX: Math.max(0, -step * 0.28), rShinX: Math.max(0, step * 0.28),
        headY: Math.sin(t * 3.0) * 0.18, headZ: Math.sin(t * 2.4) * 0.06
      });
    } else if (animState === 'pose') {
      Object.assign(p, {
        bodyY: 0.015, bodyRotY: 0.08,
        lArmZ: -(baseZ + 0.14), lArmX: -0.1, lForeX: -0.42, lForeZ: -0.06,
        rArmZ: this.#isMale ? baseZ + 0.14 : 1.05, rArmX: this.#isMale ? -0.18 : -0.35,
        rForeX: -0.35, rForeZ: this.#isMale ? 0.06 : 0.12,
        lLegX: 0.1, rLegX: -0.15, lShinX: 0.08, rShinX: 0.18,
        headY: Math.sin(t * 2.0) * 0.12 - 0.05, headZ: 0.04
      });
    } else {
      const breath = Math.sin(t * 2.1);
      p.bodyY = speed > 0.1 ? 0 : breath * 0.012;
      p.lArmZ = -(baseZ + breath * 0.02);
      p.rArmZ = baseZ + breath * 0.02;
      p.headY = Math.sin(t * 0.85) * 0.07;
      p.headX = breath * 0.018;
    }

    const a = Math.min(1, safeDt * 12);
    const L = THREE.MathUtils.lerp;
    const b = this.#bodyGroup;
    const h = this.#headGroup;
    b.position.y = L(b.position.y, p.bodyY, a);
    b.rotation.set(L(b.rotation.x, p.bodyRotX, a), L(b.rotation.y, p.bodyRotY, a), 0);
    h.rotation.set(L(h.rotation.x, p.headX, a), L(h.rotation.y, p.headY, a), L(h.rotation.z, p.headZ, a));
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
    this.#clearGroup(this.#outfitGroup);
    this.#clearGroup(this.#hairGroup);
    for (const mat of Object.values(this.#materials)) mat.dispose();
    this.#materials = {};
    if (this.#ownsTextures) this.#textureFactory?.dispose();
  }
}
