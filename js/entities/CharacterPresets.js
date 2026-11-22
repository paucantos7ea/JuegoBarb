import * as THREE from 'three';

export class CharacterPresets {
  static AVATARS = [
    {
      id: 'aurora', name: 'Aurora', gender: 'female',
      skin: 0xfbe0d2, skinHex: '#fbe0d2', hair: 0xf1cc7e, hairHex: '#f1cc7e', browHex: '#9d7642',
      eyeTop: '#1c4da8', eyeMid: '#3a86ec', eyeBot: '#8fd2ff',
      lipHex: '#e65a92', blushHex: '#ff8fb8', shadowHex: '#f3b7d8',
      swatch: 'linear-gradient(135deg,#ffe5a3,#f698c4)'
    },
    {
      id: 'valentina', name: 'Valentina', gender: 'female',
      skin: 0xd69b77, skinHex: '#d69b77', hair: 0x4b281c, hairHex: '#4b281c', browHex: '#331911',
      eyeTop: '#165b41', eyeMid: '#2d9b6e', eyeBot: '#8ce3b4',
      lipHex: '#d8556e', blushHex: '#eb838c', shadowHex: '#df9d90',
      swatch: 'linear-gradient(135deg,#c97a5b,#e564a1)'
    },
    {
      id: 'celeste', name: 'Celeste', gender: 'female',
      skin: 0xfff0e6, skinHex: '#fff0e6', hair: 0xe9def8, hairHex: '#e9def8', browHex: '#8d7ea4',
      eyeTop: '#4c3298', eyeMid: '#8663df', eyeBot: '#ceb8ff',
      lipHex: '#dc62a6', blushHex: '#f898cc', shadowHex: '#cbb5f5',
      swatch: 'linear-gradient(135deg,#e4d4ff,#99c9ff)'
    },
    {
      id: 'amara', name: 'Amara', gender: 'female',
      skin: 0x7b4a34, skinHex: '#7b4a34', hair: 0x1e151f, hairHex: '#1e151f', browHex: '#171017',
      eyeTop: '#6b4114', eyeMid: '#ba7f2e', eyeBot: '#f0c774',
      lipHex: '#c84574', blushHex: '#b65b6c', shadowHex: '#a9748b',
      swatch: 'linear-gradient(135deg,#a96a48,#e4b15e)'
    }
  ];

  static NPC_AVATARS = [
    {
      id: 'npc_adrian', name: 'Príncipe Adrián', gender: 'male',
      skin: 0xe6b99c, skinHex: '#e6b99c', hair: 0x3b2316, hairHex: '#3b2316', browHex: '#2b180f',
      eyeTop: '#1f4173', eyeMid: '#3c71b8', eyeBot: '#8cbce8',
      lipHex: '#bd7c6e', blushHex: '#d99a84', shadowHex: '#d3a48a'
    },
    {
      id: 'npc_sofia', name: 'Estilista Sofía', gender: 'female',
      skin: 0xfcdcd0, skinHex: '#fcdcd0', hair: 0xe89ab0, hairHex: '#e89ab0', browHex: '#9d5d72',
      eyeTop: '#146b6c', eyeMid: '#28a8a3', eyeBot: '#94ece6',
      lipHex: '#e6428e', blushHex: '#ff85bb', shadowHex: '#f7a9d4'
    },
    {
      id: 'npc_camila', name: 'Princesa Camila', gender: 'female',
      skin: 0xe4b592, skinHex: '#e4b592', hair: 0x7c4c2a, hairHex: '#7c4c2a', browHex: '#4f2e18',
      eyeTop: '#5e3d18', eyeMid: '#9e6c2f', eyeBot: '#e3bb72',
      lipHex: '#d95c82', blushHex: '#f18e9d', shadowHex: '#e6b29a'
    },
    {
      id: 'npc_maestra', name: 'Maestra de Ceremonias', gender: 'female',
      skin: 0x8f593f, skinHex: '#8f593f', hair: 0xd9cfe8, hairHex: '#d9cfe8', browHex: '#514161',
      eyeTop: '#452278', eyeMid: '#7d4ac2', eyeBot: '#caa8f8',
      lipHex: '#b83576', blushHex: '#bf6584', shadowHex: '#a580c2'
    }
  ];

