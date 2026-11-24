import * as THREE from 'three';

/**
 * Constructor de rostros estilo muñeca en geometría 3D pura (sin caras pintadas en canvas).
 * Cráneo suave, ojos grandes en capas (esclerótica, iris luminoso, pupila, dos catchlights
 * y arco de pestañas), cejas finas, rubor difuminado, nariz diminuta y sonrisa coral.
 */
export class FaceBuilder {
  /**
   * Construye el grupo de la cabeza 3D y registra cada geometría mediante track(geo).
   * @param {Object} materials
   * @param {boolean} isMale
   * @param {(g: THREE.BufferGeometry) => THREE.BufferGeometry} track
   * @returns {THREE.Group}
   */
  static buildHead(materials, isMale, track) {
    const headGroup = new THREE.Group();
    headGroup.position.y = isMale ? 1.62 : 1.585;

    headGroup.add(FaceBuilder.#buildCranium(materials.skin, isMale, track));
    FaceBuilder.#buildEars(headGroup, materials.skin, track);
    FaceBuilder.#buildEyes(headGroup, materials, isMale, track);
    FaceBuilder.#buildBrows(headGroup, materials.brow, isMale, track);
    FaceBuilder.#buildNose(headGroup, materials.skin, isMale, track);
    FaceBuilder.#buildLips(headGroup, materials.lips, materials.lash, isMale, track);
    if (!isMale) {
      FaceBuilder.#buildCheekBlush(headGroup, materials.blush, track);
    }

    return headGroup;
  }

  static #buildCranium(skinMat, m, track) {
    const geo = track(new THREE.SphereGeometry(0.162, 36, 28));
    const pos = geo.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i) * (m ? 0.96 : 0.91);
      let y = pos.getY(i) * (m ? 1.13 : 1.14);
      let z = pos.getZ(i) * (m ? 0.98 : 0.95);

      // Pómulos suaves y estilizados
      if (z > 0.04 && y > -0.055 && y < 0.025) {
        const cheek = Math.exp(-Math.pow((y + 0.018) / 0.036, 2)) * Math.min(1, Math.abs(x) / 0.078);
        x *= 1 + cheek * (m ? 0.025 : 0.055);
        z += cheek * (m ? 0.005 : 0.009);
      }

      // Cuencas oculares ligeramente hundidas para alojar los ojos 3D en capas
      if (z > 0.08 && y > -0.015 && y < 0.055) {
        const eyeDistL = Math.hypot((x + 0.054) / 0.036, (y - 0.016) / 0.026);
        const eyeDistR = Math.hypot((x - 0.054) / 0.036, (y - 0.016) / 0.026);
        const socket = Math.exp(-eyeDistL * eyeDistL * 1.6) + Math.exp(-eyeDistR * eyeDistR * 1.6);
        z -= socket * 0.013;
      }

      // Afinado progresivo de mandíbula y barbilla delicada
      if (y < -0.015) {
        const t = Math.min(1, Math.abs((y + 0.015) / 0.175));
        x *= 1 - Math.pow(t, 1.2) * (m ? 0.19 : 0.33);
        z *= 1 - Math.pow(t, 1.45) * (m ? 0.03 : 0.07);
        if (!m && Math.abs(x) < 0.05 && z > 0.04) {
          z += Math.pow(t, 2) * 0.012;
        }
      }

