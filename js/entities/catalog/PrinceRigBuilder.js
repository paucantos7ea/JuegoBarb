import * as THREE from 'three';
import { OutfitBuilder } from './OutfitBuilder.js';

/**
 * Constructor masculino estilizado para el Príncipe Adrián:
 * proporciones masculinas, casaca real azul zafiro con charreteras doradas,
 * banda ceremonial, pantalón de gala y botas altas.
 */
export class PrinceRigBuilder {
  /**
   * Construye el cuerpo masculino y la casaca real dentro de bodyGroup.
   */
  static buildBody(bodyGroup, materials, track) {
    const torsoPts = [
      [0.01, 0.86], [0.145, 0.88], [0.152, 1.02],
      [0.172, 1.18], [0.218, 1.34], [0.196, 1.42], [0.070, 1.45]
    ];
    const torso = new THREE.Mesh(
      track(new THREE.LatheGeometry(torsoPts.map(([x, y]) => new THREE.Vector2(x, y)), 22)),
      materials.primary
    );
    torso.scale.set(1.06, 1, 0.76);
    torso.castShadow = true;

    const neck = new THREE.Mesh(track(new THREE.CylinderGeometry(0.056, 0.064, 0.135, 14)), materials.skin);
    neck.position.y = 1.445;
    neck.castShadow = true;
    bodyGroup.add(torso, neck);

    const limbs = PrinceRigBuilder.#buildLimbs(bodyGroup, materials, track);
    const outfitGroup = new THREE.Group();
    bodyGroup.add(outfitGroup);
    PrinceRigBuilder.populatePrinceUniform(outfitGroup, materials);

    return { ...limbs, outfitGroup };
  }

  static #buildLimbs(bodyGroup, materials, track) {
    const leftLeg = new THREE.Group();
    const rightLeg = new THREE.Group();
    leftLeg.position.set(-0.115, 0.90, 0);
    rightLeg.position.set(0.115, 0.90, 0);

    const thighGeo = track(new THREE.CylinderGeometry(0.075, 0.059, 0.44, 14));
    const shinGeo = track(new THREE.CylinderGeometry(0.058, 0.046, 0.42, 14));
    const cuffGeo = track(new THREE.TorusGeometry(0.058, 0.008, 8, 16));
    const footGeo = track(new THREE.BoxGeometry(0.098, 0.076, 0.215));

    const thighMeshes = [];
    const shinMeshes = [];
    const shoeMeshes = [];
    let leftShin = null;
    let rightShin = null;

    [leftLeg, rightLeg].forEach((leg, i) => {
      const thigh = new THREE.Mesh(thighGeo, materials.secondary);
      thigh.position.y = -0.22;
      thigh.castShadow = true;
      leg.add(thigh);

      const shinGroup = new THREE.Group();
      shinGroup.position.y = -0.44;
      const shin = new THREE.Mesh(shinGeo, materials.dark);
      shin.position.y = -0.21;
      shin.castShadow = true;
      const bootCuff = new THREE.Mesh(cuffGeo, materials.roseGold);
      bootCuff.rotation.x = Math.PI / 2;
      bootCuff.position.y = -0.02;
      const shoe = new THREE.Mesh(footGeo, materials.dark);
      shoe.position.set(0, -0.43, 0.045);
      shoe.castShadow = true;
      shinGroup.add(shin, bootCuff, shoe);

      leg.add(shinGroup);
      bodyGroup.add(leg);
      thighMeshes.push(thigh);
      shinMeshes.push(shin);
      shoeMeshes.push(shoe);
      if (i === 0) leftShin = shinGroup;
      else rightShin = shinGroup;
    });

    const leftArm = new THREE.Group();
    const rightArm = new THREE.Group();
    leftArm.position.set(-0.242, 1.375, 0);
    rightArm.position.set(0.242, 1.375, 0);