  static OUTFITS = [
    {
      id: 'gala_rosa', name: 'Gala Rosa Imperial',
      desc: 'Vestido de gala satinado con pliegues y corpiño oro rosa',
      primary: 0xec66aa, secondary: 0xf8c9b8, style: 'ballgown',
      swatch: 'linear-gradient(135deg,#ff92ca,#e8b47c)'
    },
    {
      id: 'casual_chic', name: 'Casual Chic',
      desc: 'Chaqueta rosada entallada, blusa perla y pantalón',
      primary: 0xf293c2, secondary: 0xfff5fa, style: 'chic',
      swatch: 'linear-gradient(135deg,#ffc1de,#fff5fa)'
    },
    {
      id: 'equitacion_real', name: 'Equitación Real',
      desc: 'Casaca imperial borgoña con ribetes dorados y botas altas',
      primary: 0x99255b, secondary: 0xf7e7d3, style: 'riding',
      swatch: 'linear-gradient(135deg,#9b275c,#e5b869)'
    },
    {
      id: 'cristal_nocturno', name: 'Cristal Nocturno',
      desc: 'Vestido sirena amatista con pliegues y estola de cristal',
      primary: 0x6747d4, secondary: 0x9be6ff, style: 'mermaid',
      swatch: 'linear-gradient(135deg,#6b4bd6,#9be7ff)'
    }
  ];

  static NPC_OUTFITS = [
    {
      id: 'principe_gala', name: 'Gala del Príncipe',
      desc: 'Casaca real azul zafiro con charreteras doradas y botas',
      primary: 0x263a6e, secondary: 0xf3ece4, style: 'prince',
      swatch: 'linear-gradient(135deg,#263a6e,#e8bf72)'
    }
  ];

  static HAIRSTYLES = [
    { id: 'ondas_reales', name: 'Ondas Reales', desc: 'Melena larga ondulada con flequillo lateral' },
    { id: 'recogido_imperial', name: 'Recogido Imperial', desc: 'Recogido elegante con pasador dorado' },
    { id: 'coleta_perla', name: 'Coleta Perla', desc: 'Coleta alta glamurosa con mechón envolvente' }
  ];

  static ACCESSORIES = [
    { id: 'tiara', name: 'Tiara', desc: 'Corona de cristales rosas y oro' },
    { id: 'gafas', name: 'Gafas de sol', desc: 'Montura chic oro rosa' },
    { id: 'bolso', name: 'Bolso', desc: 'Bolso de gala sujeto en mano' },
    { id: 'cetro', name: 'Cetro', desc: 'Cetro de cristal luminoso' }
  ];

  static getAvatar(id) {
    return CharacterPresets.AVATARS.find((a) => a.id === id)
      || CharacterPresets.NPC_AVATARS.find((a) => a.id === id)
      || CharacterPresets.AVATARS[0];
  }

  static getOutfit(id) {
    return CharacterPresets.OUTFITS.find((o) => o.id === id)
      || CharacterPresets.NPC_OUTFITS.find((o) => o.id === id)
      || CharacterPresets.OUTFITS[0];
  }