      pos.setXYZ(i, x, y, z);
    }

    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, skinMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  static #buildEars(headGroup, skinMat, track) {
    const earGeo = track(new THREE.SphereGeometry(0.022, 10, 8));
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(earGeo, skinMat);
      ear.scale.set(0.48, 1.15, 0.72);
      ear.position.set(s * 0.145, -0.012, -0.004);
      headGroup.add(ear);
    }
  }

  static #buildEyes(headGroup, mats, m, track) {
    const scleraGeo = track(new THREE.SphereGeometry(m ? 0.024 : 0.029, 18, 14));
    const irisGeo = track(new THREE.SphereGeometry(m ? 0.016 : 0.0205, 16, 12));
    const ringGeo = track(new THREE.TorusGeometry(m ? 0.015 : 0.0195, 0.0022, 8, 22));
    const glowGeo = track(new THREE.SphereGeometry(m ? 0.011 : 0.0145, 12, 10));
    const pupilGeo = track(new THREE.SphereGeometry(m ? 0.0085 : 0.0105, 12, 10));
    const catchBigGeo = track(new THREE.SphereGeometry(m ? 0.0036 : 0.0048, 10, 8));
    const catchSmallGeo = track(new THREE.SphereGeometry(m ? 0.0021 : 0.0027, 8, 8));
    const lidCreaseGeo = track(new THREE.TorusGeometry(m ? 0.025 : 0.031, 0.0022, 6, 18, Math.PI * 0.82));

    for (const s of [-1, 1]) {
      const eyeGroup = new THREE.Group();
      eyeGroup.position.set(s * (m ? 0.053 : 0.052), m ? 0.016 : 0.014, 0.128);
      eyeGroup.rotation.y = s * 0.24;
      eyeGroup.rotation.x = -0.04;

      // 1. Esclerótica blanca curva
      const sclera = new THREE.Mesh(scleraGeo, mats.sclera);
      sclera.scale.set(m ? 1.12 : 1.08, m ? 0.72 : 0.92, 0.56);
      eyeGroup.add(sclera);

      // 2. Iris 3D luminoso + anillo exterior oscuro + reflejo inferior de color
      const iris = new THREE.Mesh(irisGeo, mats.eyeIris);
      iris.scale.set(0.95, m ? 0.88 : 1.02, 0.42);
      iris.position.set(-s * 0.001, -0.001, 0.0105);
      eyeGroup.add(iris);

      const glow = new THREE.Mesh(glowGeo, mats.eyeGlow);
      glow.scale.set(0.88, 0.58, 0.32);
      glow.position.set(-s * 0.001, -0.007, 0.0145);
      eyeGroup.add(glow);

      const ring = new THREE.Mesh(ringGeo, mats.eyeRing);
      ring.scale.set(0.95, m ? 0.88 : 1.02, 0.6);
      ring.position.set(-s * 0.001, -0.001, 0.0155);
      eyeGroup.add(ring);

      // 3. Pupila oscura 3D
      const pupil = new THREE.Mesh(pupilGeo, mats.pupil);
      pupil.scale.set(0.92, 0.96, 0.36);
      pupil.position.set(-s * 0.001, 0.0, 0.0165);
      eyeGroup.add(pupil);

      // 4. Dos puntos de brillo blanco 3D (catchlights)
      const catchBig = new THREE.Mesh(catchBigGeo, mats.catchlight);
      catchBig.scale.set(1.1, 0.95, 0.45);
      catchBig.position.set(-0.007, 0.007, 0.0195);
      const catchSmall = new THREE.Mesh(catchSmallGeo, mats.catchlight);
      catchSmall.scale.set(1, 1, 0.45);
      catchSmall.position.set(0.0065, -0.0065, 0.0195);
      eyeGroup.add(catchBig, catchSmall);

      // 5. Arco de pestañas superiores en 3D
      const lashCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-s * (m ? 0.026 : 0.029), -0.002, 0.013),
        new THREE.Vector3(-s * 0.010, m ? 0.016 : 0.024, 0.017),
        new THREE.Vector3(s * 0.012, m ? 0.017 : 0.025, 0.016),
        new THREE.Vector3(s * (m ? 0.028 : 0.036), m ? 0.005 : 0.014, 0.010)
      ]);
      const lashMesh = new THREE.Mesh(track(new THREE.TubeGeometry(lashCurve, 14, m ? 0.0026 : 0.0042, 6, false)), mats.lash);
      eyeGroup.add(lashMesh);

      if (!m) {
        // Dos pestañas exteriores delicadas + pliegue suave del párpado
        for (let k = 0; k < 2; k++) {
          const flickCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(s * (0.026 + k * 0.004), 0.014 - k * 0.004, 0.012),
            new THREE.Vector3(s * (0.038 + k * 0.003), 0.021 - k * 0.003, 0.009)
          ]);
          eyeGroup.add(new THREE.Mesh(track(new THREE.TubeGeometry(flickCurve, 6, 0.0019, 5, false)), mats.lash));
        }
        const lid = new THREE.Mesh(lidCreaseGeo, mats.eyelid);
        lid.position.set(0, 0.007, 0.012);
        lid.rotation.z = 0.28;
        eyeGroup.add(lid);
      }

      eyeGroup.userData.isEye = true; // CharacterAnimator lo usa para el parpadeo
      headGroup.add(eyeGroup);
    }
  }

  static #buildBrows(headGroup, browMat, m, track) {
    // Puntos medidos ~4 mm sobre la superficie del cráneo. Sin escalar la malla:
    // los puntos están en coordenadas de la cabeza y un scale los hundiría en la piel.
    for (const s of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(s * 0.022, m ? 0.066 : 0.066, m ? 0.149 : 0.145),
        new THREE.Vector3(s * 0.054, m ? 0.074 : 0.078, m ? 0.135 : 0.130),
        new THREE.Vector3(s * 0.088, m ? 0.064 : 0.066, m ? 0.120 : 0.1135)
      ]);
      const brow = new THREE.Mesh(track(new THREE.TubeGeometry(curve, 14, m ? 0.0050 : 0.0032, 6, false)), browMat);
      headGroup.add(brow);
    }
  }

  /** Nariz diminuta y delicada: un único relieve suave, sin puente marcado. */
  static #buildNose(headGroup, skinMat, m, track) {
    const tip = new THREE.Mesh(track(new THREE.SphereGeometry(m ? 0.0105 : 0.0085, 12, 10)), skinMat);
    tip.scale.set(1.15, 0.78, 0.9);
    tip.position.set(0, -0.030, m ? 0.152 : 0.150);
    headGroup.add(tip);
  }

  /** Sonrisa pequeña y dulce en coral/rosa: arco fino + leve relleno inferior (sin labios esculpidos). */
  static #buildLips(headGroup, lipMat, _lineMat, m, track) {
    const mouth = new THREE.Group();
    // El rostro masculino es ~4 mm más prominente en la boca
    mouth.position.set(0, m ? -0.074 : -0.071, m ? 0.0045 : 0);

    const w = m ? 0.019 : 0.016;
    const smileCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-w, 0.0035, 0.1365),
      new THREE.Vector3(-w * 0.5, -0.0005, 0.1405),
      new THREE.Vector3(0, -0.0018, 0.1418),
      new THREE.Vector3(w * 0.5, -0.0005, 0.1405),
      new THREE.Vector3(w, 0.0035, 0.1365)
    ]);
    const smile = new THREE.Mesh(track(new THREE.TubeGeometry(smileCurve, 16, m ? 0.0022 : 0.0026, 6, false)), lipMat);
    smile.scale.set(1, 0.8, 1);
    mouth.add(smile);

    if (!m) {
      // Toque inferior suave que da la forma de "boca de muñeca"
      const fill = new THREE.Mesh(track(new THREE.SphereGeometry(0.0072, 12, 8)), lipMat);
      fill.scale.set(1.25, 0.5, 0.42);
      fill.position.set(0, -0.0032, 0.1392);
      mouth.add(fill);
    }

    headGroup.add(mouth);
  }

  static #buildCheekBlush(headGroup, blushMat, track) {
    // Óvalo aplanado apoyado sobre la mejilla y orientado según su normal (medida),
    // para que asome como un rubor suave en lugar de quedar enterrado bajo la piel.
    const blushGeo = track(new THREE.SphereGeometry(0.024, 14, 10));
    const normal = new THREE.Vector3();
    for (const s of [-1, 1]) {
      const blush = new THREE.Mesh(blushGeo, blushMat);
      blush.scale.set(1.25, 0.72, 0.22);
      blush.position.set(s * 0.080, -0.028, 0.1335);
      normal.set(s * 0.52, -0.36, 0.77).normalize();
      blush.lookAt(blush.position.clone().add(normal));
      blush.renderOrder = 2;
      headGroup.add(blush);
    }
  }
}
