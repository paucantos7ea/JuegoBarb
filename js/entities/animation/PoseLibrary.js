/**
 * Biblioteca de poses absolutas para el rig estilizado.
 * Convención anatómica (el modelo mira a +Z local):
 *  - Hombro izquierdo en +X: rotation.z > 0 abre el brazo hacia fuera; derecho en -X: z < 0.
 *  - rotation.x < 0 en brazos/piernas lleva el miembro hacia delante; en espinilla, x > 0 flexiona la rodilla.
 *  - spineX > 0 inclina el torso hacia delante desde la cintura; headX > 0 baja la mirada.
 */
const ease = (k) => k * k * (3 - 2 * k);

export const EMOTE_DEFS = Object.freeze({
  wave: { duration: 2.2, label: 'Saludo Real', fadeIn: 0.25, fadeOut: 0.35 },
  spin: { duration: 1.5, label: 'Giro de Princesa', fadeIn: 0.2, fadeOut: 0.3 },
  curtsy: { duration: 2.4, label: 'Reverencia de Gala', fadeIn: 0.6, fadeOut: 0.65 },
  star: { duration: 2.8, label: 'Pose de Estrella', fadeIn: 0.35, fadeOut: 0.45 }
});

export const GESTURE_DEFS = Object.freeze({
  chest: 2.6,
  tilt: 2.2,
  look: 3.2,
  heel: 2.0
});

export class PoseLibrary {
  static reset(p, baseZ) {
    p.bodyX = 0; p.bodyY = 0; p.bodyRotX = 0; p.bodyRotY = 0; p.bodyRotZ = 0;
    p.spineX = 0; p.spineY = 0; p.spineZ = 0;
    p.headX = 0; p.headY = 0; p.headZ = 0;
    p.lArmX = 0; p.lArmZ = baseZ; p.rArmX = 0; p.rArmZ = -baseZ;
    p.lForeX = -0.22; p.lForeZ = 0.08; p.rForeX = -0.22; p.rForeZ = -0.08;
    p.lLegX = 0; p.rLegX = 0; p.lShinX = 0; p.rShinX = 0;
    p.breath = 0; p.flare = 0;
    return p;
  }

  /** Envolvente suave 0→1→0 con entrada y salida graduales. */
  static envelope(k, dur, fadeIn = 0.22, fadeOut = 0.3) {
    const t = k * dur;
    const w = Math.min(1, t / fadeIn, (dur - t) / fadeOut);
    return ease(Math.max(0, w));
  }

  /** Mezcla parcial hacia otra pose con peso w (0..1). */
  static blend(p, partial, w) {
    if (w <= 0) return;
    for (const key in partial) p[key] += (partial[key] - p[key]) * w;
  }

  /** Reposo vivo: respiración, desplazamiento de peso, mirada suave y brazos fuera de la falda. */
  static idle(p, t, baseZ) {
    const breath = Math.sin(t * 1.9);
    const sway = Math.sin(t * 0.52);
    p.breath = breath;
    p.bodyX = sway * 0.012;
    p.bodyRotZ = sway * 0.014;
    p.spineZ = -sway * 0.024;
    p.spineX = breath * 0.008;
    p.headZ = sway * 0.012;
    p.headY = Math.sin(t * 0.37) * 0.16 + Math.sin(t * 0.91 + 1.3) * 0.05;
    p.headX = Math.sin(t * 0.61) * 0.035 - breath * 0.012;
    p.lArmZ = baseZ + breath * 0.018 + sway * 0.012;
    p.rArmZ = -(baseZ + breath * 0.018 - sway * 0.012);
    p.lArmX = Math.sin(t * 0.52 + 0.8) * 0.03;
    p.rArmX = Math.sin(t * 0.52 + 2.4) * 0.03;
    // El peso pasa a una pierna y la otra rodilla se relaja
    p.rLegX = -Math.max(0, sway) * 0.05; p.rShinX = Math.max(0, sway) * 0.11;
    p.lLegX = -Math.max(0, -sway) * 0.05; p.lShinX = Math.max(0, -sway) * 0.11;
  }

