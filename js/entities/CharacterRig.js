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
  #animTime = 0;

  #appearance = {
    avatarId: 'aurora',
    outfitId: 'gala_rosa',
    hairId: 'ondas_reales',
    accessories: ['tiara']
  };

  constructor(initialAppearance = null, textureFactory = null) {
    if (initialAppearance) {
      this.#appearance = {
        ...this.#appearance,
        ...initialAppearance,
        accessories: [...(initialAppearance.accessories || ['tiara'])]
      };
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
    return this.#root;
  }

  #createMaterials(avatar) {
    this.#materials.skin = new THREE.MeshStandardMaterial({ color: avatar.skin, roughness: 0.48, metalness: 0.02 });
    this.#materials.face = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.44, metalness: 0.02 });
    this.#materials.lips = new THREE.MeshStandardMaterial({ color: avatar.lipHex, roughness: 0.18, metalness: 0.08 });
    this.#materials.hair = new THREE.MeshStandardMaterial({ color: avatar.hair, roughness: 0.35, metalness: 0.14 });
    this.#materials.primary = new THREE.MeshPhysicalMaterial({
      color: 0xec66aa, roughness: 0.3, metalness: 0.12, sheen: 0.75, sheenColor: new THREE.Color(0xffd7ec), clearcoat: 0.2
    });
    this.#materials.secondary = new THREE.MeshPhysicalMaterial({
      color: 0xf8c9b8, roughness: 0.34, metalness: 0.1, sheen: 0.5
    });
    this.#materials.roseGold = new THREE.MeshStandardMaterial({ color: 0xf4b99d, metalness: 0.9, roughness: 0.16 });
    this.#materials.crystal = new THREE.MeshPhysicalMaterial({
      color: 0xffe4f7, emissive: 0xe27bc4, emissiveIntensity: 0.48, roughness: 0.1, metalness: 0.15, clearcoat: 0.8
    });
    this.#materials.shawl = new THREE.MeshPhysicalMaterial({
      color: 0xc2eeff, emissive: 0x7ca2ff, emissiveIntensity: 0.2, roughness: 0.12, transparent: true, opacity: 0.58, side: THREE.DoubleSide
    });
    this.#materials.dark = new THREE.MeshStandardMaterial({ color: 0x221520, roughness: 0.25, metalness: 0.35 });
  }

  #track(geo) {
    this.#geometries.push(geo);
    return geo;
  }

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
      forearm.rotation.x = -0.18;
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

    const nose = new THREE.Mesh(this.#track(new THREE.ConeGeometry(0.015, 0.036, 10)), this.#materials.skin);
    nose.position.set(0, -0.015, 0.162);
    nose.rotation.x = Math.PI * 0.38;

    const lip = new THREE.Mesh(this.#track(new THREE.SphereGeometry(0.018, 10, 8)), this.#materials.lips);
    lip.scale.set(1.55, 0.45, 0.55);
    lip.position.set(0, -0.068, 0.149);
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
      ...this.#appearance,
      ...partial,
      accessories: partial.accessories ? [...partial.accessories] : this.#appearance.accessories
    };

    const avatar = CharacterPresets.getAvatar(this.#appearance.avatarId);
    const outfit = CharacterPresets.getOutfit(this.#appearance.outfitId);

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
    for (const [id, node] of Object.entries(this.#accessoryNodes)) {
      node.visible = active.has(id);
    }
  }

  getAppearance() {
    return { ...this.#appearance, accessories: [...this.#appearance.accessories] };
  }

  getRoot() {
    return this.#root;
  }

  update(dt, animState = 'idle', speed = 0) {
    this.#animTime += dt;
    const t = this.#animTime;

    if (animState === 'walk' || animState === 'run') {
      const freq = animState === 'run' ? 11.2 : 7.4;
      const swing = Math.sin(t * freq) * (animState === 'run' ? 0.68 : 0.42);
      this.#leftLeg.rotation.x = swing;
      this.#rightLeg.rotation.x = -swing;
      this.#leftShin.rotation.x = Math.max(0, -swing * 0.7);
      this.#rightShin.rotation.x = Math.max(0, swing * 0.7);
      this.#leftArm.rotation.x = -swing * 0.65;
      this.#rightArm.rotation.x = swing * 0.65;
      this.#leftForearm.rotation.x = -0.22 - Math.max(0, swing * 0.35);
      this.#rightForearm.rotation.x = -0.22 - Math.max(0, -swing * 0.35);
      this.#leftArm.rotation.z = 0.08;
      this.#rightArm.rotation.z = -0.08;
      this.#bodyGroup.position.y = Math.abs(Math.cos(t * freq)) * (animState === 'run' ? 0.06 : 0.028);
    } else if (animState === 'jump') {
      this.#leftLeg.rotation.x = -0.35;
      this.#rightLeg.rotation.x = 0.25;
      this.#leftShin.rotation.x = 0.45;
      this.#rightShin.rotation.x = 0.2;
      this.#leftArm.rotation.z = 0.85;
      this.#rightArm.rotation.z = -0.85;
      this.#bodyGroup.position.y = 0.04;
    } else if (animState === 'dance') {
      this.#bodyGroup.position.y = Math.abs(Math.sin(t * 6.2)) * 0.08;
      this.#leftArm.rotation.z = 0.95 + Math.sin(t * 5) * 0.32;
      this.#rightArm.rotation.z = -0.95 - Math.cos(t * 5) * 0.32;
      this.#leftForearm.rotation.x = -0.45;
      this.#rightForearm.rotation.x = -0.45;
      this.#leftLeg.rotation.x = Math.sin(t * 5) * 0.28;
      this.#rightLeg.rotation.x = -Math.sin(t * 5) * 0.28;
      this.#headGroup.rotation.y = Math.sin(t * 3.2) * 0.2;
    } else if (animState === 'pose') {
      this.#bodyGroup.position.y = 0.02;
      this.#leftArm.rotation.z = 0.35;
      this.#leftForearm.rotation.x = -0.55;
      this.#rightArm.rotation.z = this.#isMale ? -0.35 : -1.25;
      this.#rightArm.rotation.x = -0.35;
      this.#rightForearm.rotation.x = -0.35;
      this.#leftLeg.rotation.x = 0.1;
      this.#rightLeg.rotation.x = -0.14;
      this.#leftShin.rotation.x = 0.08;
      this.#rightShin.rotation.x = 0.16;
      this.#headGroup.rotation.y = Math.sin(t * 2.2) * 0.14;
    } else {
      const breath = Math.sin(t * 2.1);
      this.#bodyGroup.position.y = breath * 0.014;
      this.#leftLeg.rotation.x *= 0.85;
      this.#rightLeg.rotation.x *= 0.85;
      this.#leftShin.rotation.x *= 0.85;
      this.#rightShin.rotation.x *= 0.85;
      this.#leftArm.rotation.x *= 0.85;
      this.#rightArm.rotation.x *= 0.85;
      this.#leftForearm.rotation.x = -0.18;
      this.#rightForearm.rotation.x = -0.18;
      this.#leftArm.rotation.z = 0.08 + breath * 0.025;
      this.#rightArm.rotation.z = -0.08 - breath * 0.025;
      this.#headGroup.rotation.y = Math.sin(t * 0.85) * 0.07;
    }
    if (speed > 0.1 && animState === 'idle') this.#bodyGroup.position.y = 0;
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
