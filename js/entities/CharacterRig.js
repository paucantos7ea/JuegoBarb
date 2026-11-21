import * as THREE from 'three';

export class CharacterRig {
  static AVATARS = [
    { id: 'aurora', name: 'Aurora', skin: 0xfbe0d2, hair: 0xeec67a, eyes: 0x3b78c2, swatch: 'linear-gradient(135deg,#ffe5a3,#f698c4)' },
    { id: 'valentina', name: 'Valentina', skin: 0xd9a17c, hair: 0x45241c, eyes: 0x5c3621, swatch: 'linear-gradient(135deg,#c97a5b,#e564a1)' },
    { id: 'celeste', name: 'Celeste', skin: 0xfff0e8, hair: 0xeadcf8, eyes: 0x7a59c9, swatch: 'linear-gradient(135deg,#e4d4ff,#99c9ff)' },
    { id: 'amara', name: 'Amara', skin: 0x7c4b34, hair: 0x1e1620, eyes: 0x3b2316, swatch: 'linear-gradient(135deg,#a96a48,#e4b15e)' }
  ];

  static OUTFITS = [
    { id: 'gala_rosa', name: 'Gala Rosa Imperial', desc: 'Vestido de gala brillante con corpiño oro rosa', primary: 0xee6fae, secondary: 0xf6c2b0, skirt: true, swatch: 'linear-gradient(135deg,#ff92ca,#e8b47c)' },
    { id: 'casual_chic', name: 'Casual Chic', desc: 'Chaqueta rosada, blusa perla y pantalón', primary: 0xf39ac4, secondary: 0xfff6fa, skirt: false, swatch: 'linear-gradient(135deg,#ffc1de,#fff5fa)' },
    { id: 'equitacion_real', name: 'Equitación Real', desc: 'Casaca imperial borgoña con ribetes dorados', primary: 0x9b275c, secondary: 0xf8e7d2, skirt: false, swatch: 'linear-gradient(135deg,#9b275c,#e5b869)' },
    { id: 'cristal_nocturno', name: 'Cristal Nocturno', desc: 'Vestido columna amatista con destellos de cristal', primary: 0x6b4bd6, secondary: 0x9be7ff, skirt: true, swatch: 'linear-gradient(135deg,#6b4bd6,#9be7ff)' }
  ];

  static HAIRSTYLES = [
    { id: 'ondas_reales', name: 'Ondas Reales', desc: 'Melena larga y brillante' },
    { id: 'recogido_imperial', name: 'Recogido Imperial', desc: 'Moño alto elegante de gala' },
    { id: 'coleta_perla', name: 'Coleta Perla', desc: 'Coleta alta dinámica con lazo' }
  ];

  static ACCESSORIES = [
    { id: 'tiara', name: 'Tiara', desc: 'Corona de cristales rosas y oro' },
    { id: 'gafas', name: 'Gafas de sol', desc: 'Montura chic oro rosa' },
    { id: 'bolso', name: 'Bolso', desc: 'Bolso de gala en mano izquierda' },
    { id: 'cetro', name: 'Cetro', desc: 'Cetro de cristal luminoso' }
  ];

