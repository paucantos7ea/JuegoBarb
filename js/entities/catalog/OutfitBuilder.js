import * as THREE from 'three';

/**
 * Constructor dinámico de los 6 conjuntos de Alta Costura y los 5 accesorios
 * acoplables 3D. Libera limpiamente todas las geometrías previas al cambiar de prenda.
 */
export class OutfitBuilder {
  /**
   * Genera una falda con pliegues sinusoidales suaves a partir de un perfil 2D.
   */
  static createPleatedLathe(points, pleatDepth, pleatCount, phiStart = 0, phiLength = Math.PI * 2) {
    const profile = [...points].sort((a, b) => a[1] - b[1]);
    const geo = new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 52, phiStart, phiLength);
    const pos = geo.attributes.position;
    const maxY = profile[profile.length - 1][1];
    const spanY = Math.max(0.05, maxY - profile[0][1]);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (Math.hypot(x, z) > 0.05) {
        const angle = Math.atan2(z, x);
        const drop = Math.max(0, (maxY - y) / spanY);
        const wave = 1 + Math.sin(angle * pleatCount) * pleatDepth * drop;
        pos.setXYZ(i, x * wave, y, z * wave);
      }
    }
    geo.computeVertexNormals();
    return geo;
  }

  /** Libera recursivamente las geometrías de un grupo dinámico antes de reconstruirlo. */
  static clearGroup(group) {
    if (!group) return;
    while (group.children.length > 0) {
      const child = group.children[0];
      child.traverse((obj) => {
        if (obj.isMesh && obj.geometry) obj.geometry.dispose();
      });
      group.remove(child);
    }
  }

  static populateOutfit(group, outfit, materials) {
    OutfitBuilder.clearGroup(group);

    const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, rz);
      mesh.scale.set(sx, sy, sz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };

    switch (outfit.style) {
      case 'ballgown':
        OutfitBuilder.#buildBallgown(add, materials);
        break;
      case 'ice_gown':
        OutfitBuilder.#buildIceGown(add, materials);
        break;
      case 'tiered_gown':
        OutfitBuilder.#buildTieredGown(add, materials);
        break;
      case 'starry_gown':
        OutfitBuilder.#buildStarryGown(add, materials);
        break;
      case 'chic_midi':
        OutfitBuilder.#buildChicMidi(add, materials);
        break;
      case 'riding':
        OutfitBuilder.#buildRiding(add, materials);
        break;
      default:
        OutfitBuilder.#buildBallgown(add, materials);
        break;
    }
  }

  static #buildSweetheartBodice(add, m) {
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.115, 0.016, 0.018), m.roseGold, s * 0.052, 1.035, 0.092, 0, s * -0.45, s * 0.34);
      add(new THREE.TorusGeometry(0.052, 0.010, 8, 16, Math.PI), m.roseGold, s * 0.048, 1.258, 0.102);
      add(new THREE.BoxGeometry(0.011, 0.17, 0.012), m.roseGold, s * 0.036, 1.155, 0.104, 0, 0, s * -0.09);
    }
    add(new THREE.TorusGeometry(0.116, 0.015, 8, 22), m.roseGold, 0, 1.055, -0.005, Math.PI / 2, 0, 0, 1.05, 0.78, 1);
    add(new THREE.OctahedronGeometry(0.035, 0), m.crystal, 0, 1.015, 0.116, 0, 0, 0, 0.85, 1.25, 0.7);
    add(new THREE.OctahedronGeometry(0.022, 0), m.crystal, 0, 1.245, 0.115);
  }

  // 1. Gala Rosa Imperial
  static #buildBallgown(add, m) {
    add(OutfitBuilder.createPleatedLathe([[0.106, 1.04], [0.21, 0.88], [0.35, 0.60], [0.47, 0.28], [0.54, 0.04]], 0.072, 14), m.primary);
    add(new THREE.TorusGeometry(0.535, 0.015, 8, 42), m.roseGold, 0, 0.055, 0, Math.PI / 2);
    add(new THREE.TorusGeometry(0.515, 0.008, 6, 42), m.roseGold, 0, 0.098, 0, Math.PI / 2);
    add(OutfitBuilder.createPleatedLathe([[0.114, 1.04], [0.23, 0.88], [0.38, 0.64], [0.49, 0.36]], 0.056, 10, 0.44, Math.PI * 2 - 0.88), m.secondary);
    OutfitBuilder.#buildSweetheartBodice(add, m);
  }

  // 2. Princesa Cristal de Hielo
  static #buildIceGown(add, m) {
    add(OutfitBuilder.createPleatedLathe([[0.106, 1.04], [0.19, 0.86], [0.30, 0.56], [0.41, 0.26], [0.49, 0.04]], 0.068, 12), m.primary);
    add(new THREE.TorusGeometry(0.486, 0.013, 8, 40), m.secondary, 0, 0.055, 0, Math.PI / 2);
    add(new THREE.TorusGeometry(0.116, 0.015, 8, 22), m.roseGold, 0, 1.055, 0, Math.PI / 2, 0, 0, 1.05, 0.78, 1);
    // Capa traslúcida brillante desde los hombros
    add(new THREE.CylinderGeometry(0.16, 0.44, 1.24, 22, 1, true, Math.PI * 0.64, Math.PI * 0.72), m.shawl, 0, 0.76, -0.04);
    add(new THREE.TorusGeometry(0.145, 0.011, 8, 20, Math.PI * 1.15), m.roseGold, 0, 1.355, -0.01, Math.PI / 2, 0, Math.PI * 0.92);
    // Copos dorados 3D en pecho y falda
    const flake = (x, y, z, s = 1) => {
      for (let k = 0; k < 3; k++) {
        add(new THREE.BoxGeometry(0.055 * s, 0.008 * s, 0.008 * s), m.roseGold, x, y, z, 0, 0, (k * Math.PI) / 3);
      }
      add(new THREE.OctahedronGeometry(0.014 * s, 0), m.crystal, x, y, z + 0.005);
    };
    flake(0, 1.24, 0.115, 1.0);
    flake(0, 1.05, 0.118, 0.85);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      flake(Math.sin(a) * 0.39, 0.32, Math.cos(a) * 0.39, 0.95);
    }
  }

  // 3. Atardecer de Perla (volantes escalonados + lazo en la cintura)
  static #buildTieredGown(add, m) {
    add(OutfitBuilder.createPleatedLathe([[0.106, 1.04], [0.22, 0.78], [0.33, 0.64]], 0.085, 16), m.secondary);
    add(OutfitBuilder.createPleatedLathe([[0.20, 0.72], [0.34, 0.46], [0.43, 0.34]], 0.088, 18), m.primary);
    add(OutfitBuilder.createPleatedLathe([[0.32, 0.42], [0.45, 0.16], [0.52, 0.04]], 0.092, 20), m.secondary);
    add(new THREE.TorusGeometry(0.515, 0.011, 8, 40), m.roseGold, 0, 0.052, 0, Math.PI / 2);
    add(new THREE.TorusGeometry(0.118, 0.017, 8, 22), m.secondary, 0, 1.05, 0, Math.PI / 2, 0, 0, 1.06, 0.78, 1);
    // Lazo satinado en la cintura con cintas colgantes
    add(new THREE.SphereGeometry(0.024, 10, 8), m.roseGold, 0, 1.045, 0.118);
    for (const s of [-1, 1]) {
      add(new THREE.SphereGeometry(0.046, 12, 10), m.secondary, s * 0.052, 1.055, 0.115, 0, s * -0.32, s * 0.22, 1.25, 0.72, 0.42);
      add(new THREE.BoxGeometry(0.028, 0.18, 0.010), m.secondary, s * 0.028, 0.945, 0.125, -0.18, 0, s * -0.16);
    }
    add(new THREE.OctahedronGeometry(0.022, 0), m.crystal, 0, 1.245, 0.112);
  }

  // 4. Gala Nocturna Estrellada
  static #buildStarryGown(add, m) {
    add(OutfitBuilder.createPleatedLathe([[0.106, 1.04], [0.20, 0.84], [0.34, 0.54], [0.46, 0.24], [0.52, 0.04]], 0.075, 14), m.primary);
    add(OutfitBuilder.createPleatedLathe([[0.112, 1.04], [0.22, 0.86], [0.35, 0.62]], 0.060, 12, 0.35, Math.PI * 2 - 0.7), m.secondary);
    add(new THREE.CylinderGeometry(0.17, 0.34, 0.74, 18, 1, true, Math.PI * 0.62, Math.PI * 0.76), m.shawl, 0, 0.98, -0.02);
    OutfitBuilder.#buildSweetheartBodice(add, m);
    // Constelación de estrellas doradas en el corpiño y la falda
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2;
      const tier = i % 2 === 0 ? 0.44 : 0.22;
      const rad = i % 2 === 0 ? 0.38 : 0.47;
      add(new THREE.OctahedronGeometry(0.022, 0), m.crystal, Math.sin(ang) * rad, tier, Math.cos(ang) * rad, 0, ang, 0, 1, 1.35, 0.55);
    }
  }

  // 5. Chic Paseo Real (chaqueta entallada + blusa con lazo + falda midi)
  static #buildChicMidi(add, m) {
    add(OutfitBuilder.createPleatedLathe([[0.112, 1.04], [0.18, 0.86], [0.26, 0.64], [0.32, 0.44]], 0.068, 16), m.primary);
    add(new THREE.TorusGeometry(0.316, 0.010, 8, 32), m.roseGold, 0, 0.45, 0, Math.PI / 2);
    // Blusa perla + lazo en el cuello + solapas de chaqueta entallada
    add(new THREE.CylinderGeometry(0.064, 0.098, 0.19, 12), m.secondary, 0, 1.29, 0.042, 0, 0, 0, 1, 1, 0.64);
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.052, 0.18, 0.022), m.primary, s * 0.066, 1.24, 0.096, 0, s * -0.25, s * 0.20);
      add(new THREE.SphereGeometry(0.024, 10, 8), m.secondary, s * 0.028, 1.335, 0.105, 0, 0, s * 0.25, 1.25, 0.72, 0.5);
    }
    add(new THREE.TorusGeometry(0.118, 0.016, 8, 22), m.roseGold, 0, 1.05, 0, Math.PI / 2, 0, 0, 1.06, 0.78, 1);
    for (let i = 0; i < 3; i++) {
      add(new THREE.SphereGeometry(0.011, 8, 8), m.roseGold, 0, 1.21 - i * 0.06, 0.115);
    }
  }

  // 6. Amazona de Palacio (levita real entallada con botones dorados)
  static #buildRiding(add, m) {
    add(OutfitBuilder.createPleatedLathe([[0.114, 1.04], [0.17, 0.86], [0.21, 0.70]], 0.036, 8, 0.35, Math.PI * 2 - 0.7), m.primary, 0, 0, 0, 0, 0, 0, 1.04, 1, 0.80);
    add(new THREE.CylinderGeometry(0.068, 0.078, 0.08, 14), m.roseGold, 0, 1.39, 0);
    add(new THREE.TorusGeometry(0.118, 0.018, 8, 22), m.roseGold, 0, 1.05, 0, Math.PI / 2, 0, 0, 1.06, 0.78, 1);
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.088, 0.024, 0.068), m.roseGold, s * 0.165, 1.375, 0);
      for (let i = 0; i < 4; i++) {
        add(new THREE.SphereGeometry(0.011, 8, 8), m.roseGold, s * 0.038, 1.30 - i * 0.065, 0.112);
      }
    }
  }

  /**
   * Construye los 5 accesorios acoplables 3D sobre cabeza y antebrazos.
   */
  static buildAccessories(headGroup, leftForearm, rightForearm, materials, track) {
    const nodes = {};

    // 1. Tiara de Diamantes
    const tiara = new THREE.Group();
    const band = new THREE.Mesh(track(new THREE.TorusGeometry(0.136, 0.011, 8, 24, Math.PI)), materials.roseGold);
    band.rotation.x = Math.PI / 2 - 0.34;
    band.position.set(0, 0.158, 0.036);
    const centerGem = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.038, 0)), materials.crystal);
    centerGem.position.set(0, 0.212, 0.114);
    const sideGeo = track(new THREE.OctahedronGeometry(0.021, 0));
    for (const s of [-1, 1]) {
      const g = new THREE.Mesh(sideGeo, materials.crystal);
      g.position.set(s * 0.056, 0.188, 0.100);
      tiara.add(g);
    }
    tiara.add(band, centerGem);
    headGroup.add(tiara);
    nodes.tiara = tiara;

    // 2. Corona Imperial (completa 360° con puntas, perlas y rubíes)
    const corona = new THREE.Group();
    corona.position.set(0, 0.172, -0.005);
    const crownBase = new THREE.Mesh(track(new THREE.CylinderGeometry(0.128, 0.118, 0.048, 24, 1, true)), materials.roseGold);
    const crownRim = new THREE.Mesh(track(new THREE.TorusGeometry(0.122, 0.010, 8, 24)), materials.roseGold);
    crownRim.rotation.x = Math.PI / 2;
    crownRim.position.y = -0.02;
    corona.add(crownBase, crownRim);
    const spikeGeo = track(new THREE.ConeGeometry(0.024, 0.082, 6));
    const pearlGeo = track(new THREE.SphereGeometry(0.013, 8, 8));
    const gemGeo = track(new THREE.OctahedronGeometry(0.016, 0));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const sx = Math.sin(a) * 0.124;
      const sz = Math.cos(a) * 0.124;
      const spike = new THREE.Mesh(spikeGeo, materials.roseGold);
      spike.position.set(sx, 0.052, sz);
      const pearl = new THREE.Mesh(pearlGeo, materials.crystal);
      pearl.position.set(sx, 0.095, sz);
      const gem = new THREE.Mesh(gemGeo, materials.crystal);
      gem.position.set(Math.sin(a) * 0.130, 0, Math.cos(a) * 0.130);
      corona.add(spike, pearl, gem);
    }
    headGroup.add(corona);
    nodes.corona = corona;

    // 3. Gafas de Sol Chic
    const gafas = new THREE.Group();
    const lensGeo = track(new THREE.CylinderGeometry(0.036, 0.033, 0.011, 16));
    const frameGeo = track(new THREE.TorusGeometry(0.036, 0.0055, 8, 18));
    for (const s of [-1, 1]) {
      const lens = new THREE.Mesh(lensGeo, materials.dark);
      lens.rotation.x = Math.PI / 2;
      lens.scale.set(1.18, 1, 0.84);
      lens.position.set(s * 0.052, 0.014, 0.162);
      const frame = new THREE.Mesh(frameGeo, materials.roseGold);
      frame.scale.set(1.18, 0.84, 1);
      frame.position.set(s * 0.052, 0.014, 0.166);
      gafas.add(lens, frame);
    }
    const bridge = new THREE.Mesh(track(new THREE.BoxGeometry(0.030, 0.007, 0.009)), materials.roseGold);
    bridge.position.set(0, 0.018, 0.164);
    gafas.add(bridge);
    headGroup.add(gafas);
    nodes.gafas = gafas;

    // 4. Bolso de Mano Dorado (en mano izquierda)
    const bolso = new THREE.Group();
    const bag = new THREE.Mesh(track(new THREE.BoxGeometry(0.145, 0.118, 0.068)), materials.roseGold);
    bag.position.set(-0.02, -0.34, 0.02);
    bag.castShadow = true;
    const clasp = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.018, 0)), materials.crystal);
    clasp.position.set(-0.02, -0.31, 0.058);
    const strap = new THREE.Mesh(track(new THREE.TorusGeometry(0.048, 0.009, 6, 14, Math.PI)), materials.roseGold);
    strap.position.set(-0.02, -0.278, 0.02);
    bolso.add(bag, clasp, strap);
    leftForearm.add(bolso);
    nodes.bolso = bolso;

    // 5. Cetro Estelar (en mano derecha)
    const cetro = new THREE.Group();
    const rod = new THREE.Mesh(track(new THREE.CylinderGeometry(0.014, 0.012, 0.74, 10)), materials.roseGold);
    rod.rotation.x = Math.PI / 2 - 0.32;
    rod.position.set(0.01, -0.24, 0.19);
    rod.castShadow = true;
    const halo = new THREE.Mesh(track(new THREE.TorusGeometry(0.082, 0.009, 8, 20)), materials.roseGold);
    halo.position.set(0.01, -0.11, 0.51);
    const star = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.062, 0)), materials.crystal);
    star.position.set(0.01, -0.11, 0.51);
    cetro.add(rod, halo, star);
    rightForearm.add(cetro);
    nodes.cetro = cetro;

    return nodes;
  }
}
