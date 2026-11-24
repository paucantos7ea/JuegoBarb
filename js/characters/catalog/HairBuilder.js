import * as THREE from 'three';

/**
 * Constructor de peinados 3D esculpidos mediante mechones planos ahusados
 * (cintas ovaladas con tapering) y mantos ondulados en capas.
 * Cero tubos cilíndricos redondos tipo tentáculo.
 */
export class HairBuilder {
  /**
   * Genera un manto continuo de cabello ondulado con caída en capas y borde en V.
   */
  static createWavySheet({
    arcStart, arcEnd, topY, bottomY, topR, midR, botR,
    zOff = -0.012, waveAmp = 0.022, waveFreq = 2.6, rippleFreq = 10,
    segU = 30, segV = 20, hemPoint = 0.07
  }) {
    const positions = [];
    const uvs = [];
    const indices = [];

    for (let iv = 0; iv <= segV; iv++) {
      const v = iv / segV;
      for (let iu = 0; iu <= segU; iu++) {
        const u = iu / segU;
        const ang = arcStart + u * (arcEnd - arcStart);
        const centerFactor = Math.sin(u * Math.PI);
        const hemDrop = centerFactor * hemPoint + Math.sin(u * Math.PI * 7) * 0.014 * centerFactor;
        const y = topY + (bottomY - hemDrop - topY) * v;
        const baseR = topR * (1 - v) * (1 - v) + 2 * midR * (1 - v) * v + botR * v * v;
        const sWave = Math.sin(v * Math.PI * waveFreq + Math.sin(u * Math.PI * 5) * 0.6) * waveAmp * Math.pow(v, 0.72);
        const ridge = Math.sin(u * Math.PI * rippleFreq + v * 2.2) * 0.013 * Math.sin(v * Math.PI);
        const r = baseR + sWave + ridge;
        positions.push(Math.sin(ang) * r, y, Math.cos(ang) * r + zOff - v * 0.042);
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

  /**
   * Genera un mechón plano ahusado (cinta 3D de sección aplanada) a lo largo de una curva.
   */
  static createFlatStrand(points, width0, width1 = 0.006, flatRatio = 0.28, tSeg = 18, rSeg = 8) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    const geo = new THREE.TubeGeometry(curve, tSeg, 1, rSeg, false);
    const pos = geo.attributes.position;
    const frames = curve.computeFrenetFrames(tSeg, false);
    const center = new THREE.Vector3();
    const off = new THREE.Vector3();

    for (let i = 0; i <= tSeg; i++) {
      const u = i / tSeg;
      curve.getPointAt(u, center);
      const rootTaper = u < 0.12 ? 0.62 + 0.38 * (u / 0.12) : 1;
      const w = (width1 + (width0 - width1) * Math.pow(1 - u, 0.72)) * rootTaper;
      const thick = w * flatRatio;
      const N = frames.normals[i];
      const B = frames.binormals[i];
      for (let j = 0; j <= rSeg; j++) {
        const idx = i * (rSeg + 1) + j;
        off.fromBufferAttribute(pos, idx).sub(center);
        const dn = off.dot(N);
        const db = off.dot(B);
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

  static populate(group, hairId, materials, isMale = false) {
    const add = (geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, mat = materials.hair) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.scale.set(sx, sy, sz);
      m.castShadow = true;
      group.add(m);
      return m;
    };
    const strand = (pts, w0, w1 = 0.007, flat = 0.28) => add(HairBuilder.createFlatStrand(pts, w0, w1, flat));

    // Casquete craneal con volumen natural dejando despejados frente y rostro
    const sx = isMale ? 0.99 : 0.96;
    const sy = isMale ? 1.09 : 1.15;
    add(new THREE.SphereGeometry(0.174, 26, 14, 0, Math.PI * 2, 0, Math.PI * 0.40), 0, 0.032, -0.010, -0.10, 0, 0, sx, sy, 1.01);
    add(new THREE.SphereGeometry(0.174, 22, 14, Math.PI, Math.PI, 0, Math.PI * 0.66), 0, 0.032, -0.010, -0.10, 0, 0, sx, sy, 1.01);

    if (isMale || hairId === 'principe_tupe') {
      HairBuilder.#buildPrinceTupe(add, strand);
      return;
    }

    // Flequillo cortina en cintas planas enmarcando sienes y frente
    strand([[-0.025, 0.184, 0.075], [0.052, 0.155, 0.132], [0.128, 0.095, 0.114], [0.156, 0.002, 0.068]], 0.046, 0.010, 0.28);
    strand([[-0.042, 0.182, 0.072], [-0.115, 0.134, 0.114], [-0.154, 0.050, 0.084], [-0.156, -0.042, 0.052]], 0.044, 0.010, 0.28);

    switch (hairId) {
      case 'coleta_alta':
        HairBuilder.#buildHighPonytail(add, strand, materials);
        break;
      case 'recogido_mono':
        HairBuilder.#buildGalaBun(add, strand, materials);
        break;
      case 'media_melena':
        HairBuilder.#buildMidiHeadband(add, strand, materials);
        break;
      case 'trenza_lateral':
        HairBuilder.#buildSideBraid(add, strand, materials);
        break;
      case 'melena_ondulada':
      default:
        HairBuilder.#buildRoyalWaves(add, strand, materials);
        break;
    }
  }

  static #buildRoyalWaves(add, strand, mats) {
    for (const s of [-1, 1]) {
      strand([[s * 0.148, 0.076, 0.062], [s * 0.165, 0.052, -0.052], [s * 0.082, 0.040, -0.162], [0, 0.032, -0.182]], 0.040, 0.020, 0.30);
      strand([[s * 0.142, 0.072, 0.055], [s * 0.172, -0.06, 0.050], [s * 0.160, -0.19, 0.064], [s * 0.186, -0.32, 0.026], [s * 0.156, -0.43, 0.046]], 0.046, 0.012, 0.26);
    }
    add(new THREE.OctahedronGeometry(0.025, 0), 0, 0.034, -0.188, 0, 0, 0, 0.85, 1.35, 0.6, mats.crystal);
    add(new THREE.TorusGeometry(0.032, 0.007, 8, 16), 0, 0.034, -0.184, 0, 0, 0, 1.25, 0.72, 1, mats.roseGold);
    add(HairBuilder.createWavySheet({ arcStart: Math.PI * 0.42, arcEnd: Math.PI * 1.58, topY: 0.105, bottomY: -0.46, topR: 0.168, midR: 0.212, botR: 0.242, waveAmp: 0.026, waveFreq: 2.8, rippleFreq: 11 }));
    add(HairBuilder.createWavySheet({ arcStart: Math.PI * 0.50, arcEnd: Math.PI * 1.50, topY: 0.085, bottomY: -0.41, topR: 0.148, midR: 0.182, botR: 0.202, zOff: -0.004, waveAmp: 0.019, waveFreq: 2.4, rippleFreq: 9, segU: 22, segV: 14 }));
  }

  static #buildHighPonytail(add, strand, mats) {
    for (const s of [-1, 1]) {
      strand([[s * 0.140, 0.072, 0.060], [s * 0.154, -0.045, 0.062], [s * 0.132, -0.145, 0.078]], 0.028, 0.006, 0.26);
    }
    add(new THREE.TorusGeometry(0.048, 0.014, 10, 20), 0, 0.155, -0.152, 0.72, 0, 0, 1, 1, 1, mats.roseGold);
    add(new THREE.SphereGeometry(0.021, 10, 8), 0, 0.172, -0.188, 0, 0, 0, 1, 1, 1, mats.crystal);
    // Coleta glamurosa en capas onduladas planas
    add(HairBuilder.createWavySheet({ arcStart: Math.PI * 0.74, arcEnd: Math.PI * 1.26, topY: 0.165, bottomY: -0.36, topR: 0.052, midR: 0.142, botR: 0.165, zOff: -0.152, waveAmp: 0.026, waveFreq: 2.6, rippleFreq: 7, segU: 22, segV: 18 }));
    add(HairBuilder.createWavySheet({ arcStart: Math.PI * 0.80, arcEnd: Math.PI * 1.20, topY: 0.155, bottomY: -0.32, topR: 0.042, midR: 0.105, botR: 0.118, zOff: -0.172, waveAmp: 0.020, waveFreq: 2.2, rippleFreq: 5, segU: 16, segV: 14 }));
    for (const s of [-1, 1]) {
      strand([[s * 0.02, 0.168, -0.168], [s * 0.075, 0.10, -0.245], [s * 0.088, -0.08, -0.275], [s * 0.052, -0.28, -0.255]], 0.036, 0.010, 0.28);
    }
  }

  static #buildGalaBun(add, strand, mats) {
    for (const s of [-1, 1]) {
      strand([[s * 0.142, 0.068, 0.056], [s * 0.154, -0.04, 0.056], [s * 0.128, -0.132, 0.068]], 0.026, 0.006, 0.26);
    }
    // Moño esculpido con cintas envolventes superpuestas
    add(new THREE.SphereGeometry(0.092, 20, 14), 0, 0.205, -0.088, 0, 0, 0, 1.14, 0.88, 1.0);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      strand([
        [Math.cos(a) * 0.082, 0.175, -0.088 + Math.sin(a) * 0.082],
        [Math.cos(a + 1.1) * 0.102, 0.215, -0.088 + Math.sin(a + 1.1) * 0.102],
        [Math.cos(a + 2.2) * 0.068, 0.258, -0.088 + Math.sin(a + 2.2) * 0.068]
      ], 0.034, 0.016, 0.30);
    }
    // Horquilla imperial dorada + perla de cristal
    add(new THREE.TorusGeometry(0.095, 0.010, 8, 22), 0, 0.168, -0.088, Math.PI / 2, 0, 0, 1, 1, 1, mats.roseGold);
    add(new THREE.CylinderGeometry(0.006, 0.005, 0.22, 8), 0, 0.205, -0.128, 0, 0, Math.PI * 0.42, 1, 1, 1, mats.roseGold);
    add(new THREE.OctahedronGeometry(0.023, 0), 0.10, 0.232, -0.128, 0, 0, 0, 1, 1, 1, mats.crystal);
  }