    const shGeo = track(new THREE.SphereGeometry(0.064, 12, 10));
    const upGeo = track(new THREE.CylinderGeometry(0.052, 0.043, 0.27, 12));
    const loGeo = track(new THREE.CylinderGeometry(0.043, 0.034, 0.25, 12));
    const wristGeo = track(new THREE.TorusGeometry(0.036, 0.007, 8, 14));
    const hdGeo = track(new THREE.SphereGeometry(0.041, 10, 10));

    let leftForearm = null;
    let rightForearm = null;

    [leftArm, rightArm].forEach((arm, i) => {
      arm.add(new THREE.Mesh(shGeo, materials.primary));
      const upper = new THREE.Mesh(upGeo, materials.primary);
      upper.position.y = -0.14;
      upper.castShadow = true;
      arm.add(upper);

      const forearm = new THREE.Group();
      forearm.position.y = -0.27;
      forearm.rotation.set(-0.22, 0, i === 0 ? -0.08 : 0.08);
      const lower = new THREE.Mesh(loGeo, materials.primary);
      lower.position.y = -0.125;
      lower.castShadow = true;
      const wrist = new THREE.Mesh(wristGeo, materials.roseGold);
      wrist.rotation.x = Math.PI / 2;
      wrist.position.y = -0.235;
      const hand = new THREE.Mesh(hdGeo, materials.skin);
      hand.scale.set(0.88, 1.35, 0.65);
      hand.position.y = -0.268;
      forearm.add(lower, wrist, hand);

      arm.add(forearm);
      bodyGroup.add(arm);
      if (i === 0) leftForearm = forearm;
      else rightForearm = forearm;
    });

    return {
      leftLeg, rightLeg, leftShin, rightShin,
      leftArm, rightArm, leftForearm, rightForearm,
      thighMeshes, shinMeshes, shoeMeshes, puffSleeves: []
    };
  }

  /**
   * Construye la casaca real con charreteras doradas, botones, banda ceremonial y cinturón.
   */
  static populatePrinceUniform(group, m) {
    OutfitBuilder.clearGroup(group);

    const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, rz);
      mesh.scale.set(sx, sy, sz);
      mesh.castShadow = true;
      group.add(mesh);
      return mesh;
    };

    // Faldón de la casaca real
    add(
      OutfitBuilder.createPleatedLathe([[0.156, 1.02], [0.180, 0.84], [0.208, 0.66]], 0.028, 6, 0.25, Math.PI * 2 - 0.5),
      m.primary, 0, 0, 0, 0, 0, 0, 1.06, 1, 0.84
    );
    // Cuello mao dorado + cinturón real con hebilla
    add(new THREE.CylinderGeometry(0.086, 0.096, 0.095, 16), m.roseGold, 0, 1.415, 0);
    add(new THREE.TorusGeometry(0.168, 0.022, 8, 22), m.roseGold, 0, 1.02, 0, Math.PI / 2, 0, 0, 1.06, 0.78, 1);
    add(new THREE.BoxGeometry(0.064, 0.048, 0.022), m.roseGold, 0, 1.02, 0.145);

    // Charreteras doradas esculpidas con flecos en ambos hombros
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.132, 0.032, 0.095), m.roseGold, s * 0.222, 1.43, 0, 0, 0, s * -0.14);
      for (let f = -2; f <= 2; f++) {
        add(new THREE.CylinderGeometry(0.007, 0.006, 0.055, 6), m.roseGold, s * 0.278, 1.395, f * 0.018);
      }
      // Doble botonadura dorada en el pecho
      for (let i = 0; i < 4; i++) {
        add(new THREE.SphereGeometry(0.012, 8, 8), m.roseGold, s * 0.055, 1.32 - i * 0.068, 0.145);
      }
    }

    // Banda ceremonial diagonal + estrella de cristal
    add(new THREE.BoxGeometry(0.068, 0.46, 0.024), m.roseGold, 0, 1.22, 0.148, 0, 0, -0.54);
    add(new THREE.OctahedronGeometry(0.030, 0), m.crystal, -0.075, 1.29, 0.156, 0, 0, 0, 1, 1.2, 0.55);
  }
}
