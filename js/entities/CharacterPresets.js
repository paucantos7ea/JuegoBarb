import * as THREE from 'three';

export class CharacterPresets {
  static AVATARS = [
    {
      id: 'aurora', name: 'Aurora', gender: 'female',
      skin: 0xfbe0d2, skinHex: '#fbe0d2', hair: 0xf3d082, hairHex: '#f3d082', browHex: '#9e753e',
      eyeTop: '#1646a6', eyeMid: '#3784ee', eyeBot: '#94d9ff',
      lipHex: '#e45c90', blushHex: '#ff8fb8', shadowHex: '#f2b8d6',
      swatch: 'linear-gradient(135deg,#ffe5a3,#f698c4)'
    },
    {
      id: 'valentina', name: 'Valentina', gender: 'female',
      skin: 0xd9a07b, skinHex: '#d9a07b', hair: 0x4f2b1d, hairHex: '#4f2b1d', browHex: '#351b12',
      eyeTop: '#155c42', eyeMid: '#2d9e70', eyeBot: '#8ce6b6',
      lipHex: '#d95870', blushHex: '#ec858e', shadowHex: '#e0a092',
      swatch: 'linear-gradient(135deg,#c97a5b,#e564a1)'
    },
    {
      id: 'celeste', name: 'Celeste', gender: 'female',
      skin: 0xfff0e6, skinHex: '#fff0e6', hair: 0xeae0f8, hairHex: '#eae0f8', browHex: '#8d7ea4',
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
      desc: 'Vestido princesa con manguitas globo, escote corazón y doble falda',
      primary: 0xf18bb8, secondary: 0xffd5e8, style: 'ballgown',
      swatch: 'linear-gradient(135deg,#ff9bc9,#e8b47c)'
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
    { id: 'ondas_reales', name: 'Ondas Reales', desc: 'Melena ondulada en cascada con semirrecogido y pasador' },
    { id: 'recogido_imperial', name: 'Recogido Imperial', desc: 'Recogido elegante con pasador dorado' },
    { id: 'coleta_perla', name: 'Coleta Perla', desc: 'Coleta alta ondulada con mechón envolvente' }
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

  static createPleatedLathe(points, pleatDepth, pleatCount, phiStart = 0, phiLength = Math.PI * 2) {
    const profile = [...points].sort((a, b) => a[1] - b[1]);
    const geo = new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 52, phiStart, phiLength);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (Math.hypot(x, z) > 0.05) {
        const angle = Math.atan2(z, x);
        const drop = Math.max(0, 1 - y / 0.94);
        const wave = 1 + Math.sin(angle * pleatCount) * pleatDepth * drop;
        pos.setXYZ(i, x * wave, y, z * wave);
      }
    }
    geo.computeVertexNormals();
    return geo;
  }

  static populateOutfit(group, outfit, materials, isMale) {
    const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.scale.set(sx, sy, sz);
      m.castShadow = true;
      group.add(m);
      return m;
    };

    if (outfit.style === 'ballgown') {
      // Falda interior acampanada con pliegues suaves y doble cenefa dorada
      add(CharacterPresets.createPleatedLathe([[0.106, 1.04], [0.21, 0.88], [0.35, 0.6], [0.47, 0.28], [0.54, 0.04]], 0.072, 14), materials.primary);
      add(new THREE.TorusGeometry(0.535, 0.014, 8, 40), materials.roseGold, 0, 0.055, 0, Math.PI / 2);
      add(new THREE.TorusGeometry(0.518, 0.008, 6, 40), materials.roseGold, 0, 0.095, 0, Math.PI / 2);

      // Sobrefalda drapeada abierta al frente (+Z) desde el broche en V
      add(
        CharacterPresets.createPleatedLathe([[0.114, 1.04], [0.23, 0.88], [0.38, 0.64], [0.49, 0.36]], 0.055, 10, 0.44, Math.PI * 2 - 0.88),
        materials.secondary
      );

      // Cinturón en V dorado + broche de gema + escote corazón + filigrana frontal
      for (const s of [-1, 1]) {
        add(new THREE.BoxGeometry(0.115, 0.016, 0.018), materials.roseGold, s * 0.052, 1.035, 0.092, 0, s * -0.45, s * 0.34);
        add(new THREE.TorusGeometry(0.052, 0.01, 8, 16, Math.PI), materials.roseGold, s * 0.048, 1.258, 0.102);
        add(new THREE.BoxGeometry(0.011, 0.17, 0.012), materials.roseGold, s * 0.036, 1.155, 0.104, 0, 0, s * -0.09);
      }
      add(new THREE.TorusGeometry(0.115, 0.015, 8, 22), materials.roseGold, 0, 1.055, -0.005, Math.PI / 2, 0, 0, 1.05, 0.78, 1);
      add(new THREE.OctahedronGeometry(0.036, 0), materials.crystal, 0, 1.015, 0.115, 0, 0, 0, 0.85, 1.25, 0.7);
      add(new THREE.OctahedronGeometry(0.022, 0), materials.crystal, 0, 1.245, 0.115);
      return;
    }