  /** Caminar/correr: balanceo cruzado, rodilla flexionada en el avance, torsión y rebote. */
  static locomotion(p, t, baseZ, run) {
    const ph = t * (run ? 10.4 : 7.0);
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    const stride = run ? 0.66 : 0.36;
    const arm = run ? 0.62 : 0.38;
    p.lLegX = s * stride; p.rLegX = -s * stride;
    p.lShinX = Math.max(0, -c) * (run ? 1.0 : 0.55) + 0.04;
    p.rShinX = Math.max(0, c) * (run ? 1.0 : 0.55) + 0.04;
    p.lArmX = -s * arm; p.rArmX = s * arm;
    p.lArmZ = baseZ + (run ? 0.08 : 0.03); p.rArmZ = -p.lArmZ;
    p.lForeX = (run ? -0.85 : -0.3) - Math.max(0, s) * 0.22;
    p.rForeX = (run ? -0.85 : -0.3) - Math.max(0, -s) * 0.22;
    p.bodyY = Math.max(0, Math.cos(ph * 2)) * (run ? 0.035 : 0.012);
    p.bodyRotX = run ? 0.035 : 0;
    p.spineX = run ? 0.13 : 0.035;
    p.spineY = -s * (run ? 0.1 : 0.06);
    p.spineZ = c * 0.02;
    p.headY = s * (run ? 0.07 : 0.045);
    p.headX = -p.spineX * 0.55;
    return s;
  }

  /** Salto de bailarina: brazos arriba y afuera, rodillas recogidas, torso ligeramente arqueado. */
  static jump(p, baseZ) {
    Object.assign(p, {
      spineX: -0.06, headX: -0.08,
      lArmX: -0.28, rArmX: -0.28, lArmZ: baseZ + 1.42, rArmZ: -(baseZ + 1.42),
      lForeX: -0.35, rForeX: -0.35, lForeZ: 0.32, rForeZ: -0.32,
      lLegX: -0.38, lShinX: 0.72, rLegX: 0.12, rShinX: 0.5, flare: 0.05
    });
  }

  /** Aterrizaje amortiguado (se mezcla con una envolvente corta). */
  static landing(baseZ) {
    return {
      lLegX: -0.32, lShinX: 0.58, rLegX: -0.12, rShinX: 0.52, spineX: 0.1, headX: 0.05,
      lArmZ: baseZ + 0.28, rArmZ: -(baseZ + 0.28), lArmX: -0.12, rArmX: -0.12
    };
  }

  static dance(p, t) {
    const step = Math.sin(t * 4.8);
    Object.assign(p, {
      bodyY: Math.abs(Math.sin(t * 6.0)) * 0.05, bodyRotY: Math.sin(t * 3.0) * 0.14,
      lArmZ: 0.78 + step * 0.22, rArmZ: -(0.78 + Math.cos(t * 4.8) * 0.22),
      lArmX: -0.2 + Math.cos(t * 4.8) * 0.14, rArmX: -0.2 + step * 0.14,
      lForeX: -0.36, rForeX: -0.36, lLegX: step * 0.24, rLegX: -step * 0.24,
      lShinX: Math.max(0, -step * 0.26), rShinX: Math.max(0, step * 0.26),
      spineZ: Math.sin(t * 2.4) * 0.05, headY: Math.sin(t * 3.0) * 0.15,
      headZ: Math.sin(t * 2.4) * 0.05, flare: Math.abs(step) * 0.05, breath: Math.sin(t * 2.4)
    });
  }