  static createPleatedLathe(points, pleatDepth, pleatCount) {
    // LatheGeometry genera caras hacia fuera solo si el perfil va de abajo a arriba.
    // Con el perfil invertido las faldas se veían "del revés" (interior visible y piernas a través).
    const profile = [...points].sort((a, b) => a[1] - b[1]);
    const geo = new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 48);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (Math.hypot(x, z) > 0.05) {
        const angle = Math.atan2(z, x);
        const drop = Math.max(0, 1 - y / 0.92);
        const wave = 1 + Math.sin(angle * pleatCount) * pleatDepth * drop;
        pos.setXYZ(i, x * wave, y, z * wave);
      }
    }
    geo.computeVertexNormals();
    return geo;
  }

  static populateOutfit(group, outfit, materials, isMale) {
    const belt = new THREE.Mesh(new THREE.TorusGeometry(isMale ? 0.165 : 0.118, 0.022, 8, 22), materials.roseGold);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1.06, 0.78, 1);
    belt.position.y = isMale ? 1.02 : 1.05;
    group.add(belt);

    if (outfit.style === 'ballgown') {
      const skirt = new THREE.Mesh(
        CharacterPresets.createPleatedLathe([[0.11, 1.05], [0.22, 0.9], [0.36, 0.62], [0.49, 0.3], [0.56, 0.05]], 0.085, 12),
        materials.primary
      );
      skirt.castShadow = true;
      const trim = new THREE.Mesh(new THREE.TorusGeometry(0.555, 0.022, 8, 32), materials.roseGold);
      trim.rotation.x = Math.PI / 2;
      trim.position.y = 0.06;
      const brooch = new THREE.Mesh(new THREE.OctahedronGeometry(0.038, 0), materials.crystal);
      brooch.position.set(0, 1.06, 0.115);
      for (const s of [-1, 1]) {
        const arc = new THREE.Mesh(new THREE.TorusGeometry(0.054, 0.011, 8, 14, Math.PI), materials.roseGold);
        arc.position.set(s * 0.048, 1.26, 0.102);
        group.add(arc);
      }
      group.add(skirt, trim, brooch);
    } else if (outfit.style === 'mermaid') {
      const skirt = new THREE.Mesh(
        CharacterPresets.createPleatedLathe([[0.108, 1.05], [0.165, 0.85], [0.155, 0.56], [0.25, 0.28], [0.37, 0.05]], 0.075, 10),
        materials.primary
      );
      skirt.castShadow = true;
      const shawl = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.34, 0.72, 18, 1, true, Math.PI * 0.62, Math.PI * 0.76), materials.shawl);
      shawl.position.set(0, 0.98, -0.02);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.04, 0), materials.crystal);
      gem.position.set(0, 1.24, 0.115);
      group.add(skirt, shawl, gem);
    } else if (outfit.style === 'prince') {
      const coat = new THREE.Mesh(
        CharacterPresets.createPleatedLathe([[0.155, 1.02], [0.175, 0.84], [0.2, 0.68]], 0.03, 6),
        materials.primary
      );
      coat.scale.set(1.06, 1, 0.82);
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.09, 14), materials.roseGold);
      collar.position.y = 1.41;
      for (const s of [-1, 1]) {
        const ep = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.035, 0.09), materials.roseGold);
        ep.position.set(s * 0.21, 1.42, 0);
        group.add(ep);
      }
      const sash = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.44, 0.025), materials.roseGold);
      sash.position.set(0, 1.22, 0.145);
      sash.rotation.z = -0.52;
      group.add(coat, collar, sash);
    } else {
      const peplum = new THREE.Mesh(
        CharacterPresets.createPleatedLathe([[0.115, 1.05], [0.165, 0.88], [0.195, 0.76]], 0.04, 8),
        materials.primary
      );
      peplum.scale.set(1.04, 1, 0.78);
      const lapel = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.105, 0.16, 12), materials.secondary);
      lapel.position.set(0, 1.29, 0.042);
      lapel.scale.set(1, 1, 0.65);
      group.add(peplum, lapel);
    }
  }

  static createTaperedHairStrand(points, baseRadius, tipRadius = 0.004, tubularSegs = 16, radialSegs = 8) {
    const vecs = points.map((p) => (p instanceof THREE.Vector3 ? p : new THREE.Vector3(p[0], p[1], p[2])));
    const curve = new THREE.CatmullRomCurve3(vecs);
    const geo = new THREE.TubeGeometry(curve, tubularSegs, 1, radialSegs, false);
    const pos = geo.attributes.position;
    const center = new THREE.Vector3();
    const offset = new THREE.Vector3();

    for (let i = 0; i <= tubularSegs; i++) {
      const u = i / tubularSegs;
      curve.getPointAt(u, center);
      const rootBlend = u < 0.12 ? 0.62 + 0.38 * (u / 0.12) : 1;
      const bodyTaper = Math.pow(1 - u, 0.75);
      let r = (tipRadius + (baseRadius - tipRadius) * bodyTaper) * rootBlend;
      if (i === tubularSegs) r = Math.max(0.0015, tipRadius * 0.45);
      for (let j = 0; j <= radialSegs; j++) {
        const idx = i * (radialSegs + 1) + j;
        offset.fromBufferAttribute(pos, idx).sub(center).multiplyScalar(r);
        pos.setXYZ(idx, center.x + offset.x, center.y + offset.y, center.z + offset.z);
      }
    }
    geo.computeVertexNormals();
    return geo;
  }

  static populateHair(group, hairId, materials, isMale) {
    const add = (geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, mat = materials.hair) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, rz);
      mesh.scale.set(sx, sy, sz);
      mesh.castShadow = true;
      group.add(mesh);
    };
    const strand = (pts, r0, r1 = 0.004, tSeg = 16, rSeg = 8) => {
      add(CharacterPresets.createTaperedHairStrand(pts, r0, r1, tSeg, rSeg), 0, 0, 0);
    };

    // Casquete craneal suave en dos piezas (deja frente y rostro despejados)
    const sx = isMale ? 1.0 : 0.96;
    const sy = isMale ? 1.09 : 1.14;
    add(new THREE.SphereGeometry(0.174, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.36), 0, 0.028, -0.01, -0.12, 0, 0, sx, sy, 1.0);
    add(new THREE.SphereGeometry(0.174, 20, 14, Math.PI, Math.PI, 0, Math.PI * 0.65), 0, 0.028, -0.01, -0.12, 0, 0, sx, sy, 1.0);

    if (hairId === 'principe_corto' || isMale) {
      // Tupé masculino esculpido en mechones curvos ahusados
      const quiff = [
        [[-0.07, 0.135, 0.13], [-0.04, 0.195, 0.125], [0.02, 0.21, 0.05], [0.05, 0.175, -0.07]],
        [[-0.02, 0.132, 0.14], [0.02, 0.205, 0.132], [0.07, 0.205, 0.04], [0.09, 0.16, -0.08]],
        [[0.04, 0.128, 0.132], [0.085, 0.185, 0.105], [0.12, 0.165, 0.01], [0.125, 0.115, -0.09]],
        [[-0.105, 0.12, 0.105], [-0.125, 0.155, 0.04], [-0.135, 0.12, -0.06], [-0.115, 0.045, -0.13]]
      ];
      quiff.forEach((pts, i) => strand(pts, i < 2 ? 0.032 : 0.025, 0.006, 14, 8));
      // Patillas perfiladas y nuca limpia
      for (const s of [-1, 1]) {
        strand([[s * 0.145, 0.105, 0.045], [s * 0.16, 0.045, 0.038], [s * 0.154, -0.028, 0.025]], 0.022, 0.005, 10, 7);
      }
      for (let i = -2; i <= 2; i++) {
        const a = i * 0.42;
        const x = Math.sin(a) * 0.155;
        const z = -Math.cos(a) * 0.155 - 0.01;
        strand([[x * 0.9, 0.075, z * 0.95], [x, -0.005, z], [x * 0.88, -0.095, z * 0.9]], 0.028, 0.006, 10, 7);
      }
      return;
    }

    // Flequillo lateral curvo y suave común a todos los peinados femeninos
    strand([[-0.045, 0.18, 0.082], [0.042, 0.146, 0.138], [0.122, 0.088, 0.118], [0.152, -0.008, 0.072]], 0.03, 0.005, 14, 8);
    strand([[-0.03, 0.188, 0.062], [0.068, 0.156, 0.116], [0.142, 0.088, 0.085], [0.156, -0.045, 0.048]], 0.027, 0.005, 14, 8);
    strand([[-0.055, 0.176, 0.078], [-0.122, 0.128, 0.112], [-0.154, 0.042, 0.084], [-0.15, -0.075, 0.056]], 0.028, 0.005, 14, 8);

    if (hairId === 'ondas_reales') {
      for (const s of [-1, 1]) {
        strand([
          [s * 0.135, 0.095, 0.055], [s * 0.158, -0.03, 0.04],
          [s * 0.148, -0.175, 0.052], [s * 0.168, -0.32, 0.022], [s * 0.148, -0.43, 0.042]
        ], 0.028, 0.004, 18, 8);
      }
      for (let i = -4; i <= 4; i++) {
        const a = i * 0.32, abs = Math.abs(i), len = 0.54 - abs * 0.028, w = (i % 2 === 0 ? 1 : -1) * 0.024;
        const x0 = Math.sin(a) * 0.148, z0 = -Math.cos(a) * 0.148 - 0.012;
        strand([
          [x0 * 0.82, 0.115, z0 * 0.85], [x0 * 1.04, -0.015, z0 * 1.06],
          [x0 * 1.12 + w, -len * 0.36, z0 - 0.032], [x0 * 1.18 - w, -len * 0.72, z0 - 0.055], [x0 * 1.1 + w * 0.8, -len, z0 - 0.028]
        ], abs < 3 ? 0.038 : 0.032, 0.004, 18, 8);
      }
    } else if (hairId === 'coleta_perla') {
      for (const s of [-1, 1]) strand([[s * 0.14, 0.075, 0.06], [s * 0.155, -0.03, 0.062], [s * 0.135, -0.145, 0.078]], 0.02, 0.003, 12, 7);
      add(new THREE.TorusGeometry(0.044, 0.013, 10, 20), 0, 0.128, -0.17, 0.62, 0, 0, 1, 1, 1, materials.roseGold);
      add(new THREE.SphereGeometry(0.02, 10, 8), 0, 0.14, -0.205, 0, 0, 0, 1, 1, 1, materials.crystal);
      const tailSpecs = [
        [0, 0, 0.44, 0.04], [-0.042, 0.015, 0.42, 0.032], [0.042, 0.015, 0.42, 0.032],
        [-0.072, -0.012, 0.37, 0.026], [0.072, -0.012, 0.37, 0.026], [-0.026, -0.025, 0.39, 0.028], [0.026, -0.025, 0.39, 0.028]
      ];
      for (const [ox, oz, len, rad] of tailSpecs) {
        strand([
          [ox * 0.25, 0.128, -0.168], [ox * 0.85, 0.158, -0.235 + oz], [ox * 1.35, 0.01, -0.285 + oz],
          [ox * 1.1, -len * 0.45, -0.245 + oz], [ox * 1.45, -len, -0.28 + oz]
        ], rad, 0.004, 18, 8);
      }
    } else {
      for (const s of [-1, 1]) {
        strand([[s * 0.142, 0.07, 0.06], [s * 0.155, -0.035, 0.058], [s * 0.132, -0.13, 0.07]], 0.02, 0.003, 12, 7);
        strand([[s * 0.12, -0.055, -0.11], [s * 0.105, 0.06, -0.155], [s * 0.04, 0.165, -0.13]], 0.026, 0.008, 12, 7);
      }
      add(new THREE.SphereGeometry(0.088, 18, 14), 0, 0.195, -0.095, 0, 0, 0, 1.08, 0.88, 0.98);
      for (let b = 0; b < 3; b++) {
        const pts = [];
        for (let k = 0; k <= 8; k++) {
          const ang = b * (Math.PI * 2 / 3) + (k / 8) * Math.PI * 1.65;
          const r = 0.088 + Math.sin(k * 1.4) * 0.01;
          pts.push([Math.cos(ang) * r, 0.155 + (k / 8) * 0.075, -0.095 + Math.sin(ang) * r * 0.9]);
        }
        strand(pts, 0.024, 0.01, 16, 7);
      }
      add(new THREE.CylinderGeometry(0.007, 0.005, 0.21, 8), 0, 0.195, -0.135, 0, 0, Math.PI * 0.42, 1, 1, 1, materials.roseGold);
      add(new THREE.OctahedronGeometry(0.022, 0), 0.095, 0.222, -0.135, 0, 0, 0, 1, 1, 1, materials.crystal);
    }
  }

  static buildAccessories(headGroup, leftForearm, rightForearm, materials, track) {
    const nodes = {};

    const tiara = new THREE.Group();
    const band = new THREE.Mesh(track(new THREE.TorusGeometry(0.135, 0.013, 8, 22, Math.PI)), materials.roseGold);
    band.rotation.x = Math.PI / 2 - 0.34;
    band.position.set(0, 0.155, 0.035);
    const centerGem = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.042, 0)), materials.crystal);
    centerGem.position.set(0, 0.21, 0.115);
    const sideGeo = track(new THREE.OctahedronGeometry(0.024, 0));
    for (const s of [-1, 1]) {
      const g = new THREE.Mesh(sideGeo, materials.crystal);
      g.position.set(s * 0.06, 0.185, 0.1);
      tiara.add(g);
    }
    tiara.add(band, centerGem);
    headGroup.add(tiara);
    nodes.tiara = tiara;

    const gafas = new THREE.Group();
    const lensGeo = track(new THREE.CylinderGeometry(0.038, 0.034, 0.012, 14));
    const frameGeo = track(new THREE.TorusGeometry(0.038, 0.006, 8, 16));
    for (const s of [-1, 1]) {
      const lens = new THREE.Mesh(lensGeo, materials.dark);
      lens.rotation.x = Math.PI / 2;
      lens.scale.set(1.18, 1, 0.85);
      lens.position.set(s * 0.052, 0.012, 0.168);
      const frame = new THREE.Mesh(frameGeo, materials.roseGold);
      frame.scale.set(1.18, 0.85, 1);
      frame.position.set(s * 0.052, 0.012, 0.172);
      gafas.add(lens, frame);
    }
    const bridge = new THREE.Mesh(track(new THREE.BoxGeometry(0.032, 0.008, 0.01)), materials.roseGold);
    bridge.position.set(0, 0.018, 0.17);
    gafas.add(bridge);
    headGroup.add(gafas);
    nodes.gafas = gafas;

    const bolso = new THREE.Group();
    const bag = new THREE.Mesh(track(new THREE.BoxGeometry(0.145, 0.125, 0.07)), materials.primary);
    bag.position.set(-0.02, -0.34, 0.02);
    const clasp = new THREE.Mesh(track(new THREE.SphereGeometry(0.018, 8, 8)), materials.roseGold);
    clasp.position.set(-0.02, -0.31, 0.058);
    const strap = new THREE.Mesh(track(new THREE.TorusGeometry(0.048, 0.009, 6, 14, Math.PI)), materials.roseGold);
    strap.position.set(-0.02, -0.275, 0.02);
    bolso.add(bag, clasp, strap);
    leftForearm.add(bolso);
    nodes.bolso = bolso;

    const cetro = new THREE.Group();
    const rod = new THREE.Mesh(track(new THREE.CylinderGeometry(0.014, 0.013, 0.72, 10)), materials.roseGold);
    rod.rotation.x = Math.PI / 2 - 0.32;
    rod.position.set(0.01, -0.24, 0.19);
    const orb = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.072, 0)), materials.crystal);
    orb.position.set(0.01, -0.11, 0.51);
    cetro.add(rod, orb);
    rightForearm.add(cetro);
    nodes.cetro = cetro;

    return nodes;
  }
}