    // Cinturón base para el resto de estilos
    add(new THREE.TorusGeometry(isMale ? 0.165 : 0.118, 0.02, 8, 22), materials.roseGold, 0, isMale ? 1.02 : 1.05, 0, Math.PI / 2, 0, 0, 1.06, 0.78, 1);

    if (outfit.style === 'mermaid') {
      add(CharacterPresets.createPleatedLathe([[0.108, 1.05], [0.165, 0.85], [0.155, 0.56], [0.25, 0.28], [0.37, 0.05]], 0.075, 10), materials.primary);
      add(new THREE.CylinderGeometry(0.18, 0.34, 0.72, 18, 1, true, Math.PI * 0.62, Math.PI * 0.76), materials.shawl, 0, 0.98, -0.02);
      add(new THREE.OctahedronGeometry(0.038, 0), materials.crystal, 0, 1.24, 0.115);
    } else if (outfit.style === 'prince') {
      add(CharacterPresets.createPleatedLathe([[0.155, 1.02], [0.175, 0.84], [0.2, 0.68]], 0.03, 6), materials.primary, 0, 0, 0, 0, 0, 0, 1.06, 1, 0.82);
      add(new THREE.CylinderGeometry(0.085, 0.095, 0.09, 14), materials.roseGold, 0, 1.41, 0);
      for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.12, 0.035, 0.09), materials.roseGold, s * 0.21, 1.42, 0);
      add(new THREE.BoxGeometry(0.065, 0.44, 0.025), materials.roseGold, 0, 1.22, 0.145, 0, 0, -0.52);
    } else {
      add(CharacterPresets.createPleatedLathe([[0.115, 1.05], [0.165, 0.88], [0.195, 0.76]], 0.04, 8), materials.primary, 0, 0, 0, 0, 0, 0, 1.04, 1, 0.78);
      add(new THREE.CylinderGeometry(0.065, 0.105, 0.16, 12), materials.secondary, 0, 1.29, 0.042, 0, 0, 0, 1, 1, 0.65);
    }
  }

  // Manto de cabello ondulado continuo (elimina por completo los "tentáculos" separados)
  static createWavyHairSheet({ arcStart, arcEnd, topY, bottomY, topR, midR, botR, zOff = -0.015, waveAmp = 0.024, waveFreq = 2.6, rippleFreq = 10, segU = 34, segV = 22 }) {
    const positions = [], uvs = [], indices = [];
    for (let iv = 0; iv <= segV; iv++) {
      const v = iv / segV;
      for (let iu = 0; iu <= segU; iu++) {
        const u = iu / segU;
        const ang = arcStart + u * (arcEnd - arcStart);
        // Contorno inferior en V suave con ondas de rizos en las puntas
        const centerFactor = Math.sin(u * Math.PI);
        const hemDrop = centerFactor * 0.075 + Math.sin(u * Math.PI * 7) * 0.018 * centerFactor;
        const y = topY + (bottomY - hemDrop - topY) * v;
        const baseR = topR * (1 - v) * (1 - v) + 2 * midR * (1 - v) * v + botR * v * v;
        const sWave = Math.sin(v * Math.PI * waveFreq + Math.sin(u * Math.PI * 5) * 0.65) * waveAmp * Math.pow(v, 0.75);
        const ridge = Math.sin(u * Math.PI * rippleFreq + v * 2.4) * 0.015 * Math.sin(v * Math.PI);
        const r = baseR + sWave + ridge;
        const x = Math.sin(ang) * r;
        const z = Math.cos(ang) * r + zOff - v * 0.045;
        positions.push(x, y, z);
        uvs.push(u * 2.2, v);
      }
    }
    for (let iv = 0; iv < segV; iv++) {
      for (let iu = 0; iu < segU; iu++) {
        const a = iv * (segU + 1) + iu;
        const b = a + 1;
        const c = a + (segU + 1);
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  // Mechón en cinta ovalada aplanada con tapering suave (sin aspecto de tubo rígido)
  static createFlatHairRibbon(points, width0, width1 = 0.008, flatRatio = 0.34, tSeg = 18, rSeg = 10) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    const geo = new THREE.TubeGeometry(curve, tSeg, 1, rSeg, false);
    const pos = geo.attributes.position;
    const frames = curve.computeFrenetFrames(tSeg, false);
    const center = new THREE.Vector3(), off = new THREE.Vector3();

    for (let i = 0; i <= tSeg; i++) {
      const u = i / tSeg;
      curve.getPointAt(u, center);
      const rootScale = u < 0.1 ? 0.68 + 0.32 * (u / 0.1) : 1;
      const w = (width1 + (width0 - width1) * Math.pow(1 - u, 0.68)) * rootScale;
      const thick = w * flatRatio;
      const N = frames.normals[i], B = frames.binormals[i];
      for (let j = 0; j <= rSeg; j++) {
        const idx = i * (rSeg + 1) + j;
        off.fromBufferAttribute(pos, idx).sub(center);
        const dn = off.dot(N), db = off.dot(B);
        pos.setXYZ(
          idx,
          center.x + N.x * dn * thick + B.x * db * w,
          center.y + N.y * dn * thick + B.y * db * w,
          center.z + N.z * dn * thick + B.z * db * w
        );
      }
    }
    geo.computeVertexNormals();
    return geo;
  }

  static populateHair(group, hairId, materials, isMale) {
    const add = (geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, mat = materials.hair) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz);
      m.castShadow = true;
      group.add(m);
    };
    const ribbon = (pts, w0, w1 = 0.008, flat = 0.36) => add(CharacterPresets.createFlatHairRibbon(pts, w0, w1, flat));

    // Casquete craneal voluminoso suave (deja frente y rostro completamente despejados)
    const sx = isMale ? 1.01 : 0.99, sy = isMale ? 1.1 : 1.16;
    add(new THREE.SphereGeometry(0.178, 26, 14, 0, Math.PI * 2, 0, Math.PI * 0.38), 0, 0.032, -0.012, -0.1, 0, 0, sx, sy, 1.02);
    add(new THREE.SphereGeometry(0.178, 22, 14, Math.PI, Math.PI, 0, Math.PI * 0.66), 0, 0.032, -0.012, -0.1, 0, 0, sx, sy, 1.02);

    if (hairId === 'principe_corto' || isMale) {
      ribbon([[-0.08, 0.135, 0.128], [-0.03, 0.198, 0.125], [0.04, 0.212, 0.045], [0.07, 0.17, -0.075]], 0.055, 0.016, 0.45);
      ribbon([[0.01, 0.132, 0.138], [0.06, 0.195, 0.115], [0.11, 0.175, 0.02], [0.12, 0.11, -0.085]], 0.048, 0.014, 0.45);
      for (const s of [-1, 1]) ribbon([[s * 0.148, 0.105, 0.045], [s * 0.162, 0.04, 0.036], [s * 0.155, -0.03, 0.024]], 0.028, 0.008, 0.45);
      add(CharacterPresets.createWavyHairSheet({ arcStart: Math.PI * 0.58, arcEnd: Math.PI * 1.42, topY: 0.09, bottomY: -0.09, topR: 0.168, midR: 0.172, botR: 0.145, waveAmp: 0.005, rippleFreq: 6, segU: 20, segV: 10 }));
      return;
    }

    // Flequillo lateral suave en cintas planas enmarcando la frente (estilo hoja de referencia)
    ribbon([[-0.035, 0.188, 0.078], [0.048, 0.158, 0.136], [0.128, 0.098, 0.118], [0.162, 0.005, 0.072]], 0.044, 0.012, 0.36);
    ribbon([[-0.048, 0.184, 0.075], [-0.118, 0.136, 0.116], [-0.158, 0.052, 0.086], [-0.16, -0.055, 0.054]], 0.042, 0.012, 0.36);

    if (hairId === 'ondas_reales') {
      // Semirrecogido trasero con dos mechones laterales cruzados y pasador dorado + cristal
      for (const s of [-1, 1]) {
        ribbon([[s * 0.152, 0.078, 0.065], [s * 0.168, 0.055, -0.055], [s * 0.085, 0.042, -0.165], [0, 0.032, -0.185]], 0.038, 0.022, 0.38);
        // Mechones frontales ondulados sobre hombros
        ribbon([[s * 0.145, 0.075, 0.055], [s * 0.175, -0.06, 0.048], [s * 0.165, -0.19, 0.062], [s * 0.192, -0.32, 0.025], [s * 0.162, -0.42, 0.048]], 0.046, 0.014, 0.34);
      }
      add(new THREE.OctahedronGeometry(0.026, 0), materials.crystal, 0, 0.035, -0.192, 0, 0, 0, 0.85, 1.35, 0.6);
      add(new THREE.TorusGeometry(0.034, 0.007, 8, 16), materials.roseGold, 0, 0.035, -0.188, 0, 0, 0, 1.25, 0.72, 1);

      // Manto ondulado en doble capa (volumen rico en cascada sobre espalda y hombros)
      add(CharacterPresets.createWavyHairSheet({ arcStart: Math.PI * 0.42, arcEnd: Math.PI * 1.58, topY: 0.105, bottomY: -0.45, topR: 0.172, midR: 0.215, botR: 0.245, waveAmp: 0.028, waveFreq: 2.8, rippleFreq: 11 }));
      add(CharacterPresets.createWavyHairSheet({ arcStart: Math.PI * 0.50, arcEnd: Math.PI * 1.50, topY: 0.085, bottomY: -0.41, topR: 0.15, midR: 0.185, botR: 0.205, zOff: -0.005, waveAmp: 0.02, waveFreq: 2.4, rippleFreq: 9, segU: 24, segV: 16 }));
    } else if (hairId === 'coleta_perla') {
      for (const s of [-1, 1]) ribbon([[s * 0.142, 0.075, 0.06], [s * 0.158, -0.04, 0.06], [s * 0.138, -0.15, 0.078]], 0.028, 0.006, 0.34);
      add(new THREE.TorusGeometry(0.045, 0.013, 10, 20), materials.roseGold, 0, 0.125, -0.172, 0.62);
      add(new THREE.SphereGeometry(0.02, 10, 8), materials.crystal, 0, 0.138, -0.206);
      add(CharacterPresets.createWavyHairSheet({ arcStart: Math.PI * 0.76, arcEnd: Math.PI * 1.24, topY: 0.13, bottomY: -0.36, topR: 0.055, midR: 0.125, botR: 0.145, zOff: -0.165, waveAmp: 0.026, waveFreq: 2.6, rippleFreq: 7, segU: 22, segV: 18 }));
      add(CharacterPresets.createWavyHairSheet({ arcStart: Math.PI * 0.80, arcEnd: Math.PI * 1.20, topY: 0.12, bottomY: -0.32, topR: 0.045, midR: 0.095, botR: 0.11, zOff: -0.18, waveAmp: 0.02, waveFreq: 2.2, rippleFreq: 5, segU: 16, segV: 14 }));
    } else {
      for (const s of [-1, 1]) ribbon([[s * 0.144, 0.07, 0.058], [s * 0.156, -0.04, 0.056], [s * 0.132, -0.135, 0.07]], 0.026, 0.006, 0.34);
      add(new THREE.SphereGeometry(0.095, 20, 14), 0, 0.195, -0.095, 0, 0, 0, 1.12, 0.9, 1.0);
      add(new THREE.TorusGeometry(0.088, 0.024, 10, 22), 0, 0.165, -0.095, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.007, 0.005, 0.21, 8), 0, 0.195, -0.135, 0, 0, Math.PI * 0.42, 1, 1, 1, materials.roseGold);
      add(new THREE.OctahedronGeometry(0.022, 0), 0.095, 0.222, -0.135, 0, 0, 0, 1, 1, 1, materials.crystal);
    }
  }

  static buildAccessories(headGroup, leftForearm, rightForearm, materials, track) {
    const nodes = {};
    const tiara = new THREE.Group();
    const band = new THREE.Mesh(track(new THREE.TorusGeometry(0.138, 0.012, 8, 24, Math.PI)), materials.roseGold);
    band.rotation.x = Math.PI / 2 - 0.34;
    band.position.set(0, 0.16, 0.036);
    const centerGem = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.04, 0)), materials.crystal);
    centerGem.position.set(0, 0.215, 0.116);
    const sideGeo = track(new THREE.OctahedronGeometry(0.022, 0));
    for (const s of [-1, 1]) {
      const g = new THREE.Mesh(sideGeo, materials.crystal);
      g.position.set(s * 0.058, 0.19, 0.102);
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
      lens.rotation.x = Math.PI / 2; lens.scale.set(1.18, 1, 0.85); lens.position.set(s * 0.052, 0.004, 0.168);
      const frame = new THREE.Mesh(frameGeo, materials.roseGold);
      frame.scale.set(1.18, 0.85, 1); frame.position.set(s * 0.052, 0.004, 0.172);
      gafas.add(lens, frame);
    }
    const bridge = new THREE.Mesh(track(new THREE.BoxGeometry(0.032, 0.008, 0.01)), materials.roseGold);
    bridge.position.set(0, 0.01, 0.17);
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
    rod.rotation.x = Math.PI / 2 - 0.32; rod.position.set(0.01, -0.24, 0.19);
    const orb = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.072, 0)), materials.crystal);
    orb.position.set(0.01, -0.11, 0.51);
    cetro.add(rod, orb);
    rightForearm.add(cetro);
    nodes.cetro = cetro;
    return nodes;
  }
}