  static #buildMidiHeadband(add, strand, mats) {
    // Corte midi ondulado hasta los hombros con movimiento chic
    add(HairBuilder.createWavySheet({ arcStart: Math.PI * 0.36, arcEnd: Math.PI * 1.64, topY: 0.105, bottomY: -0.185, topR: 0.168, midR: 0.194, botR: 0.212, waveAmp: 0.016, waveFreq: 2.0, rippleFreq: 10, hemPoint: 0.025 }));
    for (const s of [-1, 1]) {
      strand([[s * 0.145, 0.080, 0.056], [s * 0.172, -0.035, 0.055], [s * 0.158, -0.155, 0.072]], 0.044, 0.014, 0.26);
    }
    // Diadema satinada con perlas doradas
    add(new THREE.TorusGeometry(0.165, 0.015, 10, 26, Math.PI * 1.06), 0, 0.055, 0.028, -0.28, 0, -0.09, 1.01, 1.06, 1, mats.secondary);
    for (let i = -3; i <= 3; i++) {
      const ang = Math.PI * 0.5 + i * 0.24;
      add(new THREE.SphereGeometry(0.013, 8, 8), Math.cos(ang) * 0.168, 0.055 + Math.sin(ang) * 0.175, 0.042 + Math.sin(ang) * 0.042, 0, 0, 0, 1, 1, 1, mats.crystal);
    }
  }

  static #buildSideBraid(add, strand, mats) {
    // Manto trasero recogido hacia el hombro derecho
    add(HairBuilder.createWavySheet({ arcStart: Math.PI * 0.48, arcEnd: Math.PI * 1.48, topY: 0.098, bottomY: -0.135, topR: 0.166, midR: 0.176, botR: 0.148, waveAmp: 0.010, waveFreq: 1.8, rippleFreq: 8, hemPoint: 0.03, segU: 20, segV: 12 }));
    // Mechones diagonales recogidos hacia la trenza lateral (+X)
    strand([[-0.135, 0.055, -0.04], [-0.04, -0.02, -0.165], [0.095, -0.075, -0.125], [0.162, -0.115, 0.025]], 0.048, 0.026, 0.28);
    // Trenza tejida en eslabones planos inclinados cayendo sobre el hombro derecho
    const linkGeo = new THREE.SphereGeometry(0.036, 12, 10);
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const side = i % 2 === 0 ? -1 : 1;
      const lx = 0.158 + Math.sin(t * 2.2) * 0.018 + side * 0.015;
      const ly = -0.125 - i * 0.044;
      const lz = 0.045 + Math.sin(t * Math.PI) * 0.048;
      const scale = 1 - t * 0.42;
      add(linkGeo.clone(), lx, ly, lz, 0.25, 0, side * 0.58, 1.05 * scale, 0.72 * scale, 0.58 * scale);
    }
    linkGeo.dispose();
    // Punta suave ahusada + lazo dorado con gema
    strand([[0.160, -0.43, 0.055], [0.168, -0.49, 0.062], [0.155, -0.545, 0.052]], 0.024, 0.005, 0.30);
    add(new THREE.TorusGeometry(0.026, 0.008, 8, 16), 0.160, -0.44, 0.056, Math.PI / 2, 0, 0, 1, 1, 1, mats.roseGold);
    add(new THREE.OctahedronGeometry(0.018, 0), 0.160, -0.44, 0.082, 0, 0, 0, 1, 1, 1, mats.crystal);
  }

  static #buildPrinceTupe(add, strand) {
    // Tupé real esculpido en cintas planas dinámicas y laterales limpios
    strand([[-0.078, 0.128, 0.128], [-0.028, 0.205, 0.128], [0.042, 0.214, 0.045], [0.072, 0.168, -0.075]], 0.056, 0.016, 0.38);
    strand([[0.012, 0.128, 0.136], [0.068, 0.196, 0.112], [0.112, 0.172, 0.020], [0.120, 0.105, -0.085]], 0.048, 0.014, 0.38);
    strand([[-0.055, 0.148, 0.118], [0.010, 0.222, 0.088], [0.088, 0.192, -0.025]], 0.046, 0.014, 0.36);
    for (const s of [-1, 1]) {
      strand([[s * 0.146, 0.102, 0.044], [s * 0.158, 0.038, 0.034], [s * 0.150, -0.030, 0.022]], 0.028, 0.008, 0.36);
    }
    add(HairBuilder.createWavySheet({ arcStart: Math.PI * 0.56, arcEnd: Math.PI * 1.44, topY: 0.095, bottomY: -0.090, topR: 0.166, midR: 0.170, botR: 0.142, waveAmp: 0.005, rippleFreq: 6, hemPoint: 0.015, segU: 18, segV: 10 }));
  }
}