  /** Pose de pasarela (minijuegos). */
  static pose(p, t, baseZ, isMale) {
    Object.assign(p, {
      bodyY: 0.01, bodyRotY: 0.08, lArmZ: baseZ + 0.14, lArmX: -0.1, lForeX: -0.36,
      rArmZ: isMale ? -(baseZ + 0.14) : -0.96, rArmX: isMale ? -0.16 : -0.3, rForeX: -0.32,
      lLegX: 0.1, rLegX: -0.14, lShinX: 0.08, rShinX: 0.16, spineZ: -0.03,
      headY: Math.sin(t * 2.0) * 0.12 - 0.05, headZ: 0.04
    });
  }

  /** Conversación de NPC: gestos de mano expresivos, asentimientos y leve torsión. */
  static talk(p, t, baseZ) {
    const g = Math.sin(t * 2.3);
    const g2 = Math.sin(t * 3.4 + 1.1);
    const open = Math.max(0, Math.sin(t * 0.9));
    p.rArmX = -0.42 + g * 0.12; p.rArmZ = -(baseZ + 0.05);
    p.rForeX = -1.05 + g2 * 0.22; p.rForeZ = 0.16 + g * 0.08;
    p.lArmX = -0.3 * open; p.lForeX = -0.22 - 0.6 * open; p.lForeZ = 0.08 - 0.22 * open;
    p.headX += Math.sin(t * 2.7) * 0.045;
    p.headZ += Math.sin(t * 1.3) * 0.06;
    p.spineY += g * 0.04;
  }

  /** Pose parcial de cada emote en el progreso k (0..1) y tiempo local te (s). */
  static emote(id, k, te, baseZ) {
    switch (id) {
      case 'wave':
        return {
          rArmZ: -2.25, rArmX: -0.35, rForeX: -0.3, rForeZ: -0.15 + Math.sin(te * 11) * 0.42,
          lArmZ: baseZ + 0.06, headZ: 0.09, headY: -0.15, spineZ: 0.05
        };
      case 'spin':
        return {
          lArmZ: 1.15, rArmZ: -1.15, lArmX: -0.12, rArmX: -0.12, lForeX: -0.2, rForeX: -0.2,
          lForeZ: 0.25, rForeZ: -0.25, headX: -0.06, lShinX: 0.12, rLegX: 0.1, rShinX: 0.32,
          bodyY: Math.sin(Math.PI * k) * 0.03, flare: Math.sin(Math.PI * k) * 0.17
        };
      case 'curtsy':
        return {
          spineX: 0.24, headX: 0.26, headY: 0, lLegX: -0.28, lShinX: 0.3, rLegX: 0.18, rShinX: 0.2,
          lArmZ: baseZ + 0.5, rArmZ: -(baseZ + 0.5), lArmX: -0.12, rArmX: -0.12,
          lForeX: -0.12, rForeX: -0.12, lForeZ: 0.22, rForeZ: -0.22, flare: 0.04
        };
      case 'star':
        return {
          lArmZ: 0.78, lArmX: 0.12, lForeX: -0.35, lForeZ: -1.5,
          rArmZ: -1.35, rArmX: -0.45, rForeX: -0.55, rForeZ: -0.35,
          headZ: -0.15, headY: 0.18, headX: -0.04, spineZ: -0.05, spineY: 0.12,
          bodyRotY: 0.18, bodyX: 0.02, rLegX: -0.14, rShinX: 0.28, lLegX: 0.04
        };
      default:
        return {};
    }
  }

  /** Micro-gestos ocasionales en reposo. */
  static gesture(id, te) {
    switch (id) {
      case 'chest':
        return { rArmX: -0.62, rArmZ: -0.12, rForeX: -1.55, rForeZ: 0.75, headZ: 0.06, headX: 0.04 };
      case 'tilt':
        return { headZ: 0.16, headY: 0.1, spineZ: -0.03 };
      case 'look':
        return { headY: Math.sin(te * 2.1) * 0.45, headX: -0.04 };
      case 'heel':
        return { rLegX: -0.08, rShinX: 0.24, bodyRotZ: 0.03, headZ: -0.06 };
      default:
        return {};
    }
  }
}