  #root = null;
  #bodyGroup = null;
  #headGroup = null;
  #hairGroup = null;
  #outfitGroup = null;
  #leftArm = null;
  #rightArm = null;
  #leftLeg = null;
  #rightLeg = null;
  #accessoryNodes = {};
  #materials = {};
  #geometries = [];
  #appearance = {
    avatarId: 'aurora',
    outfitId: 'gala_rosa',
    hairId: 'ondas_reales',
    accessories: ['tiara']
  };
  #animTime = 0;

  constructor(initialAppearance = null) {
    if (initialAppearance) {
      this.#appearance = {
        ...this.#appearance,
        ...initialAppearance,
        accessories: [...(initialAppearance.accessories || ['tiara'])]
      };
    }
  }

  init() {
    this.#root = new THREE.Group();
    this.#bodyGroup = new THREE.Group();
    this.#root.add(this.#bodyGroup);

    this.#materials.skin = new THREE.MeshStandardMaterial({ color: 0xfbe0d2, roughness: 0.55 });
    this.#materials.hair = new THREE.MeshStandardMaterial({ color: 0xeec67a, roughness: 0.35, metalness: 0.12 });
    this.#materials.primary = new THREE.MeshStandardMaterial({ color: 0xee6fae, roughness: 0.32, metalness: 0.18 });
    this.#materials.secondary = new THREE.MeshStandardMaterial({ color: 0xf6c2b0, roughness: 0.25, metalness: 0.35 });
    this.#materials.roseGold = new THREE.MeshStandardMaterial({ color: 0xf4b6a8, metalness: 0.9, roughness: 0.15 });
    this.#materials.crystal = new THREE.MeshStandardMaterial({
      color: 0xffd9f4,
      emissive: 0xff82c9,
      emissiveIntensity: 0.65,
      roughness: 0.12,
      metalness: 0.2
    });
    this.#materials.dark = new THREE.MeshStandardMaterial({ color: 0x241422, roughness: 0.35 });

    this.#buildBaseSkeleton();
    this.applyAppearance(this.#appearance);
    return this.#root;
  }

  #trackGeo(geo) {
    this.#geometries.push(geo);
    return geo;
  }

  #buildBaseSkeleton() {
    // Piernas
    this.#leftLeg = new THREE.Group();
    this.#leftLeg.position.set(-0.14, 0.78, 0);
    this.#rightLeg = new THREE.Group();
    this.#rightLeg.position.set(0.14, 0.78, 0);

    const legGeo = this.#trackGeo(new THREE.CylinderGeometry(0.08, 0.065, 0.72, 10));
    const shoeGeo = this.#trackGeo(new THREE.BoxGeometry(0.13, 0.1, 0.24));

    for (const leg of [this.#leftLeg, this.#rightLeg]) {
      const limb = new THREE.Mesh(legGeo, this.#materials.secondary);
      limb.position.y = -0.36;
      limb.castShadow = true;
      leg.add(limb);

      const shoe = new THREE.Mesh(shoeGeo, this.#materials.roseGold);
      shoe.position.set(0, -0.72, 0.04);
      shoe.castShadow = true;
      leg.add(shoe);
      this.#bodyGroup.add(leg);
    }

    // Torso
    const torsoGeo = this.#trackGeo(new THREE.CylinderGeometry(0.2, 0.16, 0.56, 12));
    const torso = new THREE.Mesh(torsoGeo, this.#materials.primary);
    torso.position.y = 1.08;
    torso.castShadow = true;
    this.#bodyGroup.add(torso);

    const beltGeo = this.#trackGeo(new THREE.TorusGeometry(0.175, 0.032, 8, 18));
    const belt = new THREE.Mesh(beltGeo, this.#materials.roseGold);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.84;
    this.#bodyGroup.add(belt);

    // Grupo dinámico para falda / capa / chaqueta
    this.#outfitGroup = new THREE.Group();
    this.#bodyGroup.add(this.#outfitGroup);

    // Brazos
    this.#leftArm = new THREE.Group();
    this.#leftArm.position.set(-0.27, 1.3, 0);
    this.#rightArm = new THREE.Group();
    this.#rightArm.position.set(0.27, 1.3, 0);

    const armGeo = this.#trackGeo(new THREE.CylinderGeometry(0.055, 0.048, 0.52, 8));
    const handGeo = this.#trackGeo(new THREE.SphereGeometry(0.058, 8, 8));

    for (const arm of [this.#leftArm, this.#rightArm]) {
      const limb = new THREE.Mesh(armGeo, this.#materials.skin);
      limb.position.y = -0.25;
      limb.castShadow = true;
      arm.add(limb);

      const hand = new THREE.Mesh(handGeo, this.#materials.skin);
      hand.position.y = -0.52;
      arm.add(hand);
      this.#bodyGroup.add(arm);
    }

    // Cabeza
    this.#headGroup = new THREE.Group();
    this.#headGroup.position.y = 1.56;

    const neck = new THREE.Mesh(this.#trackGeo(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 8)), this.#materials.skin);
    neck.position.y = -0.16;
    this.#headGroup.add(neck);

    const head = new THREE.Mesh(this.#trackGeo(new THREE.SphereGeometry(0.21, 16, 14)), this.#materials.skin);
    head.castShadow = true;
    this.#headGroup.add(head);

    // Ojos expresivos
    const eyeGeo = this.#trackGeo(new THREE.SphereGeometry(0.028, 8, 8));
    const leftEye = new THREE.Mesh(eyeGeo, this.#materials.dark);
    leftEye.position.set(-0.072, 0.02, 0.185);
    const rightEye = new THREE.Mesh(eyeGeo, this.#materials.dark);
    rightEye.position.set(0.072, 0.02, 0.185);
    this.#headGroup.add(leftEye, rightEye);

    this.#hairGroup = new THREE.Group();
    this.#headGroup.add(this.#hairGroup);
    this.#bodyGroup.add(this.#headGroup);

    this.#buildAccessories();
  }

  #buildAccessories() {
    // Tiara
    const tiara = new THREE.Group();
    const band = new THREE.Mesh(this.#trackGeo(new THREE.TorusGeometry(0.16, 0.018, 8, 20, Math.PI)), this.#materials.roseGold);
    band.rotation.x = Math.PI / 2 - 0.25;
    band.position.set(0, 0.18, 0.04);
    const jewel = new THREE.Mesh(this.#trackGeo(new THREE.OctahedronGeometry(0.055, 0)), this.#materials.crystal);
    jewel.position.set(0, 0.24, 0.15);
    tiara.add(band, jewel);
    this.#headGroup.add(tiara);
    this.#accessoryNodes.tiara = tiara;

    // Gafas de sol
    const gafas = new THREE.Group();
    const lensGeo = this.#trackGeo(new THREE.BoxGeometry(0.095, 0.055, 0.02));
    const l1 = new THREE.Mesh(lensGeo, this.#materials.dark);
    l1.position.set(-0.07, 0.025, 0.21);
    const l2 = new THREE.Mesh(lensGeo, this.#materials.dark);
    l2.position.set(0.07, 0.025, 0.21);
    const bridge = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(0.05, 0.014, 0.02)), this.#materials.roseGold);
    bridge.position.set(0, 0.035, 0.21);
    gafas.add(l1, l2, bridge);
    this.#headGroup.add(gafas);
    this.#accessoryNodes.gafas = gafas;

    // Bolso (mano izquierda)
    const bolso = new THREE.Group();
    const bagBody = new THREE.Mesh(this.#trackGeo(new THREE.BoxGeometry(0.16, 0.16, 0.09)), this.#materials.primary);
    bagBody.position.set(-0.04, -0.62, 0.02);
    const handle = new THREE.Mesh(this.#trackGeo(new THREE.TorusGeometry(0.055, 0.012, 6, 12, Math.PI)), this.#materials.roseGold);
    handle.position.set(-0.04, -0.53, 0.02);
    bolso.add(bagBody, handle);
    this.#leftArm.add(bolso);
    this.#accessoryNodes.bolso = bolso;

    // Cetro de cristal (mano derecha)
    const cetro = new THREE.Group();
    const rod = new THREE.Mesh(this.#trackGeo(new THREE.CylinderGeometry(0.018, 0.018, 0.72, 8)), this.#materials.roseGold);
    rod.rotation.x = Math.PI / 2 - 0.35;
    rod.position.set(0.02, -0.5, 0.22);
    const orb = new THREE.Mesh(this.#trackGeo(new THREE.OctahedronGeometry(0.09, 0)), this.#materials.crystal);
    orb.position.set(0.02, -0.37, 0.56);
    cetro.add(rod, orb);
    this.#rightArm.add(cetro);
    this.#accessoryNodes.cetro = cetro;
  }

  #rebuildOutfitGeometry(outfit) {
    while (this.#outfitGroup.children.length > 0) {
      const child = this.#outfitGroup.children[0];
      child.geometry?.dispose();
      this.#outfitGroup.remove(child);
    }

    if (outfit.skirt) {
      const isColumn = outfit.id === 'cristal_nocturno';
      const skirtGeo = new THREE.ConeGeometry(isColumn ? 0.34 : 0.52, 0.84, 18, 1, false);
      const skirt = new THREE.Mesh(skirtGeo, this.#materials.primary);
      skirt.position.y = 0.45;
      skirt.castShadow = true;
      this.#outfitGroup.add(skirt);

      const trimGeo = new THREE.TorusGeometry(isColumn ? 0.34 : 0.51, 0.028, 8, 22);
      const trim = new THREE.Mesh(trimGeo, this.#materials.roseGold);
      trim.rotation.x = Math.PI / 2;
      trim.position.y = 0.06;
      this.#outfitGroup.add(trim);
    } else {
      // Chaqueta / casaca estilizada con hombreras doradas
      const shoulderGeo = new THREE.BoxGeometry(0.56, 0.14, 0.26);
      const shoulder = new THREE.Mesh(shoulderGeo, this.#materials.primary);
      shoulder.position.y = 1.3;
      shoulder.castShadow = true;
      this.#outfitGroup.add(shoulder);

      const peplumGeo = new THREE.CylinderGeometry(0.19, 0.24, 0.22, 12);
      const peplum = new THREE.Mesh(peplumGeo, this.#materials.primary);
      peplum.position.y = 0.78;
      this.#outfitGroup.add(peplum);
    }
  }

  #rebuildHair(hairId) {
    while (this.#hairGroup.children.length > 0) {
      const child = this.#hairGroup.children[0];
      child.geometry?.dispose();
      this.#hairGroup.remove(child);
    }

    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.225, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), this.#materials.hair);
    cap.position.y = 0.02;
    this.#hairGroup.add(cap);

    if (hairId === 'ondas_reales') {
      const back = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.48, 12), this.#materials.hair);
      back.position.set(0, -0.18, -0.08);
      this.#hairGroup.add(back);
    } else if (hairId === 'recogido_imperial') {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), this.#materials.hair);
      bun.position.set(0, 0.23, -0.07);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 6, 14), this.#materials.roseGold);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, 0.16, -0.07);
      this.#hairGroup.add(bun, ring);
    } else {
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.46, 10), this.#materials.hair);
      tail.position.set(0, -0.04, -0.24);
      tail.rotation.x = -0.35;
      this.#hairGroup.add(tail);
    }
  }

  applyAppearance(partial) {
    this.#appearance = {
      ...this.#appearance,
      ...partial,
      accessories: partial.accessories ? [...partial.accessories] : this.#appearance.accessories
    };

    const avatar = CharacterRig.AVATARS.find((a) => a.id === this.#appearance.avatarId) || CharacterRig.AVATARS[0];
    const outfit = CharacterRig.OUTFITS.find((o) => o.id === this.#appearance.outfitId) || CharacterRig.OUTFITS[0];

    this.#materials.skin.color.setHex(avatar.skin);
    this.#materials.hair.color.setHex(avatar.hair);
    this.#materials.primary.color.setHex(outfit.primary);
    this.#materials.secondary.color.setHex(outfit.secondary);

    this.#rebuildOutfitGeometry(outfit);
    this.#rebuildHair(this.#appearance.hairId);

    const activeSet = new Set(this.#appearance.accessories);
    for (const [id, node] of Object.entries(this.#accessoryNodes)) {
      node.visible = activeSet.has(id);
    }
  }

  getAppearance() {
    return {
      ...this.#appearance,
      accessories: [...this.#appearance.accessories]
    };
  }

  getRoot() {
    return this.#root;
  }

  update(dt, animState = 'idle', speed = 0) {
    this.#animTime += dt;
    const t = this.#animTime;

    if (animState === 'walk' || animState === 'run') {
      const freq = animState === 'run' ? 11.5 : 7.5;
      const amp = animState === 'run' ? 0.72 : 0.45;
      const swing = Math.sin(t * freq) * amp;
      this.#leftLeg.rotation.x = swing;
      this.#rightLeg.rotation.x = -swing;
      this.#leftArm.rotation.x = -swing * 0.8;
      this.#rightArm.rotation.x = swing * 0.8;
      this.#leftArm.rotation.z = 0.08;
      this.#rightArm.rotation.z = -0.08;
      this.#bodyGroup.position.y = Math.abs(Math.cos(t * freq)) * (animState === 'run' ? 0.07 : 0.035);
    } else if (animState === 'jump') {
      this.#leftLeg.rotation.x = -0.3;
      this.#rightLeg.rotation.x = 0.25;
      this.#leftArm.rotation.z = 0.75;
      this.#rightArm.rotation.z = -0.75;
      this.#leftArm.rotation.x = -0.25;
      this.#rightArm.rotation.x = -0.25;
      this.#bodyGroup.position.y = 0.05;
    } else if (animState === 'dance') {
      this.#bodyGroup.position.y = Math.abs(Math.sin(t * 6.5)) * 0.1;
      this.#leftArm.rotation.z = 0.9 + Math.sin(t * 5) * 0.35;
      this.#rightArm.rotation.z = -0.9 - Math.cos(t * 5) * 0.35;
      this.#leftLeg.rotation.x = Math.sin(t * 5) * 0.3;
      this.#rightLeg.rotation.x = -Math.sin(t * 5) * 0.3;
      this.#headGroup.rotation.y = Math.sin(t * 3.5) * 0.22;
    } else if (animState === 'pose') {
      this.#bodyGroup.position.y = 0.03;
      this.#leftArm.rotation.z = 0.45;
      this.#rightArm.rotation.z = -1.35;
      this.#rightArm.rotation.x = -0.4;
      this.#leftLeg.rotation.x = 0.12;
      this.#rightLeg.rotation.x = -0.15;
      this.#headGroup.rotation.y = Math.sin(t * 2.5) * 0.15;
    } else {
      // Idle suave
      const breath = Math.sin(t * 2.2);
      this.#bodyGroup.position.y = breath * 0.018;
      this.#leftLeg.rotation.x *= 0.85;
      this.#rightLeg.rotation.x *= 0.85;
      this.#leftArm.rotation.x *= 0.85;
      this.#rightArm.rotation.x *= 0.85;
      this.#leftArm.rotation.z = 0.08 + breath * 0.03;
      this.#rightArm.rotation.z = -0.08 - breath * 0.03;
      this.#headGroup.rotation.y = Math.sin(t * 0.9) * 0.08;
    }

    if (speed > 0.1 && animState === 'idle') {
      this.#bodyGroup.position.y = 0;
    }
  }

  dispose() {
    for (const g of this.#geometries) g.dispose();
    this.#geometries.length = 0;
    for (const child of [...(this.#outfitGroup?.children || []), ...(this.#hairGroup?.children || [])]) {
      child.geometry?.dispose();
    }
    for (const mat of Object.values(this.#materials)) {
      mat.dispose();
    }
    this.#materials = {};
  }
}
